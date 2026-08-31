from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

T = TypeVar("T")
RewardGrantId = Annotated[str, Field(min_length=1)]

ReleaseStatus = Literal[
    "draft",
    "pending_partner_review",
    "changes_requested",
    "pending_platform_review",
    "approved",
    "drop_ready",
    "published",
]
ReleasePolicy = Literal["partner_only", "partner_and_platform"]
ReviewStage = Literal["partner", "platform"]
ReviewDecision = Literal["approved", "changes_requested"]


class Success(BaseModel, Generic[T]):
    """Generic Pydantic v2 envelope keeps every public success response uniform."""

    ok: Literal[True] = True
    data: T


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    ok: Literal[False] = False
    error: ErrorBody


class HealthData(BaseModel):
    status: Literal["healthy"]


class MagicLinkRequest(BaseModel):
    email: EmailStr
    purpose: Literal["login", "signup"]


class MagicLinkVerify(BaseModel):
    token: str = Field(min_length=1)


class ArtistPasswordLogin(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(min_length=1, max_length=200)


class AdminPasswordLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class FanPasswordCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class FanPasswordChange(BaseModel):
    current_password: str = Field(alias="currentPassword", min_length=1, max_length=200)
    new_password: str = Field(alias="newPassword", min_length=8, max_length=200)
    model_config = ConfigDict(populate_by_name=True)


class FanPasswordResetRequest(BaseModel):
    email: EmailStr


class FanPasswordResetConfirm(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(alias="newPassword", min_length=8, max_length=200)
    model_config = ConfigDict(populate_by_name=True)


class AccountDeletionRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=40)


class ContentCalendarCreate(BaseModel):
    content_type: Literal["card", "event", "product"] = Field(alias="contentType")
    content_id: str = Field(alias="contentId", min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime = Field(alias="endsAt")
    notes: str | None = Field(default=None, max_length=2000)
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_window(self) -> "ContentCalendarCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("endsAt must be after startsAt")
        return self


class ContentCalendarUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    status: Literal["scheduled", "published", "cancelled"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    model_config = ConfigDict(populate_by_name=True)


class ArtistPasswordChange(BaseModel):
    current_password: str = Field(alias="currentPassword", min_length=1, max_length=200)
    new_password: str = Field(alias="newPassword", min_length=12, max_length=200)
    model_config = ConfigDict(populate_by_name=True)


class OAuthExchangeRequest(BaseModel):
    code: str = Field(min_length=1)
    client: Literal["fan"] = "fan"


class RedemptionRequest(BaseModel):
    code: str = Field(min_length=1)
    source: Literal["qr", "manual"]


class PointExchangeRequest(BaseModel):
    reward_id: str = Field(alias="rewardId", min_length=1)
    model_config = ConfigDict(populate_by_name=True)


class ProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)
    favorite_artist_ids: list[str] = Field(default_factory=list, alias="favoriteArtistIds")
    favorite_member_ids: list[str] = Field(default_factory=list, alias="favoriteMemberIds")
    profile_image_url: str | None = Field(
        default=None, alias="profileImageUrl", max_length=2_000_000
    )
    model_config = ConfigDict(populate_by_name=True)


class ProfileEquipmentUpdate(BaseModel):
    title_reward_id: RewardGrantId | None = Field(default=None, alias="titleRewardId")
    badge_reward_ids: list[RewardGrantId] = Field(
        default_factory=list,
        alias="badgeRewardIds",
        max_length=3,
    )
    frame_reward_id: RewardGrantId | None = Field(default=None, alias="frameRewardId")
    theme_reward_id: RewardGrantId | None = Field(default=None, alias="themeRewardId")
    public_profile_enabled: bool = Field(default=False, alias="publicProfileEnabled")
    model_config = ConfigDict(populate_by_name=True)


class CollectionVisibilityUpdate(BaseModel):
    public: bool


class TradeProposalCreate(BaseModel):
    recipient_user_id: str = Field(alias="recipientUserId", min_length=1)
    offered_user_card_ids: list[str] = Field(
        alias="offeredUserCardIds", min_length=1, max_length=20
    )
    requested_user_card_ids: list[str] = Field(
        default_factory=list, alias="requestedUserCardIds", max_length=20
    )
    model_config = ConfigDict(populate_by_name=True)


class SupportTicketCreate(BaseModel):
    category: Literal["general", "card", "trade", "order", "report"]
    subject: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=4000)


class SupportMessageCreate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)


