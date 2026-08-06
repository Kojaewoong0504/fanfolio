import asyncio

from fastapi import APIRouter, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db.session import engine
from app.errors import AppError

router = APIRouter(tags=["health"])


async def _check_task_queue() -> None:
    """Check the Celery broker without blocking FastAPI's event loop."""
    settings = get_settings()
    if settings.task_queue_mode != "celery":
        return

    # Import lazily so the lightweight inline/test path does not initialize a
    # Celery connection merely because the health router was imported.
    from app.tasks import celery_app

    connection = celery_app.connection_for_read()
    try:
        await asyncio.to_thread(connection.ensure_connection, max_retries=1)
    finally:
        connection.release()


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
        await _check_task_queue()
    except (OSError, RuntimeError, ValueError, SQLAlchemyError) as error:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_NOT_READY",
            "서비스가 아직 요청을 처리할 준비가 되지 않았습니다.",
        ) from error
    return {"ok": True, "data": {"status": "ready"}}
