from uuid import uuid4

from fastapi import APIRouter, status

from app.dependencies import AdminUser, DbSession
from app.errors import AppError
from app.models import Card
from app.schemas import CodeBatchRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
async def dashboard(_: AdminUser) -> dict:
    return {"ok": True, "data": {"metrics": {"redeemedCount": 0, "activeDrops": 1}}}


@router.post("/redeem-code-batches", status_code=status.HTTP_201_CREATED)
async def code_batch(payload: CodeBatchRequest, _: AdminUser) -> dict:
    batch_id = f"batch_{uuid4().hex[:8]}"
    return {
        "ok": True,
        "data": {
            "id": batch_id,
            "quantity": payload.quantity,
            "maxUsesPerCode": payload.max_uses_per_code,
            "csvExportUrl": f"/api/admin/redeem-code-batches/{batch_id}/export",
        },
    }


@router.post("/cards/{card_id}/publish")
async def publish(card_id: str, _: AdminUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    card.status = "published"
    await session.commit()
    return {"ok": True, "data": {"id": card.id, "status": card.status}}