class SupportTicketUpdate(BaseModel):
    status: Literal["open", "in_progress", "answered", "closed"] | None = None
    assigned_admin_id: str | None = Field(default=None, alias="assignedAdminId")
    model_config = ConfigDict(populate_by_name=True)


class SupportTicketActionRequest(BaseModel):
    action: Literal[
        "assign",
        "record_evidence",
        "hold_trade",
        "release_trade",
        "refund_order",
        "grant_points",
        "hide_collection",
        "restore_collection",
        "resolve",
    ]
    reference_id: str | None = Field(default=None, alias="referenceId", max_length=160)
    note: str | None = Field(default=None, max_length=2000)
    amount: int | None = None
    model_config = ConfigDict(populate_by_name=True)


class ReportCreate(BaseModel):
    target_type: Literal["user", "trade", "card", "event"] = Field(alias="targetType")
    target_id: str = Field(alias="targetId", min_length=1, max_length=160)
    reason: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=4000)


class ArtistProfileUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=40)
    email_enabled: bool | None = Field(default=None, alias="emailEnabled")
    model_config = ConfigDict(populate_by_name=True)


class NotificationPreferencesUpdate(BaseModel):
    email_enabled: bool = Field(alias="emailEnabled")
    model_config = ConfigDict(populate_by_name=True)


class ConsentRecordCreate(BaseModel):
    policy_key: Literal["terms", "privacy", "marketing"] = Field(alias="policyKey")
    policy_version: str = Field(alias="policyVersion", min_length=1, max_length=64)
    granted: bool
    source: Literal["signup", "settings", "onboarding"] = "settings"

    model_config = ConfigDict(populate_by_name=True)


class PushDeviceRegister(BaseModel):
    token: str = Field(min_length=1, max_length=4096)
    platform: Literal["web", "ios", "android"]
    device_name: str | None = Field(default=None, alias="deviceName", max_length=120)
    model_config = ConfigDict(populate_by_name=True)


class PushDeviceUnregister(BaseModel):
    token: str = Field(min_length=1, max_length=4096)


class ReadNotification(BaseModel):
    read: bool


class CodeBatchRequest(BaseModel):
    drop_id: str = Field(alias="dropId")
    card_id: str = Field(alias="cardId")
    quantity: int = Field(gt=0)
    max_uses_per_code: int = Field(alias="maxUsesPerCode", ge=1)
    expires_at: str = Field(alias="expiresAt")
    prefix: str = Field(
        min_length=1,
        max_length=30,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="QR/CSV code prefix; path separators and control characters are rejected",
    )
    model_config = ConfigDict(populate_by_name=True)


class CardPackCardInput(BaseModel):
    card_id: str = Field(alias="cardId", min_length=1)
    position: int = Field(default=0, ge=0)
    probability: float = Field(gt=0, le=100)
    enabled: bool = True
    model_config = ConfigDict(populate_by_name=True)


class CardPackCreate(BaseModel):
    artist_id: str = Field(alias="artistId", min_length=1)
    name: str = Field(min_length=1, max_length=200)
    season_name: str | None = Field(default=None, alias="seasonName", max_length=200)
    version: str = Field(default="v1.0", min_length=1, max_length=32)
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=2048)
    description: str | None = Field(default=None, max_length=1000)
    cards: list[CardPackCardInput] = Field(default_factory=list, max_length=200)
    model_config = ConfigDict(populate_by_name=True)


class ShopProductCreate(BaseModel):
    artist_id: str = Field(alias="artistId", min_length=1)
    product_type: Literal["card_pack", "point_item", "limited_item"] = Field(
        default="card_pack", alias="productType"
    )
    card_pack_id: str | None = Field(default=None, alias="cardPackId")
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    detail_content: list[dict] = Field(default_factory=list, alias="detailContent", max_length=20)
    fulfillment: dict = Field(default_factory=dict)
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=2048)
    price_points: int = Field(alias="pricePoints", gt=0)
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    inventory_limit: int | None = Field(default=None, alias="inventoryLimit", ge=0)
    per_user_limit: int | None = Field(default=None, alias="perUserLimit", ge=1)
    scheduled_publish_at: datetime | None = Field(default=None, alias="scheduledPublishAt")
    exposure_slot: str = Field(default="shop", alias="exposureSlot", min_length=1, max_length=40)
    fan_segment: dict = Field(default_factory=dict, alias="fanSegment")
    model_config = ConfigDict(populate_by_name=True)


class ShopProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    detail_content: list[dict] | None = Field(default=None, alias="detailContent", max_length=20)
    fulfillment: dict | None = None
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=2048)
    price_points: int | None = Field(default=None, alias="pricePoints", gt=0)
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    status: Literal["draft", "published", "archived"] | None = None
    inventory_limit: int | None = Field(default=None, alias="inventoryLimit", ge=0)
    per_user_limit: int | None = Field(default=None, alias="perUserLimit", ge=1)
    scheduled_publish_at: datetime | None = Field(default=None, alias="scheduledPublishAt")
    exposure_slot: str | None = Field(
        default=None, alias="exposureSlot", min_length=1, max_length=40
    )
    fan_segment: dict | None = Field(default=None, alias="fanSegment")
    model_config = ConfigDict(populate_by_name=True)


class ShopOrderCreate(BaseModel):
    product_id: str = Field(alias="productId", min_length=1)
    payment_method: Literal["points"] = Field(alias="paymentMethod")
    model_config = ConfigDict(populate_by_name=True)


class CardCombinationRecipeCreate(BaseModel):
    scope_type: Literal["card_pack"] = Field(alias="scopeType")
    scope_id: str = Field(alias="scopeId", min_length=1)
    input_quantity: int = Field(alias="inputQuantity", ge=2, le=100)
    output_rarity_pool: list[str] = Field(alias="outputRarityPool", min_length=1, max_length=8)
    probability_snapshot: dict[str, float] = Field(alias="probabilitySnapshot", min_length=1)
    model_config = ConfigDict(populate_by_name=True)


class CardCombinationRequest(BaseModel):
    recipe_id: str = Field(alias="recipeId", min_length=1)
    material_user_card_ids: list[str] = Field(
        alias="materialUserCardIds", min_length=1, max_length=100
    )
    model_config = ConfigDict(populate_by_name=True)


class DropCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)


class DropStatusUpdate(BaseModel):
    # 발행 요청은 /submit 전용 흐름으로만 전환한다. 일반 상태 변경 API에서
    # pending_review를 허용하면 초안 검증과 제출 감사 로그가 우회될 수 있다.
    status: Literal["draft", "scheduled", "live", "ended"]


class DropUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)


EventType = Literal["announcement", "comment", "card_drop", "card", "fan_mission", "external"]
EventWorkflowStatus = Literal[
    "draft",
    "pending_review",
    "changes_requested",
    "approved",
    "scheduled",
    "published",
    "ended",
]


class EventCreateRequest(BaseModel):
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    title: str = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=5000)
    notice_items: list[str] = Field(default_factory=list, alias="noticeItems", max_length=20)
    related_card_ids: list[str] = Field(default_factory=list, alias="relatedCardIds", max_length=12)
    hero_asset_id: str = Field(alias="heroAssetId", min_length=1)
    event_type: EventType = Field(default="announcement", alias="eventType")
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    venue: str | None = Field(default=None, max_length=200)
    participant_limit: int | None = Field(default=None, alias="participantLimit", ge=1)
    application_starts_at: datetime | None = Field(default=None, alias="applicationStartsAt")
    application_ends_at: datetime | None = Field(default=None, alias="applicationEndsAt")
    featured: bool = False
    priority: int = Field(default=0, ge=0, le=100)
    cta_label: str | None = Field(default=None, alias="ctaLabel", max_length=80)
    drop_id: str | None = Field(default=None, alias="dropId")
    card_id: str | None = Field(default=None, alias="cardId")
    achievement_id: str | None = Field(default=None, alias="achievementId")
    external_url: str | None = Field(default=None, alias="externalUrl", max_length=2048)
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_event_payload(self) -> "EventCreateRequest":
        _validate_event_fields(self)
        return self


class EventUpdateRequest(EventCreateRequest):
    """Updates intentionally use the same complete shape to avoid partial drift."""


