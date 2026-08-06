import enum
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Role(str, enum.Enum):
    FAN = "fan"
    ADMIN = "admin"
    ARTIST = "artist"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    role: Mapped[Role] = mapped_column(default=Role.FAN)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    favorite_artist_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    favorite_member_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Session(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class MagicLink(Base):
    """One-time login proof; only a SHA-256 digest of the emailed token is stored."""

    __tablename__ = "magic_links"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Artist(Base):
    __tablename__ = "artists"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)


class Member(Base):
    __tablename__ = "members"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column(ForeignKey("artists.id"))
    name: Mapped[str] = mapped_column(String)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)


class Card(Base):
    __tablename__ = "cards"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    is_official: Mapped[bool] = mapped_column(Boolean, default=True)
    image_url: Mapped[str] = mapped_column(String, default="https://example.test/card.png")
    artist_id: Mapped[str | None] = mapped_column(String, nullable=True)
    member_id: Mapped[str | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    owner_artist_id: Mapped[str | None] = mapped_column(String, nullable=True)
    template_id: Mapped[str | None] = mapped_column(String, nullable=True)
    season_name: Mapped[str | None] = mapped_column(String, nullable=True)
    rarity: Mapped[str | None] = mapped_column(String, nullable=True)
    image_asset_id: Mapped[str | None] = mapped_column(String, nullable=True)
    signature_text: Mapped[str | None] = mapped_column(String, nullable=True)
    handwriting_asset_id: Mapped[str | None] = mapped_column(String, nullable=True)
    voice_asset_id: Mapped[str | None] = mapped_column(String, nullable=True)
    handwriting_transform: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    has_voice: Mapped[bool] = mapped_column(Boolean, default=False)
    issue_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preview_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)


class Drop(Base):
    __tablename__ = "drops"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="이름 없는 드롭")
    status: Mapped[str] = mapped_column(String, default="live")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RedeemCodeBatch(Base):
    __tablename__ = "redeem_code_batches"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    drop_id: Mapped[str] = mapped_column(ForeignKey("drops.id"))
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    max_uses_per_code: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[str] = mapped_column(String)
    prefix: Mapped[str] = mapped_column(String)


class RedeemCode(Base):
    __tablename__ = "redeem_codes"
    code: Mapped[str] = mapped_column(String, primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))
    drop_id: Mapped[str] = mapped_column(ForeignKey("drops.id"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    batch_id: Mapped[str | None] = mapped_column(
        ForeignKey("redeem_code_batches.id"), nullable=True
    )
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserCard(Base):
    __tablename__ = "user_cards"
    __table_args__ = (Index("uq_user_cards_card_serial", "card_id", "serial_number", unique=True),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))
    drop_id: Mapped[str | None] = mapped_column(ForeignKey("drops.id"), nullable=True)
    serial_number: Mapped[int] = mapped_column(Integer)
    acquisition_source: Mapped[str] = mapped_column(String, default="redeem_code")
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CollectionCampaign(Base):
    """Operator-defined card set and the digital benefit it unlocks."""

    __tablename__ = "collection_campaigns"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    artist_id: Mapped[str | None] = mapped_column(String, nullable=True)
    season_name: Mapped[str | None] = mapped_column(String, nullable=True)
    required_card_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    benefit_title: Mapped[str] = mapped_column(String)
    benefit_description: Mapped[str] = mapped_column(String)
    benefit_asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")


class CollectionBenefitClaim(Base):
    """One durable, idempotency-safe claim per fan and campaign."""

    __tablename__ = "collection_benefit_claims"
    __table_args__ = (
        Index("uq_collection_benefit_claim_user_campaign", "user_id", "campaign_id", unique=True),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    campaign_id: Mapped[str] = mapped_column(ForeignKey("collection_campaigns.id"))
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String, default="system")
    title: Mapped[str] = mapped_column(String, default="Fanfolio 알림")
    body: Mapped[str | None] = mapped_column(String, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str] = mapped_column(String)
    details: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    upload_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    processed_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    transform: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class BackgroundRemovalJob(Base):
    __tablename__ = "background_removal_jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    status: Mapped[str] = mapped_column(String, default="queued")
    transparent_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(String, nullable=True)
