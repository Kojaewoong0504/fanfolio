from fastapi import APIRouter, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db.session import engine
from app.errors import AppError

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health() -> dict:
    return {"ok": True, "data": {"status": "healthy"}}


@router.get("/api/health/ready")
async def readiness() -> dict:
    """Verify dependencies needed before routing production traffic here."""
    try:
        get_settings().validate_runtime()
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except (OSError, RuntimeError, ValueError, SQLAlchemyError) as error:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_NOT_READY",
            "서비스가 아직 요청을 처리할 준비가 되지 않았습니다.",
        ) from error
    return {"ok": True, "data": {"status": "ready"}}
