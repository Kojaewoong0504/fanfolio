import asyncio
import hmac
import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from secrets import token_urlsafe
from uuid import uuid4

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.errors import AppError
from app.image_processing import remove_light_background_bytes
from app.models import (
    AchievementDefinition,
    AchievementProgress,
    AdminArtistAssignment,
    AdminMembership,
    AnalyticsEvent,
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    BackgroundRemovalJob,
    Card,
    CardOwnershipLedger,
    CardPack,
    CardPackCard,
    CardReviewDecision,
    CardReviewRequest,
    CardVisibility,
    CollectionBenefitClaim,
    CollectionCampaign,
    DeploymentIdentity,
    Drop,
    EngagementEvent,
    FanLevel,
    Follow,
    LevelPolicyVersion,
    LevelThreshold,
    MagicLink,
    Member,
    MissionDefinition,
    MissionProgress,
    Notification,
    Organization,
    OrganizationArtist,
    PassEntitlement,
    PassProgress,
    PassSeason,
    PassTier,
    PointBalance,
    PointCharge,
    PointChargePackage,
    PointLedger,
    PointTransaction,
    ProfileEquipment,
    PushDevice,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    RewardCatalog,
    RewardGrant,
    Role,
    Session,
    ShopProduct,
    TradeItem,
    TradeLock,
    TradeProposal,
    User,
    UserBlock,
    UserCard,
    XpLedger,
)
from app.notification_delivery import build_delivery
from app.passwords import hash_password, verify_password
from app.retry import decide_retry
from app.storage import configured_asset_storage

logger = logging.getLogger(__name__)
PASS_CLAIM_GRACE_DAYS = 14
POINT_CHARGE_PACKAGES = (
    {"id": "points_500", "points": 500, "priceWon": 5000, "label": "500P"},
    {"id": "points_1000", "points": 1000, "priceWon": 9500, "label": "1,000P"},
    {"id": "points_3000", "points": 3000, "priceWon": 27000, "label": "3,000P"},
)


def _point_charge_package_data(package: PointChargePackage) -> dict:
    return {
        "id": package.id,
        "points": package.points,
        "priceWon": package.price_won,
        "label": package.label,
        "status": package.status,
        "sortOrder": package.sort_order,
    }


async def ensure_point_charge_packages(session: AsyncSession) -> list[PointChargePackage]:
    rows = list(
        await session.scalars(
            select(PointChargePackage).order_by(
                PointChargePackage.sort_order, PointChargePackage.id
            )
        )
    )
    if rows:
        return rows
    rows = [
        PointChargePackage(
            id=item["id"],
            points=item["points"],
            price_won=item["priceWon"],
            label=item["label"],
            sort_order=index,
        )
        for index, item in enumerate(POINT_CHARGE_PACKAGES)
    ]
    session.add_all(rows)
    await session.flush()
    return rows


def now() -> datetime:
    return datetime.now(UTC)


async def grant_user_card(
    session: AsyncSession,
    *,
    user_id: str,
    card_id: str,
    source_type: str,
    source_id: str,
    acquisition_source: str,
    metadata: dict | None = None,
    redeem_code_id: str | None = None,
    drop_id: str | None = None,
) -> UserCard:
    """Grant one card and its immutable ownership event inside the caller transaction."""
    existing_id = await session.scalar(
        select(CardOwnershipLedger.user_card_id).where(
            CardOwnershipLedger.user_id == user_id,
            CardOwnershipLedger.action == "grant",
            CardOwnershipLedger.source_type == source_type,
            CardOwnershipLedger.source_id == source_id,
        )
    )
    if existing_id:
        existing = await session.get(UserCard, existing_id)
        if existing:
            return existing

    card = await session.scalar(select(Card).where(Card.id == card_id).with_for_update())
    if card is None or card.status != "published":
        raise AppError(409, "CARD_NOT_PUBLISHED", "공개되지 않은 카드입니다.")
    serial = (
        await session.scalar(
            select(func.count()).select_from(UserCard).where(UserCard.card_id == card_id)
        )
        or 0
    ) + 1
    user_card = UserCard(
        id=f"uc_{uuid4().hex[:12]}",
        user_id=user_id,
        card_id=card_id,
        redeem_code_id=redeem_code_id,
        drop_id=drop_id,
        serial_number=serial,
        acquisition_source=acquisition_source,
        acquired_at=now(),
    )
    session.add(user_card)
    # Flush the parent row before inserting the ledger event.  There is no
    # ORM relationship between these write-model records, so relying on one
    # combined flush can make SQLite emit the ledger insert first and violate
    # the user_cards foreign key.
    await session.flush()
    session.add(
        CardOwnershipLedger(
            id=f"ledger_{uuid4().hex[:12]}",
            user_card_id=user_card.id,
            user_id=user_id,
            card_id=card_id,
            action="grant",
            source_type=source_type,
            source_id=source_id,
            to_user_id=user_id,
            metadata_json=metadata or {},
        )
    )
    await session.flush()
    await notify_followers_of_card(session, user_card=user_card)
    return user_card


async def notify_followers_of_card(session: AsyncSession, *, user_card: UserCard) -> None:
    """Notify followers once when a public collection receives a card."""
    visibility = await session.get(CardVisibility, user_card.user_id)
    if visibility is not None and not visibility.public_enabled:
        return
    owner = await session.get(User, user_card.user_id)
    card = await session.get(Card, user_card.card_id)
    if owner is None or card is None:
        return
    follower_ids = list(
        await session.scalars(
            select(Follow.follower_id).where(Follow.following_id == user_card.user_id)
        )
    )
    owner_name = owner.nickname or owner.email or owner.id
    for follower_id in follower_ids:
        if await session.scalar(
            select(UserBlock.id).where(
                or_(
                    (UserBlock.blocker_id == follower_id)
                    & (UserBlock.blocked_id == user_card.user_id),
                    (UserBlock.blocker_id == user_card.user_id)
                    & (UserBlock.blocked_id == follower_id),
                )
            )
        ):
            continue
        await notify_user_once(
            session,
            user_id=follower_id,
            kind="following_card_collected",
            title=f"{owner_name}님이 새 카드를 모았어요",
            body=f"{card.name} 카드가 공개 컬렉션에 추가됐습니다.",
            entity_type="fan",
            entity_id=user_card.user_id,
            event_key=f"following-card:{user_card.user_id}:{user_card.id}:{follower_id}",
        )


def magic_link_token_hash(token: str) -> str:
    """Persist a digest so a database leak cannot be used as a login link."""
    return sha256(token.encode()).hexdigest()


async def record_engagement_event(
    session: AsyncSession,
    *,
    user_id: str,
    kind: str,
    source_type: str,
    source_id: str,
    payload: dict | None = None,
) -> EngagementEvent:
    existing = await session.scalar(
        select(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.kind == kind,
            EngagementEvent.source_type == source_type,
            EngagementEvent.source_id == source_id,
        )
    )
    if existing:
        return existing

    event = EngagementEvent(
        id=f"evt_{uuid4().hex[:12]}",
        user_id=user_id,
        kind=kind,
        source_type=source_type,
        source_id=source_id,
        payload=payload or {},
    )
    try:
        async with session.begin_nested():
            session.add(event)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(EngagementEvent).where(
                EngagementEvent.user_id == user_id,
                EngagementEvent.kind == kind,
                EngagementEvent.source_type == source_type,
                EngagementEvent.source_id == source_id,
            )
        )
        if existing:
            return existing
        raise
    return event


async def record_analytics_event(
    session: AsyncSession,
    *,
    event_name: str,
    user_id: str | None = None,
    organization_id: str | None = None,
    artist_id: str | None = None,
    card_id: str | None = None,
    pack_id: str | None = None,
    source: str | None = None,
    dedupe_key: str | None = None,
    metadata: dict | None = None,
) -> AnalyticsEvent:
    """Record an analytics event without duplicating retried lifecycle actions."""
    if dedupe_key:
        existing = await session.scalar(
            select(AnalyticsEvent).where(AnalyticsEvent.dedupe_key == dedupe_key)
        )
        if existing:
            return existing
    event = AnalyticsEvent(
        id=f"analytics_{uuid4().hex[:12]}",
        event_name=event_name,
        user_id=user_id,
        organization_id=organization_id,
        artist_id=artist_id,
        card_id=card_id,
        pack_id=pack_id,
        source=source,
        dedupe_key=dedupe_key,
        metadata_json=metadata or {},
    )
    try:
        async with session.begin_nested():
            session.add(event)
            await session.flush()
    except IntegrityError:
        if dedupe_key:
            existing = await session.scalar(
                select(AnalyticsEvent).where(AnalyticsEvent.dedupe_key == dedupe_key)
            )
            if existing:
                return existing
        raise
    return event


async def grant_xp(
    session: AsyncSession,
    *,
    user_id: str,
    event_id: str,
    rule_key: str,
    amount: int,
) -> XpLedger:
    existing = await session.scalar(
        select(XpLedger).where(
            XpLedger.user_id == user_id,
            XpLedger.event_id == event_id,
            XpLedger.rule_key == rule_key,
        )
    )
    if existing:
        return existing

    row = XpLedger(
        id=f"xp_{uuid4().hex[:12]}",
        user_id=user_id,
        event_id=event_id,
        rule_key=rule_key,
        amount=amount,
    )
    try:
        async with session.begin_nested():
            session.add(row)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(XpLedger).where(
                XpLedger.user_id == user_id,
                XpLedger.event_id == event_id,
                XpLedger.rule_key == rule_key,
            )
        )
        if existing:
            return existing
        raise

    total_xp = await session.scalar(
        select(func.coalesce(func.sum(XpLedger.amount), 0)).where(XpLedger.user_id == user_id)
    )
    level = await session.get(FanLevel, user_id)
    if level is None:
        level = FanLevel(user_id=user_id)
        session.add(level)
    level.total_xp = int(total_xp or 0)
    level.level = await level_for_total_xp(session, total_xp=level.total_xp)
    return row


async def level_for_total_xp(session: AsyncSession, *, total_xp: int) -> int:
    active_policy_id = await session.scalar(
        select(LevelPolicyVersion.id)
        .where(
            LevelPolicyVersion.status == "published",
            LevelPolicyVersion.is_active.is_(True),
            or_(
                LevelPolicyVersion.effective_at.is_(None),
                LevelPolicyVersion.effective_at <= now(),
            ),
        )
        .order_by(LevelPolicyVersion.effective_at.desc().nullslast(), LevelPolicyVersion.id)
        .limit(1)
    )
    if active_policy_id is None:
        return max(1, total_xp // 100 + 1)
    threshold_level = await session.scalar(
        select(LevelThreshold.level)
        .where(
            LevelThreshold.policy_version_id == active_policy_id,
            LevelThreshold.required_xp <= max(0, total_xp),
        )
        .order_by(LevelThreshold.level.desc())
        .limit(1)
    )
    return int(threshold_level or 1)


async def _get_or_create_point_balance_for_update(
    session: AsyncSession, *, user_id: str
) -> PointBalance:
    balance = await session.scalar(
        select(PointBalance).where(PointBalance.user_id == user_id).with_for_update()
    )
    if balance is not None:
        return balance

    balance = PointBalance(user_id=user_id)
    try:
        async with session.begin_nested():
            session.add(balance)
            await session.flush()
    except IntegrityError:
        balance = await session.scalar(
            select(PointBalance).where(PointBalance.user_id == user_id).with_for_update()
        )
        if balance is not None:
            return balance
        raise
    return balance


async def grant_points(
    session: AsyncSession,
    *,
    user_id: str,
    source_event_id: str,
    rule_key: str,
    amount: int,
    description: str | None = None,
    metadata: dict | None = None,
    expires_at: datetime | None = None,
) -> PointLedger:
    if amount <= 0:
        raise AppError(422, "INVALID_POINT_AMOUNT", "point amount must be positive")
    existing = await session.scalar(
        select(PointLedger).where(
            PointLedger.user_id == user_id,
            PointLedger.source_event_id == source_event_id,
            PointLedger.rule_key == rule_key,
        )
    )
    if existing:
        return existing

    ledger = PointLedger(
        id=f"point_{uuid4().hex[:12]}",
        user_id=user_id,
        source_event_id=source_event_id,
        rule_key=rule_key,
        transaction_type="earn",
        amount=amount,
        balance_after=0,
        description=description,
        expires_at=expires_at,
        metadata_json=metadata or {},
    )
    try:
        async with session.begin_nested():
            session.add(ledger)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(PointLedger).where(
                PointLedger.user_id == user_id,
                PointLedger.source_event_id == source_event_id,
                PointLedger.rule_key == rule_key,
            )
        )
        if existing:
            return existing
        raise
    balance = await _get_or_create_point_balance_for_update(session, user_id=user_id)
    balance.balance += amount
    ledger.balance_after = balance.balance
    return ledger


def point_charge_package(package_id: str) -> dict:
    package = next((item for item in POINT_CHARGE_PACKAGES if item["id"] == package_id), None)
    if package is None:
        raise AppError(404, "POINT_PACKAGE_NOT_FOUND", "포인트 충전 상품을 찾을 수 없습니다.")
    return package