class EventReviewRequest(BaseModel):
    decision: Literal["approve", "changes_requested"]
    note: str | None = Field(default=None, max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class EventDrawRequest(BaseModel):
    winner_count: int = Field(alias="winnerCount", ge=1, le=10_000)
    model_config = ConfigDict(populate_by_name=True)


class EventCheckInRequest(BaseModel):
    token: str = Field(min_length=1, max_length=4096)


class EventCommentCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class EventCommentReviewRequest(BaseModel):
    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)
    model_config = ConfigDict(populate_by_name=True)


def _validate_event_fields(payload: EventCreateRequest) -> None:
    payload.notice_items = [item.strip() for item in payload.notice_items if item.strip()]
    if any(len(item) > 500 for item in payload.notice_items):
        raise ValueError("noticeItems entries must be 500 characters or fewer")
    if len(set(payload.related_card_ids)) != len(payload.related_card_ids):
        raise ValueError("relatedCardIds must not contain duplicates")
    if payload.ends_at is not None and payload.ends_at <= payload.starts_at:
        raise ValueError("endsAt must be later than startsAt")
    if (
        payload.application_ends_at is not None
        and payload.application_starts_at is not None
        and payload.application_ends_at <= payload.application_starts_at
    ):
        raise ValueError("applicationEndsAt must be later than applicationStartsAt")
    links = {
        "card_drop": payload.drop_id,
        "card": payload.card_id,
        "fan_mission": payload.achievement_id,
        "external": payload.external_url,
    }
    selected = [
        value
        for value in (
            payload.drop_id,
            payload.card_id,
            payload.achievement_id,
            payload.external_url,
        )
        if value
    ]
    if payload.event_type in {"announcement", "comment"}:
        if selected:
            raise ValueError("announcement and comment events cannot have a connection")
    elif links.get(payload.event_type) is None:
        raise ValueError(f"{payload.event_type} events require exactly one connection")
    elif len(selected) != 1:
        raise ValueError("exactly one connection is allowed")
    if payload.external_url is not None and not payload.external_url.lower().startswith("https://"):
        raise ValueError("externalUrl must use HTTPS")


class AdminEventItem(BaseModel):
    id: str
    organization_id: str | None = Field(alias="organizationId")
    artist_id: str | None = Field(alias="artistId")
    title: str
    summary: str
    event_type: EventType = Field(alias="eventType")
    workflow_status: EventWorkflowStatus = Field(alias="workflowStatus")
    display_status: Literal["upcoming", "active", "ended"] | None = Field(
        default=None, alias="displayStatus"
    )
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    venue: str | None = None
    participant_limit: int | None = Field(default=None, alias="participantLimit")
    application_starts_at: datetime | None = Field(default=None, alias="applicationStartsAt")
    application_ends_at: datetime | None = Field(default=None, alias="applicationEndsAt")
    featured: bool
    priority: int
    hero_asset_id: str = Field(alias="heroAssetId")
    review_note: str | None = Field(default=None, alias="reviewNote")
    published_at: datetime | None = Field(default=None, alias="publishedAt")
    model_config = ConfigDict(populate_by_name=True)


class FanEventItem(BaseModel):
    id: str
    artist_id: str | None = Field(alias="artistId")
    artist_name: str | None = Field(default=None, alias="artistName")
    title: str
    summary: str
    description: str
    notice_items: list[str] = Field(default_factory=list, alias="noticeItems")
    related_cards: list[dict] = Field(default_factory=list, alias="relatedCards")
    event_type: EventType = Field(alias="eventType")
    status: Literal["upcoming", "active", "ended"]
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    hero_url: str | None = Field(default=None, alias="heroUrl")
    cta_label: str | None = Field(default=None, alias="ctaLabel")
    cta_target: str | None = Field(default=None, alias="ctaTarget")
    model_config = ConfigDict(populate_by_name=True)


class EventListResponse(BaseModel):
    items: list[FanEventItem]
    pagination: dict


class HomeResponse(BaseModel):
    featured_event: FanEventItem | None = Field(default=None, alias="featuredEvent")
    upcoming_events: list[FanEventItem] = Field(default_factory=list, alias="upcomingEvents")
    favorite_artists: list[dict] = Field(default_factory=list, alias="favoriteArtists")
    # Kept as a deprecated compatibility field for older clients.
    favorite_artist: dict | None = Field(default=None, alias="favoriteArtist")
    new_cards: list[dict] = Field(default_factory=list, alias="newCards")
    model_config = ConfigDict(populate_by_name=True)


