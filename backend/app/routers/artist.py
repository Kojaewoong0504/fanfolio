from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Header, Request, Response, status
from sqlalchemy import func, select
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.dependencies import ArtistUser, DbSession
from app.effects import validate_effect_config
from app.errors import AppError
from app.image_processing import compose_card_preview, compose_card_preview_bytes
from app.models import (
    Artist,
    ArtistProfile,
    Asset,
    BackgroundRemovalJob,
    Card,
    CardCollaborationComment,
    CardEffectVersion,
    Member,
    SpatialSceneJob,
    User,
    UserCard,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import (
    ArtistCardRequest,
    ArtistCardUpdate,
    ArtistProfileUpdate,
    ArtistReviewSubmitRequest,
    CardCollaborationCommentCreate,
    CardCollaborationCommentUpdate,
    CardEffectVersionCreate,
    CardEffectVersionUpdate,
)
from app.services import release_card_data, submit_card_for_release_review
from app.spatial_scene import (
    PhotoAnalysisBundle,
    SpatialSceneProviderError,
    configured_photo_analysis_provider,
    configured_spatial_scene_provider,
    generation_key,
    photo_analysis_metadata,
    public_photo_analysis_metadata,
    public_spatial_scene_metadata,
    source_revision,
    spatial_scene_metadata,
    validate_photo_analysis_bundle,
)
from app.storage import configured_asset_storage, storage_response
from app.tasks import enqueue_background_removal, enqueue_spatial_scene

router = APIRouter(prefix="/api", tags=["artist"])
LENTICULAR_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def profile_data(user, profile: ArtistProfile | None = None) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "nickname": user.nickname,
        "role": user.role.value,
        "emailEnabled": user.notification_email_enabled,
        "artistId": profile.artist_id if profile else None,
        "verificationStatus": profile.verification_status if profile else "pending",
    }


@router.get("/artist/profile")
async def get_profile(user: ArtistUser, session: DbSession) -> dict:
    profile = await session.get(ArtistProfile, user.id)
    return {"ok": True, "data": profile_data(user, profile)}


@router.patch("/artist/profile")
async def update_profile(
    payload: ArtistProfileUpdate, user: ArtistUser, session: DbSession
) -> dict:
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    if "nickname" in values:
        user.nickname = values["nickname"]
    if "email_enabled" in values:
        user.notification_email_enabled = values["email_enabled"]
    await session.commit()
    profile = await session.get(ArtistProfile, user.id)
    return {"ok": True, "data": profile_data(user, profile)}


@router.get("/artist/templates")
async def list_templates(user: ArtistUser, session: DbSession) -> dict:
    """Return the studio's selectable templates and the artist catalog.

    Templates are configuration in the MVP, so they are intentionally kept
    outside the card table. Artists still receive the group/member catalog
    from the database instead of relying on values baked into the UI.
    """
    profile = await session.get(ArtistProfile, user.id)
    artist_query = select(Artist).order_by(Artist.name)
    member_query = select(Member).order_by(Member.name)
    if profile and profile.verification_status == "verified":
        artist_query = artist_query.where(Artist.id == profile.artist_id)
        member_query = member_query.where(Member.artist_id == profile.artist_id)
    else:
        artist_query = artist_query.where(False)
        member_query = member_query.where(False)
    artists = (await session.scalars(artist_query)).all()
    members = (await session.scalars(member_query)).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": "template_signature_v1",
                    "name": "스페셜",
                    "layoutVersion": "signature-v1",
                    "status": "active",
                },
                {
                    "id": "template_basic_v1",
                    "name": "일반",
                    "layoutVersion": "basic-v1",
                    "status": "active",
                },
            ],
            "artists": [
                {"id": artist.id, "name": artist.name, "imageUrl": artist.image_url}
                for artist in artists
            ],
            "members": [
                {"id": member.id, "artistId": member.artist_id, "name": member.name}
                for member in members
            ],
        },
    }


@router.post("/artist/cards", status_code=status.HTTP_201_CREATED)
async def create_card(payload: ArtistCardRequest, user: ArtistUser, session: DbSession) -> dict:
    image_asset = await session.get(Asset, payload.image_asset_id)
    if not image_asset or image_asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "카드 이미지를 찾을 수 없습니다.")
    if payload.voice_asset_id:
        await owned_asset(payload.voice_asset_id, user, session)
    if payload.video_asset_id:
        await owned_asset(payload.video_asset_id, user, session)
    if payload.handwriting_asset_id:
        await owned_asset(payload.handwriting_asset_id, user, session)
    await validate_design_assets(payload.design_config, user, session)
    artist_id = await resolve_catalog_ids(
        artist_id=payload.artist_id, member_id=payload.member_id, session=session
    )
    await ensure_artist_catalog_access(artist_id=artist_id, user=user, session=session)
    card = Card(
        id=f"card_{uuid4().hex[:10]}",
        name=payload.name,
        owner_artist_id=user.id,
        status="draft",
        artist_id=artist_id,
        member_id=payload.member_id,
        template_id=payload.template_id,
        season_name=payload.season_name,
        rarity=payload.rarity,
        image_asset_id=payload.image_asset_id,
        signature_text=payload.signature_text,
        handwriting_asset_id=payload.handwriting_asset_id,
        handwriting_transform=payload.handwriting_transform,
        voice_asset_id=payload.voice_asset_id,
        video_asset_id=payload.video_asset_id,
        design_config=payload.design_config,
        has_voice=payload.has_voice,
        issue_limit=payload.issue_limit,
    )
    session.add(card)
    await session.commit()
    return {"ok": True, "data": card_data(card)}


