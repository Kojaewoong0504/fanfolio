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


class ReadNotification(BaseModel):
    read: bool


class CodeBatchRequest(BaseModel):
    drop_id: str = Field(alias="dropId")
    card_id: str = Field(alias="cardId")
    quantity: int = Field(gt=0)
    max_uses_per_code: int = Field(alias="maxUsesPerCode", ge=1)
    expires_at: str = Field(alias="expiresAt")
    prefix: str
    model_config = ConfigDict(populate_by_name=True)


class ArtistCardRequest(BaseModel):
    template_id: str = Field(alias="templateId")
    name: str
    season_name: str = Field(alias="seasonName")
    rarity: str
    image_asset_id: str = Field(alias="imageAssetId")
    issue_limit: int = Field(alias="issueLimit", gt=0)
    model_config = ConfigDict(populate_by_name=True)


class UploadPresignRequest(BaseModel):
    file_name: str = Field(alias="fileName", min_length=1, max_length=255)
    content_type: Literal["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4"] = (
        Field(alias="contentType")
    )
    purpose: Literal["card", "handwriting", "voice"]
    model_config = ConfigDict(populate_by_name=True)
