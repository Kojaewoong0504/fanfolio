import asyncio
import hmac
import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.errors import AppError
from app.image_processing import remove_light_background_bytes
from app.mailer import MailDeliveryError, deliver_notification_email
from app.models import (
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    BackgroundRemovalJob,
    Card,
    CollectionBenefitClaim,
    CollectionCampaign,
    DeploymentIdentity,
    Drop,
    MagicLink,
    Member,
    Notification,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    Role,
    Session,
    User,
    UserCard,
)
from app.passwords import hash_password
from app.storage import configured_asset_storage

logger = logging.getLogger(__name__)


def now() -> datetime:
    return datetime.now(UTC)


def magic_link_token_hash(token: str) -> str:
    """Persist a digest so a database leak cannot be used as a login link."""
    return sha256(token.encode()).hexdigest()


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
    elif not user.password_hash:
        user.password_hash = hash_password(password)
    # The bootstrap administrator is trusted to choose their own password
    # during deployment; only delegated accounts are forced to rotate one.
    user.must_change_password = False
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
        CollectionBenefitClaim,
        AuditLog,
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
                artist_id="artist_nova3",
                member_id="member_yuna",
                season_name="2026 SPRING",
                rarity="Special",
                signature_text="오늘 와줘서 고마워",
                issue_limit=500,
                image_url="/src/assets/hero.png",
            ),
            Card(
                id="card_draft",
                name="비공개 카드",
                status="draft",
                artist_id="artist_nova3",
                image_url="/src/assets/hero.png",
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
    details: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            id=f"audit_{uuid4().hex[:12]}",
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
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
) -> dict:
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
        drop = await session.get(Drop, code.drop_id)
        # The card lock also serializes serial-number allocation when two different
        # redeem codes issue copies of the same card at the same time.
        card = await session.scalar(select(Card).where(Card.id == code.card_id).with_for_update())
        if drop.status != "live":
            raise AppError(409, "DROP_NOT_LIVE", "현재 진행 중인 드롭이 아닙니다.")
        if card.status != "published":
            raise AppError(409, "CARD_NOT_PUBLISHED", "공개되지 않은 카드입니다.")
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
            drop_id=code.drop_id,
            serial_number=serial,
            acquisition_source=acquisition_source,
            acquired_at=now(),
        )
        session.add(user_card)
        record_details = {"cardId": card.id, "source": acquisition_source}
        await record_audit(
            session,
            actor_user_id=user_id,
            action="redemption.created",
            entity_type="user_card",
            entity_id=user_card.id,
            details=record_details,
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
    return {
        "userCardId": user_card.id,
        "cardId": card.id,
        "serialNumber": serial,
        "redirectTo": f"/reveal/{user_card.id}",
    }
