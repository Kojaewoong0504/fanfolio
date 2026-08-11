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


class ProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)
    favorite_artist_ids: list[str] = Field(default_factory=list, alias="favoriteArtistIds")
    favorite_member_ids: list[str] = Field(default_factory=list, alias="favoriteMemberIds")
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


class ArtistProfileUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=40)
    email_enabled: bool | None = Field(default=None, alias="emailEnabled")
    model_config = ConfigDict(populate_by_name=True)


class NotificationPreferencesUpdate(BaseModel):
    email_enabled: bool = Field(alias="emailEnabled")
    model_config = ConfigDict(populate_by_name=True)


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
    model_config = ConfigDict(populate_by_name=True)


class ArtistReviewSubmitRequest(BaseModel):
    review_note: str | None = Field(default=None, alias="reviewNote", max_length=500)
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
    ]
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def organization_logo_must_be_an_image(self) -> "UploadPresignRequest":
        if self.purpose == "organization_logo" and self.content_type not in {
            "image/png",
            "image/jpeg",
            "image/webp",
        }:
            raise ValueError("organization_logo uploads must be PNG, JPEG, or WebP")
        return self