class RedeemCodeStatusUpdate(BaseModel):
    status: Literal["active", "disabled", "expired"]


class AdminCardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    template_id: str | None = Field(default=None, alias="templateId")
    season_name: str | None = Field(default=None, alias="seasonName")
    rarity: str | None = None
    image_asset_id: str | None = Field(default=None, alias="imageAssetId")
    owner_artist_id: str | None = Field(default=None, alias="ownerArtistId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
    video_asset_id: str | None = Field(default=None, alias="videoAssetId")
    design_config: dict | None = Field(default=None, alias="designConfig")
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    has_voice: bool = Field(default=False, alias="hasVoice")
    issue_limit: int | None = Field(default=None, alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class AdminCardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    template_id: str | None = Field(default=None, alias="templateId")
    season_name: str | None = Field(default=None, alias="seasonName")
    rarity: str | None = None
    image_asset_id: str | None = Field(default=None, alias="imageAssetId")
    owner_artist_id: str | None = Field(default=None, alias="ownerArtistId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
    video_asset_id: str | None = Field(default=None, alias="videoAssetId")
    design_config: dict | None = Field(default=None, alias="designConfig")
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    has_voice: bool | None = Field(default=None, alias="hasVoice")
    issue_limit: int | None = Field(default=None, alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class AdminArtistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=2048)
    model_config = ConfigDict(populate_by_name=True)


class AssetTransformUpdate(BaseModel):
    transform: dict[str, float]


class AdminUserRoleUpdate(BaseModel):
    role: Literal["fan", "artist", "admin"]


class ArtistAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")
    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    model_config = ConfigDict(populate_by_name=True)


class AdminAccountCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    model_config = ConfigDict(populate_by_name=True)


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    contact_name: str | None = Field(default=None, alias="contactName", max_length=120)
    contact_email: EmailStr | None = Field(default=None, alias="contactEmail")
    contract_starts_at: datetime | None = Field(default=None, alias="contractStartsAt")
    contract_ends_at: datetime | None = Field(default=None, alias="contractEndsAt")
    logo_url: str | None = Field(default=None, alias="logoUrl", max_length=500)
    logo_asset_id: str | None = Field(default=None, alias="logoAssetId", max_length=80)
    model_config = ConfigDict(populate_by_name=True)


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(
        default=None,
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    status: Literal["active", "suspended"] | None = None
    contact_name: str | None = Field(default=None, alias="contactName", max_length=120)
    contact_email: EmailStr | None = Field(default=None, alias="contactEmail")
    contract_starts_at: datetime | None = Field(default=None, alias="contractStartsAt")
    contract_ends_at: datetime | None = Field(default=None, alias="contractEndsAt")
    logo_url: str | None = Field(default=None, alias="logoUrl", max_length=500)
    logo_asset_id: str | None = Field(default=None, alias="logoAssetId", max_length=80)
    model_config = ConfigDict(populate_by_name=True)


class OrganizationArtistsUpdate(BaseModel):
    artist_ids: list[str] = Field(alias="artistIds", max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class OrganizationMemberCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    access_level: Literal["company_admin", "manager", "editor", "viewer"] = Field(
        alias="accessLevel"
    )
    artist_ids: list[str] = Field(default_factory=list, alias="artistIds", max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class OrganizationMemberUpdate(BaseModel):
    display_name: str | None = Field(
        default=None, alias="displayName", min_length=1, max_length=120
    )
    access_level: Literal["company_admin", "manager", "editor", "viewer"] | None = Field(
        default=None, alias="accessLevel"
    )
    status: Literal["active", "suspended"] | None = None
    model_config = ConfigDict(populate_by_name=True)


class OrganizationMemberArtistsUpdate(BaseModel):
    artist_ids: list[str] = Field(alias="artistIds", max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class AdminArtistProfileUpdate(BaseModel):
    artist_id: str = Field(alias="artistId")
    verification_status: Literal["pending", "verified", "rejected"] = Field(
        alias="verificationStatus"
    )
    model_config = ConfigDict(populate_by_name=True)


class CollectionCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    artist_id: str | None = Field(default=None, alias="artistId")
    season_name: str | None = Field(default=None, alias="seasonName")
    required_card_ids: list[str] = Field(min_length=1, alias="requiredCardIds")
    benefit_title: str = Field(min_length=1, max_length=160, alias="benefitTitle")
    benefit_description: str = Field(min_length=1, max_length=500, alias="benefitDescription")
    benefit_asset_id: str | None = Field(default=None, alias="benefitAssetId")
    status: Literal["active", "disabled"] = "active"
    model_config = ConfigDict(populate_by_name=True)


class CollectionCampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    artist_id: str | None = Field(default=None, alias="artistId")
    season_name: str | None = Field(default=None, alias="seasonName")
    required_card_ids: list[str] | None = Field(default=None, min_length=1, alias="requiredCardIds")
    benefit_title: str | None = Field(
        default=None, min_length=1, max_length=160, alias="benefitTitle"
    )
    benefit_description: str | None = Field(
        default=None, min_length=1, max_length=500, alias="benefitDescription"
    )
    benefit_asset_id: str | None = Field(default=None, alias="benefitAssetId")
    status: Literal["active", "disabled"] | None = None
    model_config = ConfigDict(populate_by_name=True)


class AdminCardReviewRequest(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str | None = Field(default=None, max_length=500)


class AdminCardReleaseDecisionRequest(BaseModel):
    # The route fixes the stage; keeping it optional avoids a conflicting client input.
    stage: ReviewStage | None = None
    decision: ReviewDecision
    note: str | None = Field(default=None, max_length=500)


class DropCardLinkRequest(BaseModel):
    card_id: str = Field(alias="cardId", min_length=1)
    model_config = ConfigDict(populate_by_name=True)


class AdminNotificationReadRequest(BaseModel):
    read: bool


class AchievementDefinitionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    condition_type: Literal[
        "first_card",
        "card_count",
        "member_count",
        "specific_card",
        "set_complete",
        "drop_participation",
    ] = Field(alias="conditionType")
    target_value: int = Field(default=1, alias="targetValue", ge=1)
    condition_payload: dict = Field(default_factory=dict, alias="conditionPayload")
    reward_ids: list[str] = Field(default_factory=list, alias="rewardIds", max_length=20)
    xp_bonus: int = Field(default=0, alias="xpBonus", ge=0)
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def include_condition_metadata(self) -> "AchievementDefinitionCreate":
        if self.member_id is not None:
            self.condition_payload = {**self.condition_payload, "memberId": self.member_id}
        if self.reward_ids:
            self.condition_payload = {
                **self.condition_payload,
                "rewardIds": self.reward_ids,
                "rewardId": self.reward_ids[0],
            }
        if self.xp_bonus:
            self.condition_payload = {**self.condition_payload, "xpBonus": self.xp_bonus}
        if self.condition_type == "specific_card" and not self.condition_payload.get("cardId"):
            raise ValueError("specific_card 업적에는 conditionPayload.cardId가 필요합니다.")
        if self.condition_type == "drop_participation" and not self.condition_payload.get("dropId"):
            raise ValueError("drop_participation 업적에는 conditionPayload.dropId가 필요합니다.")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("업적 종료 시각은 시작 시각 이후로 선택해 주세요.")
        return self


class MissionDefinitionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    event_kind: str = Field(alias="eventKind", min_length=1, max_length=80)
    target_value: int = Field(default=1, alias="targetValue", ge=1)
    recurrence: Literal["once", "daily", "weekly", "season"] = "once"
    condition_payload: dict = Field(default_factory=dict, alias="conditionPayload")
    reward_payload: dict = Field(default_factory=dict, alias="rewardPayload")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_period(self) -> "MissionDefinitionCreate":
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("미션 종료 시각은 시작 시각 이후로 선택해 주세요.")
        return self


class MissionDefinitionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    event_kind: str | None = Field(default=None, alias="eventKind", min_length=1, max_length=80)
    target_value: int | None = Field(default=None, alias="targetValue", ge=1)
    recurrence: Literal["once", "daily", "weekly", "season"] | None = None
    condition_payload: dict | None = Field(default=None, alias="conditionPayload")
    reward_payload: dict | None = Field(default=None, alias="rewardPayload")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_period(self) -> "MissionDefinitionUpdate":
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("미션 종료 시각은 시작 시각 이후로 선택해 주세요.")
        return self


class LevelThresholdInput(BaseModel):
    level: int = Field(ge=1)
    required_xp: int = Field(alias="requiredXp", ge=0)
    label: str | None = Field(default=None, max_length=100)
    model_config = ConfigDict(populate_by_name=True)


class LevelPolicyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    thresholds: list[LevelThresholdInput] = Field(min_length=1, max_length=100)
    effective_at: datetime | None = Field(default=None, alias="effectiveAt")
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_thresholds(self) -> "LevelPolicyCreate":
        levels = [item.level for item in self.thresholds]
        if len(levels) != len(set(levels)):
            raise ValueError("레벨 번호는 중복될 수 없습니다.")
        if levels != sorted(levels):
            raise ValueError("레벨 번호는 오름차순이어야 합니다.")
        return self


class PointAdjustmentRequest(BaseModel):
    user_id: str = Field(alias="userId", min_length=1)
    amount: int
    reason: str = Field(min_length=1, max_length=500)
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey", max_length=160)
    model_config = ConfigDict(populate_by_name=True)


class PointChargeRequest(BaseModel):
    package_id: str = Field(alias="packageId", min_length=1, max_length=80)
    payment_method: Literal["sandbox_card", "sandbox_kakao", "sandbox_naver"] = Field(
        alias="paymentMethod"
    )
    model_config = ConfigDict(populate_by_name=True)


class AdminPointChargePackageCreate(BaseModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_]+$")
    points: int = Field(gt=0)
    price_won: int = Field(alias="priceWon", gt=0)
    label: str = Field(min_length=1, max_length=80)
    sort_order: int = Field(default=0, alias="sortOrder", ge=0)
    scheduled_publish_at: datetime | None = Field(default=None, alias="scheduledPublishAt")
    model_config = ConfigDict(populate_by_name=True)


class AdminPointChargePackageUpdate(BaseModel):
    points: int | None = Field(default=None, gt=0)
    price_won: int | None = Field(default=None, alias="priceWon", gt=0)
    label: str | None = Field(default=None, min_length=1, max_length=80)
    status: Literal["active", "inactive"] | None = None
    sort_order: int | None = Field(default=None, alias="sortOrder", ge=0)
    scheduled_publish_at: datetime | None = Field(default=None, alias="scheduledPublishAt")
    model_config = ConfigDict(populate_by_name=True)


class ApprovalCreateRequest(BaseModel):
    kind: Literal["points_adjustment", "shop_refund", "product_publish", "odds_change"]
    entity_type: str = Field(alias="entityType", min_length=1, max_length=60)
    entity_id: str = Field(alias="entityId", min_length=1, max_length=160)
    payload: dict = Field(default_factory=dict)
    reason: str | None = Field(default=None, max_length=1000)
    model_config = ConfigDict(populate_by_name=True)


class ApprovalDecisionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class RewardCatalogCreate(BaseModel):
    """A fan-facing reward that can be attached to an achievement or pass tier."""

    name: str = Field(min_length=1, max_length=160)
    reward_type: Literal["title", "badge", "profile_frame", "digital_bonus", "card_pack"] = Field(
        alias="rewardType"
    )
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    metadata: dict = Field(default_factory=dict)
    model_config = ConfigDict(populate_by_name=True)


class PassTierCreate(BaseModel):
    tier: int = Field(ge=1)
    required_xp: int = Field(alias="requiredXp", ge=0)
    reward_id: str | None = Field(default=None, alias="rewardId")
    premium_reward_id: str | None = Field(default=None, alias="premiumRewardId")
    model_config = ConfigDict(populate_by_name=True)


class PassSeasonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str | None = Field(default=None, alias="artistId")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    premium_enabled: bool = Field(default=False, alias="premiumEnabled")
    premium_price_points: int | None = Field(default=None, alias="premiumPricePoints", ge=1)
    tiers: list[PassTierCreate] = Field(min_length=1, max_length=50)
    model_config = ConfigDict(populate_by_name=True)


class CardReleaseState(BaseModel):
    release_policy: ReleasePolicy = Field(alias="releasePolicy")
    release_status: ReleaseStatus = Field(alias="releaseStatus")
    review_version: int = Field(alias="reviewVersion", ge=0)
    model_config = ConfigDict(populate_by_name=True)


class CardReviewRequestItem(BaseModel):
    id: str
    card_id: str = Field(alias="cardId")
    version: int
    stage: ReviewStage
    status: Literal["pending", "approved", "changes_requested"]
    snapshot: dict
    model_config = ConfigDict(populate_by_name=True)


class CardReviewDecisionItem(BaseModel):
    id: str
    request_id: str = Field(alias="requestId")
    reviewer_user_id: str = Field(alias="reviewerUserId")
    decision: ReviewDecision
    note: str | None = Field(default=None, max_length=500)
    decided_at: datetime = Field(alias="decidedAt")
    model_config = ConfigDict(populate_by_name=True)


class NotificationItem(BaseModel):
    id: str
    kind: str
    title: str
    body: str | None = None
    is_read: bool = Field(alias="isRead")
    created_at: datetime = Field(alias="createdAt")
    entity_type: str | None = Field(default=None, alias="entityType")
    entity_id: str | None = Field(default=None, alias="entityId")
    event_key: str | None = Field(default=None, alias="eventKey")
    artist_id: str | None = Field(default=None, alias="artistId")
    artist_name: str | None = Field(default=None, alias="artistName")
    model_config = ConfigDict(populate_by_name=True)


class CollectionGoalCreate(BaseModel):
    pack_id: str = Field(alias="packId", min_length=1)
    target_count: int | None = Field(default=None, alias="targetCount", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class ArtistReviewSubmitRequest(BaseModel):
    review_note: str | None = Field(default=None, alias="reviewNote", max_length=500)
    model_config = ConfigDict(populate_by_name=True)


class CardCollaborationCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    mention_user_id: str | None = Field(default=None, alias="mentionUserId")
    review_version: int | None = Field(default=None, alias="reviewVersion", ge=1)
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def normalize_body(self):
        self.body = self.body.strip()
        if not self.body:
            raise ValueError("INVALID_COMMENT")
        return self


class CardCollaborationCommentUpdate(BaseModel):
    status: Literal["open", "resolved"]
    model_config = ConfigDict(populate_by_name=True)


class ArtistCardRequest(BaseModel):
    template_id: str = Field(alias="templateId")
    name: str
    season_name: str = Field(alias="seasonName")
    rarity: str
    image_asset_id: str = Field(alias="imageAssetId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
    video_asset_id: str | None = Field(default=None, alias="videoAssetId")
    design_config: dict | None = Field(default=None, alias="designConfig")
    has_voice: bool = Field(default=False, alias="hasVoice")
    issue_limit: int = Field(alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class ArtistCardUpdate(BaseModel):
    template_id: str | None = Field(default=None, alias="templateId")
    name: str | None = None
    season_name: str | None = Field(default=None, alias="seasonName")
    rarity: str | None = None
    image_asset_id: str | None = Field(default=None, alias="imageAssetId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
    video_asset_id: str | None = Field(default=None, alias="videoAssetId")
    design_config: dict | None = Field(default=None, alias="designConfig")
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    has_voice: bool | None = Field(default=None, alias="hasVoice")
    issue_limit: int | None = Field(default=None, alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class CardEffectVersionCreate(BaseModel):
    design_config: dict = Field(alias="designConfig")
    model_config = ConfigDict(populate_by_name=True)


class CardEffectVersionUpdate(BaseModel):
    design_config: dict | None = Field(default=None, alias="designConfig")
    model_config = ConfigDict(populate_by_name=True)


class CardEffectReviewDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=500)


class UploadPresignRequest(BaseModel):
    file_name: str = Field(alias="fileName", min_length=1, max_length=255)
    content_type: Literal[
        "image/png",
        "image/jpeg",
        "image/webp",
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/webm",
        "video/mp4",
        "video/webm",
        "application/pdf",
    ] = Field(alias="contentType")
    purpose: Literal[
        "card",
        "handwriting",
        "voice",
        "video",
        "collection_benefit",
        "organization_logo",
        "event_banner",
        "reward_image",
    ]
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def image_purpose_must_be_an_image(self) -> "UploadPresignRequest":
        if self.purpose in {
            "event_banner",
            "organization_logo",
            "reward_image",
        } and self.content_type not in {
            "image/png",
            "image/jpeg",
            "image/webp",
        }:
            raise ValueError("image uploads must be PNG, JPEG, or WebP")
        return self
