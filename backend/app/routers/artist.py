from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.core.config import get_settings
from app.dependencies import ArtistUser, DbSession
from app.errors import AppError
from app.image_processing import compose_card_preview
from app.models import Artist, Asset, BackgroundRemovalJob, Card, Member, UserCard
from app.rate_limit import enforce_rate_limit
from app.schemas import ArtistCardRequest, ArtistCardUpdate
from app.tasks import enqueue_background_removal

router = APIRouter(prefix="/api", tags=["artist"])


@router.get("/artist/templates")
async def list_templates(user: ArtistUser, session: DbSession) -> dict:
    """Return the studio's selectable templates and the artist catalog.

    Templates are configuration in the MVP, so they are intentionally kept
    outside the card table. Artists still receive the group/member catalog
    from the database instead of relying on values baked into the UI.
    """
    artists = (await session.scalars(select(Artist).order_by(Artist.name))).all()
    members = (await session.scalars(select(Member).order_by(Member.name))).all()
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
    artist_id = await resolve_catalog_ids(
        artist_id=payload.artist_id, member_id=payload.member_id, session=session
    )
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
        voice_asset_id=payload.voice_asset_id,
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
        "memberId": card.member_id,
        "signatureText": card.signature_text,
        "handwritingAssetId": card.handwriting_asset_id,
        "voiceAssetId": card.voice_asset_id,
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


@router.get("/artist/cards/{card_id}")
async def get_card(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": card_data(card)}


@router.patch("/artist/cards/{card_id}")
async def update_card(
    card_id: str, payload: ArtistCardUpdate, user: ArtistUser, session: DbSession
) -> dict:
    card = await owned_card(card_id, user, session)
    if card.status not in {"draft", "changes_requested"}:
        raise AppError(409, "INVALID_CARD_STATUS", "현재 상태에서는 카드를 수정할 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    for asset_field in ("image_asset_id", "handwriting_asset_id", "voice_asset_id"):
        asset_id = values.get(asset_field)
        if asset_id is not None:
            await owned_asset(asset_id, user, session)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_catalog_ids(
            artist_id=values.get("artist_id", card.artist_id),
            member_id=values.get("member_id", card.member_id),
            session=session,
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
async def get_preview_image(card_id: str, user: ArtistUser, session: DbSession) -> FileResponse:
    card = await owned_card(card_id, user, session)
    if not card.preview_storage_path:
        await render_preview(card, user, session)
    if not card.preview_storage_path:
        raise AppError(404, "PREVIEW_NOT_READY", "카드 미리보기가 아직 준비되지 않았습니다.")
    return FileResponse(card.preview_storage_path, media_type="image/png")


@router.post("/artist/cards/{card_id}/submit-review")
async def submit_review(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card or card.owner_artist_id != user.id:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status != "draft":
        raise AppError(409, "INVALID_CARD_STATUS", "검수 요청할 수 없는 상태입니다.")
    card.status = "pending_review"
    await session.commit()
    return {"ok": True, "data": {"id": card.id, "status": card.status}}


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
