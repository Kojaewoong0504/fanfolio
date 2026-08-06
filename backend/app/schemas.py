from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


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


class RedemptionRequest(BaseModel):
    code: str = Field(min_length=1)
    source: Literal["qr", "manual"]


class ProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)
    favorite_artist_ids: list[str] = Field(default_factory=list, alias="favoriteArtistIds")
    favorite_member_ids: list[str] = Field(default_factory=list, alias="favoriteMemberIds")
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
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)


class DropStatusUpdate(BaseModel):
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
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
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
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    handwriting_asset_id: str | None = Field(default=None, alias="handwritingAssetId")
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    has_voice: bool | None = Field(default=None, alias="hasVoice")
    issue_limit: int | None = Field(default=None, alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class AssetTransformUpdate(BaseModel):
    transform: dict[str, float]


class AdminUserRoleUpdate(BaseModel):
    role: Literal["fan", "artist", "admin"]


class AdminCardReviewRequest(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str | None = Field(default=None, max_length=500)


class ArtistCardRequest(BaseModel):
    template_id: str = Field(alias="templateId")
    name: str
    season_name: str = Field(alias="seasonName")
    rarity: str
    image_asset_id: str = Field(alias="imageAssetId")
    artist_id: str | None = Field(default=None, alias="artistId")
    member_id: str | None = Field(default=None, alias="memberId")
    signature_text: str | None = Field(default=None, alias="signatureText", max_length=200)
    voice_asset_id: str | None = Field(default=None, alias="voiceAssetId")
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
    handwriting_transform: dict[str, float] | None = Field(
        default=None, alias="handwritingTransform"
    )
    has_voice: bool | None = Field(default=None, alias="hasVoice")
    issue_limit: int | None = Field(default=None, alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class UploadPresignRequest(BaseModel):
    file_name: str = Field(alias="fileName", min_length=1, max_length=255)
    content_type: Literal["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4"] = (
        Field(alias="contentType")
    )
    purpose: Literal["card", "handwriting", "voice"]
    model_config = ConfigDict(populate_by_name=True)
