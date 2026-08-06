import asyncio
import csv
from datetime import UTC, datetime
from io import BytesIO, StringIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import qrcode
from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import func, select

from app.dependencies import AdminUser, DbSession
from app.errors import AppError
from app.models import (
    Artist,
    Asset,
    AuditLog,
    Card,
    Drop,
    Member,
    RedeemCode,
    RedeemCodeBatch,
    Role,
    User,
)
from app.schemas import (
    AdminCardCreate,
    AdminCardReviewRequest,
    AdminCardUpdate,
    AdminUserRoleUpdate,
    CodeBatchRequest,
    DropCreateRequest,
    DropStatusUpdate,
    DropUpdateRequest,
    RedeemCodeStatusUpdate,
)
from app.services import notify_fans, record_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])


def drop_data(drop: Drop) -> dict:
    return {
        "id": drop.id,
        "name": drop.name,
        "status": drop.status,
        "startsAt": drop.starts_at.isoformat() if drop.starts_at else None,
        "endsAt": drop.ends_at.isoformat() if drop.ends_at else None,
    }


def qr_png_bytes(code: str) -> bytes:
    image = qrcode.make(code)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def qr_zip_bytes(codes: list[str]) -> bytes:
    output = BytesIO()
    with ZipFile(output, mode="w", compression=ZIP_DEFLATED) as archive:
        for code in codes:
            archive.writestr(f"{code}.png", qr_png_bytes(code))
    return output.getvalue()


@router.get("/dashboard")
async def dashboard(_: AdminUser, session: DbSession) -> dict:
    total_cards = await session.scalar(select(func.count()).select_from(Card))
    published_cards = await session.scalar(
        select(func.count()).select_from(Card).where(Card.status == "published")
    )
    active_drops = await session.scalar(
        select(func.count()).select_from(Drop).where(Drop.status == "live")
    )
    redeemed_count = await session.scalar(select(func.coalesce(func.sum(RedeemCode.used_count), 0)))
    recent_logs = (
        await session.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(5)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "metrics": {
                "totalCards": total_cards or 0,
                "publishedCards": published_cards or 0,
                "activeDrops": active_drops or 0,
                "redeemedCount": redeemed_count or 0,
            },
            "recentActivity": [
                {
                    "action": log.action,
                    "actorId": log.actor_user_id,
                    "entityType": log.entity_type,
                    "entityId": log.entity_id,
                }
                for log in recent_logs
            ],
        },
    }


@router.get("/cards")
async def cards(
    _: AdminUser,
    session: DbSession,
    q: str | None = None,
    card_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
) -> dict:
    filters = []
    if q:
        filters.append(Card.name.ilike(f"%{q}%"))
    if card_status:
        filters.append(Card.status == card_status)
    total = await session.scalar(select(func.count()).select_from(Card).where(*filters)) or 0
    results = await session.scalars(
        select(Card)
        .where(*filters)
        .order_by(Card.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        {
            "id": card.id,
            "name": card.name,
            "status": card.status,
            "rarity": card.rarity,
            "issueLimit": card.issue_limit,
            "imageAssetId": card.image_asset_id,
            "ownerArtistId": card.owner_artist_id,
        }
        for card in results
    ]
    return {
        "ok": True,
        "data": {
            "items": items,
            "meta": {"pagination": {"page": page, "pageSize": page_size, "total": total}},
        },
    }


@router.get("/drops")
async def list_drops(_: AdminUser, session: DbSession) -> dict:
    drops = await session.scalars(select(Drop).order_by(Drop.id.desc()))
    return {"ok": True, "data": {"items": [drop_data(drop) for drop in drops]}}


@router.get("/drops/{drop_id}")
async def get_drop(drop_id: str, _: AdminUser, session: DbSession) -> dict:
    drop = await session.get(Drop, drop_id)
    if not drop:
        raise AppError(404, "DROP_NOT_FOUND", "드롭을 찾을 수 없습니다.")
    return {"ok": True, "data": drop_data(drop)}


def admin_card_data(card: Card) -> dict:
    return {
        "id": card.id,
        "name": card.name,
        "status": card.status,
        "rarity": card.rarity,
        "seasonName": card.season_name,
        "templateId": card.template_id,
        "issueLimit": card.issue_limit,
        "imageAssetId": card.image_asset_id,
        "ownerArtistId": card.owner_artist_id,
        "artistId": card.artist_id,
        "memberId": card.member_id,
        "signatureText": card.signature_text,
        "handwritingAssetId": card.handwriting_asset_id,
        "voiceAssetId": card.voice_asset_id,
        "handwritingTransform": card.handwriting_transform,
        "hasVoice": card.has_voice,
        "sourceImageUrl": f"/api/admin/cards/{card.id}/image" if card.image_asset_id else None,
        "previewImageUrl": (
            f"/api/admin/cards/{card.id}/preview/image" if card.preview_storage_path else None
        ),
    }


async def validate_admin_assets(values: dict, session: DbSession) -> None:
    for field in ("image_asset_id", "handwriting_asset_id", "voice_asset_id"):
        asset_id = values.get(field)
        if asset_id and not await session.get(Asset, asset_id):
            raise AppError(404, "ASSET_NOT_FOUND", "카드 자산을 찾을 수 없습니다.")


async def resolve_admin_catalog_ids(
    *, artist_id: str | None, member_id: str | None, session: DbSession
) -> str | None:
    """Validate the catalog association for cards created by operations."""
    if artist_id is not None and not await session.get(Artist, artist_id):
        raise AppError(404, "ARTIST_NOT_FOUND", "선택한 그룹을 찾을 수 없습니다.")
    if member_id is None:
        return artist_id
    member = await session.get(Member, member_id)
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "선택한 멤버를 찾을 수 없습니다.")
    if artist_id is not None and artist_id != member.artist_id:
        raise AppError(422, "MEMBER_ARTIST_MISMATCH", "멤버와 그룹을 올바르게 선택해 주세요.")
    return member.artist_id


