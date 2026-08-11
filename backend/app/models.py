import enum
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DeploymentIdentity(Base):
    """A durable marker that prevents silently bootstrapping a replacement DB."""

    __tablename__ = "deployment_identity"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    key_digest: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Role(str, enum.Enum):
    FAN = "fan"
    ADMIN = "admin"
    ARTIST = "artist"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("role", "email", name="uq_users_role_email"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    username: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[Role] = mapped_column(default=Role.FAN)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    favorite_artist_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    favorite_member_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Organization(Base):
    """A partner company whose staff operate only assigned artists."""

    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'suspended')",
            name="ck_organization_status",
        ),
        Index("ix_organizations_logo_asset_id", "logo_asset_id"),
        Index("ix_organizations_status_name", "status", "name"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    contact_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String, nullable=True)
    contract_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    contract_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AdminMembership(Base):
    """Operational admin scope, intentionally separate from login client role."""

    __tablename__ = "admin_memberships"
    __table_args__ = (
        CheckConstraint(
            "access_level IN ('root', 'company_admin', 'manager', 'editor', 'viewer')",
            name="ck_admin_membership_access_level",
        ),
        CheckConstraint(
            "status IN ('active', 'suspended')",
            name="ck_admin_membership_status",
        ),
        CheckConstraint(
            "(access_level = 'root' AND organization_id IS NULL) OR "
            "(access_level != 'root' AND organization_id IS NOT NULL)",
            name="ck_admin_membership_scope",
        ),
        Index("ix_admin_memberships_organization_status", "organization_id", "status"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    access_level: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class OrganizationArtist(Base):
    """Artists that one partner company is contractually allowed to manage."""

    __tablename__ = "organization_artists"

    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    artist_id: Mapped[str] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True
    )


class AdminArtistAssignment(Base):
    """The subset of a partner company's artists assigned to one staff admin."""

    __tablename__ = "admin_artist_assignments"
    __table_args__ = (Index("ix_admin_artist_assignments_artist", "artist_id"),)

    admin_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    artist_id: Mapped[str] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True
    )
    assigned_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Session(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class RefreshToken(Base):
    """Server-side state for a signed refresh JWT and its rotation family."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_family_id", "family_id"),
        Index("ix_refresh_tokens_user_client", "user_id", "client"),
        Index("ix_refresh_tokens_token_digest", "token_digest"),
    )

    jti: Mapped[str] = mapped_column(String, primary_key=True)
    family_id: Mapped[str] = mapped_column(String, nullable=False)
    token_digest: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    client: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_jti: Mapped[str | None] = mapped_column(String, nullable=True)


class SocialAccount(Base):
    """Verified provider identity linked to one Fanfolio user."""

    __tablename__ = "social_accounts"
    __table_args__ = (
        Index("uq_social_accounts_provider_subject", "provider", "subject", unique=True),
        Index("ix_social_accounts_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class OAuthState(Base):
    """Short-lived server-side state used to prevent OAuth CSRF."""

    __tablename__ = "oauth_states"

    state_hash: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    client: Mapped[str] = mapped_column(String, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OAuthExchangeCode(Base):
    """One-time browser-to-API handoff code; never place app tokens in a URL."""

    __tablename__ = "oauth_exchange_codes"

    code_hash: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    client: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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


class ArtistProfile(Base):
    """Connect an artist account to the catalog group it may publish for."""

    __tablename__ = "artist_profiles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    artist_id: Mapped[str] = mapped_column(ForeignKey("artists.id"))
    verification_status: Mapped[str] = mapped_column(String, default="pending")


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
    video_asset_id: Mapped[str | None] = mapped_column(String, nullable=True)
    handwriting_transform: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    design_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    has_voice: Mapped[bool] = mapped_column(Boolean, default=False)
    issue_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preview_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)


class Drop(Base):
    __tablename__ = "drops"
    __table_args__ = (
        Index("ix_drops_organization_artist_status", "organization_id", "artist_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="이름 없는 드롭")
    status: Mapped[str] = mapped_column(String, default="live")
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(ForeignKey("artists.id"), nullable=True)
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
    __table_args__ = (
        Index("uq_user_cards_card_serial", "card_id", "serial_number", unique=True),
        Index("uq_user_cards_user_redeem_code", "user_id", "redeem_code_id", unique=True),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))
    redeem_code_id: Mapped[str | None] = mapped_column(
        ForeignKey("redeem_codes.code"), nullable=True
    )
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
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), nullable=True
    )
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
    upload_completed_at: Mapped[datetime | None] = mapped_column(
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
