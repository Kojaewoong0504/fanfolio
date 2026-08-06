from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.errors import AppError
from app.image_processing import save_uploaded_bytes
from app.models import Asset, Role
from app.schemas import AssetTransformUpdate, UploadPresignRequest

router = APIRouter(prefix="/api", tags=["assets"])


def require_upload_role(user: CurrentUser) -> None:
    if user.role not in {Role.ADMIN, Role.ARTIST}:
        raise AppError(403, "FORBIDDEN", "권한이 없습니다.")


@router.post("/uploads/presign", status_code=status.HTTP_201_CREATED)
async def presign_upload(
    payload: UploadPresignRequest, user: CurrentUser, session: DbSession
) -> dict:
    """Create an owned asset and return a short-lived development upload URL.

    Production should replace the internal PUT URL with an object-store presigned URL.
    The asset record and ownership check stay the same in both environments.
    """
    require_upload_role(user)
    asset = Asset(
        id=f"asset_{uuid4().hex[:10]}",
        owner_id=user.id,
        file_name=payload.file_name,
        content_type=payload.content_type,
        purpose=payload.purpose,
    )
    session.add(asset)
    await session.commit()
    expires_at = datetime.now(UTC) + timedelta(minutes=15)
    return {
        "ok": True,
        "data": {
            "assetId": asset.id,
            "uploadUrl": f"/api/uploads/{asset.id}/content",
            "expiresAt": expires_at.isoformat(),
        },
    }


@router.put("/uploads/{asset_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def upload_asset_content(
    asset_id: str, request: Request, user: CurrentUser, session: DbSession
) -> Response:
    """Accept bytes for local development; object storage replaces this endpoint later."""
    require_upload_role(user)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    content = await request.body()
    if not content:
        raise AppError(422, "EMPTY_UPLOAD", "업로드할 파일이 없습니다.")
    asset.storage_path = save_uploaded_bytes(get_settings().storage_dir, asset.id, content)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/assets/{asset_id}/transparent")
async def get_transparent_asset(
    asset_id: str, user: CurrentUser, session: DbSession
) -> FileResponse:
    require_upload_role(user)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id or not asset.processed_storage_path:
        raise AppError(404, "ASSET_NOT_FOUND", "처리된 자산을 찾을 수 없습니다.")
    return FileResponse(asset.processed_storage_path, media_type="image/png")


@router.patch("/assets/{asset_id}/transform")
async def update_asset_transform(
    asset_id: str,
    payload: AssetTransformUpdate,
    user: CurrentUser,
    session: DbSession,
) -> dict:
    require_upload_role(user)
    asset = await session.get(Asset, asset_id)
    if not asset or asset.owner_id != user.id:
        raise AppError(404, "ASSET_NOT_FOUND", "자산을 찾을 수 없습니다.")
    asset.transform = payload.transform
    await session.commit()
    return {"ok": True, "data": {"assetId": asset.id, "transform": asset.transform}}