@router.get("/catalog")
async def admin_catalog(_: AdminUser, session: DbSession) -> dict:
    artists = (await session.scalars(select(Artist).order_by(Artist.name))).all()
    members = (await session.scalars(select(Member).order_by(Member.name))).all()
    return {
        "ok": True,
        "data": {
            "artists": [{"id": item.id, "name": item.name} for item in artists],
            "members": [
                {"id": item.id, "artistId": item.artist_id, "name": item.name} for item in members
            ],
        },
    }


@router.post("/cards", status_code=status.HTTP_201_CREATED)
async def create_admin_card(payload: AdminCardCreate, admin: AdminUser, session: DbSession) -> dict:
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    await validate_admin_assets(values, session)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_admin_catalog_ids(
            artist_id=values.get("artist_id"), member_id=values.get("member_id"), session=session
        )
    card = Card(id=f"card_{uuid4().hex[:10]}", **values)
    session.add(card)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="card.created",
        entity_type="card",
        entity_id=card.id,
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


@router.get("/cards/{card_id}")
async def card_detail(card_id: str, _: AdminUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    return {"ok": True, "data": admin_card_data(card)}


@router.patch("/cards/{card_id}")
async def update_admin_card(
    card_id: str,
    payload: AdminCardUpdate,
    admin: AdminUser,
    session: DbSession,
) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status == "published":
        raise AppError(
            409, "INVALID_CARD_STATUS", "공개된 카드는 운영 화면에서 수정할 수 없습니다."
        )
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    await validate_admin_assets(values, session)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_admin_catalog_ids(
            artist_id=values.get("artist_id", card.artist_id),
            member_id=values.get("member_id", card.member_id),
            session=session,
        )
    for field, value in values.items():
        setattr(card, field, value)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="card.updated",
        entity_type="card",
        entity_id=card.id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


@router.get("/cards/{card_id}/preview/image")
async def card_preview_image(card_id: str, _: AdminUser, session: DbSession) -> FileResponse:
    card = await session.get(Card, card_id)
    if not card or not card.preview_storage_path:
        raise AppError(404, "PREVIEW_NOT_READY", "카드 미리보기가 아직 준비되지 않았습니다.")
    return FileResponse(card.preview_storage_path, media_type="image/png")


@router.get("/cards/{card_id}/image")
async def card_source_image(card_id: str, _: AdminUser, session: DbSession) -> FileResponse:
    """Serve the uploaded source image to operators during card review."""
    card = await session.get(Card, card_id)
    if not card or not card.image_asset_id:
        raise AppError(404, "CARD_IMAGE_NOT_FOUND", "카드 원본 이미지를 찾을 수 없습니다.")
    asset = await session.get(Asset, card.image_asset_id)
    if not asset or not asset.storage_path:
        raise AppError(404, "CARD_IMAGE_NOT_READY", "카드 원본 이미지가 아직 준비되지 않았습니다.")
    return FileResponse(asset.storage_path, media_type=asset.content_type or "image/png")


@router.post("/cards/{card_id}/review")
async def review_card(
    card_id: str,
    payload: AdminCardReviewRequest,
    admin: AdminUser,
    session: DbSession,
) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status != "pending_review":
        raise AppError(409, "INVALID_REVIEW_STATUS", "검수 대기 중인 카드만 검수할 수 있습니다.")
    next_status = "approved" if payload.decision == "approve" else "changes_requested"
    action = "card.review_approved" if payload.decision == "approve" else "card.changes_requested"
    card.status = next_status
    await record_audit(
        session,
        actor_user_id=admin.id,
        action=action,
        entity_type="card",
        entity_id=card.id,
        details={"note": payload.note} if payload.note else {},
    )
    await session.commit()
    return {"ok": True, "data": {"id": card.id, "status": card.status}}


@router.post("/cards/{card_id}/approve")
async def approve_card(card_id: str, admin: AdminUser, session: DbSession) -> dict:
    return await review_card(
        card_id,
        AdminCardReviewRequest(decision="approve"),
        admin,
        session,
    )


@router.post("/drops", status_code=status.HTTP_201_CREATED)
async def create_drop(payload: DropCreateRequest, _: AdminUser, session: DbSession) -> dict:
    if payload.starts_at and payload.ends_at and payload.ends_at <= payload.starts_at:
        raise AppError(422, "INVALID_DROP_WINDOW", "종료 시각은 시작 시각보다 늦어야 합니다.")
    drop = Drop(
        id=f"drop_{uuid4().hex[:10]}",
        name=payload.name,
        status="draft",
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(drop)
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}


@router.patch("/drops/{drop_id}/status")
async def update_drop_status(
    drop_id: str, payload: DropStatusUpdate, admin: AdminUser, session: DbSession
) -> dict:
    drop = await session.get(Drop, drop_id)
    if not drop:
        raise AppError(404, "DROP_NOT_FOUND", "드롭을 찾을 수 없습니다.")
    previous_status = drop.status
    drop.status = payload.status
    if previous_status != "live" and payload.status == "live":
        await record_audit(
            session,
            actor_user_id=admin.id,
            action="drop.started",
            entity_type="drop",
            entity_id=drop.id,
            details={"previousStatus": previous_status},
        )
        await notify_fans(
            session,
            kind="drop_started",
            title="새 드롭이 시작되었어요",
            body=f"{drop.name}에서 새로운 공식 카드를 만나보세요.",
        )
    await session.commit()
    return {"ok": True, "data": {"id": drop.id, "status": drop.status}}


@router.patch("/drops/{drop_id}")
async def update_drop(
    drop_id: str,
    payload: DropUpdateRequest,
    _: AdminUser,
    session: DbSession,
) -> dict:
    drop = await session.get(Drop, drop_id)
    if not drop:
        raise AppError(404, "DROP_NOT_FOUND", "드롭을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    starts_at = values.get("starts_at", drop.starts_at)
    ends_at = values.get("ends_at", drop.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise AppError(422, "INVALID_DROP_WINDOW", "종료 시각은 시작 시각보다 늦어야 합니다.")
    for field, value in values.items():
        setattr(drop, field, value)
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}


@router.get("/users")
async def list_users(
    _: AdminUser,
    session: DbSession,
    q: str | None = None,
    role: Role | None = None,
) -> dict:
    filters = []
    if q:
        filters.append(User.email.ilike(f"%{q}%"))
    if role:
        filters.append(User.role == role)
    users = await session.scalars(select(User).where(*filters).order_by(User.email))
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": user.id,
                    "email": user.email,
                    "role": user.role.value,
                    "nickname": user.nickname,
                    "onboardingCompleted": user.onboarding_completed,
                }
                for user in users
            ]
        },
    }


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    payload: AdminUserRoleUpdate,
    admin: AdminUser,
    session: DbSession,
) -> dict:
    if user_id == admin.id:
        raise AppError(
            409, "CANNOT_CHANGE_OWN_ROLE", "현재 로그인한 관리자의 역할은 변경할 수 없습니다."
        )
    user = await session.get(User, user_id)
    if not user:
        raise AppError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.")
    new_role = Role(payload.role)
    if user.role == Role.ADMIN and new_role != Role.ADMIN:
        admin_count = await session.scalar(
            select(func.count()).select_from(User).where(User.role == Role.ADMIN)
        )
        if admin_count == 1:
            raise AppError(409, "LAST_ADMIN_REQUIRED", "최소 한 명의 관리자가 필요합니다.")
    previous_role = user.role.value
    user.role = new_role
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="user.role_changed",
        entity_type="user",
        entity_id=user.id,
        details={"previousRole": previous_role, "newRole": new_role.value},
    )
    await session.commit()
    return {"ok": True, "data": {"id": user.id, "role": user.role.value}}


