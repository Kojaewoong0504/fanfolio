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

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.errors import AppError
from app.image_processing import remove_light_background_bytes
from app.mailer import MailDeliveryError, deliver_notification_email
from app.models import (
    AchievementDefinition,
    AchievementProgress,
    AdminArtistAssignment,
    AdminMembership,
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    BackgroundRemovalJob,
    Card,
    CardReviewDecision,
    CardReviewRequest,
    CollectionBenefitClaim,
    CollectionCampaign,
    DeploymentIdentity,
    Drop,
    EngagementEvent,
    FanLevel,
    MagicLink,
    Member,
    Notification,
    Organization,
    OrganizationArtist,
    PassProgress,
    PassSeason,
    PassTier,
    ProfileEquipment,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    RewardCatalog,
    RewardGrant,
    Role,
    Session,
    User,
    UserCard,
    XpLedger,
)
from app.passwords import hash_password
from app.storage import configured_asset_storage

logger = logging.getLogger(__name__)
PASS_CLAIM_GRACE_DAYS = 14


def now() -> datetime:
    return datetime.now(UTC)


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
    level.level = max(1, level.total_xp // 100 + 1)
    return row


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
        .where(RewardGrant.id == grant_id, RewardGrant.user_id == user_id)
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
            .where(RewardGrant.user_id == user_id, RewardGrant.id.in_(equipped_reward_ids))
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


async def fan_progression_data(session: AsyncSession, user_id: str) -> dict:
    level = await session.get(FanLevel, user_id)
    definitions = list(
        await session.scalars(
            select(AchievementDefinition)
            .where(AchievementDefinition.status == "published")
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

    claimable_reward_rows = (
        await session.execute(
            select(RewardGrant, RewardCatalog)
            .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
            .where(
                RewardGrant.user_id == user_id,
                RewardGrant.claimed_at.is_(None),
                RewardCatalog.status == "published",
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
                RewardCatalog.status == "published",
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
            "level": level.level if level else 1,
            "totalXp": level.total_xp if level else 0,
        },
        "achievements": achievements,
        "claimableRewards": [
            _reward_grant_data(grant, reward) for grant, reward in claimable_reward_rows
        ],
        "claimedRewards": [
            _reward_grant_data(grant, reward) for grant, reward in claimed_reward_rows
        ],
        "pass": await fan_pass_data(session, user_id=user_id),
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
                PassSeason.is_paid.is_(False),
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
    total = await session.scalar(
        select(func.coalesce(func.sum(XpLedger.amount), 0)).where(*conditions)
    )
    return int(total or 0)


async def refresh_pass_progress(
    session: AsyncSession, *, user_id: str, season: PassSeason
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


def _pass_tier_data(tier: PassTier, progress: PassProgress) -> dict:
    claimed_tier_ids = set(progress.claimed_tier_ids or [])
    claimed = tier.id in claimed_tier_ids
    return {
        "id": tier.id,
        "tier": tier.tier,
        "requiredXp": tier.required_xp,
        "rewardId": tier.reward_id,
        "claimed": claimed,
        "claimable": not claimed and progress.current_xp >= tier.required_xp,
    }


async def fan_pass_data(session: AsyncSession, *, user_id: str) -> dict:
    current_time = now()
    seasons = list(
        await session.scalars(
            select(PassSeason)
            .where(PassSeason.status == "published", PassSeason.is_paid.is_(False))
            .order_by(PassSeason.starts_at, PassSeason.id)
        )
    )
    items = []
    for season in seasons:
        if not _season_active_for_pass_view(season, current_time):
            continue
        progress = await refresh_pass_progress(session, user_id=user_id, season=season)
        tiers = list(
            await session.scalars(
                select(PassTier)
                .where(PassTier.season_id == season.id)
                .order_by(PassTier.tier, PassTier.id)
            )
        )
        items.append(
            {
                "id": season.id,
                "title": season.title,
                "organizationId": season.organization_id,
                "artistId": season.artist_id,
                "status": season.status,
                "isPaid": False,
                "startsAt": _datetime_data(season.starts_at),
                "endsAt": _datetime_data(season.ends_at),
                "progress": {
                    "currentXp": progress.current_xp,
                    "claimedTierIds": list(progress.claimed_tier_ids or []),
                },
                "tiers": [_pass_tier_data(tier, progress) for tier in tiers],
            }
        )
    await session.commit()
    return {"seasons": items}


async def claim_pass_tier(session: AsyncSession, *, user_id: str, tier_id: str) -> dict:
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
    if season.status != "published" or season.is_paid:
        raise AppError(404, "PASS_TIER_NOT_FOUND", "팬 패스 티어를 찾을 수 없습니다.")
    if not _season_open_for_claim(season, now()):
        raise AppError(409, "PASS_SEASON_CLAIM_CLOSED", "팬 패스 수령 기간이 지났습니다.")

    progress = await refresh_pass_progress(session, user_id=user_id, season=season)
    claimed_tier_ids = list(progress.claimed_tier_ids or [])
    if tier.id in claimed_tier_ids:
        raise AppError(409, "PASS_TIER_ALREADY_CLAIMED", "이미 수령한 팬 패스 티어입니다.")
    if progress.current_xp < tier.required_xp:
        raise AppError(409, "PASS_TIER_LOCKED", "필요한 XP를 달성한 뒤 수령할 수 있습니다.")

    event = await record_engagement_event(
        session,
        user_id=user_id,
        kind="pass_tier_claimed",
        source_type="pass_tier",
        source_id=tier.id,
        payload={"seasonId": season.id, "requiredXp": tier.required_xp},
    )
    event.status = "processed"
    event.processed_at = now()

    reward_grant_data = None
    if tier.reward_id:
        grant = await grant_reward(
            session,
            user_id=user_id,
            reward_id=tier.reward_id,
            source_event_id=event.id,
            rule_key=f"pass_tier:{tier.id}",
        )
        reward = await session.get(RewardCatalog, tier.reward_id)
        if reward is not None:
            reward_grant_data = _reward_grant_data(grant, reward)

    claimed_tier_ids.append(tier.id)
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
        details={"seasonId": season.id, "requiredXp": tier.required_xp},
    )
    await session.commit()
    return {
        "seasonId": season.id,
        "tierId": tier.id,
        "claimedAt": _datetime_data(claimed_at),
        "rewardGrant": reward_grant_data,
    }


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
        if event.status == "processed":
            return
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
        for definition in await published_definitions_for_event(session, event):
            await update_achievement_progress(session, event=event, definition=definition)
        await update_pass_progress(session, event=event)
        event.status = "processed"
        event.processed_at = now()
        await session.commit()


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
    artist_id = "artist_nova3"
    artist = await session.get(Artist, artist_id)
    if artist is None:
        session.add(Artist(id=artist_id, name="드림스케이프", image_url="/src/assets/hero.png"))

    member_rows = (
        ("member_yuna", "유나"),
        ("member_minho", "민호"),
        ("member_jei", "제이"),
    )
    for member_id, name in member_rows:
        if await session.get(Member, member_id) is None:
            session.add(Member(id=member_id, artist_id=artist_id, name=name))

    if await session.get(Card, "card_demo_published") is None:
        session.add(
            Card(
                id="card_demo_published",
                name="컴백 기념 사인 카드",
                status="published",
                release_policy="partner_and_platform",
                release_status="published",
                artist_id=artist_id,
                member_id="member_yuna",
                season_name="2026 SPRING",
                rarity="Special",
                signature_text="오늘 와줘서 고마워",
                issue_limit=500,
                image_url="/src/assets/hero.png",
            )
        )
    await session.commit()


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
    image_path = Path(__file__).resolve().parents[1] / "assets" / "card-yuna-lavender.jpg"
    image_path = image_path.resolve()
    if not image_path.is_file():
        raise FileNotFoundError(f"bundled demo card image is missing: {image_path}")

    storage = configured_asset_storage()
    content = await asyncio.to_thread(image_path.read_bytes)
    # These are the two controlled QA/demo identities created by our own
    # onboarding flow. Partner-owned cards are intentionally not discovered
    # or rewritten here.
    repair_targets = (
        (
            "card_demo_published",
            "asset_demo_card_yuna_lavender",
            "컴백 기념 사인 카드",
            "2026 SPRING",
        ),
        ("card_82bc4c1d51", "asset_qa_card_yuna_lavender", "QA 스타더스트 홀로그램", "2026 SUMMER"),
        ("card_123c407f49", "asset_qa_card_normal", "QA 노멀 런칭 카드", "2026 QA LAUNCH"),
    )
    repaired = 0
    for card_id, asset_id, card_name, season_name in repair_targets:
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
        asset = await session.get(Asset, asset_id)
        if asset is None:
            asset = Asset(
                id=asset_id,
                owner_id=admin_id,
                file_name=image_path.name,
                content_type="image/jpeg",
                purpose="card",
            )
            session.add(asset)
            await session.flush()

        if not asset.storage_path or not storage.exists(asset.storage_path):
            asset.storage_path = await asyncio.to_thread(storage.save_bytes, asset.id, content)
        asset.owner_id = admin_id
        asset.file_name = image_path.name
        asset.content_type = "image/jpeg"
        asset.purpose = "card"
        asset.upload_completed_at = now()
        card.image_asset_id = asset.id
        card.image_url = ""
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
        session.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                role=role,
                password_hash=hash_password("test-admin-password") if role == Role.ADMIN else None,
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
            Artist(id="artist_nova3", name="드림스케이프", image_url="/src/assets/hero.png"),
            Member(id="member_yuna", artist_id="artist_nova3", name="유나"),
            Member(id="member_minho", artist_id="artist_nova3", name="민호"),
            Member(id="member_jei", artist_id="artist_nova3", name="제이"),
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
                image_url="/src/assets/hero.png",
                drop_id="drop_live",
            ),
            Card(
                id="card_draft",
                name="비공개 카드",
                status="draft",
                artist_id="artist_nova3",
                image_url="/src/assets/hero.png",
                drop_id="drop_live",
            ),
            Drop(id="drop_live", name="NOVA-3 Comeback Live Drop", status="live"),
            Drop(id="drop_ended", status="ended"),
        ]
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
        session.add(
            Notification(
                id=f"notification_{uuid4().hex[:12]}",
                user_id=fan.id,
                kind=kind,
                title=title,
                body=body,
            )
        )
        if fan.notification_email_enabled and fan.email:
            try:
                await deliver_notification_email(fan.email, title, body)
            except MailDeliveryError:
                # In-app delivery is the source of truth; an SMTP outage must
                # not roll back the card/drop event transaction.
                logger.warning(
                    "Could not deliver notification email to %s", fan.email, exc_info=True
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
    session.add(
        Notification(
            id=f"notification_{uuid4().hex[:12]}",
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
            event_key=event_key,
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
        # The card lock also serializes serial-number allocation when two different
        # redeem codes issue copies of the same card at the same time.
        card = await session.scalar(select(Card).where(Card.id == code.card_id).with_for_update())
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
        serial = (
            await session.scalar(
                select(func.count()).select_from(UserCard).where(UserCard.card_id == card.id)
            )
        ) + 1
        user_card = UserCard(
            id=f"uc_{uuid4().hex[:12]}",
            user_id=user_id,
            card_id=card.id,
            redeem_code_id=code.code,
            drop_id=card.drop_id,
            serial_number=serial,
            acquisition_source=acquisition_source,
            acquired_at=now(),
        )
        session.add(user_card)
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
        session.add(
            Notification(
                id=f"notification_{uuid4().hex[:12]}",
                user_id=user_id,
                kind="card_redeemed",
                title="카드를 컬렉션에 추가했어요",
                body=f"{card.name} 카드가 내 컬렉션에 추가되었습니다.",
            )
        )
    return (
        {
            "userCardId": user_card.id,
            "cardId": card.id,
            "serialNumber": serial,
            "redirectTo": f"/reveal/{user_card.id}",
        },
        event.id,
    )
