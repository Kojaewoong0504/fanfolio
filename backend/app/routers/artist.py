from uuid import uuid4

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import ArtistUser, DbSession
from app.errors import AppError
from app.models import Asset, BackgroundRemovalJob, Card
from app.schemas import ArtistCardRequest

router = APIRouter(prefix="/api", tags=["artist"])


@router.post("/artist/cards", status_code=status.HTTP_201_CREATED)
async def create_card(payload: ArtistCardRequest, user: ArtistUser, session: DbSession) -> dict:
    card = Card(
        id=f"card_{uuid4().hex[:10]}", name=payload.name, owner_artist_id=user.id, status="draft"
    )
    session.add(card)
    await session.commit()
    return {"ok": True, "data": {"id": card.id, "status": card.status}}


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