@router.post("/redeem-code-batches", status_code=status.HTTP_201_CREATED)
async def code_batch(payload: CodeBatchRequest, _: AdminUser, session: DbSession) -> dict:
    drop = await session.get(Drop, payload.drop_id)
    card = await session.get(Card, payload.card_id)
    if not drop:
        raise AppError(404, "DROP_NOT_FOUND", "드롭을 찾을 수 없습니다.")
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if drop.status != "live":
        raise AppError(409, "DROP_NOT_LIVE", "진행 중인 드롭에만 코드를 발급할 수 있습니다.")
    if card.status != "published":
        raise AppError(409, "CARD_NOT_PUBLISHED", "공개된 카드에만 코드를 발급할 수 있습니다.")
    try:
        expires_at = datetime.fromisoformat(payload.expires_at)
    except ValueError as error:
        raise AppError(422, "INVALID_EXPIRY", "만료 시각 형식이 올바르지 않습니다.") from error
    batch_id = f"batch_{uuid4().hex[:8]}"
    batch = RedeemCodeBatch(
        id=batch_id,
        drop_id=payload.drop_id,
        card_id=payload.card_id,
        quantity=payload.quantity,
        max_uses_per_code=payload.max_uses_per_code,
        expires_at=payload.expires_at,
        prefix=payload.prefix,
    )
    session.add(batch)
    for _ in range(payload.quantity):
        session.add(
            RedeemCode(
                code=f"{payload.prefix}-{uuid4().hex[:10].upper()}",
                card_id=payload.card_id,
                drop_id=payload.drop_id,
                expires_at=expires_at,
                max_uses=payload.max_uses_per_code,
                batch_id=batch_id,
            )
        )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": batch_id,
            "quantity": payload.quantity,
            "maxUsesPerCode": payload.max_uses_per_code,
            "csvExportUrl": f"/api/admin/redeem-code-batches/{batch_id}/export",
            "qrZipUrl": f"/api/admin/redeem-code-batches/{batch_id}/qr.zip",
        },
    }