async def resolve_point_charge_package(session: AsyncSession, package_id: str) -> dict:
    packages = await ensure_point_charge_packages(session)
    package = next((item for item in packages if item.id == package_id), None)
    if package is None:
        raise AppError(404, "POINT_PACKAGE_NOT_FOUND", "포인트 충전 상품을 찾을 수 없습니다.")
    if package.status != "active":
        raise AppError(409, "POINT_PACKAGE_INACTIVE", "현재 판매하지 않는 포인트 상품입니다.")
    scheduled_at = package.scheduled_publish_at
    if scheduled_at is not None:
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        if scheduled_at > now():
            raise AppError(
                409, "POINT_PACKAGE_NOT_PUBLISHED", "아직 공개되지 않은 포인트 상품입니다."
            )
    return _point_charge_package_data(package)


async def create_point_charge(
    session: AsyncSession,
    *,
    user_id: str,
    package_id: str,
    payment_method: str,
    idempotency_key: str,
) -> PointCharge:
    package = await resolve_point_charge_package(session, package_id)
    existing = await session.scalar(
        select(PointCharge).where(
            PointCharge.user_id == user_id,
            PointCharge.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return existing
    event = await record_engagement_event(
        session,
        user_id=user_id,
        kind="points_charged",
        source_type="point_charge",
        source_id=f"{user_id}:{idempotency_key}",
        payload={
            "packageId": package_id,
            "points": package["points"],
            "paymentMethod": payment_method,
        },
    )
    ledger = await grant_points(
        session,
        user_id=user_id,
        source_event_id=event.id,
        rule_key=f"point_charge:{package_id}",
        amount=package["points"],
        description=f"포인트 충전 {package['label']}",
        metadata={"packageId": package_id, "paymentMethod": payment_method},
    )
    charge = PointCharge(
        id=f"point_charge_{uuid4().hex[:12]}",
        user_id=user_id,
        package_id=package_id,
        payment_method=payment_method,
        points=package["points"],
        price_won=package["priceWon"],
        status="completed",
        idempotency_key=idempotency_key,
        ledger_id=ledger.id,
    )
    transaction = PointTransaction(
        id=f"point_tx_{uuid4().hex[:12]}",
        user_id=user_id,
        operation="charge",
        idempotency_key=idempotency_key,
        amount=package["points"],
        ledger_id=ledger.id,
        status="completed",
    )
    session.add_all([charge, transaction])
    await session.flush()
    return charge


async def refund_point_charge(
    session: AsyncSession, *, user_id: str, charge_id: str
) -> PointCharge:
    charge = await session.scalar(
        select(PointCharge)
        .where(PointCharge.id == charge_id, PointCharge.user_id == user_id)
        .with_for_update()
    )
    if charge is None:
        raise AppError(404, "POINT_CHARGE_NOT_FOUND", "포인트 충전 내역을 찾을 수 없습니다.")
    if charge.status == "refunded":
        return charge
    if charge.status != "completed" or not charge.ledger_id:
        raise AppError(409, "POINT_CHARGE_NOT_REFUNDABLE", "환불할 수 없는 충전 상태입니다.")
    event = await record_engagement_event(
        session,
        user_id=user_id,
        kind="points_refunded",
        source_type="point_charge_refund",
        source_id=charge.id,
        payload={"chargeId": charge.id, "points": charge.points},
    )
    balance = await _get_or_create_point_balance_for_update(session, user_id=user_id)
    if balance.balance < charge.points:
        raise AppError(
            409, "POINT_CHARGE_REFUND_BALANCE", "이미 사용한 포인트가 있어 환불할 수 없습니다."
        )
    balance.balance -= charge.points
    session.add(
        PointLedger(
            id=f"point_{uuid4().hex[:12]}",
            user_id=user_id,
            source_event_id=event.id,
            rule_key=f"point_charge_refund:{charge.id}",
            transaction_type="reverse",
            amount=-charge.points,
            balance_after=balance.balance,
            description=f"포인트 충전 환불 {charge.points:,}P",
            reversed_ledger_id=charge.ledger_id,
            metadata_json={"chargeId": charge.id},
        )
    )
    charge.status = "refunded"
    charge.refunded_at = now()
    await session.flush()
    return charge


async def spend_points(
    session: AsyncSession,
    *,
    user_id: str,
    source_event_id: str,
    rule_key: str,
    amount: int,
    description: str | None = None,
    metadata: dict | None = None,
) -> PointLedger:
    if amount <= 0:
        raise AppError(422, "INVALID_POINT_AMOUNT", "point amount must be positive")
    existing = await session.scalar(
        select(PointLedger).where(
            PointLedger.user_id == user_id,
            PointLedger.source_event_id == source_event_id,
            PointLedger.rule_key == rule_key,
        )
    )
    if existing:
        return existing

    balance = await session.scalar(
        select(PointBalance).where(PointBalance.user_id == user_id).with_for_update()
    )
    if balance is None or balance.balance < amount:
        raise AppError(409, "INSUFFICIENT_POINTS", "포인트가 부족합니다.")
    balance.balance -= amount
    ledger = PointLedger(
        id=f"point_{uuid4().hex[:12]}",
        user_id=user_id,
        source_event_id=source_event_id,
        rule_key=rule_key,
        transaction_type="spend",
        amount=-amount,
        balance_after=balance.balance,
        description=description,
        metadata_json=metadata or {},
    )
    session.add(ledger)
    await session.flush()
    return ledger


async def reverse_points(
    session: AsyncSession,
    *,
    user_id: str,
    source_event_id: str,
    rule_key: str,
    amount: int,
    reversed_ledger_id: str,
    description: str | None = None,
    metadata: dict | None = None,
) -> PointLedger:
    """Return spent points while preserving the original debit provenance."""
    if amount <= 0:
        raise AppError(422, "INVALID_POINT_AMOUNT", "point amount must be positive")
    existing = await session.scalar(
        select(PointLedger).where(
            PointLedger.user_id == user_id,
            PointLedger.source_event_id == source_event_id,
            PointLedger.rule_key == rule_key,
        )
    )
    if existing:
        return existing
    balance = await _get_or_create_point_balance_for_update(session, user_id=user_id)
    balance.balance += amount
    ledger = PointLedger(
        id=f"point_{uuid4().hex[:12]}",
        user_id=user_id,
        source_event_id=source_event_id,
        rule_key=rule_key,
        transaction_type="reverse",
        amount=amount,
        balance_after=balance.balance,
        description=description,
        reversed_ledger_id=reversed_ledger_id,
        metadata_json=metadata or {},
    )
    session.add(ledger)
    await session.flush()
    return ledger


def base_xp_for(event: EngagementEvent) -> int:
    if event.kind == "card_collected":
        return 30
    if event.kind == "card_revoked":
        return -30
    return 0


async def card_collected_source_is_eligible(session: AsyncSession, event: EngagementEvent) -> bool:
    if event.kind != "card_collected":
        return True
    if event.source_type != "user_card":
        return False

    conditions = [
        *eligible_source_card_conditions(user_id=event.user_id),
        UserCard.id == event.source_id,
    ]
    card_id = event.payload.get("cardId")
    if card_id:
        conditions.append(UserCard.card_id == card_id)
    drop_id = event.payload.get("dropId")
    if drop_id:
        conditions.append(UserCard.drop_id == drop_id)

    return bool(
        await session.scalar(
            select(UserCard.id)
            .join(Card, Card.id == UserCard.card_id)
            .join(Drop, Drop.id == Card.drop_id)
            .where(*conditions)
        )
    )


async def published_definitions_for_event(
    session: AsyncSession, event: EngagementEvent
) -> list[AchievementDefinition]:
    if event.kind != "card_collected":
        return []
    artist_id = event.payload.get("artistId")
    organization_id = await organization_id_for_card_collected_event(session, event)
    organization_filters = (
        [
            AchievementDefinition.organization_id.is_(None),
            or_(
                AchievementDefinition.artist_id.is_(None),
                AchievementDefinition.artist_id == artist_id,
            ),
        ]
        if organization_id is None
        else [
            or_(
                AchievementDefinition.organization_id == organization_id,
                and_(
                    AchievementDefinition.organization_id.is_(None),
                    AchievementDefinition.artist_id.is_(None),
                ),
            )
        ]
    )
    return list(
        await session.scalars(
            select(AchievementDefinition).where(
                AchievementDefinition.status == "published",
                *organization_filters,
                or_(
                    AchievementDefinition.artist_id.is_(None),
                    AchievementDefinition.artist_id == artist_id,
                ),
            )
        )
    )


async def organization_id_for_card_collected_event(
    session: AsyncSession, event: EngagementEvent
) -> str | None:
    if event.kind != "card_collected":
        return None
    if event.source_type == "user_card":
        organization_id = await session.scalar(
            select(Drop.organization_id)
            .select_from(UserCard)
            .join(Card, Card.id == UserCard.card_id)
            .join(Drop, Drop.id == Card.drop_id)
            .where(UserCard.id == event.source_id, UserCard.user_id == event.user_id)
        )
        if organization_id is not None:
            return organization_id

    card_id = event.payload.get("cardId")
    drop_id = event.payload.get("dropId")
    if card_id or drop_id:
        conditions = []
        if card_id:
            conditions.append(Card.id == card_id)
        if drop_id:
            conditions.append(Drop.id == drop_id)
        return await session.scalar(
            select(Drop.organization_id)
            .select_from(Card)
            .join(Drop, Drop.id == Card.drop_id)
            .where(*conditions)
        )
    return None


async def organization_id_for_event(session: AsyncSession, event: EngagementEvent) -> str | None:
    organization_id = event.payload.get("organizationId")
    if organization_id:
        return str(organization_id)
    return await organization_id_for_card_collected_event(session, event)


def mission_period_key(
    recurrence: str,
    event_time: datetime,
    starts_at: datetime | None,
    ends_at: datetime | None,
) -> str:
    event_time = _as_aware_utc(event_time) or now()
    if recurrence == "daily":
        return event_time.date().isoformat()
    if recurrence == "weekly":
        year, week, _ = event_time.isocalendar()
        return f"{year}-W{week:02d}"
    if recurrence == "season":
        start = _datetime_data(starts_at) or "open"
        end = _datetime_data(ends_at) or "open"
        return f"season:{start}:{end}"
    return "once"


def _payload_value_matches(expected: object, actual: object) -> bool:
    if isinstance(expected, list):
        return actual in expected
    return actual == expected


def mission_payload_matches(mission: MissionDefinition, event: EngagementEvent) -> bool:
    for key, expected in (mission.condition_payload or {}).items():
        if key not in event.payload:
            return False
        if not _payload_value_matches(expected, event.payload.get(key)):
            return False
    return True


async def published_missions_for_event(
    session: AsyncSession, event: EngagementEvent
) -> list[MissionDefinition]:
    event_time = now()
    organization_id = await organization_id_for_event(session, event)
    artist_id = event.payload.get("artistId")
    candidates = list(
        await session.scalars(
            select(MissionDefinition).where(
                MissionDefinition.status == "published",
                MissionDefinition.event_kind == event.kind,
                or_(
                    MissionDefinition.starts_at.is_(None), MissionDefinition.starts_at <= event_time
                ),
                or_(MissionDefinition.ends_at.is_(None), MissionDefinition.ends_at >= event_time),
            )
        )
    )
    missions = []
    for mission in candidates:
        if mission.organization_id is not None and mission.organization_id != organization_id:
            continue
        if mission.artist_id is not None and mission.artist_id != artist_id:
            continue
        if not mission_payload_matches(mission, event):
            continue
        missions.append(mission)
    return missions


async def get_or_create_mission_progress(
    session: AsyncSession, *, user_id: str, mission_id: str, period_key: str
) -> MissionProgress:
    progress = await session.scalar(
        select(MissionProgress).where(
            MissionProgress.user_id == user_id,
            MissionProgress.mission_id == mission_id,
            MissionProgress.period_key == period_key,
        )
    )
    if progress:
        return progress
    progress = MissionProgress(
        id=f"mission_progress_{uuid4().hex[:12]}",
        user_id=user_id,
        mission_id=mission_id,
        period_key=period_key,
    )
    try:
        async with session.begin_nested():
            session.add(progress)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(MissionProgress).where(
                MissionProgress.user_id == user_id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.period_key == period_key,
            )
        )
        if existing:
            return existing
        raise
    return progress


async def notify_mission_once(
    session: AsyncSession,
    *,
    user_id: str,
    mission: MissionDefinition,
    period_key: str,
) -> None:
    event_key = f"mission:{mission.id}:{user_id}:{period_key}"
    if await session.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.event_key == event_key,
        )
    ):
        return
    session.add(
        Notification(
            id=f"notification_{uuid4().hex[:12]}",
            user_id=user_id,
            kind="mission_completed",
            title="미션을 완료했어요",
            body=f"{mission.title} 미션 보상이 지급되었습니다.",
            entity_type="mission",
            entity_id=mission.id,
            event_key=event_key,
        )
    )


async def deliver_mission_reward(
    session: AsyncSession,
    *,
    event: EngagementEvent,
    mission: MissionDefinition,
    period_key: str,
) -> None:
    reward_payload = mission.reward_payload or {}
    rule_key = f"mission:{mission.id}:{period_key}"
    xp = int(reward_payload.get("xp") or 0)
    if xp:
        await grant_xp(
            session,
            user_id=event.user_id,
            event_id=event.id,
            rule_key=rule_key,
            amount=xp,
        )
    points = int(reward_payload.get("points") or 0)
    if points:
        await grant_points(
            session,
            user_id=event.user_id,
            source_event_id=event.id,
            rule_key=rule_key,
            amount=points,
            description=f"Mission reward: {mission.title}",
            metadata={"missionId": mission.id, "periodKey": period_key},
        )
    reward_id = reward_payload.get("rewardId")
    if reward_id:
        await grant_reward(
            session,
            user_id=event.user_id,
            reward_id=str(reward_id),
            source_event_id=event.id,
            rule_key=rule_key,
        )
    await notify_mission_once(
        session,
        user_id=event.user_id,
        mission=mission,
        period_key=period_key,
    )


