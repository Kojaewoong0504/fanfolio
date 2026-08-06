from uuid import uuid4

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import ArtistUser, DbSession
from app.errors import AppError
from app.models import Asset, BackgroundRemovalJob, Card
from app.schemas import ArtistCardRequest, ArtistCardUpdate

router = APIRouter(prefix="/api", tags=["artist"])


@router.post("/artist/cards", status_code=status.HTTP_201_CREATED)
async def create_card(payload: ArtistCardRequest, user: ArtistUser, session: DbSession) -> dict:
    image_asset = await session.get(Asset, payload.image_asset_id)
    if not image_asset or image_asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "카드 이미지를 찾을 수 없습니다.")
    card = Card(
        id=f"card_{uuid4().hex[:10]}",
        name=payload.name,
        owner_artist_id=user.id,
        status="draft",
        template_id=payload.template_id,
        season_name=payload.season_name,
        rarity=payload.rarity,
        image_asset_id=payload.image_asset_id,
        issue_limit=payload.issue_limit,
    )
    session.add(card)
    await session.commit()
    return {"ok": True, "data": card_data(card)}


def card_data(card: Card) -> dict:
    return {
        "id": card.id,
        "name": card.name,
        "status": card.status,
        "templateId": card.template_id,
        "seasonName": card.season_name,
        "rarity": card.rarity,
        "imageAssetId": card.image_asset_id,
        "signatureText": card.signature_text,
        "handwritingAssetId": card.handwriting_asset_id,
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
    for asset_field in ("image_asset_id", "handwriting_asset_id"):
        asset_id = values.get(asset_field)
        if asset_id is not None:
            await owned_asset(asset_id, user, session)
    for field, value in values.items():
        setattr(card, field, value)
    await session.commit()
    return {"ok": True, "data": card_data(card)}


def preview_data(card: Card) -> dict:
    return {
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


@router.post("/artist/cards/{card_id}/preview")
async def create_preview(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": preview_data(card)}


@router.get("/artist/cards/{card_id}/preview")
async def get_preview(card_id: str, user: ArtistUser, session: DbSession) -> dict:
    card = await owned_card(card_id, user, session)
    return {"ok": True, "data": preview_data(card)}


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
async def remove_background(asset_id: str, user: ArtistUser, session: DbSession) -> dict:
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    # Later, enqueue this durable job to Celery only after the DB transaction commits.
    job = BackgroundRemovalJob(id=f"job_{uuid4().hex[:10]}", asset_id=asset.id, status="queued")
    session.add(job)
    await session.commit()
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
    return {"ok": True, "data": data}