def redeem_code_status(code: RedeemCode) -> str:
    if code.disabled_at:
        return "disabled"
    expires_at = (
        code.expires_at.replace(tzinfo=UTC)
        if code.expires_at and code.expires_at.tzinfo is None
        else code.expires_at
    )
    if expires_at and expires_at <= datetime.now(UTC):
        return "expired"
    if code.used_count >= code.max_uses:
        return "exhausted"
    return "active"


@router.get("/redeem-code-batches")
async def list_code_batches(_: AdminUser, session: DbSession) -> dict:
    batches = await session.scalars(select(RedeemCodeBatch).order_by(RedeemCodeBatch.id.desc()))
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": batch.id,
                    "dropId": batch.drop_id,
                    "cardId": batch.card_id,
                    "quantity": batch.quantity,
                    "maxUsesPerCode": batch.max_uses_per_code,
                    "expiresAt": batch.expires_at,
                    "prefix": batch.prefix,
                    "csvExportUrl": f"/api/admin/redeem-code-batches/{batch.id}/export",
                    "qrZipUrl": f"/api/admin/redeem-code-batches/{batch.id}/qr.zip",
                }
                for batch in batches
            ]
        },
    }


@router.get("/redeem-code-batches/{batch_id}/export")
async def export_code_batch(batch_id: str, _: AdminUser, session: DbSession) -> StreamingResponse:
    batch = await session.get(RedeemCodeBatch, batch_id)
    if not batch:
        raise AppError(404, "BATCH_NOT_FOUND", "코드 배치를 찾을 수 없습니다.")
    codes = await session.scalars(
        select(RedeemCode).where(RedeemCode.batch_id == batch_id).order_by(RedeemCode.code)
    )
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        ["code", "card_id", "drop_id", "expires_at", "used_count", "max_uses", "qr_image_url"]
    )
    for code in codes:
        writer.writerow(
            [
                code.code,
                code.card_id,
                code.drop_id,
                batch.expires_at,
                code.used_count,
                code.max_uses,
                f"/api/admin/redeem-codes/{code.code}/qr",
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{batch_id}.csv"'},
    )


@router.get("/redeem-codes/{code_id}/qr")
async def redeem_code_qr(code_id: str, _: AdminUser, session: DbSession) -> Response:
    """Render a printable QR whose payload is the redeem code itself."""
    code = await session.get(RedeemCode, code_id)
    if not code:
        raise AppError(404, "REDEEM_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.")
    return Response(
        content=await asyncio.to_thread(qr_png_bytes, code.code),
        media_type="image/png",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/redeem-code-batches/{batch_id}/qr.zip")
async def redeem_code_batch_qr_zip(batch_id: str, _: AdminUser, session: DbSession) -> Response:
    """Package a batch's printable QR PNGs for production fulfillment."""
    batch = await session.get(RedeemCodeBatch, batch_id)
    if not batch:
        raise AppError(404, "BATCH_NOT_FOUND", "코드 배치를 찾을 수 없습니다.")
    codes = await session.scalars(
        select(RedeemCode).where(RedeemCode.batch_id == batch_id).order_by(RedeemCode.code)
    )
    code_values = [code.code for code in codes]
    archive = await asyncio.to_thread(qr_zip_bytes, code_values)
    return Response(
        content=archive,
        media_type="application/zip",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'attachment; filename="{batch_id}-qr.zip"',
        },
    )


@router.patch("/redeem-codes/{code_id}")
async def update_redeem_code(
    code_id: str,
    payload: RedeemCodeStatusUpdate,
    admin: AdminUser,
    session: DbSession,
) -> dict:
    code = await session.get(RedeemCode, code_id)
    if not code:
        raise AppError(404, "REDEEM_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.")
    if payload.status == "disabled":
        code.disabled_at = datetime.now(UTC)
    elif payload.status == "expired":
        code.disabled_at = None
        code.expires_at = datetime.now(UTC)
    else:
        code.disabled_at = None
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="redeem_code.status_changed",
        entity_type="redeem_code",
        entity_id=code.code,
        details={"status": payload.status},
    )
    await session.commit()
    return {"ok": True, "data": {"code": code.code, "status": redeem_code_status(code)}}


@router.get("/audit-logs")
async def audit_logs(
    _: AdminUser,
    session: DbSession,
    action: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> dict:
    filters = [AuditLog.action == action] if action else []
    logs = await session.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": log.id,
                    "actorId": log.actor_user_id,
                    "action": log.action,
                    "entityType": log.entity_type,
                    "entityId": log.entity_id,
                    "metadata": log.details,
                    "createdAt": log.created_at.isoformat(),
                }
                for log in logs
            ]
        },
    }


@router.post("/cards/{card_id}/publish")
async def publish(card_id: str, admin: AdminUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status == "pending_review":
        raise AppError(409, "REVIEW_REQUIRED", "검수 승인 후 카드를 공개할 수 있습니다.")
    previous_status = card.status
    card.status = "published"
    if previous_status != "published":
        await record_audit(
            session,
            actor_user_id=admin.id,
            action="card.published",
            entity_type="card",
            entity_id=card.id,
            details={"previousStatus": previous_status},
        )
        await notify_fans(
            session,
            kind="card_published",
            title="새 카드가 공개되었어요",
            body=f"{card.name} 카드를 확인해보세요.",
        )
    await session.commit()
    return {"ok": True, "data": {"id": card.id, "status": card.status}}