async def update_mission_progress(
    session: AsyncSession,
    *,
    event: EngagementEvent,
    mission: MissionDefinition,
) -> MissionProgress:
    period_key = mission_period_key(
        mission.recurrence,
        now(),
        mission.starts_at,
        mission.ends_at,
    )
    progress = await get_or_create_mission_progress(
        session,
        user_id=event.user_id,
        mission_id=mission.id,
        period_key=period_key,
    )
    was_completed = progress.completed_at is not None
    if progress.completed_at is None:
        progress.current_value = min(progress.current_value + 1, mission.target_value)
        progress.updated_at = now()
        if progress.current_value >= mission.target_value:
            progress.completed_at = now()
    if progress.completed_at is not None and not was_completed:
        await deliver_mission_reward(
            session,
            event=event,
            mission=mission,
            period_key=period_key,
        )
    return progress


def eligible_source_card_conditions(*, user_id: str) -> list[object]:
    return [
        UserCard.user_id == user_id,
        Card.status == "published",
        Card.is_official.is_(True),
        Card.release_status == "published",
        UserCard.drop_id == Card.drop_id,
        Drop.status == "live",
    ]


def achievement_source_scope_conditions(achievement: AchievementDefinition) -> list[object]:
    conditions = []
    if achievement.organization_id is not None:
        conditions.append(Drop.organization_id == achievement.organization_id)
    if achievement.artist_id is not None:
        conditions.append(Card.artist_id == achievement.artist_id)
    return conditions


async def owned_card_query_value(
    session: AsyncSession,
    *,
    user_id: str,
    achievement: AchievementDefinition,
    value: str,
) -> int:
    conditions = [
        *eligible_source_card_conditions(user_id=user_id),
        *achievement_source_scope_conditions(achievement),
    ]
    member_id = achievement.condition_payload.get("memberId")
    if member_id:
        conditions.append(Card.member_id == member_id)
    return int(
        await session.scalar(
            select(func.count(func.distinct(value)))
            .select_from(UserCard)
            .join(Card, Card.id == UserCard.card_id)
            .join(Drop, Drop.id == Card.drop_id)
            .where(*conditions)
        )
        or 0
    )


async def achievement_current_value(
    session: AsyncSession,
    *,
    event: EngagementEvent,
    definition: AchievementDefinition,
) -> int:
    payload = definition.condition_payload or {}
    if definition.condition_type == "first_card":
        return min(
            1,
            await owned_card_query_value(
                session, user_id=event.user_id, achievement=definition, value=Card.id
            ),
        )
    if definition.condition_type == "card_count":
        return await owned_card_query_value(
            session, user_id=event.user_id, achievement=definition, value=Card.id
        )
    if definition.condition_type == "member_count":
        return await owned_card_query_value(
            session, user_id=event.user_id, achievement=definition, value=Card.member_id
        )
    if definition.condition_type == "specific_card":
        card_id = payload.get("cardId")
        if not card_id:
            return 0
        return int(
            bool(
                await session.scalar(
                    select(UserCard.id)
                    .join(Card, Card.id == UserCard.card_id)
                    .join(Drop, Drop.id == Card.drop_id)
                    .where(
                        *eligible_source_card_conditions(user_id=event.user_id),
                        *achievement_source_scope_conditions(definition),
                        UserCard.card_id == card_id,
                    )
                )
            )
        )
    if definition.condition_type == "set_complete":
        campaign_id = payload.get("campaignId")
        campaign = await session.get(CollectionCampaign, campaign_id) if campaign_id else None
        required_card_ids = list(
            campaign.required_card_ids if campaign else payload.get("cardIds", [])
        )
        if not required_card_ids:
            return 0
        owned_card_ids = set(
            await session.scalars(
                select(UserCard.card_id)
                .join(Card, Card.id == UserCard.card_id)
                .join(Drop, Drop.id == Card.drop_id)
                .where(
                    *eligible_source_card_conditions(user_id=event.user_id),
                    *achievement_source_scope_conditions(definition),
                    UserCard.card_id.in_(required_card_ids),
                )
            )
        )
        return len(owned_card_ids)
    if definition.condition_type == "drop_participation":
        drop_id = payload.get("dropId") or event.payload.get("dropId")
        if not drop_id:
            return 0
        return int(
            bool(
                await session.scalar(
                    select(UserCard.id)
                    .join(Card, Card.id == UserCard.card_id)
                    .join(Drop, Drop.id == Card.drop_id)
                    .where(
                        *eligible_source_card_conditions(user_id=event.user_id),
                        *achievement_source_scope_conditions(definition),
                        Card.drop_id == drop_id,
                    )
                )
            )
        )
    return 0


async def get_or_create_achievement_progress(
    session: AsyncSession, *, user_id: str, achievement_id: str
) -> AchievementProgress:
    progress = await session.scalar(
        select(AchievementProgress).where(
            AchievementProgress.user_id == user_id,
            AchievementProgress.achievement_id == achievement_id,
        )
    )
    if progress:
        return progress
    progress = AchievementProgress(
        id=f"achievement_progress_{uuid4().hex[:12]}",
        user_id=user_id,
        achievement_id=achievement_id,
    )
    try:
        async with session.begin_nested():
            session.add(progress)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(AchievementProgress).where(
                AchievementProgress.user_id == user_id,
                AchievementProgress.achievement_id == achievement_id,
            )
        )
        if existing:
            return existing
        raise
    return progress


async def grant_reward(
    session: AsyncSession,
    *,
    user_id: str,
    reward_id: str,
    source_event_id: str,
    rule_key: str,
) -> RewardGrant:
    existing = await session.scalar(
        select(RewardGrant).where(
            RewardGrant.user_id == user_id,
            RewardGrant.source_event_id == source_event_id,
            RewardGrant.rule_key == rule_key,
        )
    )
    if existing:
        return existing
    reward = await session.get(RewardCatalog, reward_id)
    if reward is None or reward.status != "published":
        raise AppError(409, "REWARD_NOT_PUBLISHED", "공개된 보상을 찾을 수 없습니다.")
    grant = RewardGrant(
        id=f"reward_grant_{uuid4().hex[:12]}",
        user_id=user_id,
        reward_id=reward_id,
        source_event_id=source_event_id,
        rule_key=rule_key,
    )
    try:
        async with session.begin_nested():
            session.add(grant)
            await session.flush()
    except IntegrityError:
        existing = await session.scalar(
            select(RewardGrant).where(
                RewardGrant.user_id == user_id,
                RewardGrant.source_event_id == source_event_id,
                RewardGrant.rule_key == rule_key,
            )
        )
        if existing:
            return existing
        raise
    return grant