@router.get("/artist/cards")
async def list_cards(user: ArtistUser, session: DbSession) -> dict:
    cards = await session.scalars(
        select(Card).where(Card.owner_artist_id == user.id).order_by(Card.id.desc())
    )
    return {"ok": True, "data": {"items": [card_data(card) for card in cards]}}


@router.get("/artist/insights")
async def insights(user: ArtistUser, session: DbSession) -> dict:
    """Return ownership-scoped card and collection metrics for the studio."""
    cards = (
        await session.scalars(
            select(Card).where(Card.owner_artist_id == user.id).order_by(Card.id.desc())
        )
    ).all()
    card_ids = [card.id for card in cards]
    redemption_counts: dict[str, int] = {}
    if card_ids:
        rows = (
            await session.execute(
                select(UserCard.card_id, func.count())
                .where(UserCard.card_id.in_(card_ids))
                .group_by(UserCard.card_id)
            )
        ).all()
        redemption_counts = {card_id: count for card_id, count in rows}

    items = [
        {
            "cardId": card.id,
            "name": card.name,
            "status": card.status,
            "issueLimit": card.issue_limit,
            "redeemedCount": redemption_counts.get(card.id, 0),
        }
        for card in cards
    ]
    return {
        "ok": True,
        "data": {
            "summary": {
                "totalCards": len(cards),
                "draftCards": sum(card.status == "draft" for card in cards),
                "pendingReviewCards": sum(card.status == "pending_review" for card in cards),
                "publishedCards": sum(card.status == "published" for card in cards),
                "redeemedCount": sum(redemption_counts.values()),
            },
            "items": items,
        },
    }


def card_data(card: Card) -> dict:
    return {
        "id": card.id,
        "name": card.name,
        "status": card.status,
        "templateId": card.template_id,
        "seasonName": card.season_name,
        "rarity": card.rarity,
        "artistId": card.artist_id,
        "imageAssetId": card.image_asset_id,
        "imageUrl": (
            f"/api/artist/cards/{card.id}/image?client=artist" if card.image_asset_id else None
        ),
        "memberId": card.member_id,
        "signatureText": card.signature_text,
        "handwritingAssetId": card.handwriting_asset_id,
        "handwritingUrl": (
            f"/api/artist/cards/{card.id}/handwriting?client=artist"
            if card.handwriting_asset_id
            else None
        ),
        "voiceAssetId": card.voice_asset_id,
        "voiceUrl": (
            f"/api/artist/cards/{card.id}/voice?client=artist" if card.voice_asset_id else None
        ),
        "videoAssetId": card.video_asset_id,
        "videoUrl": (
            f"/api/artist/cards/{card.id}/video?client=artist" if card.video_asset_id else None
        ),
        "designConfig": card.design_config,
        "reviewNote": card.review_note,
        "handwritingTransform": card.handwriting_transform,
        "hasVoice": card.has_voice,
        "issueLimit": card.issue_limit,
        **release_card_data(card),
    }


async def owned_card(card_id: str, user: ArtistUser, session: DbSession) -> Card:
    card = await session.get(Card, card_id)
    if not card or card.owner_artist_id != user.id:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    return card


async def owned_asset(asset_id: str, user: ArtistUser, session: DbSession) -> Asset:
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    return asset


def current_source_revision(asset: Asset) -> str | None:
    if not asset.upload_completed_at:
        return None
    return source_revision(asset.id, asset.upload_completed_at)


async def valid_photo_analysis_metadata(asset: Asset) -> dict[str, object] | None:
    revision = current_source_revision(asset)
    if not revision:
        return None
    metadata = (asset.transform or {}).get("photoAnalysis")
    if not isinstance(metadata, dict) or metadata.get("status") != "completed":
        return None
    if metadata.get("sourceAssetId") != asset.id or metadata.get("sourceRevision") != revision:
        return None
    if not metadata.get("capabilities", {}).get("subjectMask"):
        return None
    path = metadata.get("maskStoragePath")
    if not isinstance(path, str) or not path:
        return None
    storage = configured_asset_storage()
    if not await run_in_threadpool(storage.exists, path):
        return None
    try:
        mask = await run_in_threadpool(storage.read_bytes, path)
        validate_photo_analysis_bundle(
            PhotoAnalysisBundle(
                mask=mask,
                provider=str(metadata.get("provider", "")),
                model_version=str(metadata.get("modelVersion", "")),
                confidence=float(metadata.get("confidence", -1)),
            ),
            expected_size=await run_in_threadpool(storage_image_size, asset),
        )
    except (SpatialSceneProviderError, TypeError, ValueError):
        return None
    return metadata


def storage_image_size(asset: Asset) -> tuple[int, int]:
    storage = configured_asset_storage()
    path = asset.storage_path
    if not path:
        raise SpatialSceneProviderError("source asset is not ready")
    from app.spatial_scene import image_size

    return image_size(storage.read_bytes(path))


