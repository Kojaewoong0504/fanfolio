from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Request, Response, status
from sqlalchemy import func, select

from app.core.config import get_settings
from app.dependencies import ArtistUser, DbSession
from app.errors import AppError
from app.image_processing import compose_card_preview, compose_card_preview_bytes
from app.models import (
    Artist,
    ArtistProfile,
    Asset,
    BackgroundRemovalJob,
    Card,
    Member,
    UserCard,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import (
    ArtistCardRequest,
    ArtistCardUpdate,
    ArtistProfileUpdate,
    ArtistReviewSubmitRequest,
)
from app.storage import configured_asset_storage, storage_response
from app.tasks import enqueue_background_removal

router = APIRouter(prefix="/api", tags=["artist"])
LENTICULAR_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def profile_data(user, profile: ArtistProfile | None = None) -> dict:
    return {
        "id": user.id,
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
    if card.status != "draft":
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
    card.status = "pending_review"
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": card.id,
            "status": card.status,
            "reviewNote": card.review_note,
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