def _datetime_data(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _reward_grant_data(grant: RewardGrant, reward: RewardCatalog) -> dict:
    return {
        "id": grant.id,
        "rewardId": reward.id,
        "type": reward.reward_type,
        "name": reward.name,
        "metadata": reward.metadata_,
        "grantedAt": _datetime_data(grant.granted_at),
        "claimedAt": _datetime_data(grant.claimed_at),
    }


async def _reward_grant_with_catalog(
    session: AsyncSession, *, user_id: str, grant_id: str
) -> tuple[RewardGrant, RewardCatalog] | None:
    row = (
        await session.execute(
            select(RewardGrant, RewardCatalog)
            .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
            .where(
                RewardGrant.id == grant_id,
                RewardGrant.user_id == user_id,
                RewardGrant.revoked_at.is_(None),
                RewardCatalog.status == "published",
            )
        )
    ).one_or_none()
    return row if row else None


async def _locked_reward_grant_with_catalog(
    session: AsyncSession, *, user_id: str, grant_id: str
) -> tuple[RewardGrant, RewardCatalog] | None:
    grant = await session.scalar(
        select(RewardGrant)
        .where(
            RewardGrant.id == grant_id,
            RewardGrant.user_id == user_id,
            RewardGrant.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if grant is None:
        return None
    reward = await session.get(RewardCatalog, grant.reward_id)
    if reward is None or reward.status != "published":
        return None
    return grant, reward


async def _equipment_data(session: AsyncSession, *, user_id: str) -> dict:
    equipment = await session.get(ProfileEquipment, user_id)
    equipped_reward_ids = list(equipment.equipped_reward_ids if equipment else [])
    result = {
        "titleRewardId": None,
        "badgeRewardIds": [],
        "frameRewardId": None,
        "themeRewardId": None,
        "publicProfileEnabled": equipment.is_public if equipment else False,
    }
    if not equipped_reward_ids:
        return result

    rows = (
        await session.execute(
            select(RewardGrant.id, RewardCatalog.reward_type)
            .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
            .where(
                RewardGrant.user_id == user_id,
                RewardGrant.id.in_(equipped_reward_ids),
                RewardGrant.revoked_at.is_(None),
            )
        )
    ).all()
    reward_type_by_grant_id = {grant_id: reward_type for grant_id, reward_type in rows}
    for grant_id in equipped_reward_ids:
        reward_type = reward_type_by_grant_id.get(grant_id)
        if reward_type == "title" and result["titleRewardId"] is None:
            result["titleRewardId"] = grant_id
        elif reward_type == "badge" and len(result["badgeRewardIds"]) < 3:
            result["badgeRewardIds"].append(grant_id)
        elif reward_type == "profile_frame" and result["frameRewardId"] is None:
            result["frameRewardId"] = grant_id
        elif reward_type == "collection_theme" and result["themeRewardId"] is None:
            result["themeRewardId"] = grant_id
    return result


def _event_artist_expression():
    return EngagementEvent.payload["artistId"].as_string()


def _global_pass_reward_grant_filter():
    """Treat a grant from a global pass as global even if its catalog is artist-tagged.

    Older/admin-created pass rewards may retain an artist association in the
    catalog while the pass season itself is global. The pass event is the
    authoritative source for that grant's scope.
    """
    return (
        select(PassTier.id)
        .join(PassSeason, PassSeason.id == PassTier.season_id)
        .join(
            EngagementEvent,
            and_(
                EngagementEvent.id == RewardGrant.source_event_id,
                EngagementEvent.source_type == "pass_tier",
                EngagementEvent.source_id == PassTier.id,
            ),
        )
        .where(PassSeason.artist_id.is_(None))
        .exists()
    )


async def fan_progression_data(
    session: AsyncSession,
    user_id: str,
    artist_id: str | None = None,
    global_scope: bool = False,
) -> dict:
    total_xp = await scoped_user_xp(session, user_id=user_id, artist_id=artist_id)
    level_number = await level_for_total_xp(session, total_xp=total_xp)
    definitions = list(
        await session.scalars(
            select(AchievementDefinition)
            .where(
                AchievementDefinition.status == "published",
                or_(
                    AchievementDefinition.artist_id.is_(None)
                    if global_scope
                    else True
                    if artist_id is None
                    else AchievementDefinition.artist_id == artist_id,
                ),
            )
            .order_by(AchievementDefinition.title, AchievementDefinition.id)
        )
    )
    achievements = []
    for definition in definitions:
        progress = await session.scalar(
            select(AchievementProgress).where(
                AchievementProgress.user_id == user_id,
                AchievementProgress.achievement_id == definition.id,
            )
        )
        current_value = progress.current_value if progress else 0
        achievements.append(
            {
                "id": definition.id,
                "title": definition.title,
                "description": definition.description,
                "conditionType": definition.condition_type,
                "targetValue": definition.target_value,
                "currentValue": current_value,
                "completedAt": _datetime_data(progress.completed_at if progress else None),
            }
        )

    reward_scope_filter = (
        or_(RewardCatalog.artist_id.is_(None), _global_pass_reward_grant_filter())
        if global_scope
        else True
        if artist_id is None
        else RewardCatalog.artist_id == artist_id
    )
    claimable_reward_rows = (
        await session.execute(
            select(RewardGrant, RewardCatalog)
            .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
            .where(
                RewardGrant.user_id == user_id,
                RewardGrant.claimed_at.is_(None),
                RewardGrant.revoked_at.is_(None),
                RewardCatalog.status == "published",
                reward_scope_filter,
            )
            .order_by(RewardGrant.granted_at, RewardGrant.id)
        )
    ).all()
    claimed_reward_rows = (
        await session.execute(
            select(RewardGrant, RewardCatalog)
            .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
            .where(
                RewardGrant.user_id == user_id,
                RewardGrant.claimed_at.is_not(None),
                RewardGrant.revoked_at.is_(None),
                RewardCatalog.status == "published",
                reward_scope_filter,
            )
            .order_by(RewardGrant.claimed_at, RewardGrant.granted_at, RewardGrant.id)
        )
    ).all()
    events = list(
        await session.scalars(
            select(EngagementEvent)
            .where(EngagementEvent.user_id == user_id)
            .order_by(EngagementEvent.id)
        )
    )
    return {
        "level": {
            "level": level_number,
            "totalXp": total_xp,
        },
        "achievements": achievements,
        "claimableRewards": [
            _reward_grant_data(grant, reward) for grant, reward in claimable_reward_rows
        ],
        "claimedRewards": [
            _reward_grant_data(grant, reward) for grant, reward in claimed_reward_rows
        ],
        "pass": await fan_pass_data(
            session, user_id=user_id, artist_id=artist_id, global_scope=global_scope
        ),
        "equipment": await _equipment_data(session, user_id=user_id),
        "debugEvents": [
            {
                "kind": event.kind,
                "sourceUserCardId": event.source_id if event.source_type == "user_card" else None,
                "status": event.status,
            }
            for event in events
        ],
    }


async def claim_reward_grant(session: AsyncSession, *, user_id: str, grant_id: str) -> dict:
    row = await _locked_reward_grant_with_catalog(session, user_id=user_id, grant_id=grant_id)
    if row is None:
        raise AppError(404, "REWARD_GRANT_NOT_FOUND", "수령할 보상을 찾을 수 없습니다.")
    grant, reward = row
    if grant.claimed_at is None:
        grant.claimed_at = now()
        session.add(
            Notification(
                id=f"notification_{uuid4().hex[:12]}",
                user_id=user_id,
                kind="reward_claimed",
                title="보상을 보관함에 추가했어요",
                body=f"{reward.name} 보상을 보관함에서 확인할 수 있어요.",
                entity_type="reward_grant",
                entity_id=grant.id,
                event_key=f"reward:{grant.id}:claimed",
            )
        )
        await session.commit()
    return _reward_grant_data(grant, reward)


async def _validate_equipment_reward(
    session: AsyncSession,
    *,
    user_id: str,
    grant_id: str,
    expected_type: str,
) -> None:
    row = await _reward_grant_with_catalog(session, user_id=user_id, grant_id=grant_id)
    if row is None:
        raise AppError(404, "REWARD_GRANT_NOT_FOUND", "장착할 보상을 찾을 수 없습니다.")
    grant, reward = row
    if grant.claimed_at is None:
        raise AppError(409, "REWARD_GRANT_UNCLAIMED", "보상을 수령한 뒤 장착할 수 있습니다.")
    if reward.reward_type != expected_type:
        raise AppError(
            422,
            "INVALID_EQUIPMENT_REWARD_TYPE",
            "장착 위치와 보상 유형이 일치하지 않습니다.",
        )


async def update_profile_equipment(session: AsyncSession, *, user_id: str, payload: object) -> dict:
    reward_ids = [
        payload.title_reward_id,
        *payload.badge_reward_ids,
        payload.frame_reward_id,
        payload.theme_reward_id,
    ]
    equipped_reward_ids = [reward_id for reward_id in reward_ids if reward_id]
    if len(equipped_reward_ids) != len(set(equipped_reward_ids)):
        raise AppError(422, "DUPLICATE_EQUIPMENT_REWARD", "같은 보상을 중복 장착할 수 없습니다.")

    if payload.title_reward_id:
        await _validate_equipment_reward(
            session, user_id=user_id, grant_id=payload.title_reward_id, expected_type="title"
        )
    for badge_reward_id in payload.badge_reward_ids:
        await _validate_equipment_reward(
            session, user_id=user_id, grant_id=badge_reward_id, expected_type="badge"
        )
    if payload.frame_reward_id:
        await _validate_equipment_reward(
            session,
            user_id=user_id,
            grant_id=payload.frame_reward_id,
            expected_type="profile_frame",
        )
    if payload.theme_reward_id:
        await _validate_equipment_reward(
            session,
            user_id=user_id,
            grant_id=payload.theme_reward_id,
            expected_type="collection_theme",
        )

    equipment = await session.get(ProfileEquipment, user_id)
    if equipment is None:
        equipment = ProfileEquipment(user_id=user_id)
        session.add(equipment)
    equipment.equipped_reward_ids = equipped_reward_ids
    equipment.is_public = payload.public_profile_enabled
    equipment.updated_at = now()
    await session.commit()
    return await _equipment_data(session, user_id=user_id)


async def notify_fan_once(
    session: AsyncSession,
    *,
    user_id: str,
    achievement: AchievementDefinition,
) -> None:
    event_key = f"achievement:{achievement.id}:{user_id}"
    if await session.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.event_key == event_key,
        )
    ):
        return
    session.add(
        Notification(
            id=f"notification_{uuid4().hex[:12]}",
            user_id=user_id,
            kind="achievement_unlocked",
            title="업적을 달성했어요",
            body=f"{achievement.title} 업적을 완료했습니다.",
            entity_type="achievement",
            entity_id=achievement.id,
            event_key=event_key,
        )
    )


async def update_achievement_progress(
    session: AsyncSession,
    *,
    event: EngagementEvent,
    definition: AchievementDefinition,
) -> AchievementProgress:
    progress = await get_or_create_achievement_progress(
        session, user_id=event.user_id, achievement_id=definition.id
    )
    was_completed = progress.completed_at is not None
    current_value = await achievement_current_value(session, event=event, definition=definition)
    progress.current_value = min(current_value, definition.target_value)
    progress.updated_at = now()
    if progress.current_value >= definition.target_value and progress.completed_at is None:
        progress.completed_at = now()
    if progress.completed_at is not None and not was_completed:
        xp_bonus = int((definition.condition_payload or {}).get("xpBonus") or 0)
        if xp_bonus:
            await grant_xp(
                session,
                user_id=event.user_id,
                event_id=event.id,
                rule_key=f"achievement:{definition.id}",
                amount=xp_bonus,
            )
        reward_id = definition.reward_rule_key or (definition.condition_payload or {}).get(
            "rewardId"
        )
        if reward_id:
            await grant_reward(
                session,
                user_id=event.user_id,
                reward_id=reward_id,
                source_event_id=event.id,
                rule_key=f"achievement:{definition.id}",
            )
        await notify_fan_once(session, user_id=event.user_id, achievement=definition)
    return progress


async def update_pass_progress(session: AsyncSession, *, event: EngagementEvent) -> None:
    seasons = list(
        await session.scalars(
            select(PassSeason).where(
                PassSeason.status == "published",
                or_(PassSeason.is_paid.is_(False), PassSeason.premium_enabled.is_(True)),
                or_(PassSeason.starts_at.is_(None), PassSeason.starts_at <= now()),
                or_(PassSeason.ends_at.is_(None), PassSeason.ends_at >= now()),
            )
        )
    )
    for season in seasons:
        await refresh_pass_progress(session, user_id=event.user_id, season=season)


async def current_user_xp(session: AsyncSession, *, user_id: str) -> int:
    return await scoped_user_xp(session, user_id=user_id)


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def scoped_user_xp(
    session: AsyncSession,
    *,
    user_id: str,
    artist_id: str | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> int:
    conditions = [XpLedger.user_id == user_id]
    season_starts_at = _as_aware_utc(starts_at)
    season_ends_at = _as_aware_utc(ends_at)
    if season_starts_at is not None:
        conditions.append(XpLedger.created_at >= season_starts_at)
    if season_ends_at is not None:
        conditions.append(XpLedger.created_at <= season_ends_at)
    query = select(func.coalesce(func.sum(XpLedger.amount), 0)).where(*conditions)
    if artist_id is not None:
        query = query.join(EngagementEvent, EngagementEvent.id == XpLedger.event_id).where(
            _event_artist_expression() == artist_id
        )
    total = await session.scalar(query)
    return int(total or 0)


async def refresh_pass_progress(
    session: AsyncSession,
    *,
    user_id: str,
    season: PassSeason,
    artist_id: str | None = None,
) -> PassProgress:
    progress = await session.scalar(
        select(PassProgress).where(
            PassProgress.user_id == user_id,
            PassProgress.season_id == season.id,
        )
    )
    if progress is None:
        progress = PassProgress(
            id=f"pass_progress_{user_id}_{season.id}",
            user_id=user_id,
            season_id=season.id,
            claimed_tier_ids=[],
        )
        try:
            async with session.begin_nested():
                session.add(progress)
                await session.flush()
        except IntegrityError:
            existing = await session.scalar(
                select(PassProgress).where(
                    PassProgress.user_id == user_id,
                    PassProgress.season_id == season.id,
                )
            )
            if existing is None:
                raise
            progress = existing
    progress.current_xp = await scoped_user_xp(
        session,
        user_id=user_id,
        artist_id=season.artist_id if season.artist_id is not None else artist_id,
        starts_at=season.starts_at,
        ends_at=season.ends_at,
    )
    progress.updated_at = now()
    return progress


def _season_active_for_pass_view(season: PassSeason, current_time: datetime) -> bool:
    starts_at = _as_aware_utc(season.starts_at)
    ends_at = _as_aware_utc(season.ends_at)
    return (starts_at is None or starts_at <= current_time) and (
        ends_at is None or ends_at >= current_time
    )


def _season_open_for_claim(season: PassSeason, current_time: datetime) -> bool:
    starts_at = _as_aware_utc(season.starts_at)
    ends_at = _as_aware_utc(season.ends_at)
    if starts_at is not None and starts_at > current_time:
        return False
    if ends_at is None:
        return True
    return current_time <= ends_at + timedelta(days=PASS_CLAIM_GRACE_DAYS)


def _pass_tier_data(
    tier: PassTier,
    progress: PassProgress,
    free_reward: RewardCatalog | None = None,
    premium_reward: RewardCatalog | None = None,
    premium_purchased: bool = False,
) -> dict:
    claimed_tier_ids = set(progress.claimed_tier_ids or [])
    claimed = tier.id in claimed_tier_ids
    premium_claimed_ids = set(progress.premium_claimed_tier_ids or [])
    premium_claimed = tier.id in premium_claimed_ids

    def reward_data(reward: RewardCatalog | None) -> dict | None:
        if reward is None or reward.status != "published":
            return None
        return {
            "id": reward.id,
            "type": reward.reward_type,
            "name": reward.name,
            "metadata": reward.metadata_,
        }

    data = {
        "id": tier.id,
        "tier": tier.tier,
        "requiredXp": tier.required_xp,
        "rewardId": tier.reward_id,
        "claimed": claimed,
        "claimable": not claimed and progress.current_xp >= tier.required_xp,
    }
    data["reward"] = reward_data(free_reward)
    if premium_reward is not None or tier.premium_reward_id:
        data.update(
            {
                "premiumRewardId": tier.premium_reward_id,
                "freeReward": reward_data(free_reward),
                "premiumReward": reward_data(premium_reward),
                "premiumClaimed": premium_claimed,
                "premiumClaimable": premium_purchased
                and not premium_claimed
                and progress.current_xp >= tier.required_xp,
            }
        )
    return data


async def fan_pass_data(
    session: AsyncSession,
    *,
    user_id: str,
    artist_id: str | None = None,
    global_scope: bool = False,
) -> dict:
    current_time = now()
    seasons = list(
        await session.scalars(
            select(PassSeason)
            .where(
                PassSeason.status == "published",
                or_(PassSeason.is_paid.is_(False), PassSeason.premium_enabled.is_(True)),
                or_(
                    PassSeason.artist_id.is_(None)
                    if global_scope
                    else True
                    if artist_id is None
                    else PassSeason.artist_id == artist_id,
                ),
            )
            .order_by(PassSeason.starts_at, PassSeason.id)
        )
    )
    items = []
    for season in seasons:
        if not _season_active_for_pass_view(season, current_time):
            continue
        progress = await refresh_pass_progress(
            session, user_id=user_id, season=season, artist_id=artist_id
        )
        FreeReward = aliased(RewardCatalog)
        PremiumReward = aliased(RewardCatalog)
        tier_rows = (
            await session.execute(
                select(PassTier, FreeReward, PremiumReward)
                .outerjoin(FreeReward, FreeReward.id == PassTier.reward_id)
                .outerjoin(PremiumReward, PremiumReward.id == PassTier.premium_reward_id)
                .where(PassTier.season_id == season.id)
                .order_by(PassTier.tier, PassTier.id)
            )
        ).all()
        entitlement = await session.scalar(
            select(PassEntitlement).where(
                PassEntitlement.user_id == user_id,
                PassEntitlement.season_id == season.id,
                PassEntitlement.status == "active",
            )
        )
        items.append(
            {
                "id": season.id,
                "title": season.title,
                "organizationId": season.organization_id,
                "artistId": season.artist_id,
                "status": season.status,
                "isPaid": season.is_paid,
                "premiumEnabled": season.premium_enabled,
                "premiumPricePoints": season.premium_price_points,
                "isPurchased": entitlement is not None,
                "startsAt": _datetime_data(season.starts_at),
                "endsAt": _datetime_data(season.ends_at),
                "progress": {
                    "currentXp": progress.current_xp,
                    "claimedTierIds": list(progress.claimed_tier_ids or []),
                },
                "tiers": [
                    _pass_tier_data(
                        tier, progress, free_reward, premium_reward, entitlement is not None
                    )
                    for tier, free_reward, premium_reward in tier_rows
                ],
            }
        )
    await session.commit()
    return {"seasons": items}


async def purchase_pass_season(session: AsyncSession, *, user_id: str, season_id: str) -> dict:
    season = await session.scalar(
        select(PassSeason).where(PassSeason.id == season_id).with_for_update()
    )
    if season is None or season.status != "published" or not season.premium_enabled:
        raise AppError(404, "PASS_SEASON_NOT_FOUND", "구매할 수 있는 시즌 패스를 찾을 수 없습니다.")
    if not _season_active_for_pass_view(season, now()):
        raise AppError(409, "PASS_SEASON_SALE_CLOSED", "현재 판매 중인 시즌 패스가 아닙니다.")
    existing = await session.scalar(
        select(PassEntitlement)
        .where(
            PassEntitlement.user_id == user_id,
            PassEntitlement.season_id == season.id,
        )
        .with_for_update()
    )
    if existing is not None and existing.status == "active":
        return {
            "seasonId": season.id,
            "entitlementId": existing.id,
            "pricePoints": existing.price_points,
            "replayed": True,
        }
    price = season.premium_price_points
    if price is None or price <= 0:
        raise AppError(409, "PASS_PRICE_NOT_CONFIGURED", "시즌 패스 가격이 설정되지 않았습니다.")
    event = await record_engagement_event(
        session,
        user_id=user_id,
        kind="pass_purchased",
        source_type="pass_season",
        source_id=season.id,
        payload={"seasonId": season.id, "points": price},
    )
    event.status = "processed"
    event.processed_at = now()
    ledger = await spend_points(
        session,
        user_id=user_id,
        source_event_id=event.id,
        rule_key=f"pass_purchase:{season.id}",
        amount=price,
        description=f"{season.title} 프리미엄 패스 구매",
        metadata={"seasonId": season.id},
    )
    if existing is None:
        existing = PassEntitlement(
            id=f"pass_entitlement_{uuid4().hex[:12]}",
            user_id=user_id,
            season_id=season.id,
            price_points=price,
            status="active",
        )
        session.add(existing)
    else:
        existing.price_points = price
        existing.status = "active"
    await session.flush()
    await record_audit(
        session,
        actor_user_id=user_id,
        action="pass.purchased",
        entity_type="pass_season",
        entity_id=season.id,
        organization_id=season.organization_id,
        artist_id=season.artist_id,
        details={"pricePoints": price, "ledgerId": ledger.id},
    )
    await session.commit()
    return {
        "seasonId": season.id,
        "entitlementId": existing.id,
        "pricePoints": price,
        "replayed": False,
    }


async def claim_pass_tier(
    session: AsyncSession, *, user_id: str, tier_id: str, track: str = "free"
) -> dict:
    row = (
        await session.execute(
            select(PassTier, PassSeason)
            .join(PassSeason, PassSeason.id == PassTier.season_id)
            .where(PassTier.id == tier_id)
        )
    ).one_or_none()
    if row is None:
        raise AppError(404, "PASS_TIER_NOT_FOUND", "팬 패스 티어를 찾을 수 없습니다.")
    tier, season = row
    if season.status != "published" or (track == "premium" and not season.premium_enabled):
        raise AppError(404, "PASS_TIER_NOT_FOUND", "팬 패스 티어를 찾을 수 없습니다.")
    if track not in {"free", "premium"}:
        raise AppError(422, "PASS_TRACK_INVALID", "팬 패스 보상 트랙을 확인해 주세요.")
    if not _season_open_for_claim(season, now()):
        raise AppError(409, "PASS_SEASON_CLAIM_CLOSED", "팬 패스 수령 기간이 지났습니다.")

    progress = await refresh_pass_progress(session, user_id=user_id, season=season)
    claimed_tier_ids = list(progress.claimed_tier_ids or [])
    premium_claimed_tier_ids = list(progress.premium_claimed_tier_ids or [])
    claimed_ids = premium_claimed_tier_ids if track == "premium" else claimed_tier_ids
    reward_id = tier.premium_reward_id if track == "premium" else tier.reward_id
    if (
        track == "premium"
        and await session.scalar(
            select(PassEntitlement.id).where(
                PassEntitlement.user_id == user_id,
                PassEntitlement.season_id == season.id,
                PassEntitlement.status == "active",
            )
        )
        is None
    ):
        raise AppError(
            409, "PASS_PREMIUM_NOT_PURCHASED", "프리미엄 패스를 구매한 뒤 받을 수 있습니다."
        )
    if tier.id in claimed_ids:
        raise AppError(409, "PASS_TIER_ALREADY_CLAIMED", "이미 수령한 팬 패스 티어입니다.")
    if progress.current_xp < tier.required_xp:
        raise AppError(409, "PASS_TIER_LOCKED", "필요한 XP를 달성한 뒤 수령할 수 있습니다.")

    event = await record_engagement_event(
        session,
        user_id=user_id,
        kind="pass_tier_claimed",
        source_type="pass_tier",
        source_id=tier.id,
        payload={"seasonId": season.id, "requiredXp": tier.required_xp, "track": track},
    )
    event.status = "processed"
    event.processed_at = now()

    reward_grant_data = None
    if reward_id:
        grant = await grant_reward(
            session,
            user_id=user_id,
            reward_id=reward_id,
            source_event_id=event.id,
            rule_key=f"pass_tier:{tier.id}:{track}",
        )
        reward = await session.get(RewardCatalog, reward_id)
        if reward is not None:
            grant.claimed_at = now()
            session.add(
                Notification(
                    id=f"notification_{uuid4().hex[:12]}",
                    user_id=user_id,
                    kind="reward_claimed",
                    title="보상을 받았어요",
                    body=f"{reward.name} 보상이 보관함에 추가되었습니다.",
                    entity_type="reward_grant",
                    entity_id=grant.id,
                    event_key=f"reward:{grant.id}:claimed",
                )
            )
            reward_grant_data = _reward_grant_data(grant, reward)

    claimed_ids.append(tier.id)
    if track == "premium":
        progress.premium_claimed_tier_ids = premium_claimed_tier_ids
    else:
        progress.claimed_tier_ids = claimed_tier_ids
    progress.updated_at = now()
    claimed_at = now()
    await record_audit(
        session,
        actor_user_id=user_id,
        action="pass_tier.claimed",
        entity_type="pass_tier",
        entity_id=tier.id,
        organization_id=season.organization_id,
        artist_id=season.artist_id,
        details={"seasonId": season.id, "requiredXp": tier.required_xp, "track": track},
    )
    await session.commit()
    return {
        "seasonId": season.id,
        "tierId": tier.id,
        "track": track,
        "claimedAt": _datetime_data(claimed_at),
        "rewardGrant": reward_grant_data,
    }


async def reconcile_claimed_global_pass_reward_grants(
    session: AsyncSession, *, user_id: str
) -> int:
    """Repair missing grants for claimed tiers in this fan's global passes only."""
    progress_rows = list(
        await session.scalars(select(PassProgress).where(PassProgress.user_id == user_id))
    )
    claimed_tier_ids = {
        tier_id for progress in progress_rows for tier_id in (progress.claimed_tier_ids or [])
    }
    if not claimed_tier_ids:
        return 0

    tier_rows = (
        await session.execute(
            select(PassTier, PassSeason, RewardCatalog)
            .join(PassSeason, PassSeason.id == PassTier.season_id)
            .join(RewardCatalog, RewardCatalog.id == PassTier.reward_id)
            .where(
                PassTier.id.in_(claimed_tier_ids),
                PassSeason.artist_id.is_(None),
                RewardCatalog.status == "published",
            )
        )
    ).all()

    repaired_count = 0
    for tier, season, reward in tier_rows:
        event = await record_engagement_event(
            session,
            user_id=user_id,
            kind="pass_tier_claimed",
            source_type="pass_tier",
            source_id=tier.id,
            payload={"seasonId": season.id, "requiredXp": tier.required_xp},
        )
        event.status = "processed"
        event.processed_at = event.processed_at or now()
        grant = await grant_reward(
            session,
            user_id=user_id,
            reward_id=reward.id,
            source_event_id=event.id,
            rule_key=f"pass_tier:{tier.id}",
        )
        if grant.claimed_at is None:
            grant.claimed_at = now()
            repaired_count += 1

    await session.commit()
    return repaired_count


async def process_engagement_event(event_id: str) -> None:
    """Shared task entry point for idempotent growth event consumption."""
    async with SessionLocal() as session:
        event = await session.scalar(
            select(EngagementEvent).where(EngagementEvent.id == event_id).with_for_update()
        )
        if event is None:
            raise AppError(
                404,
                "ENGAGEMENT_EVENT_NOT_FOUND",
                "처리할 팬 성장 이벤트를 찾을 수 없습니다.",
            )
        if event.status in {"processed", "dead_letter"}:
            return
        next_attempt_count = (event.attempt_count or 0) + 1
        event.attempt_count = next_attempt_count
        event.error_code = None
        event.error_message = None
        try:
            source_is_eligible = await card_collected_source_is_eligible(session, event)
            amount = base_xp_for(event) if source_is_eligible else 0
            if amount:
                await grant_xp(
                    session,
                    user_id=event.user_id,
                    event_id=event.id,
                    rule_key=event.kind,
                    amount=amount,
                )
            if event.kind != "card_collected" or source_is_eligible:
                for mission in await published_missions_for_event(session, event):
                    await update_mission_progress(session, event=event, mission=mission)
            for definition in await published_definitions_for_event(session, event):
                await update_achievement_progress(session, event=event, definition=definition)
            await update_pass_progress(session, event=event)
            event.status = "processed"
            event.processed_at = now()
            event.next_attempt_at = None
            await session.commit()
        except Exception as exc:
            await session.rollback()
            failed_event = await session.scalar(
                select(EngagementEvent).where(EngagementEvent.id == event_id).with_for_update()
            )
            if failed_event is not None:
                decision = decide_retry(
                    attempt_count=next_attempt_count,
                    now=now(),
                    max_attempts=get_settings().engagement_event_max_attempts,
                    base_delay_seconds=get_settings().engagement_event_retry_base_seconds,
                    max_delay_seconds=get_settings().engagement_event_retry_max_seconds,
                )
                failed_event.status = decision.status
                failed_event.next_attempt_at = decision.next_attempt_at
                failed_event.dead_lettered_at = now() if decision.status == "dead_letter" else None
                failed_event.attempt_count = next_attempt_count
                if isinstance(exc, AppError):
                    failed_event.error_code = exc.code
                    failed_event.error_message = exc.message
                else:
                    failed_event.error_code = exc.__class__.__name__
                    failed_event.error_message = str(exc)
                failed_event.error_message = (failed_event.error_message or "")[:500]
                await session.commit()
            raise


async def retry_failed_engagement_events(limit: int = 100) -> int:
    """Re-dispatch failed growth events whose backoff window has elapsed."""
    current_time = now()
    async with SessionLocal() as session:
        event_ids = list(
            await session.scalars(
                select(EngagementEvent.id)
                .where(
                    EngagementEvent.status == "failed",
                    EngagementEvent.next_attempt_at.is_not(None),
                    EngagementEvent.next_attempt_at <= current_time,
                )
                .order_by(EngagementEvent.next_attempt_at)
                .limit(limit)
            )
        )
    processed = 0
    for event_id in event_ids:
        try:
            await process_engagement_event(event_id)
        except Exception:
            logger.exception("Retry of engagement event %s failed", event_id)
        else:
            processed += 1
    return processed


async def revoke_card_growth(
    session: AsyncSession, *, user_card: UserCard, reason: str
) -> EngagementEvent:
    return await record_engagement_event(
        session,
        user_id=user_card.user_id,
        kind="card_revoked",
        source_type="user_card",
        source_id=user_card.id,
        payload={"cardId": user_card.card_id, "reason": reason},
    )


async def ensure_demo_catalog(session: AsyncSession) -> None:
    """Create the small public catalog needed for a fresh MVP deployment.

    This deliberately creates only catalog content. It does not create test
    users, admin sessions, or redeem codes, so enabling it in a hosted
    environment cannot grant access or manufacture collectible inventory.
    """
    artist_rows = (
        ("artist_nova3", "드림스케이프", "/assets/demo/dreamscape/group.png"),
        ("artist_luminous", "루미너스", "/src/assets/fan-week-lavender-meet.png"),
        ("artist_velora", "벨로라", "/src/assets/fan-week-night-stage.png"),
        ("artist_stellon", "스텔라온", "/src/assets/login/dreamscape-group.png"),
    )
    for artist_id, name, image_url in artist_rows:
        artist = await session.get(Artist, artist_id)
        if artist is None:
            artist = Artist(id=artist_id)
            session.add(artist)
        artist.name = name
        artist.image_url = image_url

    member_rows = (
        ("member_yuna", "artist_nova3", "유나"),
        ("member_minho", "artist_nova3", "하린"),
        ("member_jei", "artist_nova3", "세나"),
        ("member_rina", "artist_nova3", "리나"),
        ("member_luminous_arin", "artist_luminous", "아린"),
        ("member_luminous_ian", "artist_luminous", "이안"),
        ("member_luminous_sena", "artist_luminous", "세나"),
        ("member_velora_haneul", "artist_velora", "하늘"),
        ("member_velora_leo", "artist_velora", "레오"),
        ("member_velora_rin", "artist_velora", "린"),
        ("member_stellon_dan", "artist_stellon", "단"),
        ("member_stellon_roa", "artist_stellon", "로아"),
        ("member_stellon_siwoo", "artist_stellon", "시우"),
    )
    member_images = {
        "member_yuna": "/assets/demo/dreamscape/yuna.png",
        "member_minho": "/assets/demo/dreamscape/harin.png",
        "member_jei": "/assets/demo/dreamscape/sena.png",
        "member_rina": "/assets/demo/dreamscape/rina.png",
    }
    for member_id, artist_id, name in member_rows:
        member = await session.get(Member, member_id)
        if member is None:
            member = Member(id=member_id)
            session.add(member)
        member.artist_id = artist_id
        member.name = name
        member.image_url = member_images.get(member_id)

    card_specs = (
        (
            "card_demo_published",
            "Nebula Yuna Ver.",
            "member_yuna",
            "UR",
            "/assets/demo/dreamscape/yuna.png",
        ),
        (
            "card_demo_harin",
            "Nebula Harin Ver.",
            "member_minho",
            "SR",
            "/assets/demo/dreamscape/harin.png",
        ),
        (
            "card_demo_sena",
            "Starlight Sena Ver.",
            "member_jei",
            "R",
            "/assets/demo/dreamscape/sena.png",
        ),
        (
            "card_demo_rina",
            "Midnight Rina Ver.",
            "member_rina",
            "N",
            "/assets/demo/dreamscape/rina.png",
        ),
    )
    for card_id, name, member_id, rarity, image_url in card_specs:
        card = await session.get(Card, card_id)
        if card is None:
            card = Card(id=card_id)
            session.add(card)
        card.name = name
        card.status = "published"
        card.release_policy = "partner_and_platform"
        card.release_status = "published"
        card.is_official = True
        card.artist_id = "artist_nova3"
        card.member_id = member_id
        card.season_name = "정규 1집 · DREAMSCAPE"
        card.rarity = rarity
        card.image_url = image_url
        card.tradable = True

    pack = await session.get(CardPack, "demo_pack_dreamscape_nebula")
    if pack is None:
        pack = CardPack(
            id="demo_pack_dreamscape_nebula",
            artist_id="artist_nova3",
            name="DREAMSCAPE Nebula Ver.",
        )
        session.add(pack)
    pack.artist_id = "artist_nova3"
    pack.name = "DREAMSCAPE Nebula Ver."
    pack.season_name = "정규 1집 · DREAMSCAPE"
    pack.version = "v1.0"
    pack.image_url = "/assets/demo/dreamscape/card-pack.png"
    pack.description = "드림스케이프 정규 1집의 공개 카드를 확인하고 수집해보세요."
    pack.status = "published"
    pack.published_at = pack.published_at or now()
    for position, (card_id, _name, _member_id, _rarity, _image_url) in enumerate(
        card_specs, start=1
    ):
        link_id = f"demo_pack_dreamscape_card_{position}"
        link = await session.get(CardPackCard, link_id)
        if link is None:
            link = CardPackCard(id=link_id, pack_id=pack.id, card_id=card_id)
            session.add(link)
        link.pack_id = pack.id
        link.card_id = card_id
        link.position = position
        link.probability = 25.0
        link.enabled = True

    product = await session.get(ShopProduct, "demo_shop_dreamscape_nebula")
    if product is None:
        product = ShopProduct(id="demo_shop_dreamscape_nebula")
        session.add(product)
    product.artist_id = "artist_nova3"
    product.product_type = "card_pack"
    product.card_pack_id = pack.id
    product.name = "DREAMSCAPE Nebula Ver. 카드팩"
    product.description = "드림스케이프 멤버 카드 4종 중 1장을 만날 수 있어요."
    product.image_url = pack.image_url
    product.price_points = 1200
    product.status = "published"
    product.starts_at = None
    product.ends_at = None
    await session.commit()


async def ensure_fan_community_demo(session: AsyncSession, *, password: str) -> dict[str, object]:
    """Create isolated local accounts and inventory for the real social flow.

    The seed is deliberately explicit and non-destructive: it only owns IDs
    prefixed with ``local_demo_`` and never resets or deletes existing data.
    Hosted environments cannot invoke it.
    """
    if get_settings().is_hosted:
        raise RuntimeError("FAN_COMMUNITY_DEMO_LOCAL_ONLY")
    if len(password) < 12:
        raise ValueError("The local fan community demo password must be at least 12 characters")

    await ensure_demo_catalog(session)

    user_specs = (
        {
            "id": "local_demo_fan",
            "email": "demo.fan@example.com",
            "nickname": "팬포리오",
            "profile_image_url": "/src/assets/profile-avatar-generated.png",
            "favorite_member_ids": ["member_yuna"],
        },
        {
            "id": "local_demo_collector",
            "email": "demo.collector@example.com",
            "nickname": "별빛수집가",
            "profile_image_url": "/src/assets/card-yuna-lavender.jpg",
            "favorite_member_ids": ["member_minho", "member_jei"],
        },
    )
    for spec in user_specs:
        user = await session.get(User, spec["id"])
        if user is None:
            user = User(id=spec["id"], role=Role.FAN)
            session.add(user)
        elif user.role != Role.FAN:
            raise RuntimeError(f"FAN_COMMUNITY_DEMO_ID_CONFLICT:{spec['id']}")
        user.email = str(spec["email"])
        user.nickname = str(spec["nickname"])
        user.profile_image_url = str(spec["profile_image_url"])
        user.favorite_artist_ids = ["artist_nova3"]
        user.favorite_member_ids = list(spec["favorite_member_ids"])
        user.onboarding_completed = True
        if not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)

    card_specs = (
        {
            "id": "local_demo_card_harin",
            "name": "Nebula Harin Ver.",
            "member_id": "member_minho",
            "rarity": "UR",
            "image_url": "/assets/demo/dreamscape/harin.png",
        },
        {
            "id": "local_demo_card_doyun",
            "name": "Nebula Sena Ver.",
            "member_id": "member_jei",
            "rarity": "SR",
            "image_url": "/assets/demo/dreamscape/sena.png",
        },
        {
            "id": "local_demo_card_minjae",
            "name": "Starlight Rina Ver.",
            "member_id": "member_rina",
            "rarity": "R",
            "image_url": "/assets/demo/dreamscape/rina.png",
        },
        {
            "id": "local_demo_card_jay",
            "name": "Midnight Yuna Ver.",
            "member_id": "member_yuna",
            "rarity": "N",
            "image_url": "/assets/demo/dreamscape/yuna.png",
        },
    )
    for spec in card_specs:
        card = await session.get(Card, spec["id"])
        if card is None:
            card = Card(id=spec["id"], name=str(spec["name"]))
            session.add(card)
        card.name = str(spec["name"])
        card.status = "published"
        card.release_policy = "partner_and_platform"
        card.release_status = "published"
        card.is_official = True
        card.artist_id = "artist_nova3"
        card.member_id = str(spec["member_id"])
        card.season_name = "정규 1집 · DREAMSCAPE"
        card.rarity = str(spec["rarity"])
        card.image_url = str(spec["image_url"])
        card.tradable = True

    await session.flush()
    pack_id = "local_demo_pack_dreamscape"
    pack = await session.get(CardPack, pack_id)
    if pack is None:
        pack = CardPack(id=pack_id, artist_id="artist_nova3", name="DREAMSCAPE Community Demo")
        session.add(pack)
    pack.artist_id = "artist_nova3"
    pack.name = "DREAMSCAPE Community Demo"
    pack.season_name = "정규 1집 · DREAMSCAPE"
    pack.version = "v1.0-demo"
    pack.image_url = "/assets/demo/dreamscape/card-pack.png"
    pack.description = "드림스케이프 정규 1집의 공개 카드를 확인하고 수집해보세요."
    pack.status = "published"
    pack.published_at = pack.published_at or now()
    await session.flush()
    for position, spec in enumerate(card_specs, start=1):
        link_id = f"local_demo_pack_card_{position}"
        link = await session.get(CardPackCard, link_id)
        if link is None:
            link = CardPackCard(id=link_id, pack_id=pack_id, card_id=str(spec["id"]))
            session.add(link)
        link.pack_id = pack_id
        link.card_id = str(spec["id"])
        link.position = position
        link.probability = 25.0
        link.enabled = True

    demo_product = await session.get(ShopProduct, "local_demo_shop_pack_nebula")
    if demo_product is None:
        demo_product = ShopProduct(id="local_demo_shop_pack_nebula")
        session.add(demo_product)
    demo_product.artist_id = "artist_nova3"
    demo_product.product_type = "card_pack"
    demo_product.card_pack_id = pack_id
    demo_product.name = "DREAMSCAPE Nebula Ver. 카드팩"
    demo_product.description = "랜덤 포토카드 3장을 만나보세요."
    demo_product.image_url = pack.image_url
    demo_product.price_points = 1200
    demo_product.status = "published"
    demo_product.starts_at = None
    demo_product.ends_at = None

    await session.flush()
    for user_id in ("local_demo_fan", "local_demo_collector"):
        visibility = await session.get(CardVisibility, user_id)
        if visibility is None:
            session.add(CardVisibility(user_id=user_id, public_enabled=True))
        else:
            visibility.public_enabled = True

    inventory_specs = {
        "local_demo_fan": ("local_demo_card_harin", "local_demo_card_jay"),
        "local_demo_collector": (
            "local_demo_card_doyun",
            "local_demo_card_minjae",
            "local_demo_card_harin",
        ),
    }
    inventory: dict[str, list[str]] = {}
    for user_id, card_ids in inventory_specs.items():
        inventory[user_id] = []
        for position, card_id in enumerate(card_ids, start=1):
            user_card = await grant_user_card(
                session,
                user_id=user_id,
                card_id=card_id,
                source_type="fan_community_demo",
                source_id=f"{user_id}:{position}:{card_id}",
                acquisition_source="card_pack",
            )
            inventory[user_id].append(user_card.id)

    await session.commit()
    return {
        "fanUserId": "local_demo_fan",
        "collectorUserId": "local_demo_collector",
        "fanUserCardIds": inventory["local_demo_fan"],
        "collectorUserCardIds": inventory["local_demo_collector"],
    }


async def ensure_demo_card_asset(session: AsyncSession) -> None:
    """Link the packaged demo card to a real object-storage asset.

    This repair is deliberately opt-in and limited to the stable demo/QA card
    IDs created by our own onboarding flow. It never discovers or rewrites
    partner-owned cards, while fixing legacy `/src/assets/...` placeholders
    that cannot be served by the API.
    """
    admin_id = await session.scalar(select(User.id).where(User.role == Role.ADMIN))
    if admin_id is None:
        logger.warning("Demo card asset repair skipped: no admin owner exists")
        return

    # The production image copies `backend/assets` to `/app/assets`.  Since
    # this module lives at `/app/app/services.py`, `parents[1]` is already
    # the application root; climbing one more level incorrectly produced
    # `/assets/...` and prevented the server from starting on Render.
    storage = configured_asset_storage()
    asset_specs = {
        "yuna": ("card-yuna-lavender.jpg", "image/jpeg"),
        "minho": ("card-minho-midnight.jpg", "image/jpeg"),
        "jay": ("card-jay-rosegold.jpg", "image/jpeg"),
        "back": ("card-back-template.png", "image/png"),
    }
    bundled_assets: dict[str, tuple[bytes, str, str]] = {}
    for key, (file_name, content_type) in asset_specs.items():
        image_path = (Path(__file__).resolve().parents[1] / "assets" / file_name).resolve()
        if not image_path.is_file():
            raise FileNotFoundError(f"bundled demo card image is missing: {image_path}")
        bundled_assets[key] = (
            await asyncio.to_thread(image_path.read_bytes),
            file_name,
            content_type,
        )
    # These are the two controlled QA/demo identities created by our own
    # onboarding flow. Partner-owned cards are intentionally not discovered
    # or rewritten here.
    repair_targets = (
        (
            "card_demo_published",
            "asset_demo_card_yuna_lavender",
            "컴백 기념 사인 카드",
            "2026 SPRING",
            "yuna",
        ),
        (
            "card_82bc4c1d51",
            "asset_qa_card_minho_midnight",
            "QA 스타더스트 홀로그램",
            "2026 SUMMER",
            "minho",
        ),
        (
            "card_123c407f49",
            "asset_qa_card_jay_rosegold",
            "QA 노멀 런칭 카드",
            "2026 QA LAUNCH",
            "jay",
        ),
    )
    repaired = 0
    back_asset_id = "asset_demo_card_back_template"
    back_content, back_file_name, back_content_type = bundled_assets["back"]
    back_asset = await session.get(Asset, back_asset_id)
    if back_asset is None:
        back_asset = Asset(
            id=back_asset_id,
            owner_id=admin_id,
            file_name=back_file_name,
            content_type=back_content_type,
            purpose="card",
        )
        session.add(back_asset)
        await session.flush()
    if not back_asset.storage_path or not storage.exists(back_asset.storage_path):
        back_asset.storage_path = await asyncio.to_thread(
            storage.save_bytes, back_asset.id, back_content
        )
    back_asset.owner_id = admin_id
    back_asset.file_name = back_file_name
    back_asset.content_type = back_content_type
    back_asset.purpose = "card"
    back_asset.upload_completed_at = now()

    for card_id, asset_id, card_name, season_name, image_key in repair_targets:
        card = await session.get(Card, card_id)
        if card is None:
            card = await session.scalar(
                select(Card).where(
                    Card.name == card_name,
                    Card.season_name == season_name,
                    Card.artist_id == "artist_nova3",
                )
            )
        if card is None:
            continue
        content, file_name, content_type = bundled_assets[image_key]
        asset = await session.get(Asset, asset_id)
        if asset is None:
            asset = Asset(
                id=asset_id,
                owner_id=admin_id,
                file_name=file_name,
                content_type=content_type,
                purpose="card",
            )
            session.add(asset)
            await session.flush()

        if not asset.storage_path or not storage.exists(asset.storage_path):
            asset.storage_path = await asyncio.to_thread(storage.save_bytes, asset.id, content)
        asset.owner_id = admin_id
        asset.file_name = file_name
        asset.content_type = content_type
        asset.purpose = "card"
        asset.upload_completed_at = now()
        card.image_asset_id = asset.id
        card.image_url = ""
        design_config = card.design_config if isinstance(card.design_config, dict) else {}
        back_config = (
            design_config.get("back") if isinstance(design_config.get("back"), dict) else {}
        )
        if not (back_config.get("backImageAssetId") or back_config.get("imageAssetId")):
            card.design_config = {
                **design_config,
                "back": {**back_config, "backImageAssetId": back_asset_id},
            }
        repaired += 1

    await session.commit()
    logger.info("Controlled card asset repair completed: cards_repaired=%s", repaired)


async def ensure_admin_bootstrap(session: AsyncSession) -> None:
    """Create the first password admin only when deployment secrets configure it."""
    settings = get_settings()
    email = settings.admin_bootstrap_email.strip().lower()
    password = settings.admin_bootstrap_password
    if not email or not password:
        return
    if len(password) < 12:
        raise ValueError("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters")
    user = await session.scalar(select(User).where(User.email == email, User.role == Role.ADMIN))
    if user is None:
        user = User(
            id=f"admin_{uuid4().hex}",
            email=email,
            role=Role.ADMIN,
            nickname="운영 관리자",
            password_hash=hash_password(password),
            must_change_password=False,
        )
        session.add(user)
        await session.flush()
    elif not user.password_hash:
        user.password_hash = hash_password(password)
    # The bootstrap administrator is trusted to choose their own password
    # during deployment; only delegated accounts are forced to rotate one.
    user.must_change_password = False
    membership = await session.get(AdminMembership, user.id)
    if membership is None:
        session.add(
            AdminMembership(
                user_id=user.id,
                organization_id=None,
                access_level="root",
                status="active",
                display_name=user.nickname or "운영 관리자",
                created_by_user_id=user.id,
            )
        )
    else:
        membership.organization_id = None
        membership.access_level = "root"
        membership.status = "active"
        membership.display_name = user.nickname or membership.display_name
    await session.commit()


async def ensure_data_identity(session: AsyncSession) -> None:
    """Refuse to silently initialize a replacement production database.

    A Render restart should keep using the same database. If the database URL
    is accidentally replaced, the identity row is absent or mismatched and
    startup stops instead of recreating only the bootstrap administrator.
    ``ALLOW_DATA_BOOTSTRAP`` is a deliberate, one-deploy switch for the first
    initialization of a new durable database.
    """
    settings = get_settings()
    if not settings.is_hosted:
        return
    digest = sha256(settings.data_protection_key.encode("utf-8")).hexdigest()
    identity = await session.get(DeploymentIdentity, "primary")
    if identity is None:
        if not settings.allow_data_bootstrap:
            raise RuntimeError("DATA_STORE_NOT_INITIALIZED")
        session.add(DeploymentIdentity(id="primary", key_digest=digest))
        await session.commit()
        return
    if not hmac.compare_digest(identity.key_digest, digest):
        raise RuntimeError("DATA_STORE_IDENTITY_MISMATCH")


async def reset_database(session: AsyncSession) -> None:
    for model in (
        BackgroundRemovalJob,
        PassEntitlement,
        ProfileEquipment,
        PassProgress,
        PassTier,
        PassSeason,
        RewardGrant,
        XpLedger,
        AchievementProgress,
        AchievementDefinition,
        RewardCatalog,
        FanLevel,
        EngagementEvent,
        CollectionBenefitClaim,
        AuditLog,
        CardReviewDecision,
        CardReviewRequest,
        TradeLock,
        TradeItem,
        TradeProposal,
        UserBlock,
        Follow,
        CardVisibility,
        AdminArtistAssignment,
        OrganizationArtist,
        AdminMembership,
        Organization,
        Notification,
        UserCard,
        RedeemCode,
        RedeemCodeBatch,
        Drop,
        Card,
        CollectionCampaign,
        Asset,
        Member,
        ArtistProfile,
        Artist,
        MagicLink,
        RefreshToken,
        Session,
        User,
    ):
        await session.execute(delete(model))
    await session.commit()


async def seed_core(session: AsyncSession) -> dict:
    users = [
        ("fan", Role.FAN),
        ("otherFan", Role.FAN),
        ("admin", Role.ADMIN),
        ("artist", Role.ARTIST),
    ]
    for user_id, role in users:
        username = "seed-dreamscape-studio" if role == Role.ARTIST else None
        password = {
            Role.FAN: "test-fan-password",
            Role.ADMIN: "test-admin-password",
            Role.ARTIST: "test-artist-password",
        }.get(role)
        session.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                role=role,
                username=username,
                password_hash=hash_password(password) if password else None,
            )
        )
        session.add(
            Session(
                token=f"test-session-{user_id.replace('otherFan', 'other-fan')}", user_id=user_id
            )
        )
    session.add(
        AdminMembership(
            user_id="admin",
            organization_id=None,
            access_level="root",
            status="active",
            display_name="운영 관리자",
            created_by_user_id="admin",
        )
    )
    session.add_all(
        [
            MagicLink(
                token_hash=magic_link_token_hash("test-magic-link-fan"),
                email="fan@example.com",
                purpose="login",
                expires_at=now() + timedelta(minutes=15),
            ),
            MagicLink(
                token_hash=magic_link_token_hash("test-magic-link-new-fan"),
                email="new-fan@example.com",
                purpose="signup",
                expires_at=now() + timedelta(minutes=15),
            ),
            MagicLink(
                token_hash=magic_link_token_hash("test-magic-link-expired"),
                email="fan@example.com",
                purpose="login",
                expires_at=now() - timedelta(minutes=1),
            ),
            MagicLink(
                token_hash=magic_link_token_hash("test-magic-link-admin"),
                email="admin@example.com",
                purpose="login",
                expires_at=now() + timedelta(minutes=15),
            ),
            MagicLink(
                token_hash=magic_link_token_hash("test-magic-link-artist"),
                email="artist@example.com",
                purpose="login",
                expires_at=now() + timedelta(minutes=15),
            ),
        ]
    )
    session.add_all(
        [
            Organization(
                id="org_scenario_partner",
                name="스타웨이브 엔터테인먼트",
                slug="starwave-entertainment",
                status="active",
                contact_name="운영 담당자",
                contact_email="ops@starwave.example.com",
            ),
            Artist(
                id="artist_nova3",
                name="드림스케이프",
                image_url="/assets/demo/dreamscape/group.png",
            ),
            Artist(
                id="artist_luminous",
                name="루미너스",
                image_url="/src/assets/fan-week-lavender-meet.png",
            ),
            Artist(
                id="artist_velora",
                name="벨로라",
                image_url="/src/assets/fan-week-night-stage.png",
            ),
            Artist(
                id="artist_stellon",
                name="스텔라온",
                image_url="/src/assets/login/dreamscape-group.png",
            ),
            Member(id="member_yuna", artist_id="artist_nova3", name="유나"),
            Member(id="member_minho", artist_id="artist_nova3", name="하린"),
            Member(id="member_jei", artist_id="artist_nova3", name="세나"),
            Member(id="member_rina", artist_id="artist_nova3", name="리나"),
            Member(id="member_luminous_arin", artist_id="artist_luminous", name="아린"),
            Member(id="member_luminous_ian", artist_id="artist_luminous", name="이안"),
            Member(id="member_luminous_sena", artist_id="artist_luminous", name="세나"),
            Member(id="member_velora_haneul", artist_id="artist_velora", name="하늘"),
            Member(id="member_velora_leo", artist_id="artist_velora", name="레오"),
            Member(id="member_velora_rin", artist_id="artist_velora", name="린"),
            Member(id="member_stellon_dan", artist_id="artist_stellon", name="단"),
            Member(id="member_stellon_roa", artist_id="artist_stellon", name="로아"),
            Member(id="member_stellon_siwoo", artist_id="artist_stellon", name="시우"),
            Card(
                id="card_published",
                name="컴백 기념 사인 카드",
                status="published",
                release_policy="partner_and_platform",
                release_status="published",
                artist_id="artist_nova3",
                member_id="member_yuna",
                season_name="2026 SPRING",
                rarity="Special",
                signature_text="오늘 와줘서 고마워",
                issue_limit=500,
                image_url="/assets/demo/dreamscape/yuna.png",
                drop_id="drop_live",
            ),
            Card(
                id="card_draft",
                name="비공개 카드",
                status="draft",
                artist_id="artist_nova3",
                image_url="/assets/demo/dreamscape/yuna.png",
                drop_id="drop_live",
            ),
            Drop(id="drop_live", name="NOVA-3 Comeback Live Drop", status="live"),
            Drop(id="drop_ended", status="ended"),
        ]
    )
    session.add(
        OrganizationArtist(
            organization_id="org_scenario_partner",
            artist_id="artist_nova3",
        )
    )
    session.add(
        ArtistProfile(user_id="artist", artist_id="artist_nova3", verification_status="verified")
    )
    session.add_all(
        [
            RedeemCode(code="NOVA-VALID-01", card_id="card_published", drop_id="drop_live"),
            RedeemCode(
                code="NOVA-EXPIRED-01",
                card_id="card_published",
                drop_id="drop_live",
                expires_at=now() - timedelta(days=1),
            ),
            RedeemCode(code="NOVA-ENDED-01", card_id="card_published", drop_id="drop_ended"),
            RedeemCode(code="NOVA-DRAFT-01", card_id="card_draft", drop_id="drop_live"),
            RedeemCode(
                code="NOVA-EXHAUSTED-01",
                card_id="card_published",
                drop_id="drop_live",
                used_count=0,
                max_uses=0,
            ),
        ]
    )
    session.add_all(
        [
            Notification(
                id="notification_1",
                user_id="fan",
                kind="system",
                title="Fanfolio에 오신 것을 환영해요",
                body="새로운 공식 카드 소식을 알려드릴게요.",
            ),
            Asset(id="asset_card_image", owner_id="artist"),
            Asset(id="asset_handwriting", owner_id="artist"),
        ]
    )
    await session.commit()
    return {
        "sessions": {
            "fan": "test-session-fan",
            "otherFan": "test-session-other-fan",
            "admin": "test-session-admin",
            "artist": "test-session-artist",
        },
        "magicLinkTokens": {
            "fan": "test-magic-link-fan",
            "newFan": "test-magic-link-new-fan",
            "expired": "test-magic-link-expired",
            "admin": "test-magic-link-admin",
            "artist": "test-magic-link-artist",
        },
        "ids": {
            "publishedCardId": "card_published",
            "liveDropId": "drop_live",
            "templateId": "template_signature_v1",
            "imageAssetId": "asset_card_image",
            "handwritingAssetId": "asset_handwriting",
        },
        "codes": {
            "valid": "NOVA-VALID-01",
            "expired": "NOVA-EXPIRED-01",
            "endedDrop": "NOVA-ENDED-01",
            "unpublished": "NOVA-DRAFT-01",
            "exhausted": "NOVA-EXHAUSTED-01",
        },
    }


