import asyncio
import logging

from fastapi import APIRouter, status
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.errors import AppError
from app.rate_limit import check_rate_limit_backend
from app.storage import configured_asset_storage
from app.upload_safety import _scan_with_clamav

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


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


async def _check_storage_backend() -> None:
    """Check that the configured object store can answer a metadata request."""
    settings = get_settings()
    if settings.storage_backend == "local":
        configured_asset_storage().check_ready()
        return
    storage = configured_asset_storage()
    await asyncio.to_thread(storage.check_ready)


async def _check_upload_scanner() -> None:
    """Fail readiness when production's required ClamAV service is unavailable."""
    if get_settings().asset_scan_mode != "clamav":
        return
    try:
        await _scan_with_clamav(b"fanfolio-healthcheck")
    except AppError as error:
        raise OSError(error.message) from error


@router.get("/api/health")
async def health() -> dict:
    return {"ok": True, "data": {"status": "healthy"}}


@router.get("/api/health/ready")
async def readiness() -> dict:
    """Verify dependencies needed before routing production traffic here."""
    stage = "configuration"
    try:
        get_settings().validate_runtime()
        stage = "database"
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        stage = "object_storage"
        await _check_storage_backend()
        stage = "upload_scanner"
        await _check_upload_scanner()
        stage = "task_queue"
        await _check_task_queue()
        stage = "rate_limit"
        await check_rate_limit_backend()
    except Exception as error:
        # Render needs a useful reason for a 503, but connection strings and
        # provider error messages must never be copied into public responses
        # or logs. The exception type is enough to identify the failing class
        # of dependency (storage, Redis, configuration, or database).
        response = getattr(error, "response", {})
        error_details = response.get("Error", {}) if isinstance(response, dict) else {}
        metadata = response.get("ResponseMetadata", {}) if isinstance(response, dict) else {}
        logger.warning(
            "Fanfolio readiness check failed: stage=%s type=%s code=%s status=%s",
            stage,
            type(error).__name__,
            error_details.get("Code", "unknown"),
            metadata.get("HTTPStatusCode", "unknown"),
        )
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_NOT_READY",
            "서비스가 아직 요청을 처리할 준비가 되지 않았습니다.",
        ) from error
    return {"ok": True, "data": {"status": "ready"}}