async def reusable_spatial_mask_metadata(asset: Asset) -> dict[str, object] | None:
    revision = current_source_revision(asset)
    if not revision:
        return None
    metadata = (asset.transform or {}).get("spatialScene")
    if not isinstance(metadata, dict) or metadata.get("status") != "completed":
        return None
    if metadata.get("sourceAssetId") != asset.id or metadata.get("sourceRevision") != revision:
        return None
    if metadata.get("provider") == "local_fallback":
        return None
    path = metadata.get("maskStoragePath")
    if not isinstance(path, str) or not path:
        return None
    storage = configured_asset_storage()
    if not await run_in_threadpool(storage.exists, path):
        return None
    try:
        mask = await run_in_threadpool(storage.read_bytes, path)
        validate_photo_analysis_bundle(
            PhotoAnalysisBundle(
                mask=mask,
                provider=str(metadata.get("provider", "")),
                model_version=str(metadata.get("modelVersion", "")),
                confidence=float(metadata.get("confidence", -1)),
            ),
            expected_size=await run_in_threadpool(storage_image_size, asset),
        )
    except (SpatialSceneProviderError, TypeError, ValueError):
        return None
    return metadata


def ensure_lenticular_image_asset(asset: Asset) -> None:
    if asset.purpose != "card" or asset.content_type not in LENTICULAR_IMAGE_CONTENT_TYPES:
        raise AppError(
            422,
            "INVALID_LENTICULAR_ASSET",
            "렌티큘러 이미지 자산 정보를 확인해 주세요.",
        )


def media_incomplete(message: str) -> AppError:
    return AppError(409, "CARD_MEDIA_INCOMPLETE", message)


async def ensure_ready_lenticular_asset(card: Card, user: ArtistUser, session: DbSession) -> None:
    front = (card.design_config or {}).get("front")
    if not isinstance(front, dict) or front.get("interaction") != "lenticular":
        return
    lenticular_asset_id = front.get("lenticularAssetId")
    if not isinstance(lenticular_asset_id, str) or not lenticular_asset_id:
        raise media_incomplete("렌티큘러 이미지를 추가해 주세요.")

    asset = await session.get(Asset, lenticular_asset_id)
    if (
        not asset
        or asset.owner_id != user.id
        or asset.purpose != "card"
        or asset.content_type not in LENTICULAR_IMAGE_CONTENT_TYPES
    ):
        raise media_incomplete("렌티큘러 이미지 자산 정보를 확인해 주세요.")

    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise media_incomplete("렌티큘러 이미지 업로드를 완료해 주세요.")
    if not configured_asset_storage().exists(path):
        raise media_incomplete("렌티큘러 이미지 업로드를 완료해 주세요.")


async def validate_design_assets(
    design_config: dict | None, user: ArtistUser, session: DbSession
) -> None:
    """Reject malformed or cross-account artwork references before card save."""
    if not design_config:
        return
    if "creativeLayers" in design_config:
        layers = design_config["creativeLayers"]
        if not isinstance(layers, list) or len(layers) > 50:
            raise AppError(422, "INVALID_CREATIVE_LAYERS", "카드 레이어 구성을 확인해 주세요.")
        for layer in layers:
            if not isinstance(layer, dict):
                raise AppError(422, "INVALID_CREATIVE_LAYERS", "카드 레이어 구성을 확인해 주세요.")
            asset_id = layer.get("assetId")
            if asset_id is not None:
                if not isinstance(asset_id, str) or not asset_id:
                    raise AppError(
                        422,
                        "INVALID_CREATIVE_LAYERS",
                        "카드 레이어 자산 정보를 확인해 주세요.",
                    )
                await owned_asset(asset_id, user, session)

    front = design_config.get("front")
    if not isinstance(front, dict) or "lenticularAssetId" not in front:
        return
    lenticular_asset_id = front["lenticularAssetId"]
    if lenticular_asset_id is None:
        return
    if not isinstance(lenticular_asset_id, str) or not lenticular_asset_id:
        raise AppError(
            422,
            "INVALID_LENTICULAR_ASSET",
            "렌티큘러 이미지 자산 정보를 확인해 주세요.",
        )
    asset = await owned_asset(lenticular_asset_id, user, session)
    ensure_lenticular_image_asset(asset)