async def process_background_removal(job_id: str) -> None:
    """Process one local image job; replace this function with a Celery task in production."""
    async with SessionLocal() as session:
        job = await session.get(BackgroundRemovalJob, job_id)
        if not job:
            return
        asset = await session.get(Asset, job.asset_id)
        if not asset or not asset.storage_path:
            job.status = "failed"
            await session.commit()
            return
        try:
            job.status = "processing"
            await session.commit()
            storage = configured_asset_storage()
            output_bytes = await asyncio.to_thread(
                remove_light_background_bytes, storage.read_bytes(asset.storage_path)
            )
            output_path = storage.save_derived_bytes(asset.id, "-transparent.png", output_bytes)
            asset.processed_storage_path = output_path
            job.status = "completed"
            job.transparent_image_url = f"/api/assets/{asset.id}/transparent"
            job.preview_url = job.transparent_image_url
            await session.commit()
        except Exception:
            # Storage providers can raise provider-specific exceptions (for
            # example botocore ClientError), so a job must be marked failed
            # instead of being left in `processing` indefinitely.
            logger.exception("Background removal failed for job %s", job_id)
            job.status = "failed"
            await session.commit()


async def cleanup_expired_uploads() -> int:
    """Delete objects from presigns that expired without a completion step."""
    async with SessionLocal() as session:
        assets = await session.scalars(
            select(Asset).where(
                Asset.upload_expires_at.is_not(None),
                Asset.upload_expires_at < now(),
                Asset.upload_completed_at.is_(None),
                Asset.storage_path.is_not(None),
            )
        )
        storage = configured_asset_storage()
        cleaned = 0
        for asset in assets:
            try:
                if asset.storage_path:
                    storage.delete(asset.storage_path)
            except Exception:
                # Keep the path so the next Beat run can retry a transient
                # object-store failure without losing the cleanup target.
                logger.exception("Could not delete expired upload %s", asset.id)
                continue
            asset.storage_path = None
            cleaned += 1
        await session.commit()
        return cleaned


