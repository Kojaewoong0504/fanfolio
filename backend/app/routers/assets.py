import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4

from fastapi import APIRouter, Request, Response, status
from starlette.concurrency import run_in_threadpool

from app.admin_access import load_admin_context
from app.core.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.errors import AppError
from app.image_processing import ensure_event_hero_derivative
from app.models import Asset, Organization, Role
from app.schemas import AssetTransformUpdate, UploadPresignRequest
from app.storage import (
    DIRECT_UPLOAD_STAGING_SUFFIX,
    StorageObjectNotFound,
    configured_asset_storage,
    storage_response,
)
from app.upload_safety import scan_uploaded_content

router = APIRouter(prefix="/api", tags=["assets"])
logger = logging.getLogger(__name__)

ORGANIZATION_LOGO_MAX_BYTES = 2 * 1024 * 1024


def invalidate_source_photo_derivatives(asset: Asset) -> None:
    if not isinstance(asset.transform, dict):
        return
    transform = {
        key: value
        for key, value in asset.transform.items()
        if key not in {"photoAnalysis", "spatialScene"}
    }
    asset.transform = transform or None


def upload_limit_bytes(asset: Asset) -> int:
    if asset.purpose == "organization_logo":
        return ORGANIZATION_LOGO_MAX_BYTES
    return get_settings().max_upload_bytes


async def require_upload_role(user: CurrentUser, session: DbSession) -> None:
    if user.role not in {Role.ADMIN, Role.ARTIST}:
        raise AppError(403, "FORBIDDEN", "권한이 없습니다.")
    if user.role == Role.ADMIN:
        await load_admin_context(session, user)


async def prepare_event_banner_variant(asset: Asset, storage) -> None:
    """Generate the public fan banner before the upload is reported ready."""
    if asset.purpose != "event_banner" or not asset.storage_path:
        return
    asset.processed_storage_path = await run_in_threadpool(
        ensure_event_hero_derivative, storage, asset.id, asset.storage_path, force=True
    )


@router.post("/uploads/presign", status_code=status.HTTP_201_CREATED)
async def presign_upload(
    payload: UploadPresignRequest, user: CurrentUser, session: DbSession
) -> dict:
    """Create an owned asset and return a short-lived upload URL."""
    await require_upload_role(user, session)
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.upload_url_ttl_seconds)
    storage = configured_asset_storage()
    asset = Asset(
        id=f"asset_{uuid4().hex[:10]}",
        owner_id=user.id,
        file_name=payload.file_name,
        content_type=payload.content_type,
        purpose=payload.purpose,
        upload_expires_at=expires_at,
    )
    upload_url = f"/api/uploads/{asset.id}/content"
    upload_mode = "api"
    complete_url = None
    # Supabase Storage's S3-compatible endpoint uses the same direct upload
    # contract as a regular S3 backend. Keeping this branch shared ensures
    # card images are uploaded to durable object storage instead of the
    # ephemeral Render filesystem.
    if settings.storage_backend in {"s3", "supabase"}:
        asset.storage_path = storage.asset_path(asset.id, DIRECT_UPLOAD_STAGING_SUFFIX)
        upload_url = storage.presigned_upload_url(
            asset.id,
            content_type=payload.content_type,
            expires_in=settings.upload_url_ttl_seconds,
        )
        upload_mode = "direct"
        complete_url = f"/api/uploads/{asset.id}/complete"
    session.add(asset)
    await session.commit()
    return {
        "ok": True,
        "data": {
            "assetId": asset.id,
            "uploadUrl": upload_url,
            "uploadMode": upload_mode,
            "completeUrl": complete_url,
            "expiresAt": expires_at.isoformat(),
            "maxUploadBytes": upload_limit_bytes(asset),
        },
    }


@router.put("/uploads/{asset_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def upload_asset_content(
    asset_id: str, request: Request, user: CurrentUser, session: DbSession
) -> Response:
    """Accept bytes for local development; object storage replaces this endpoint later."""
    await require_upload_role(user, session)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    if asset.upload_completed_at:
        raise AppError(409, "UPLOAD_ALREADY_COMPLETED", "이미 완료된 업로드입니다.")
    if asset.upload_expires_at and datetime.now(UTC) > asset.upload_expires_at.replace(tzinfo=UTC):
        raise AppError(410, "UPLOAD_URL_EXPIRED", "업로드 URL이 만료되었습니다.")
    content_length = request.headers.get("content-length")
    upload_limit = upload_limit_bytes(asset)
    if content_length:
        try:
            if int(content_length) > upload_limit:
                raise AppError(413, "UPLOAD_TOO_LARGE", "업로드 파일이 너무 큽니다.")
        except ValueError:
            raise AppError(400, "INVALID_CONTENT_LENGTH", "업로드 크기를 확인할 수 없습니다.")
    content = await request.body()
    if not content:
        raise AppError(422, "EMPTY_UPLOAD", "업로드할 파일이 없습니다.")
    if len(content) > upload_limit:
        raise AppError(413, "UPLOAD_TOO_LARGE", "업로드 파일이 너무 큽니다.")
    await scan_uploaded_content(
        content_type=asset.content_type,
        purpose=asset.purpose,
        content=content,
    )
    storage = configured_asset_storage()
    asset.storage_path = await run_in_threadpool(
        storage.save_bytes,
        asset.id,
        content,
        content_type=asset.content_type,
    )
    asset.content_sha256 = sha256(content).hexdigest()
    if asset.purpose == "event_banner":
        await prepare_event_banner_variant(asset, storage)
    invalidate_source_photo_derivatives(asset)
    asset.upload_completed_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/uploads/{asset_id}/complete")