@router.get("/artist/cards/{card_id}")
async def get_card(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": card_data(card)}


def collaboration_comment_data(comment: CardCollaborationComment) -> dict:
    return {
        "id": comment.id,
        "cardId": comment.card_id,
        "authorUserId": comment.author_user_id,
        "body": comment.body,
        "mentionUserId": comment.mention_user_id,
        "status": comment.status,
        "reviewVersion": comment.review_version,
        "createdAt": comment.created_at.isoformat() if comment.created_at else None,
        "updatedAt": comment.updated_at.isoformat() if comment.updated_at else None,
    }


@router.get("/artist/cards/{card_id}/comments")
async def list_card_comments(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    await owned_card(card_id, user, session)
    comments = await session.scalars(
        select(CardCollaborationComment)
        .where(CardCollaborationComment.card_id == card_id)
        .order_by(CardCollaborationComment.created_at.desc())
    )
    return {"ok": True, "data": {"items": [collaboration_comment_data(item) for item in comments]}}


@router.post("/artist/cards/{card_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_card_comment(
    card_id: str,
    payload: CardCollaborationCommentCreate,
    user: ArtistUser,
    session: DbSession,
) -> dict:
    card = await owned_card(card_id, user, session)
    if payload.mention_user_id:
        mentioned = await session.get(User, payload.mention_user_id)
        if mentioned is None or mentioned.role.value not in {"artist", "admin"}:
            raise AppError(404, "MENTION_USER_NOT_FOUND", "멘션할 운영 사용자를 찾을 수 없습니다.")
    comment = CardCollaborationComment(
        id=f"comment_{uuid4().hex[:12]}",
        card_id=card.id,
        author_user_id=user.id,
        body=payload.body,
        mention_user_id=payload.mention_user_id,
        review_version=payload.review_version or card.review_version or None,
        status="open",
    )
    session.add(comment)
    await session.commit()
    return {"ok": True, "data": collaboration_comment_data(comment)}


@router.patch("/artist/cards/{card_id}/comments/{comment_id}")
async def update_card_comment(
    card_id: str,
    comment_id: str,
    payload: CardCollaborationCommentUpdate,
    user: ArtistUser,
    session: DbSession,
) -> dict:
    await owned_card(card_id, user, session)
    comment = await session.get(CardCollaborationComment, comment_id)
    if comment is None or comment.card_id != card_id:
        raise AppError(404, "COMMENT_NOT_FOUND", "협업 코멘트를 찾을 수 없습니다.")
    comment.status = payload.status
    await session.commit()
    return {"ok": True, "data": collaboration_comment_data(comment)}


async def effect_version_or_404(
    card_id: str, version_id: str, user: ArtistUser, session: DbSession
) -> CardEffectVersion:
    await owned_card(card_id, user, session)
    version = await session.get(CardEffectVersion, version_id)
    if not version or version.card_id != card_id:
        raise AppError(404, "EFFECT_VERSION_NOT_FOUND", "효과 버전을 찾을 수 없습니다.")
    return version


def ensure_card_editable(card: Card) -> None:
    if card.status not in {"draft", "changes_requested"} or card.release_status not in {
        "draft",
        "changes_requested",
    }:
        raise AppError(409, "INVALID_CARD_STATUS", "현재 상태에서는 카드를 수정할 수 없습니다.")


def effect_version_data(version: CardEffectVersion) -> dict:
    return {
        "id": version.id,
        "cardId": version.card_id,
        "version": version.version,
        "designConfig": version.design_config,
        "status": version.status,
        "reviewNote": version.review_note,
        "submittedAt": version.submitted_at.isoformat() if version.submitted_at else None,
        "approvedAt": version.approved_at.isoformat() if version.approved_at else None,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


@router.get("/artist/cards/{card_id}/effect-versions")
async def list_effect_versions(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    await owned_card(card_id, user, session)
    versions = (
        await session.scalars(
            select(CardEffectVersion)
            .where(CardEffectVersion.card_id == card_id)
            .order_by(CardEffectVersion.version.desc())
        )
    ).all()
    return {"ok": True, "data": {"items": [effect_version_data(item) for item in versions]}}


@router.post("/artist/cards/{card_id}/effect-versions", status_code=status.HTTP_201_CREATED)
async def create_effect_version(
    card_id: str,
    payload: CardEffectVersionCreate,
    user: ArtistUser,
    session: DbSession,
) -> dict:
    card = await owned_card(card_id, user, session)
    ensure_card_editable(card)
    config = validate_effect_config(payload.design_config)
    await validate_design_assets(config, user, session)
    latest = await session.scalar(
        select(func.max(CardEffectVersion.version)).where(CardEffectVersion.card_id == card_id)
    )
    version = CardEffectVersion(
        id=f"effect_{uuid4().hex[:12]}",
        card_id=card.id,
        version=(latest or 0) + 1,
        design_config=config,
        author_user_id=user.id,
        status="draft",
    )
    session.add(version)
    await session.commit()
    return {"ok": True, "data": effect_version_data(version)}


@router.patch("/artist/cards/{card_id}/effect-versions/{version_id}")
async def update_effect_version(
    card_id: str,
    version_id: str,
    payload: CardEffectVersionUpdate,
    user: ArtistUser,
    session: DbSession,
) -> dict:
    card = await owned_card(card_id, user, session)
    ensure_card_editable(card)
    version = await effect_version_or_404(card_id, version_id, user, session)
    if version.status not in {"draft", "rejected"}:
        raise AppError(
            409, "EFFECT_VERSION_LOCKED", "검수 중이거나 승인된 효과는 수정할 수 없습니다."
        )
    if payload.design_config is not None:
        config = validate_effect_config(payload.design_config)
        await validate_design_assets(config, user, session)
        version.design_config = config
    version.status = "draft"
    version.review_note = None
    await session.commit()
    return {"ok": True, "data": effect_version_data(version)}


@router.post("/artist/cards/{card_id}/effect-versions/{version_id}/submit-review")
async def submit_effect_version_review(
    card_id: str, version_id: str, user: ArtistUser, session: DbSession
) -> dict:
    card = await owned_card(card_id, user, session)
    ensure_card_editable(card)
    version = await effect_version_or_404(card_id, version_id, user, session)
    if version.status not in {"draft", "rejected"}:
        raise AppError(
            409, "EFFECT_VERSION_INVALID_STATUS", "현재 효과 버전은 검수를 요청할 수 없습니다."
        )
    version.status = "pending_review"
    version.submitted_at = datetime.now(UTC)
    version.review_note = None
    await session.commit()
    return {"ok": True, "data": effect_version_data(version)}


@router.get("/artist/cards/{card_id}/image")
async def card_image(card_id: str, user: ArtistUser, session: DbSession) -> Response:
    """Serve an artist-owned card image while editing a draft."""
    card = await owned_card(card_id, user, session)
    if not card.image_asset_id:
        raise AppError(404, "CARD_IMAGE_NOT_FOUND", "카드 이미지를 찾을 수 없습니다.")
    asset = await owned_asset(card.image_asset_id, user, session)
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(404, "CARD_IMAGE_NOT_READY", "카드 이미지가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "image/png"
    )


@router.get("/artist/cards/{card_id}/video")
async def card_video(card_id: str, user: ArtistUser, session: DbSession) -> Response:
    """Serve an artist-owned motion layer while editing a draft."""
    card = await owned_card(card_id, user, session)
    if not card.video_asset_id:
        raise AppError(404, "VIDEO_NOT_FOUND", "카드 영상을 찾을 수 없습니다.")
    asset = await owned_asset(card.video_asset_id, user, session)
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(404, "VIDEO_NOT_READY", "카드 영상이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "video/mp4"
    )


@router.get("/artist/cards/{card_id}/voice")
async def card_voice(card_id: str, user: ArtistUser, session: DbSession) -> Response:
    """Serve an artist-owned voice recording while editing a draft."""
    card = await owned_card(card_id, user, session)
    if not card.voice_asset_id:
        raise AppError(404, "VOICE_NOT_FOUND", "보이스 파일을 찾을 수 없습니다.")
    asset = await owned_asset(card.voice_asset_id, user, session)
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(404, "VOICE_NOT_READY", "보이스 파일이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "audio/mpeg"
    )


@router.get("/artist/cards/{card_id}/handwriting")
async def card_handwriting(card_id: str, user: ArtistUser, session: DbSession) -> Response:
    """Serve the artist-owned handwriting layer while editing a draft."""
    card = await owned_card(card_id, user, session)
    if not card.handwriting_asset_id:
        raise AppError(404, "HANDWRITING_NOT_FOUND", "손글씨 레이어를 찾을 수 없습니다.")
    asset = await owned_asset(card.handwriting_asset_id, user, session)
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(404, "HANDWRITING_NOT_READY", "손글씨 레이어가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "image/png"
    )


@router.patch("/artist/cards/{card_id}")
async def update_card(
    card_id: str, payload: ArtistCardUpdate, user: ArtistUser, session: DbSession
) -> dict:
    card = await owned_card(card_id, user, session)
    if card.status not in {"draft", "changes_requested"}:
        raise AppError(409, "INVALID_CARD_STATUS", "현재 상태에서는 카드를 수정할 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    if "design_config" in values:
        await validate_design_assets(values["design_config"], user, session)
    for asset_field in (
        "image_asset_id",
        "handwriting_asset_id",
        "voice_asset_id",
        "video_asset_id",
    ):
        asset_id = values.get(asset_field)
        if asset_id is not None:
            await owned_asset(asset_id, user, session)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_catalog_ids(
            artist_id=values.get("artist_id", card.artist_id),
            member_id=values.get("member_id", card.member_id),
            session=session,
        )
        await ensure_artist_catalog_access(
            artist_id=values["artist_id"], user=user, session=session
        )
    for field, value in values.items():
        setattr(card, field, value)
    if card.release_status == "changes_requested":
        card.release_status = "draft"
        card.status = "draft"
    await session.commit()
    return {"ok": True, "data": card_data(card)}


async def resolve_catalog_ids(
    *, artist_id: str | None, member_id: str | None, session: DbSession
) -> str | None:
    """Validate the studio's group/member selection before saving a card."""
    if artist_id is not None and not await session.get(Artist, artist_id):
        raise AppError(404, "ARTIST_NOT_FOUND", "선택한 그룹을 찾을 수 없습니다.")
    if member_id is None:
        return artist_id
    member = await session.get(Member, member_id)
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "선택한 멤버를 찾을 수 없습니다.")
    if artist_id is not None and member.artist_id != artist_id:
        raise AppError(422, "MEMBER_ARTIST_MISMATCH", "멤버와 그룹을 올바르게 선택해 주세요.")
    return member.artist_id


async def ensure_artist_catalog_access(
    *, artist_id: str | None, user: ArtistUser, session: DbSession
) -> None:
    """Allow an artist account to select only its verified catalog group."""
    if artist_id is None:
        return
    profile = await session.get(ArtistProfile, user.id)
    if not profile or profile.verification_status != "verified" or profile.artist_id != artist_id:
        raise AppError(403, "ARTIST_CATALOG_FORBIDDEN", "소속이 확인된 그룹만 선택할 수 있습니다.")


def preview_data(card: Card, *, preview_image_url: str | None = None) -> dict:
    data = {
        "cardId": card.id,
        "previewUrl": f"/api/artist/cards/{card.id}/preview",
        "metadata": card_data(card),
        "layers": {
            "base": {"assetId": card.image_asset_id},
            "handwriting": {
                "assetId": card.handwriting_asset_id,
                "text": card.signature_text,
                "transform": card.handwriting_transform,
            },
            "video": {"assetId": card.video_asset_id},
            "effects": {
                "front": {
                    "style": (card.design_config or {}).get("front", {}).get("effect", "none"),
                    "intensity": (card.design_config or {})
                    .get("front", {})
                    .get("effectIntensity", 0.0),
                },
                "back": {
                    "style": (card.design_config or {}).get("back", {}).get("effect", "none"),
                },
            },
        },
    }
    if preview_image_url:
        data["previewImageUrl"] = preview_image_url
    return data


async def render_preview(card: Card, user: ArtistUser, session: DbSession) -> dict:
    base_asset = (
        await owned_asset(card.image_asset_id, user, session) if card.image_asset_id else None
    )
    handwriting_asset = (
        await owned_asset(card.handwriting_asset_id, user, session)
        if card.handwriting_asset_id
        else None
    )
    preview_image_url = None
    if base_asset and base_asset.storage_path:
        handwriting_path = (
            handwriting_asset.processed_storage_path or handwriting_asset.storage_path
            if handwriting_asset
            else None
        )
        storage = configured_asset_storage()
        if base_asset.storage_path.startswith("s3://"):
            card.preview_storage_path = storage.save_preview_bytes(
                card.id,
                compose_card_preview_bytes(
                    storage.read_bytes(base_asset.storage_path),
                    storage.read_bytes(handwriting_path) if handwriting_path else None,
                    card.handwriting_transform,
                ),
            )
        else:
            card.preview_storage_path = compose_card_preview(
                get_settings().storage_dir,
                card.id,
                base_asset.storage_path,
                handwriting_path,
                card.handwriting_transform,
            )
        await session.commit()
        preview_image_url = f"/api/artist/cards/{card.id}/preview/image"
    return preview_data(card, preview_image_url=preview_image_url)


@router.post("/artist/cards/{card_id}/preview")
async def create_preview(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": await render_preview(card, user, session)}


@router.get("/artist/cards/{card_id}/preview")
async def get_preview(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": await render_preview(card, user, session)}


@router.get("/artist/cards/{card_id}/preview/image")
async def get_preview_image(card_id: str, user: ArtistUser, session: DbSession) -> Response:
    card = await owned_card(card_id, user, session)
    if not card.preview_storage_path:
        await render_preview(card, user, session)
    if not card.preview_storage_path:
        raise AppError(404, "PREVIEW_NOT_READY", "카드 미리보기가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), card.preview_storage_path, media_type="image/png"
    )


@router.post("/artist/cards/{card_id}/submit-review")
async def submit_review(
    card_id: str,
    user: ArtistUser,
    session: DbSession,
    payload: ArtistReviewSubmitRequest | None = None,
) -> dict:
    card = await session.get(Card, card_id)
    if not card or card.owner_artist_id != user.id:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status != "draft" or card.release_status not in {"draft", "changes_requested"}:
        raise AppError(409, "INVALID_CARD_STATUS", "검수 요청할 수 없는 상태입니다.")
    if card.has_voice:
        if not card.voice_asset_id:
            raise AppError(409, "CARD_MEDIA_INCOMPLETE", "보이스 파일을 추가해 주세요.")
        voice_asset = await owned_asset(card.voice_asset_id, user, session)
        if not voice_asset.storage_path or not voice_asset.upload_completed_at:
            raise AppError(
                409,
                "CARD_MEDIA_INCOMPLETE",
                "보이스 파일 업로드를 완료해 주세요.",
            )
    video_enabled = bool((card.design_config or {}).get("video", {}).get("enabled"))
    if video_enabled:
        if not card.video_asset_id:
            raise AppError(409, "CARD_MEDIA_INCOMPLETE", "모션 영상을 추가해 주세요.")
        video_asset = await owned_asset(card.video_asset_id, user, session)
        if not video_asset.storage_path or not video_asset.upload_completed_at:
            raise AppError(
                409,
                "CARD_MEDIA_INCOMPLETE",
                "모션 영상 업로드를 완료해 주세요.",
            )
    await ensure_ready_lenticular_asset(card, user, session)
    card.review_note = payload.review_note if payload else None
    await submit_card_for_release_review(session, card=card)
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": card.id,
            "status": card.status,
            "reviewNote": card.review_note,
            **release_card_data(card),
        },
    }


@router.post("/assets/{asset_id}/background-removal", status_code=status.HTTP_202_ACCEPTED)
async def remove_background(
    asset_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user: ArtistUser,
    session: DbSession,
) -> dict:
    client_host = request.client.host if request.client else "unknown"
    await enforce_rate_limit(
        f"background-removal:{user.id}:{client_host}", limit=10, window_seconds=60 * 60
    )
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    job = BackgroundRemovalJob(id=f"job_{uuid4().hex[:10]}", asset_id=asset.id, status="queued")
    session.add(job)
    await session.commit()
    enqueue_background_removal(job.id, background_tasks)
    return {"ok": True, "data": {"jobId": job.id, "status": job.status}}


@router.get("/artist/assets/{asset_id}/photo-analysis")
async def get_photo_analysis(asset_id: str, user: ArtistUser, session: DbSession) -> dict:
    """Return cached source-photo segmentation metadata without running inference."""
    asset = await owned_asset(asset_id, user, session)
    metadata = await valid_photo_analysis_metadata(asset)
    if not metadata:
        raise AppError(404, "PHOTO_ANALYSIS_NOT_FOUND", "생성된 사진 분석이 없습니다.")
    return {"ok": True, "data": public_photo_analysis_metadata(metadata)}


@router.post("/artist/assets/{asset_id}/photo-analysis")
async def analyze_photo(asset_id: str, user: ArtistUser, session: DbSession) -> dict:
    """Create or reuse cached source-photo subject segmentation for studio masking."""
    asset = await owned_asset(asset_id, user, session)
    revision = current_source_revision(asset)
    if not asset.storage_path or not revision:
        raise AppError(409, "ASSET_NOT_READY", "먼저 이미지 업로드를 완료해 주세요.")
    cached = await valid_photo_analysis_metadata(asset)
    if cached:
        return {"ok": True, "data": public_photo_analysis_metadata(cached)}
    spatial = await reusable_spatial_mask_metadata(asset)
    storage = configured_asset_storage()
    if spatial:
        metadata = photo_analysis_metadata(
            asset.id,
            source_revision=revision,
            provider=str(spatial["provider"]),
            model_version=str(spatial["modelVersion"]),
            confidence=float(spatial["confidence"]),
            mask_storage_path=str(spatial["maskStoragePath"]),
        )
        asset.transform = {**(asset.transform or {}), "photoAnalysis": metadata}
        await session.commit()
        return {"ok": True, "data": public_photo_analysis_metadata(metadata)}
    source = await run_in_threadpool(storage.read_bytes, asset.storage_path)
    try:
        bundle = await configured_photo_analysis_provider(get_settings()).analyze(source)
    except SpatialSceneProviderError as error:
        raise AppError(
            502,
            "PHOTO_ANALYSIS_FAILED",
            "사진 분석을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error
    mask_path = await run_in_threadpool(
        storage.save_derived_bytes,
        asset.id,
        "-photo-analysis-mask.png",
        bundle.mask,
        content_type="image/png",
    )
    metadata = photo_analysis_metadata(
        asset.id,
        source_revision=revision,
        provider=bundle.provider,
        model_version=bundle.model_version,
        confidence=bundle.confidence,
        mask_storage_path=mask_path,
    )
    asset.transform = {**(asset.transform or {}), "photoAnalysis": metadata}
    await session.commit()
    return {"ok": True, "data": public_photo_analysis_metadata(metadata)}


@router.get("/artist/assets/{asset_id}/photo-analysis-mask")
async def photo_analysis_mask(asset_id: str, user: ArtistUser, session: DbSession) -> Response:
    asset = await owned_asset(asset_id, user, session)
    metadata = await valid_photo_analysis_metadata(asset)
    if not metadata:
        raise AppError(404, "PHOTO_ANALYSIS_MASK_NOT_FOUND", "생성된 인물 마스크가 없습니다.")
    path = metadata.get("maskStoragePath")
    if not isinstance(path, str):
        raise AppError(404, "PHOTO_ANALYSIS_MASK_NOT_FOUND", "생성된 인물 마스크가 없습니다.")
    storage = configured_asset_storage()
    if path.startswith("s3://"):
        content = await run_in_threadpool(storage.read_bytes, path)
        return Response(content=content, media_type="image/png")
    return storage_response(storage, path, media_type="image/png")


@router.post("/artist/assets/{asset_id}/spatial-scene")
async def generate_spatial_scene(asset_id: str, user: ArtistUser, session: DbSession) -> dict:
    """Create and privately persist the aligned spatial scene bundle."""
    asset = await owned_asset(asset_id, user, session)
    if not asset.storage_path or not asset.upload_completed_at:
        raise AppError(409, "ASSET_NOT_READY", "먼저 이미지 업로드를 완료해 주세요.")
    storage = configured_asset_storage()
    source = await run_in_threadpool(storage.read_bytes, asset.storage_path)
    cached_analysis = await valid_photo_analysis_metadata(asset)
    cached_mask = None
    if cached_analysis and isinstance(cached_analysis.get("maskStoragePath"), str):
        cached_mask = await run_in_threadpool(
            storage.read_bytes, cached_analysis["maskStoragePath"]
        )
    try:
        bundle = await configured_spatial_scene_provider(get_settings()).generate(
            source, mask=cached_mask
        )
    except SpatialSceneProviderError as error:
        raise AppError(
            502,
            "SPATIAL_SCENE_GENERATION_FAILED",
            "입체 장면을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error
    depth_path = await run_in_threadpool(
        storage.save_derived_bytes,
        asset.id,
        "-spatial-depth.png",
        bundle.depth,
        content_type="image/png",
    )
    mask_path = await run_in_threadpool(
        storage.save_derived_bytes,
        asset.id,
        "-spatial-mask.png",
        bundle.mask,
        content_type="image/png",
    )
    background_path = await run_in_threadpool(
        storage.save_derived_bytes,
        asset.id,
        "-spatial-background.png",
        bundle.background,
        content_type="image/png",
    )
    metadata = spatial_scene_metadata(
        asset.id,
        provider=bundle.provider,
        model_version=bundle.model_version,
        confidence=bundle.confidence,
        source_revision=current_source_revision(asset),
        depth_storage_path=depth_path,
        mask_storage_path=mask_path,
        background_storage_path=background_path,
    )
    asset.transform = {**(asset.transform or {}), "spatialScene": metadata}
    await session.commit()
    return {"ok": True, "data": public_spatial_scene_metadata(metadata)}


@router.post("/artist/assets/{asset_id}/spatial-scene-jobs", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_spatial_scene_job(
    asset_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    user: ArtistUser,
    session: DbSession,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Accept a spatial generation request without waiting for model inference."""
    if not idempotency_key or not idempotency_key.strip():
        raise AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key가 필요합니다.")
    asset = await owned_asset(asset_id, user, session)
    if not asset.storage_path or not asset.upload_completed_at:
        raise AppError(409, "ASSET_NOT_READY", "먼저 이미지 업로드를 완료해 주세요.")
    crop_rect = tuple(payload.get("cropRect", (0, 0, 0, 0)))
    if len(crop_rect) != 4 or not all(isinstance(value, int) for value in crop_rect):
        raise AppError(422, "INVALID_CROP_RECT", "cropRect는 네 개의 정수여야 합니다.")
    source_revision = f"{asset.id}:{asset.upload_completed_at.isoformat()}"
    motion_preset = payload.get("motionPreset", "portrait-parallax")
    pipeline_version = payload.get("pipelineVersion", "v1")
    if not isinstance(motion_preset, str) or not isinstance(pipeline_version, str):
        raise AppError(422, "INVALID_SPATIAL_SCENE_OPTIONS", "공간 장면 옵션이 올바르지 않습니다.")
    existing = await session.scalar(
        select(SpatialSceneJob).where(
            SpatialSceneJob.owner_id == user.id,
            SpatialSceneJob.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return {
            "ok": True,
            "data": {"jobId": existing.id, "status": existing.status, "reused": True},
        }
    job = SpatialSceneJob(
        id=f"scene_job_{uuid4().hex[:10]}",
        owner_id=user.id,
        asset_id=asset.id,
        idempotency_key=idempotency_key.strip(),
        generation_key=generation_key(
            source_revision=source_revision,
            crop_rect=crop_rect,
            motion_preset=motion_preset,
            pipeline_version=pipeline_version,
        ),
    )
    session.add(job)
    await session.commit()
    enqueue_spatial_scene(job.id, background_tasks)
    return {"ok": True, "data": {"jobId": job.id, "status": job.status, "reused": False}}


@router.get("/artist/spatial-scene-jobs/{job_id}")
async def get_spatial_scene_job(job_id: str, user: ArtistUser, session: DbSession) -> dict:
    job = await session.scalar(
        select(SpatialSceneJob).where(
            SpatialSceneJob.id == job_id, SpatialSceneJob.owner_id == user.id
        )
    )
    if not job:
        raise AppError(404, "SPATIAL_SCENE_JOB_NOT_FOUND", "공간 장면 작업을 찾을 수 없습니다.")
    data = {"jobId": job.id, "status": job.status, "phase": job.phase, "attempts": job.attempts}
    if job.error_code:
        data["errorCode"] = job.error_code
    if job.result_metadata and job.status == "ready":
        data["scene"] = public_spatial_scene_metadata(job.result_metadata)
    return {"ok": True, "data": data}


@router.get("/artist/assets/{asset_id}/spatial-depth")
async def spatial_depth(asset_id: str, user: ArtistUser, session: DbSession) -> Response:
    asset = await owned_asset(asset_id, user, session)
    metadata = (asset.transform or {}).get("spatialScene", {})
    path = metadata.get("depthStoragePath")
    if not path:
        raise AppError(404, "SPATIAL_DEPTH_NOT_FOUND", "생성된 깊이맵이 없습니다.")
    return storage_response(configured_asset_storage(), path, media_type="image/png")


@router.get("/artist/assets/{asset_id}/spatial-mask")
async def spatial_mask(asset_id: str, user: ArtistUser, session: DbSession) -> Response:
    asset = await owned_asset(asset_id, user, session)
    metadata = (asset.transform or {}).get("spatialScene", {})
    path = metadata.get("maskStoragePath")
    if not path:
        raise AppError(404, "SPATIAL_MASK_NOT_FOUND", "생성된 인물 마스크가 없습니다.")
    return storage_response(configured_asset_storage(), path, media_type="image/png")


@router.get("/artist/assets/{asset_id}/spatial-background")
async def spatial_background(asset_id: str, user: ArtistUser, session: DbSession) -> Response:
    asset = await owned_asset(asset_id, user, session)
    metadata = (asset.transform or {}).get("spatialScene", {})
    path = metadata.get("backgroundStoragePath")
    if not path:
        raise AppError(404, "SPATIAL_BACKGROUND_NOT_FOUND", "생성된 배경 장면이 없습니다.")
    return storage_response(configured_asset_storage(), path, media_type="image/png")


@router.get("/background-removal-jobs/{job_id}")
async def get_background_removal_job(job_id: str, user: ArtistUser, session: DbSession) -> dict:
    job = await session.scalar(
        select(BackgroundRemovalJob)
        .join(Asset, Asset.id == BackgroundRemovalJob.asset_id)
        .where(BackgroundRemovalJob.id == job_id, Asset.owner_id == user.id)
    )
    if not job:
        raise AppError(404, "JOB_NOT_FOUND", "배경 제거 작업을 찾을 수 없습니다.")
    data = {"jobId": job.id, "status": job.status}
    if job.status == "completed":
        data.update(
            {"transparentImageUrl": job.transparent_image_url, "previewUrl": job.preview_url}
        )
    return {"ok": True, "data": data}