async def record_audit(
    session: AsyncSession,
    *,
    actor_user_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    organization_id: str | None = None,
    artist_id: str | None = None,
    details: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            id=f"audit_{uuid4().hex[:12]}",
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            organization_id=organization_id,
            artist_id=artist_id,
            details=details or {},
        )
    )


async def notify_fans(session: AsyncSession, *, kind: str, title: str, body: str) -> None:
    fans = await session.scalars(select(User).where(User.role == Role.FAN))
    for fan in fans:
        notification = Notification(
            id=f"notification_{uuid4().hex[:12]}",
            user_id=fan.id,
            kind=kind,
            title=title,
            body=body,
        )
        session.add(notification)
        if fan.notification_email_enabled and fan.email:
            session.add(
                build_delivery(
                    notification_id=notification.id,
                    channel="email",
                    destination=fan.email,
                )
            )


def review_snapshot(card: Card) -> dict:
    return {
        "name": card.name,
        "rarity": card.rarity,
        "artistId": card.artist_id,
        "memberId": card.member_id,
        "imageAssetId": card.image_asset_id,
        "voiceAssetId": card.voice_asset_id,
        "videoAssetId": card.video_asset_id,
        "handwritingAssetId": card.handwriting_asset_id,
        "designConfig": card.design_config or {},
        "issueLimit": card.issue_limit,
    }