async def complete_asset_upload(asset_id: str, user: CurrentUser, session: DbSession) -> dict:
    """Finalize a direct object-store upload after server-side safety checks."""
    await require_upload_role(user, session)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    if asset.upload_expires_at and datetime.now(UTC) > asset.upload_expires_at.replace(tzinfo=UTC):
        raise AppError(410, "UPLOAD_URL_EXPIRED", "업로드 URL이 만료되었습니다.")
    # Browser retries and worker handoffs can repeat the finalize request. Once
    # the object has passed the server-side scan, the state transition is
    # already complete and the same success response is safe to return.
    if asset.upload_completed_at:
        return {"ok": True, "data": {"assetId": asset.id, "status": "ready"}}
    if not asset.storage_path:
        raise AppError(409, "UPLOAD_NOT_READY", "업로드된 파일을 찾을 수 없습니다.")
    storage = configured_asset_storage()
    staging_path = asset.storage_path
    if not await run_in_threadpool(storage.exists, staging_path):
        raise AppError(409, "UPLOAD_NOT_READY", "업로드된 파일을 찾을 수 없습니다.")
    if await run_in_threadpool(storage.size_bytes, staging_path) > upload_limit_bytes(asset):
        await run_in_threadpool(storage.delete, staging_path)
        asset.storage_path = None
        await session.commit()
        raise AppError(413, "UPLOAD_TOO_LARGE", "업로드 파일이 너무 큽니다.")
    try:
        content = await run_in_threadpool(storage.read_bytes, staging_path)
        await scan_uploaded_content(
            content_type=asset.content_type,
            purpose=asset.purpose,
            content=content,
        )
    except AppError:
        await run_in_threadpool(storage.delete, staging_path)
        asset.storage_path = None
        await session.commit()
        raise
    except StorageObjectNotFound:
        asset.storage_path = None
        await session.commit()
        raise AppError(409, "UPLOAD_NOT_READY", "업로드된 파일을 찾을 수 없습니다.")
    canonical_path = await run_in_threadpool(
        storage.save_bytes,
        asset.id,
        content,
        content_type=asset.content_type,
    )
    if asset.purpose == "event_banner":
        asset.processed_storage_path = await run_in_threadpool(
            ensure_event_hero_derivative, storage, asset.id, canonical_path, content, force=True
        )
    asset.storage_path = canonical_path
    asset.content_sha256 = sha256(content).hexdigest()
    invalidate_source_photo_derivatives(asset)
    asset.upload_completed_at = datetime.now(UTC)
    await session.commit()
    if staging_path != canonical_path:
        try:
            await run_in_threadpool(storage.delete, staging_path)
        except Exception:
            logger.warning("direct upload staging cleanup failed for %s", asset.id, exc_info=True)
    return {"ok": True, "data": {"assetId": asset.id, "status": "ready"}}


@router.get("/assets/{asset_id}/transparent")
async def get_transparent_asset(asset_id: str, user: CurrentUser, session: DbSession) -> Response:
    await require_upload_role(user, session)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id or not asset.processed_storage_path:
        raise AppError(404, "ASSET_NOT_FOUND", "처리된 자산을 찾을 수 없습니다.")
    return storage_response(
        configured_asset_storage(), asset.processed_storage_path, media_type="image/png"
    )


@router.get("/assets/{asset_id}/content")
async def get_owned_asset_content(asset_id: str, user: CurrentUser, session: DbSession) -> Response:
    """Serve a reusable creative layer only to its admin or artist owner."""
    await require_upload_role(user, session)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(404, "ASSET_NOT_READY", "자산이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(),
        path,
        media_type=asset.content_type or "application/octet-stream",
    )


@router.get("/organizations/{organization_id}/logo")
async def get_organization_logo(organization_id: str, session: DbSession) -> Response:
    organization = await session.get(Organization, organization_id)
    if organization is None or organization.logo_asset_id is None:
        raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
    asset = await session.get(Asset, organization.logo_asset_id)
    if (
        asset is None
        or asset.purpose != "organization_logo"
        or asset.content_type not in {"image/png", "image/jpeg", "image/webp"}
        or asset.storage_path is None
        or asset.upload_completed_at is None
    ):
        raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
    storage = configured_asset_storage()
    try:
        if not storage.exists(asset.storage_path):
            raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
        content = storage.read_bytes(asset.storage_path)
    except StorageObjectNotFound:
        raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
    return Response(content=content, media_type=asset.content_type)


@router.patch("/assets/{asset_id}/transform")
async def update_asset_transform(
    asset_id: str,
    payload: AssetTransformUpdate,
    user: CurrentUser,
    session: DbSession,
) -> dict:
    await require_upload_role(user, session)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    asset.transform = payload.transform
    await session.commit()
    return {"ok": True, "data": {"assetId": asset.id, "transform": asset.transform}}
