import enum
from datetime import UTC, datetime

import sqlalchemy as sa
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
    __table_args__ = (
        UniqueConstraint("role", "email", name="uq_users_role_email"),
        Index(
            "uq_users_role_nickname_ci",
            "role",
            sa.text("lower(nickname)"),
            unique=True,
            sqlite_where=sa.text("nickname IS NOT NULL AND trim(nickname) <> ''"),
            postgresql_where=sa.text("nickname IS NOT NULL AND btrim(nickname) <> ''"),
        ),
    )
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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConsentRecord(Base):
    """Append-only record of a user's policy and optional marketing choices."""

    __tablename__ = "consent_records"
    __table_args__ = (
        CheckConstraint(
            "policy_key IN ('terms', 'privacy', 'marketing')",
            name="ck_consent_records_policy_key",
        ),
        Index("ix_consent_records_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    policy_key: Mapped[str] = mapped_column(String(32), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="settings")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Follow(Base):
    """One fan following another fan's public activity."""

    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follows_pair"),
        Index("ix_follows_following", "following_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    following_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class UserBlock(Base):
    """A private block relationship used to hide social surfaces."""

    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_user_blocks_pair"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    blocker_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    blocked_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class SupportTicket(Base):
    """A fan support request tracked through the operations queue."""

    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint(
            "category IN ('general', 'card', 'trade', 'order', 'report')",
            name="ck_support_tickets_category",
        ),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'answered', 'closed')",
            name="ck_support_tickets_status",
        ),
        Index("ix_support_tickets_user_created", "user_id", "created_at"),
        Index("ix_support_tickets_status_updated", "status", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    assigned_admin_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SupportMessage(Base):
    """An immutable message in a support ticket conversation."""

    __tablename__ = "support_messages"
    __table_args__ = (Index("ix_support_messages_ticket_created", "ticket_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"))
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(4000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class SupportEvidence(Base):
    """Structured case evidence and operator notes, separate from fan messages."""

    __tablename__ = "support_evidence"
    __table_args__ = (Index("ix_support_evidence_ticket_created", "ticket_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"))
    actor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardVisibility(Base):
    """Per-fan switch controlling whether a collection can be viewed publicly."""

    __tablename__ = "card_visibilities"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    public_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


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
            "access_level IN ('root', 'platform_operator', 'company_admin', 'manager', 'editor', 'viewer')",
            name="ck_admin_membership_access_level",
        ),
        CheckConstraint(
            "status IN ('active', 'suspended')",
            name="ck_admin_membership_status",
        ),
        CheckConstraint(
            "(access_level IN ('root', 'platform_operator') AND organization_id IS NULL) OR "
            "(access_level NOT IN ('root', 'platform_operator') AND organization_id IS NOT NULL)",
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
    release_policy: Mapped[str] = mapped_column(String, nullable=False, default="partner_only")
    release_status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    review_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_official: Mapped[bool] = mapped_column(Boolean, default=True)
    image_url: Mapped[str] = mapped_column(String, default="https://example.test/card.png")
    artist_id: Mapped[str | None] = mapped_column(String, nullable=True)
    member_id: Mapped[str | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    owner_artist_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Partner-owned cards must remain isolated even when two organizations
    # collaborate with the same artist.
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
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
    tradable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preview_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    # Never infer a release from artist scope: a card belongs to one concrete drop.
    drop_id: Mapped[str | None] = mapped_column(ForeignKey("drops.id"), nullable=True)


class CardEffectVersion(Base):
    """Versioned artist effect configuration kept separate from the published card."""

    __tablename__ = "card_effect_versions"
    __table_args__ = (
        UniqueConstraint("card_id", "version", name="uq_card_effect_version"),
        Index("ix_card_effect_versions_card_status", "card_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    design_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardCollaborationComment(Base):
    """Scoped feedback thread shared by studio authors and card operators."""

    __tablename__ = "card_collaboration_comments"
    __table_args__ = (
        Index("ix_card_collab_comments_card_created", "card_id", "created_at"),
        Index("ix_card_collab_comments_card_status", "card_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    mention_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    review_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class CardReviewRequest(Base):
    __tablename__ = "card_review_requests"
    __table_args__ = (
        UniqueConstraint(
            "card_id",
            "version",
            "stage",
            name="uq_card_review_request_version_stage",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    snapshot: Mapped[dict] = mapped_column(JSON)


class CardReviewDecision(Base):
    __tablename__ = "card_review_decisions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    request_id: Mapped[str] = mapped_column(
        ForeignKey("card_review_requests.id", ondelete="CASCADE")
    )
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    decision: Mapped[str] = mapped_column(String)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


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


class CardPack(Base):
    """A versioned, fan-visible pack whose published odds are immutable."""

    __tablename__ = "card_packs"
    __table_args__ = (
        UniqueConstraint("artist_id", "name", "version", name="uq_card_packs_artist_name_version"),
        Index("ix_card_packs_status_artist", "status", "artist_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    artist_id: Mapped[str] = mapped_column(ForeignKey("artists.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    season_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1.0")
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ShopProduct(Base):
    """Sellable storefront metadata linked to an existing catalog artifact."""

    __tablename__ = "shop_products"
    __table_args__ = (
        CheckConstraint(
            "product_type IN ('card_pack', 'point_item', 'limited_item')",
            name="ck_shop_products_product_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_shop_products_status",
        ),
        CheckConstraint("price_points > 0", name="ck_shop_products_price_points_positive"),
        Index("ix_shop_products_status_artist", "status", "artist_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # A product may be scoped to an artist or to the global storefront. Global
    # products are used for cross-artist season passes and point packages.
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="RESTRICT"), nullable=True
    )
    product_type: Mapped[str] = mapped_column(String(32), nullable=False, default="card_pack")
    card_pack_id: Mapped[str | None] = mapped_column(
        ForeignKey("card_packs.id", ondelete="RESTRICT"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    detail_content: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    fulfillment: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    price_points: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    inventory_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sold_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    per_user_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scheduled_publish_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    exposure_slot: Mapped[str] = mapped_column(String(40), nullable=False, default="shop")
    fan_segment: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict, server_default=sa.text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class ShopOrder(Base):
    """Immutable point purchase snapshot for a storefront product."""

    __tablename__ = "shop_orders"
    __table_args__ = (
        CheckConstraint("payment_method IN ('points')", name="ck_shop_orders_payment_method"),
        CheckConstraint(
            "status IN ('completed', 'failed', 'refunded')", name="ck_shop_orders_status"
        ),
        UniqueConstraint("user_id", "idempotency_key", name="uq_shop_orders_user_key"),
        Index("ix_shop_orders_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    product_id: Mapped[str] = mapped_column(ForeignKey("shop_products.id", ondelete="RESTRICT"))
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    price_points: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(32), nullable=False, default="points")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    idempotency_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    point_ledger_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    point_event_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    refund_transaction_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ShopOrderEntitlement(Base):
    """One purchased card-pack use right, consumed when the pack is opened."""

    __tablename__ = "shop_order_entitlements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available', 'opened', 'revoked')",
            name="ck_shop_order_entitlements_status",
        ),
        UniqueConstraint("order_id", name="uq_shop_order_entitlements_order"),
        Index("ix_shop_order_entitlements_user_pack", "user_id", "pack_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("shop_orders.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    pack_id: Mapped[str] = mapped_column(ForeignKey("card_packs.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="available")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardPackCard(Base):
    """Card membership and the public probability for one pack version."""

    __tablename__ = "card_pack_cards"
    __table_args__ = (
        UniqueConstraint("pack_id", "card_id", name="uq_card_pack_cards_pack_card"),
        Index("ix_card_pack_cards_pack_position", "pack_id", "position"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    pack_id: Mapped[str] = mapped_column(
        ForeignKey("card_packs.id", ondelete="CASCADE"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    probability: Mapped[float] = mapped_column(sa.Float, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CardPackOpening(Base):
    """One immutable pack result with a globally unique issuance code."""

    __tablename__ = "card_pack_openings"
    __table_args__ = (
        UniqueConstraint("issuance_code", name="uq_card_pack_openings_issuance_code"),
        Index(
            "uq_card_pack_openings_user_pack_key",
            "user_id",
            "pack_id",
            "idempotency_key",
            unique=True,
        ),
        Index("ix_card_pack_openings_user_created", "user_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    pack_id: Mapped[str] = mapped_column(
        ForeignKey("card_packs.id", ondelete="RESTRICT"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False
    )
    user_card_id: Mapped[str | None] = mapped_column(
        ForeignKey("user_cards.id", ondelete="RESTRICT"), nullable=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    issuance_code: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardCombinationRecipe(Base):
    """Published, immutable policy for converting duplicate pack cards."""

    __tablename__ = "card_combination_recipes"
    __table_args__ = (
        UniqueConstraint("scope_type", "scope_id", name="uq_card_combination_recipe_scope"),
        Index("ix_card_combination_recipes_status", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    scope_type: Mapped[str] = mapped_column(String(32), nullable=False)
    scope_id: Mapped[str] = mapped_column(String, nullable=False)
    input_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    output_rarity_pool: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    probability_snapshot: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False)
    probability_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="published")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class CardCombination(Base):
    """One atomic material consumption and weighted result grant."""

    __tablename__ = "card_combinations"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_card_combinations_user_key"),
        Index("ix_card_combinations_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipe_id: Mapped[str] = mapped_column(
        ForeignKey("card_combination_recipes.id", ondelete="RESTRICT"), nullable=False
    )
    result_card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False
    )
    result_user_card_id: Mapped[str | None] = mapped_column(
        ForeignKey("user_cards.id", ondelete="RESTRICT"), nullable=True
    )
    material_user_card_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    probability_version: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardCombinationMaterial(Base):
    """Unique material reservation prevents a UserCard from being reused."""

    __tablename__ = "card_combination_materials"
    __table_args__ = (
        UniqueConstraint("user_card_id", name="uq_card_combination_material_user_card"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    combination_id: Mapped[str] = mapped_column(
        ForeignKey("card_combinations.id", ondelete="CASCADE"), nullable=False
    )
    user_card_id: Mapped[str] = mapped_column(
        ForeignKey("user_cards.id", ondelete="RESTRICT"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class Event(Base):
    """Editorial fan-facing event, independent from card release mechanics."""

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_workflow_status_starts_at", "workflow_status", "starts_at"),
        Index("ix_events_artist_workflow_starts", "artist_id", "workflow_status", "starts_at"),
        Index("ix_events_featured_priority", "featured", "priority"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(String(5000), nullable=False, default="")
    notice_items: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    hero_asset_id: Mapped[str] = mapped_column(
        ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, default="announcement")
    workflow_status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    venue: Mapped[str | None] = mapped_column(String(200), nullable=True)
    participant_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    application_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    application_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    drop_id: Mapped[str | None] = mapped_column(ForeignKey("drops.id"), nullable=True)
    card_id: Mapped[str | None] = mapped_column(ForeignKey("cards.id"), nullable=True)
    achievement_id: Mapped[str | None] = mapped_column(
        ForeignKey("achievement_definitions.id"), nullable=True
    )
    external_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class EventRelatedCard(Base):
    __tablename__ = "event_related_cards"
    __table_args__ = (
        UniqueConstraint("event_id", "card_id", name="uq_event_related_cards_event_card"),
        UniqueConstraint("event_id", "position", name="uq_event_related_cards_event_position"),
        Index("ix_event_related_cards_event_position", "event_id", "position"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class EventApplication(Base):
    __tablename__ = "event_applications"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_applications_event_user"),
        Index("ix_event_applications_event_status", "event_id", "status"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="submitted")
    check_in_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    check_in_token_issued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class EventComment(Base):
    __tablename__ = "event_comments"
    __table_args__ = (Index("ix_event_comments_event_created", "event_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


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
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trade_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FanWishlistItem(Base):
    """A fan's server-backed bookmark for one owned card type."""

    __tablename__ = "fan_wishlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_fan_wishlist_user_card"),
        Index("ix_fan_wishlist_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CollectionGoal(Base):
    """One fan-owned collection target tied to a published card pack."""

    __tablename__ = "collection_goals"
    __table_args__ = (
        UniqueConstraint("user_id", "pack_id", name="uq_collection_goals_user_pack"),
        Index("ix_collection_goals_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    pack_id: Mapped[str] = mapped_column(ForeignKey("card_packs.id", ondelete="CASCADE"))
    target_count: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class TradeProposal(Base):
    """A pending two-sided fan card exchange."""

    __tablename__ = "trade_proposals"
    __table_args__ = (
        Index("ix_trade_proposals_recipient_status", "recipient_id", "status"),
        Index("ix_trade_proposals_proposer_status", "proposer_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    proposer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TradeItem(Base):
    """Card offered by one side of a trade proposal."""

    __tablename__ = "trade_items"
    __table_args__ = (
        UniqueConstraint("proposal_id", "user_card_id", name="uq_trade_items_proposal_card"),
        Index("ix_trade_items_user_card", "user_card_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("trade_proposals.id", ondelete="CASCADE"))
    user_card_id: Mapped[str] = mapped_column(ForeignKey("user_cards.id", ondelete="RESTRICT"))
    side: Mapped[str] = mapped_column(String(16), nullable=False)


class TradeLock(Base):
    """Unique active lock preventing a card from entering two open trades."""

    __tablename__ = "trade_locks"
    __table_args__ = (UniqueConstraint("user_card_id", name="uq_trade_locks_user_card"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("trade_proposals.id", ondelete="CASCADE"))
    user_card_id: Mapped[str] = mapped_column(ForeignKey("user_cards.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class TradeHold(Base):
    """An explicit operational hold that prevents a trade from being accepted."""

    __tablename__ = "trade_holds"
    __table_args__ = (UniqueConstraint("proposal_id", name="uq_trade_holds_proposal"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("trade_proposals.id", ondelete="CASCADE"))
    ticket_id: Mapped[str | None] = mapped_column(
        ForeignKey("support_tickets.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class CardOwnershipLedger(Base):
    """Append-only ownership event for every card grant or transfer."""

    __tablename__ = "card_ownership_ledger"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "action",
            "source_type",
            "source_id",
            name="uq_card_ownership_ledger_event",
        ),
        Index("ix_card_ownership_ledger_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_card_id: Mapped[str] = mapped_column(
        ForeignKey("user_cards.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(128), nullable=False)
    from_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    to_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    record_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class EngagementEvent(Base):
    __tablename__ = "engagement_events"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "kind",
            "source_type",
            "source_id",
            name="uq_engagement_event_source",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dead_lettered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class MissionDefinition(Base):
    """Operator-authored repeatable growth mission definition."""

    __tablename__ = "mission_definitions"
    __table_args__ = (
        CheckConstraint(
            "recurrence IN ('once', 'daily', 'weekly', 'season')",
            name="ck_mission_definitions_recurrence",
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_review', 'published', 'disabled', 'ended')",
            name="ck_mission_definitions_status",
        ),
        CheckConstraint("target_value > 0", name="ck_mission_definitions_target_positive"),
        Index("ix_mission_definitions_status_event", "status", "event_kind"),
        Index(
            "ix_mission_definitions_scope_status",
            "organization_id",
            "artist_id",
            "status",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    event_kind: Mapped[str] = mapped_column(String(80), nullable=False)
    target_value: Mapped[int] = mapped_column(Integer, nullable=False)
    recurrence: Mapped[str] = mapped_column(
        String(20), nullable=False, default="once", server_default="once"
    )
    condition_payload: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default=sa.text("'{}'")
    )
    reward_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=sa.text("'{}'"))
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="draft", server_default="draft"
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class MissionProgress(Base):
    """Per-fan progress for one mission period instance."""

    __tablename__ = "mission_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "mission_id",
            "period_key",
            name="uq_mission_progress_user_period",
        ),
        CheckConstraint("current_value >= 0", name="ck_mission_progress_current_nonnegative"),
        Index("ix_mission_progress_user_updated", "user_id", "updated_at"),
        Index("ix_mission_progress_mission_period", "mission_id", "period_key"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mission_id: Mapped[str] = mapped_column(
        ForeignKey("mission_definitions.id", ondelete="CASCADE")
    )
    period_key: Mapped[str] = mapped_column(String(64), nullable=False)
    current_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PointLedger(Base):
    """Immutable point accounting row for earns, spends, reversals, and expirations."""

    __tablename__ = "point_ledger"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_event_id",
            "rule_key",
            name="uq_point_ledger_event_rule",
        ),
        CheckConstraint(
            "transaction_type IN ('earn', 'spend', 'reverse', 'expire', 'adjust')",
            name="ck_point_ledger_transaction_type",
        ),
        Index("ix_point_ledger_user_created", "user_id", "created_at"),
        Index("ix_point_ledger_expires_at", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_event_id: Mapped[str] = mapped_column(ForeignKey("engagement_events.id"), nullable=False)
    rule_key: Mapped[str] = mapped_column(String(160), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_ledger_id: Mapped[str | None] = mapped_column(
        ForeignKey("point_ledger.id"), nullable=True
    )
    metadata_json: Mapped[dict] = mapped_column(
        "metadata", JSON, default=dict, server_default=sa.text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class PointBalance(Base):
    """Cached spendable point balance for one fan."""

    __tablename__ = "point_balances"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_point_balances_nonnegative"),)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PointTransaction(Base):
    """Durable idempotency record for every externally requested point mutation."""

    __tablename__ = "point_transactions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "operation",
            "idempotency_key",
            name="uq_point_transactions_user_operation_key",
        ),
        CheckConstraint(
            "operation IN ('charge', 'refund', 'adjustment')",
            name="ck_point_transactions_operation",
        ),
        CheckConstraint("status IN ('completed', 'failed')", name="ck_point_transactions_status"),
        Index("ix_point_transactions_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    response_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ledger_id: Mapped[str | None] = mapped_column(
        ForeignKey("point_ledger.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class PointCharge(Base):
    """A user-facing point purchase with a provider-neutral payment snapshot."""

    __tablename__ = "point_charges"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_point_charges_user_key"),
        CheckConstraint(
            "status IN ('completed', 'refunded', 'failed', 'cancelled')",
            name="ck_point_charges_status",
        ),
        Index("ix_point_charges_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    package_id: Mapped[str] = mapped_column(String(80), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    price_won: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="completed")
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    ledger_id: Mapped[str | None] = mapped_column(
        ForeignKey("point_ledger.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PointChargePackage(Base):
    """Administrator-managed catalog entry for a point top-up package."""

    __tablename__ = "point_charge_packages"
    __table_args__ = (
        CheckConstraint("points > 0", name="ck_point_charge_packages_points_positive"),
        CheckConstraint("price_won > 0", name="ck_point_charge_packages_price_positive"),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_point_charge_packages_status"),
        Index("ix_point_charge_packages_status_sort", "status", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    price_won: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scheduled_publish_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class LevelPolicyVersion(Base):
    """Versioned fan-level policy so future threshold changes are explicit."""

    __tablename__ = "level_policy_versions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'disabled')",
            name="ck_level_policy_versions_status",
        ),
        Index("ix_level_policy_versions_active_status", "is_active", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="draft", server_default="draft"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class LevelThreshold(Base):
    """Required cumulative XP for one level under a policy version."""

    __tablename__ = "level_thresholds"
    __table_args__ = (
        UniqueConstraint(
            "policy_version_id",
            "level",
            name="uq_level_threshold_policy_level",
        ),
        CheckConstraint("level >= 1", name="ck_level_thresholds_level_positive"),
        CheckConstraint("required_xp >= 0", name="ck_level_thresholds_required_nonnegative"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    policy_version_id: Mapped[str] = mapped_column(
        ForeignKey("level_policy_versions.id", ondelete="CASCADE")
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    required_xp: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)


class AnalyticsEvent(Base):
    """Immutable product analytics event used for scoped operational statistics."""

    __tablename__ = "analytics_events"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_analytics_events_dedupe_key"),
        Index("ix_analytics_events_name_created", "event_name", "created_at"),
        Index("ix_analytics_events_scope_created", "organization_id", "artist_id", "created_at"),
        Index("ix_analytics_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_name: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), nullable=True
    )
    card_id: Mapped[str | None] = mapped_column(
        ForeignKey("cards.id", ondelete="SET NULL"), nullable=True
    )
    pack_id: Mapped[str | None] = mapped_column(
        ForeignKey("card_packs.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class AchievementDefinition(Base):
    __tablename__ = "achievement_definitions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(ForeignKey("artists.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    condition_type: Mapped[str] = mapped_column(String, nullable=False)
    target_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    condition_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    reward_rule_key: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AchievementProgress(Base):
    __tablename__ = "achievement_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_achievement_progress_user"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    achievement_id: Mapped[str] = mapped_column(
        ForeignKey("achievement_definitions.id"), nullable=False
    )
    current_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class RewardCatalog(Base):
    __tablename__ = "reward_catalog"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(ForeignKey("artists.id"), nullable=True)
    reward_type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")


class RewardGrant(Base):
    __tablename__ = "reward_grants"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_event_id",
            "rule_key",
            name="uq_reward_grant_event_rule",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    reward_id: Mapped[str] = mapped_column(ForeignKey("reward_catalog.id"), nullable=False)
    source_event_id: Mapped[str] = mapped_column(ForeignKey("engagement_events.id"), nullable=False)
    rule_key: Mapped[str] = mapped_column(String, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RewardGrantCardPackEntitlement(Base):
    """One card-pack use right granted by a fan-growth reward."""

    __tablename__ = "reward_grant_card_pack_entitlements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available', 'opened', 'revoked')",
            name="ck_reward_grant_card_pack_entitlements_status",
        ),
        UniqueConstraint("reward_grant_id", name="uq_reward_grant_card_pack_entitlement_grant"),
        Index(
            "ix_reward_grant_card_pack_entitlements_user_pack",
            "user_id",
            "pack_id",
            "status",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    reward_grant_id: Mapped[str] = mapped_column(
        ForeignKey("reward_grants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    pack_id: Mapped[str] = mapped_column(ForeignKey("card_packs.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="available")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class XpLedger(Base):
    __tablename__ = "xp_ledger"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", "rule_key", name="uq_xp_ledger_event_rule"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_id: Mapped[str] = mapped_column(ForeignKey("engagement_events.id"), nullable=False)
    rule_key: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class FanLevel(Base):
    __tablename__ = "fan_levels"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PassSeason(Base):
    __tablename__ = "pass_seasons"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(ForeignKey("artists.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    is_paid: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    premium_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    premium_price_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PassTier(Base):
    __tablename__ = "pass_tiers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    season_id: Mapped[str] = mapped_column(ForeignKey("pass_seasons.id"), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)
    required_xp: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_id: Mapped[str | None] = mapped_column(ForeignKey("reward_catalog.id"), nullable=True)
    premium_reward_id: Mapped[str | None] = mapped_column(
        ForeignKey("reward_catalog.id"), nullable=True
    )


class PassProgress(Base):
    __tablename__ = "pass_progress"
    __table_args__ = (UniqueConstraint("user_id", "season_id", name="uq_pass_progress_user"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("pass_seasons.id"), nullable=False)
    current_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimed_tier_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    premium_claimed_tier_ids: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default=sa.text("'[]'"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PassEntitlement(Base):
    """A user's purchased premium access for one season."""

    __tablename__ = "pass_entitlements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'refunded', 'expired')",
            name="ck_pass_entitlements_status",
        ),
        UniqueConstraint("user_id", "season_id", name="uq_pass_entitlements_user_season"),
        Index("ix_pass_entitlements_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    season_id: Mapped[str] = mapped_column(ForeignKey("pass_seasons.id", ondelete="CASCADE"))
    price_points: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    order_id: Mapped[str | None] = mapped_column(
        ForeignKey("shop_orders.id", ondelete="SET NULL"), nullable=True
    )
    purchased_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ProfileEquipment(Base):
    __tablename__ = "profile_equipment"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    equipped_reward_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


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
    __table_args__ = (
        Index("uq_notifications_user_event_key", "user_id", "event_key", unique=True),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String, default="system")
    title: Mapped[str] = mapped_column(String, default="Fanfolio 알림")
    body: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    event_key: Mapped[str | None] = mapped_column(String, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class PushDevice(Base):
    """An authenticated fan's current push-capable device registration."""

    __tablename__ = "push_devices"
    __table_args__ = (
        UniqueConstraint("token", name="uq_push_devices_token"),
        Index("ix_push_devices_user_enabled", "user_id", "enabled"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String(4096), nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class NotificationDelivery(Base):
    """Durable, idempotent delivery attempt for an in-app notification."""

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "notification_id", "channel", "destination", name="uq_notification_delivery_target"
        ),
        Index("ix_notification_deliveries_due", "status", "next_attempt_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    notification_id: Mapped[str] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    destination: Mapped[str] = mapped_column(String(4096), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class ContentCalendarEntry(Base):
    """A scheduled card, event, or product publication window."""

    __tablename__ = "content_calendar_entries"
    __table_args__ = (
        Index(
            "ix_content_calendar_content_window",
            "content_type",
            "content_id",
            "starts_at",
            "ends_at",
        ),
        Index("ix_content_calendar_starts_at", "starts_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    content_id: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class ApprovalRequest(Base):
    """Two-person approval record for high-impact administrator mutations."""

    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_status_created", "status", "created_at"),
        Index("ix_approval_requests_entity", "entity_type", "entity_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(160), nullable=False)
    requested_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    payload: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict, server_default=sa.text("'{}'")
    )
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