def required_release_policy(card: Card) -> str:
    return "partner_and_platform" if card.rarity == "Special" else "partner_only"


def release_card_data(card: Card) -> dict:
    return {
        "releasePolicy": card.release_policy,
        "releaseStatus": card.release_status,
        "reviewVersion": card.review_version,
    }


async def create_review_request(session: AsyncSession, *, card: Card, stage: str) -> None:
    session.add(
        CardReviewRequest(
            id=f"review_request_{uuid4().hex[:12]}",
            card_id=card.id,
            version=card.review_version,
            stage=stage,
            status="pending",
            snapshot=review_snapshot(card),
        )
    )


async def active_review_request(
    session: AsyncSession, *, card: Card, stage: str
) -> CardReviewRequest | None:
    return await session.scalar(
        select(CardReviewRequest).where(
            CardReviewRequest.card_id == card.id,
            CardReviewRequest.version == card.review_version,
            CardReviewRequest.stage == stage,
            CardReviewRequest.status == "pending",
        )
    )


async def notify_admin_once(
    session: AsyncSession,
    *,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: str,
    event_key: str,
) -> None:
    if await session.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.event_key == event_key,
        )
    ):
        return
    notification = Notification(
        id=f"notification_{uuid4().hex[:12]}",
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        event_key=event_key,
    )
    session.add(notification)
    await _queue_notification_deliveries(session, notification)


async def notify_user_once(
    session: AsyncSession,
    *,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: str,
    event_key: str,
) -> None:
    """Create one fan notification for an immutable domain event."""
    if await session.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.event_key == event_key,
        )
    ):
        return
    notification = Notification(
        id=f"notification_{uuid4().hex[:12]}",
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        event_key=event_key,
    )
    session.add(notification)
    await _queue_notification_deliveries(session, notification)


async def _queue_notification_deliveries(session: AsyncSession, notification: Notification) -> None:
    recipient = await session.get(User, notification.user_id)
    if recipient is None:
        return
    if recipient.notification_email_enabled and recipient.email:
        session.add(
            build_delivery(
                notification_id=notification.id,
                channel="email",
                destination=recipient.email,
            )
        )
    devices = await session.scalars(
        select(PushDevice).where(PushDevice.user_id == recipient.id, PushDevice.enabled.is_(True))
    )
    for device in devices:
        session.add(
            build_delivery(
                notification_id=notification.id,
                channel="push",
                destination=device.token,
            )
        )


async def notify_partner_reviewers(session: AsyncSession, *, card: Card) -> None:
    if not card.artist_id:
        return
    reviewers = await session.scalars(
        select(AdminMembership)
        .join(
            OrganizationArtist,
            OrganizationArtist.organization_id == AdminMembership.organization_id,
        )
        .where(
            OrganizationArtist.artist_id == card.artist_id,
            AdminMembership.status == "active",
            AdminMembership.access_level.in_(("company_admin", "manager")),
        )
    )
    for membership in reviewers:
        await notify_admin_once(
            session,
            user_id=membership.user_id,
            kind="card_partner_review_requested",
            title="카드 회사 검수가 필요합니다",
            body=f"{card.name} 카드가 회사 검수를 기다리고 있습니다.",
            entity_type="card",
            entity_id=card.id,
            event_key=f"card:{card.id}:partner:{card.review_version}",
        )


async def notify_platform_reviewers(session: AsyncSession, *, card: Card) -> None:
    reviewers = await session.scalars(
        select(AdminMembership).where(
            AdminMembership.status == "active",
            AdminMembership.access_level == "platform_operator",
        )
    )
    for membership in reviewers:
        await notify_admin_once(
            session,
            user_id=membership.user_id,
            kind="card_platform_review_requested",
            title="카드 플랫폼 검수가 필요합니다",
            body=f"{card.name} 카드가 플랫폼 검수를 기다리고 있습니다.",
            entity_type="card",
            entity_id=card.id,
            event_key=f"card:{card.id}:platform:{card.review_version}",
        )


async def submit_card_for_release_review(session: AsyncSession, *, card: Card) -> None:
    card.review_version += 1
    card.release_policy = required_release_policy(card)
    card.release_status = "pending_partner_review"
    card.status = "pending_review"
    await create_review_request(session, card=card, stage="partner")
    await notify_partner_reviewers(session, card=card)


async def record_review_decision(
    session: AsyncSession,
    *,
    request: CardReviewRequest,
    reviewer_user_id: str,
    decision: str,
    note: str | None,
) -> None:
    request.status = decision
    session.add(
        CardReviewDecision(
            id=f"review_decision_{uuid4().hex[:12]}",
            request_id=request.id,
            reviewer_user_id=reviewer_user_id,
            decision=decision,
            note=note,
            decided_at=now(),
        )
    )


async def request_magic_link(session: AsyncSession, *, email: str, purpose: str) -> str:
    """Create the one-time proof that a mail provider will deliver later."""
    token = token_urlsafe(32)
    session.add(
        MagicLink(
            token_hash=magic_link_token_hash(token),
            email=email.lower(),
            purpose=purpose,
            expires_at=now() + timedelta(minutes=15),
        )
    )
    await session.commit()
    return token


async def verify_magic_link(session: AsyncSession, *, token: str) -> dict:
    """Consume a valid link atomically and issue a new opaque browser session."""
    async with session.begin():
        link = await session.get(MagicLink, magic_link_token_hash(token))
        expires_at = (
            link.expires_at.replace(tzinfo=UTC)
            if link and link.expires_at.tzinfo is None
            else link.expires_at
            if link
            else None
        )
        if not link or link.consumed_at or (expires_at and expires_at <= now()):
            raise AppError(401, "MAGIC_LINK_INVALID", "유효하지 않거나 만료된 매직 링크입니다.")

        matching_users = list(await session.scalars(select(User).where(User.email == link.email)))
        user = next((candidate for candidate in matching_users if candidate.role == Role.FAN), None)
        if user is None and len(matching_users) == 1:
            # Preserve the role of an unambiguous legacy admin/artist magic
            # link. When several role-scoped identities share one email, the
            # fan app must never guess a privileged identity.
            user = matching_users[0]
        if not user:
            user = User(id=f"user_{uuid4().hex[:12]}", email=link.email, role=Role.FAN)
            session.add(user)
            await session.flush()

        link.consumed_at = now()
        session_token = token_urlsafe(32)
        if not get_settings().is_hosted:
            session.add(Session(token=session_token, user_id=user.id))

        result = {
            "user": {"id": user.id, "email": user.email, "role": user.role.value},
            "onboardingCompleted": user.onboarding_completed,
            "sessionToken": session_token,
            "userId": user.id,
        }
    return result


async def preview_redeem(session: AsyncSession, user: User, code_value: str) -> Card:
    """Resolve a redeem code without consuming it or opening a write transaction."""
    code = await session.scalar(select(RedeemCode).where(RedeemCode.code == code_value))
    if not code:
        raise AppError(404, "REDEEM_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.")
    if code.disabled_at:
        raise AppError(409, "REDEEM_CODE_DISABLED", "비활성화된 코드입니다.")
    if code.used_count >= code.max_uses:
        raise AppError(409, "REDEEM_CODE_ALREADY_USED", "사용할 수 없는 코드입니다.")
    already_owned = await session.scalar(
        select(UserCard.id).where(
            UserCard.user_id == user.id,
            UserCard.redeem_code_id == code.code,
        )
    )
    if already_owned:
        raise AppError(409, "REDEEM_CODE_ALREADY_USED", "이미 사용한 코드입니다.")
    expires_at = (
        code.expires_at.replace(tzinfo=UTC)
        if code.expires_at and code.expires_at.tzinfo is None
        else code.expires_at
    )
    if expires_at and expires_at < now():
        raise AppError(409, "REDEEM_CODE_EXPIRED", "만료된 코드입니다.")
    card = await session.scalar(select(Card).where(Card.id == code.card_id))
    if card is None or card.status != "published":
        raise AppError(409, "CARD_NOT_PUBLISHED", "공개되지 않은 카드입니다.")
    drop = await session.get(Drop, code.drop_id)
    if drop is None or drop.status != "live":
        raise AppError(409, "DROP_NOT_LIVE", "현재 진행 중인 드롭이 아닙니다.")
    if card.drop_id is None or code.drop_id != card.drop_id:
        raise AppError(409, "CARD_DROP_MISMATCH", "카드 발행 드롭과 코드 드롭이 일치하지 않습니다.")
    return card


async def redeem(
    session: AsyncSession, user: User, code_value: str, acquisition_source: str = "redeem_code"
) -> tuple[dict, str]:
    # Lock the redeem row so concurrent requests cannot both consume the same code.
    # Authentication performed a read first, which starts SQLAlchemy's autobegin
    # transaction. Close that read-only boundary before this service owns its write
    # transaction; do not let routers accidentally control transaction scope.
    user_id = user.id  # rollback expires ORM objects; retain primitive request identity.
    if session.in_transaction():
        await session.rollback()
    async with session.begin():
        code = await session.scalar(
            select(RedeemCode).where(RedeemCode.code == code_value).with_for_update()
        )
        if not code:
            raise AppError(404, "REDEEM_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.")
        if code.disabled_at:
            raise AppError(409, "REDEEM_CODE_DISABLED", "비활성화된 코드입니다.")
        if code.used_count >= code.max_uses:
            error_code = (
                "REDEEM_LIMIT_REACHED" if code.max_uses == 0 else "REDEEM_CODE_ALREADY_USED"
            )
            raise AppError(409, error_code, "사용할 수 없는 코드입니다.")
        already_owned = await session.scalar(
            select(UserCard.id).where(
                UserCard.user_id == user_id,
                UserCard.redeem_code_id == code.code,
            )
        )
        if already_owned:
            raise AppError(409, "REDEEM_CODE_ALREADY_USED", "이미 사용한 코드입니다.")
        expires_at = (
            code.expires_at.replace(tzinfo=UTC)
            if code.expires_at and code.expires_at.tzinfo is None
            else code.expires_at
        )
        if expires_at and expires_at < now():
            raise AppError(409, "REDEEM_CODE_EXPIRED", "만료된 코드입니다.")
        card = await session.scalar(select(Card).where(Card.id == code.card_id))
        if card is None or card.status != "published":
            raise AppError(409, "CARD_NOT_PUBLISHED", "공개되지 않은 카드입니다.")
        drop = await session.get(Drop, code.drop_id)
        if drop is None or drop.status != "live":
            raise AppError(409, "DROP_NOT_LIVE", "현재 진행 중인 드롭이 아닙니다.")
        if card.drop_id is None or code.drop_id != card.drop_id:
            raise AppError(
                409,
                "CARD_DROP_MISMATCH",
                "카드 발행 드롭과 코드 드롭이 일치하지 않습니다.",
            )
        code.used_count += 1
        user_card = await grant_user_card(
            session,
            user_id=user_id,
            card_id=card.id,
            source_type="redeem_code",
            source_id=code.code,
            acquisition_source=acquisition_source,
            redeem_code_id=code.code,
            drop_id=card.drop_id,
            metadata={"dropId": drop.id, "acquisitionSource": acquisition_source},
        )
        event = await record_engagement_event(
            session,
            user_id=user_id,
            kind="card_collected",
            source_type="user_card",
            source_id=user_card.id,
            payload={
                "cardId": card.id,
                "artistId": card.artist_id,
                "memberId": card.member_id,
                "dropId": drop.id,
            },
        )
        record_details = {"cardId": card.id, "source": acquisition_source}
        await record_audit(
            session,
            actor_user_id=user_id,
            action="redemption.created",
            entity_type="user_card",
            entity_id=user_card.id,
            details={**record_details, "engagementEventId": event.id},
        )
        await notify_user_once(
            session,
            user_id=user_id,
            kind="card_redeemed",
            title="카드를 컬렉션에 추가했어요",
            body=f"{card.name} 카드가 내 컬렉션에 추가되었습니다.",
            entity_type="user_card",
            entity_id=user_card.id,
            event_key=f"redemption:{code.code}:{user_id}",
        )
    return (
        {
            "userCardId": user_card.id,
            "cardId": card.id,
            "serialNumber": user_card.serial_number,
            "redirectTo": f"/reveal/{user_card.id}",
        },
        event.id,
    )
