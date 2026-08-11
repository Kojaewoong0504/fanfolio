import asyncio
import csv
from datetime import UTC, datetime
from io import BytesIO, StringIO
from secrets import token_urlsafe
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import qrcode
from fastapi import APIRouter, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, or_, select, update

from app.admin_access import AdminContext
from app.dependencies import CurrentAdmin, DbSession, RootAdminUser
from app.errors import AppError
from app.models import (
    AdminMembership,
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    Card,
    CollectionCampaign,
    Drop,
    Member,
    OrganizationArtist,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    Role,
    User,
)
from app.passwords import hash_password
from app.routers.admin_partners import router as partner_router
from app.schemas import (
    AdminAccountCreate,
    AdminArtistProfileUpdate,
    AdminArtistUpdate,
    AdminCardCreate,
    AdminCardReviewRequest,
    AdminCardUpdate,
    AdminUserRoleUpdate,
    ArtistAccountCreate,
    ArtistReviewSubmitRequest,
    CodeBatchRequest,
    CollectionCampaignCreate,
    CollectionCampaignUpdate,
    DropCreateRequest,
    DropStatusUpdate,
    DropUpdateRequest,
    RedeemCodeStatusUpdate,
)
from app.services import notify_fans, record_audit
from app.storage import configured_asset_storage, storage_response

router = APIRouter(prefix="/api/admin", tags=["admin"])
router.include_router(partner_router)
LENTICULAR_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


@router.get("/me")
async def admin_me(context: CurrentAdmin, session: DbSession) -> dict:
    artists = []
    if context.assigned_artist_ids:
        rows = await session.scalars(
            select(Artist).where(Artist.id.in_(context.assigned_artist_ids)).order_by(Artist.name)
        )
        artists = [
            {"id": artist.id, "name": artist.name, "imageUrl": artist.image_url} for artist in rows
        ]
    organization = None
    if context.organization is not None:
        organization = {
            "id": context.organization.id,
            "name": context.organization.name,
            "slug": context.organization.slug,
            "status": context.organization.status,
            "logoUrl": context.organization.logo_url,
        }
    return {
        "ok": True,
        "data": {
            "user": {
                "id": context.user.id,
                "email": context.user.email,
                "displayName": context.membership.display_name,
            },
            "accessLevel": context.membership.access_level,
            "status": context.membership.status,
            "organization": organization,
            "assignedArtists": artists,
            "allowedActions": sorted(context.allowed_actions),
        },
    }


def drop_data(drop: Drop) -> dict:
    return {
        "id": drop.id,
        "name": drop.name,
        "status": drop.status,
        "organizationId": drop.organization_id,
        "artistId": drop.artist_id,
        "startsAt": drop.starts_at.isoformat() if drop.starts_at else None,
        "endsAt": drop.ends_at.isoformat() if drop.ends_at else None,
    }


def _require_scoped_action(context: AdminContext, action: str) -> None:
    if not context.is_root:
        context.require_action(action)


async def _organization_artist_or_404(
    session: DbSession,
    context: AdminContext,
    organization_id: str,
    artist_id: str,
) -> None:
    organization_artist = await session.scalar(
        select(OrganizationArtist).where(
            OrganizationArtist.organization_id == organization_id,
            OrganizationArtist.artist_id == artist_id,
        )
    )
    if organization_artist is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if (
        not context.is_root
        and context.membership.access_level != "company_admin"
        and artist_id not in context.assigned_artist_ids
    ):
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")


async def scoped_drop_or_404(
    drop_id: str,
    context: AdminContext,
    session: DbSession,
) -> Drop:
    drop = await session.get(Drop, drop_id)
    if drop is None:
        raise AppError(404, "DROP_NOT_FOUND", "드롭을 찾을 수 없습니다.")
    if context.is_root:
        return drop
    if (
        context.organization is None
        or drop.organization_id != context.organization.id
        or drop.artist_id is None
    ):
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    await _organization_artist_or_404(session, context, drop.organization_id, drop.artist_id)
    return drop


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


def collection_campaign_data(campaign: CollectionCampaign) -> dict:
    return {
        "id": campaign.id,
        "name": campaign.name,
        "artistId": campaign.artist_id,
        "seasonName": campaign.season_name,
        "requiredCardIds": campaign.required_card_ids,
        "benefitTitle": campaign.benefit_title,
        "benefitDescription": campaign.benefit_description,
        "benefitAssetId": campaign.benefit_asset_id,
        "benefitDownloadAvailable": bool(campaign.benefit_asset_id),
        "status": campaign.status,
    }


async def validate_campaign_cards(card_ids: list[str], session: DbSession) -> None:
    if len(card_ids) != len(set(card_ids)):
        raise AppError(422, "DUPLICATE_CAMPAIGN_CARD", "캠페인 카드 목록에 중복 카드가 있습니다.")
    cards = await session.scalars(select(Card).where(Card.id.in_(card_ids)))
    if len(cards.all()) != len(card_ids):
        raise AppError(404, "CARD_NOT_FOUND", "캠페인에 포함할 카드를 찾을 수 없습니다.")


@router.get("/collection-campaigns")
async def list_collection_campaigns(_: RootAdminUser, session: DbSession) -> dict:
    campaigns = await session.scalars(
        select(CollectionCampaign).order_by(CollectionCampaign.status, CollectionCampaign.name)
    )
    return {"ok": True, "data": {"items": [collection_campaign_data(item) for item in campaigns]}}


@router.post("/collection-campaigns", status_code=status.HTTP_201_CREATED)
async def create_collection_campaign(
    payload: CollectionCampaignCreate, admin: RootAdminUser, session: DbSession
) -> dict:
    await validate_campaign_cards(payload.required_card_ids, session)
    await validate_admin_assets(payload.model_dump(exclude_unset=True, by_alias=False), session)
    campaign = CollectionCampaign(
        id=f"campaign_{uuid4().hex[:10]}",
        **payload.model_dump(exclude_unset=True, by_alias=False),
    )
    session.add(campaign)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="collection_campaign.created",
        entity_type="collection_campaign",
        entity_id=campaign.id,
    )
    await session.commit()
    return {"ok": True, "data": collection_campaign_data(campaign)}


@router.patch("/collection-campaigns/{campaign_id}")
async def update_collection_campaign(
    campaign_id: str,
    payload: CollectionCampaignUpdate,
    admin: RootAdminUser,
    session: DbSession,
) -> dict:
    campaign = await session.get(CollectionCampaign, campaign_id)
    if not campaign:
        raise AppError(404, "CAMPAIGN_NOT_FOUND", "특전 캠페인을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    if "required_card_ids" in values:
        await validate_campaign_cards(values["required_card_ids"], session)
    await validate_admin_assets(values, session)
    for field, value in values.items():
        setattr(campaign, field, value)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="collection_campaign.updated",
        entity_type="collection_campaign",
        entity_id=campaign.id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": collection_campaign_data(campaign)}


@router.get("/dashboard")
async def dashboard(context: CurrentAdmin, session: DbSession) -> dict:
    card_filters = [] if context.is_root else [Card.artist_id.in_(context.assigned_artist_ids)]
    total_cards = await session.scalar(select(func.count()).select_from(Card).where(*card_filters))
    published_cards = await session.scalar(
        select(func.count()).select_from(Card).where(*card_filters, Card.status == "published")
    )
    active_drops = 0
    redeemed_count = 0
    if context.is_root:
        active_drops = await session.scalar(
            select(func.count()).select_from(Drop).where(Drop.status == "live")
        )
        redeemed_count = await session.scalar(
            select(func.coalesce(func.sum(RedeemCode.used_count), 0))
        )
    audit_filters = []
    if not context.is_root:
        audit_filters.extend(
            [
                AuditLog.organization_id == context.membership.organization_id,
                or_(
                    AuditLog.artist_id.is_(None),
                    AuditLog.artist_id.in_(context.assigned_artist_ids),
                ),
            ]
        )
    recent_logs = (
        await session.scalars(
            select(AuditLog)
            .where(*audit_filters)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(5)
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
    context: CurrentAdmin,
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
    if not context.is_root:
        filters.append(Card.artist_id.in_(context.assigned_artist_ids))
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
            "artistId": card.artist_id,
            "memberId": card.member_id,
            "seasonName": card.season_name,
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
async def list_drops(context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "drops:read")
    statement = select(Drop).order_by(Drop.id.desc())
    if not context.is_root:
        statement = statement.where(Drop.organization_id == context.membership.organization_id)
        if context.membership.access_level != "company_admin":
            statement = statement.where(Drop.artist_id.in_(context.assigned_artist_ids))
    drops = await session.scalars(statement)
    return {"ok": True, "data": {"items": [drop_data(drop) for drop in drops]}}


@router.get("/drops/{drop_id}")
async def get_drop(drop_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "drops:read")
    drop = await scoped_drop_or_404(drop_id, context, session)
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
        "videoAssetId": card.video_asset_id,
        "designConfig": card.design_config,
        "reviewNote": card.review_note,
        "handwritingTransform": card.handwriting_transform,
        "hasVoice": card.has_voice,
        "sourceImageUrl": f"/api/admin/cards/{card.id}/image" if card.image_asset_id else None,
        "previewImageUrl": (
            f"/api/admin/cards/{card.id}/preview/image" if card.preview_storage_path else None
        ),
    }


async def validate_admin_assets(
    values: dict,
    session: DbSession,
    *,
    context: AdminContext | None = None,
) -> None:
    storage = None
    for field in (
        "image_asset_id",
        "handwriting_asset_id",
        "voice_asset_id",
        "video_asset_id",
        "benefit_asset_id",
    ):
        asset_id = values.get(field)
        if not asset_id:
            continue
        asset = await session.get(Asset, asset_id)
        if not asset or (
            context is not None and not context.is_root and asset.owner_id != context.user.id
        ):
            raise AppError(404, "ASSET_NOT_FOUND", "카드 자산을 찾을 수 없습니다.")
        if asset.storage_path:
            if storage is None:
                storage = configured_asset_storage()
            if not storage.exists(asset.storage_path):
                raise AppError(409, "ASSET_NOT_READY", "업로드된 자산이 아직 준비되지 않았습니다.")

    design_config = values.get("design_config")
    if not design_config:
        return
    front = design_config.get("front") if isinstance(design_config, dict) else None
    if not isinstance(front, dict) or "lenticularAssetId" not in front:
        return
    lenticular_asset_id = front["lenticularAssetId"]
    if lenticular_asset_id is None:
        return
    if not isinstance(lenticular_asset_id, str) or not lenticular_asset_id:
        raise AppError(
            422,
            "INVALID_LENTICULAR_ASSET",
            "렌티큘러 이미지 자산 정보를 확인해 주세요.",
        )
    asset = await session.get(Asset, lenticular_asset_id)
    if not asset or (
        context is not None and not context.is_root and asset.owner_id != context.user.id
    ):
        raise AppError(404, "ASSET_NOT_FOUND", "카드 자산을 찾을 수 없습니다.")
    if asset.purpose != "card" or asset.content_type not in LENTICULAR_IMAGE_CONTENT_TYPES:
        raise AppError(
            422,
            "INVALID_LENTICULAR_ASSET",
            "렌티큘러 이미지 자산 정보를 확인해 주세요.",
        )
    path = asset.processed_storage_path or asset.storage_path
    if not path:
        raise AppError(409, "ASSET_NOT_READY", "업로드된 자산이 아직 준비되지 않았습니다.")
    if storage is None:
        storage = configured_asset_storage()
    if not storage.exists(path):
        raise AppError(409, "ASSET_NOT_READY", "업로드된 자산이 아직 준비되지 않았습니다.")


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
async def admin_catalog(context: CurrentAdmin, session: DbSession) -> dict:
    artist_query = select(Artist).order_by(Artist.name)
    member_query = select(Member).order_by(Member.name)
    if not context.is_root:
        artist_query = artist_query.where(Artist.id.in_(context.assigned_artist_ids))
        member_query = member_query.where(Member.artist_id.in_(context.assigned_artist_ids))
    artists = (await session.scalars(artist_query)).all()
    members = (await session.scalars(member_query)).all()
    return {
        "ok": True,
        "data": {
            "artists": [{"id": item.id, "name": item.name} for item in artists],
            "members": [
                {"id": item.id, "artistId": item.artist_id, "name": item.name} for item in members
            ],
        },
    }


@router.patch("/artists/{artist_id}")
async def update_admin_artist(
    artist_id: str,
    payload: AdminArtistUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("artists:write")
    context.require_artist(artist_id)
    artist = await session.get(Artist, artist_id)
    if artist is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "아티스트를 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    for field, value in values.items():
        setattr(artist, field, value)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="artist.updated",
        entity_type="artist",
        entity_id=artist.id,
        organization_id=context.membership.organization_id,
        artist_id=artist.id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {"id": artist.id, "name": artist.name, "imageUrl": artist.image_url},
    }


@router.post("/cards", status_code=status.HTTP_201_CREATED)
async def create_admin_card(
    payload: AdminCardCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_write()
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    await validate_admin_assets(values, session, context=context)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_admin_catalog_ids(
            artist_id=values.get("artist_id"), member_id=values.get("member_id"), session=session
        )
    if not context.is_root:
        values["artist_id"] = context.require_artist(values.get("artist_id"))
    card = Card(id=f"card_{uuid4().hex[:10]}", **values)
    session.add(card)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card.created",
        entity_type="card",
        entity_id=card.id,
        organization_id=context.membership.organization_id,
        artist_id=card.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


@router.get("/cards/{card_id}")
async def card_detail(card_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_artist(card.artist_id)
    return {"ok": True, "data": admin_card_data(card)}


@router.patch("/cards/{card_id}")
async def update_admin_card(
    card_id: str,
    payload: AdminCardUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_artist(card.artist_id)
    context.require_write()
    if card.status == "published":
        raise AppError(
            409, "INVALID_CARD_STATUS", "공개된 카드는 운영 화면에서 수정할 수 없습니다."
        )
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    await validate_admin_assets(values, session, context=context)
    if "artist_id" in values or "member_id" in values:
        values["artist_id"] = await resolve_admin_catalog_ids(
            artist_id=values.get("artist_id", card.artist_id),
            member_id=values.get("member_id", card.member_id),
            session=session,
        )
    if not context.is_root:
        values["artist_id"] = context.require_artist(values.get("artist_id", card.artist_id))
    for field, value in values.items():
        setattr(card, field, value)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card.updated",
        entity_type="card",
        entity_id=card.id,
        organization_id=context.membership.organization_id,
        artist_id=card.artist_id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


@router.get("/cards/{card_id}/preview/image")
async def card_preview_image(card_id: str, context: CurrentAdmin, session: DbSession) -> Response:
    card = await session.get(Card, card_id)
    if not card or not card.preview_storage_path:
        raise AppError(404, "PREVIEW_NOT_READY", "카드 미리보기가 아직 준비되지 않았습니다.")
    context.require_artist(card.artist_id)
    return storage_response(
        configured_asset_storage(), card.preview_storage_path, media_type="image/png"
    )


@router.get("/cards/{card_id}/image")
async def card_source_image(card_id: str, context: CurrentAdmin, session: DbSession) -> Response:
    """Serve the uploaded source image to operators during card review."""
    card = await session.get(Card, card_id)
    if not card or not card.image_asset_id:
        raise AppError(404, "CARD_IMAGE_NOT_FOUND", "카드 원본 이미지를 찾을 수 없습니다.")
    context.require_artist(card.artist_id)
    asset = await session.get(Asset, card.image_asset_id)
    if not asset or not asset.storage_path:
        raise AppError(404, "CARD_IMAGE_NOT_READY", "카드 원본 이미지가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), asset.storage_path, media_type=asset.content_type or "image/png"
    )


@router.post("/cards/{card_id}/submit-review")
async def submit_admin_card_review(
    card_id: str,
    context: CurrentAdmin,
    session: DbSession,
    payload: ArtistReviewSubmitRequest | None = None,
) -> dict:
    context.require_action("cards:submit_review")
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_artist(card.artist_id)
    if card.status not in {"draft", "changes_requested"}:
        raise AppError(409, "INVALID_CARD_STATUS", "검수 요청할 수 없는 상태입니다.")
    card.review_note = payload.review_note if payload else None
    card.status = "pending_review"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card.review_submitted",
        entity_type="card",
        entity_id=card.id,
        organization_id=context.membership.organization_id,
        artist_id=card.artist_id,
        details={"reviewNote": card.review_note},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": card.id,
            "status": card.status,
            "reviewNote": card.review_note,
        },
    }


@router.post("/cards/{card_id}/review")
async def review_card(
    card_id: str,
    payload: AdminCardReviewRequest,
    admin: RootAdminUser,
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
async def approve_card(card_id: str, admin: RootAdminUser, session: DbSession) -> dict:
    return await review_card(
        card_id,
        AdminCardReviewRequest(decision="approve"),
        admin,
        session,
    )


@router.post("/drops", status_code=status.HTTP_201_CREATED)
async def create_drop(
    payload: DropCreateRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_scoped_action(context, "drops:write")
    if payload.starts_at and payload.ends_at and payload.ends_at <= payload.starts_at:
        raise AppError(422, "INVALID_DROP_WINDOW", "종료 시각은 시작 시각보다 늦어야 합니다.")
    organization_id = payload.organization_id
    artist_id = payload.artist_id
    if not context.is_root:
        organization_id = context.membership.organization_id
        if artist_id is None:
            raise AppError(422, "ARTIST_REQUIRED", "아티스트를 선택해 주세요.")
    elif bool(organization_id) != bool(artist_id):
        raise AppError(422, "DROP_SCOPE_REQUIRED", "조직과 아티스트 범위를 함께 선택해 주세요.")
    if organization_id and artist_id:
        await _organization_artist_or_404(session, context, organization_id, artist_id)
    drop = Drop(
        id=f"drop_{uuid4().hex[:10]}",
        name=payload.name,
        status="draft",
        organization_id=organization_id,
        artist_id=artist_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(drop)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="drop.created",
        entity_type="drop",
        entity_id=drop.id,
        organization_id=drop.organization_id,
        artist_id=drop.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}


@router.patch("/drops/{drop_id}/status")
async def update_drop_status(
    drop_id: str, payload: DropStatusUpdate, admin: RootAdminUser, session: DbSession
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
            organization_id=drop.organization_id,
            artist_id=drop.artist_id,
        )
        await notify_fans(
            session,
            kind="drop_started",
            title="새 드롭이 시작되었어요",
            body=f"{drop.name}에서 새로운 공식 카드를 만나보세요.",
        )
    await session.commit()
    return {"ok": True, "data": {"id": drop.id, "status": drop.status}}


@router.post("/drops/{drop_id}/submit")
async def submit_drop(drop_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "drops:submit")
    drop = await scoped_drop_or_404(drop_id, context, session)
    if drop.status != "draft":
        raise AppError(409, "INVALID_DROP_STATUS", "초안 드롭만 발행 요청할 수 있습니다.")
    drop.status = "pending_review"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="drop.submitted",
        entity_type="drop",
        entity_id=drop.id,
        organization_id=drop.organization_id,
        artist_id=drop.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}


@router.patch("/drops/{drop_id}")
async def update_drop(
    drop_id: str,
    payload: DropUpdateRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "drops:write")
    drop = await scoped_drop_or_404(drop_id, context, session)
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    starts_at = values.get("starts_at", drop.starts_at)
    ends_at = values.get("ends_at", drop.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise AppError(422, "INVALID_DROP_WINDOW", "종료 시각은 시작 시각보다 늦어야 합니다.")
    for field, value in values.items():
        setattr(drop, field, value)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="drop.updated",
        entity_type="drop",
        entity_id=drop.id,
        organization_id=drop.organization_id,
        artist_id=drop.artist_id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}


@router.get("/users")
async def list_users(
    admin: RootAdminUser,
    session: DbSession,
    q: str | None = None,
    role: Role | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
) -> dict:
    filters = []
    if q:
        filters.append(User.email.ilike(f"%{q}%"))
    if role:
        filters.append(User.role == role)
    total = await session.scalar(select(func.count()).select_from(User).where(*filters))
    users = await session.scalars(
        select(User)
        .where(*filters)
        .order_by(User.email)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": user.id,
                    "email": user.email,
                    "profileImageUrl": user.profile_image_url,
                    "role": user.role.value,
                    "nickname": user.nickname,
                    "onboardingCompleted": user.onboarding_completed,
                    "isCurrentUser": user.id == admin.id,
                }
                for user in users
            ],
            "meta": {
                "pagination": {
                    "page": page,
                    "pageSize": page_size,
                    "total": total or 0,
                }
            },
        },
    }


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    payload: AdminUserRoleUpdate,
    admin: RootAdminUser,
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


@router.post("/artist-accounts", status_code=status.HTTP_201_CREATED)
async def create_artist_account(
    payload: ArtistAccountCreate,
    admin: RootAdminUser,
    session: DbSession,
) -> dict:
    username = payload.username.lower()
    existing = await session.scalar(select(User).where(User.username == username))
    if existing:
        raise AppError(409, "USERNAME_TAKEN", "이미 사용 중인 아이디입니다.")
    temporary_password = token_urlsafe(18)
    user = User(
        id=f"artist_{uuid4().hex[:12]}",
        username=username,
        nickname=payload.display_name,
        role=Role.ARTIST,
        password_hash=hash_password(temporary_password),
        must_change_password=True,
    )
    session.add(user)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="artist_account.created",
        entity_type="user",
        entity_id=user.id,
        details={"username": username},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": user.id,
            "username": username,
            "displayName": user.nickname,
            "role": user.role.value,
            "mustChangePassword": True,
            # Returned only at creation time; it is never persisted in plaintext.
            "temporaryPassword": temporary_password,
        },
    }


def artist_account_data(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.nickname,
        "mustChangePassword": user.must_change_password,
    }


@router.get("/artist-accounts")
async def list_artist_accounts(_: RootAdminUser, session: DbSession) -> dict:
    users = await session.scalars(
        select(User).where(User.role == Role.ARTIST).order_by(User.username)
    )
    return {
        "ok": True,
        "data": {"items": [artist_account_data(user) for user in users]},
    }


@router.post("/artist-accounts/{user_id}/reset-password")
async def reset_artist_account_password(
    user_id: str,
    admin: RootAdminUser,
    session: DbSession,
) -> dict:
    user = await session.get(User, user_id)
    if user is None or user.role != Role.ARTIST:
        raise AppError(404, "ARTIST_ACCOUNT_NOT_FOUND", "아티스트 계정을 찾을 수 없습니다.")

    temporary_password = token_urlsafe(18)
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.client == "artist",
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="artist_account.password_reset",
        entity_type="user",
        entity_id=user.id,
        details={"username": user.username},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            **artist_account_data(user),
            # Returned once; only the hash is stored in the database.
            "temporaryPassword": temporary_password,
        },
    }


@router.post("/admin-accounts", status_code=status.HTTP_201_CREATED)
async def create_admin_account(
    payload: AdminAccountCreate,
    admin: RootAdminUser,
    session: DbSession,
) -> dict:
    email = str(payload.email).lower()
    existing = await session.scalar(
        select(User).where(User.email == email, User.role == Role.ADMIN)
    )
    if existing:
        raise AppError(409, "EMAIL_TAKEN", "이미 등록된 이메일입니다.")
    temporary_password = token_urlsafe(18)
    user = User(
        id=f"admin_{uuid4().hex[:12]}",
        email=email,
        nickname=payload.display_name,
        role=Role.ADMIN,
        password_hash=hash_password(temporary_password),
        must_change_password=True,
    )
    session.add(user)
    await session.flush()
    session.add(
        AdminMembership(
            user_id=user.id,
            organization_id=None,
            access_level="root",
            status="active",
            display_name=payload.display_name,
            created_by_user_id=admin.id,
        )
    )
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="admin_account.created",
        entity_type="user",
        entity_id=user.id,
        details={"email": email},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": user.id,
            "email": email,
            "displayName": user.nickname,
            "role": user.role.value,
            "mustChangePassword": True,
            "temporaryPassword": temporary_password,
        },
    }


def artist_profile_data(user: User, profile: ArtistProfile | None, artist: Artist | None) -> dict:
    return {
        "userId": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "artistId": profile.artist_id if profile else None,
        "artistName": artist.name if artist else None,
        "verificationStatus": profile.verification_status if profile else "pending",
    }


@router.get("/artist-profiles")
async def list_artist_profiles(_: RootAdminUser, session: DbSession) -> dict:
    rows = (
        await session.execute(
            select(User, ArtistProfile, Artist)
            .outerjoin(ArtistProfile, ArtistProfile.user_id == User.id)
            .outerjoin(Artist, Artist.id == ArtistProfile.artist_id)
            .where(User.role == Role.ARTIST)
            .order_by(User.email)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [artist_profile_data(user, profile, artist) for user, profile, artist in rows]
        },
    }


@router.patch("/artist-profiles/{user_id}")
async def review_artist_profile(
    user_id: str,
    payload: AdminArtistProfileUpdate,
    admin: RootAdminUser,
    session: DbSession,
) -> dict:
    user = await session.get(User, user_id)
    if not user:
        raise AppError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.")
    if user.role != Role.ARTIST:
        raise AppError(409, "USER_NOT_ARTIST", "아티스트 계정만 소속을 검수할 수 있습니다.")
    artist = await session.get(Artist, payload.artist_id)
    if not artist:
        raise AppError(404, "ARTIST_NOT_FOUND", "선택한 그룹을 찾을 수 없습니다.")
    profile = await session.get(ArtistProfile, user.id)
    previous_status = profile.verification_status if profile else "pending"
    if profile:
        profile.artist_id = payload.artist_id
        profile.verification_status = payload.verification_status
    else:
        profile = ArtistProfile(
            user_id=user.id,
            artist_id=payload.artist_id,
            verification_status=payload.verification_status,
        )
        session.add(profile)
    await record_audit(
        session,
        actor_user_id=admin.id,
        action="artist_profile.reviewed",
        entity_type="artist_profile",
        entity_id=user.id,
        details={
            "previousStatus": previous_status,
            "newStatus": payload.verification_status,
            "artistId": payload.artist_id,
        },
    )
    await session.commit()
    return {"ok": True, "data": artist_profile_data(user, profile, artist)}


async def scoped_code_batch_or_404(
    batch_id: str,
    context: AdminContext,
    session: DbSession,
) -> RedeemCodeBatch:
    batch = await session.get(RedeemCodeBatch, batch_id)
    if batch is None:
        raise AppError(404, "BATCH_NOT_FOUND", "코드 배치를 찾을 수 없습니다.")
    await scoped_drop_or_404(batch.drop_id, context, session)
    return batch


async def scoped_redeem_code_or_404(
    code_id: str,
    context: AdminContext,
    session: DbSession,
) -> RedeemCode:
    code = await session.get(RedeemCode, code_id)
    if code is None:
        raise AppError(404, "REDEEM_CODE_NOT_FOUND", "코드를 찾을 수 없습니다.")
    await scoped_drop_or_404(code.drop_id, context, session)
    return code


@router.post("/redeem-code-batches", status_code=status.HTTP_201_CREATED)
async def code_batch(payload: CodeBatchRequest, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "codes:write")
    drop = await scoped_drop_or_404(payload.drop_id, context, session)
    card = await session.get(Card, payload.card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if not context.is_root and card.artist_id != drop.artist_id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
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
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="redeem_code_batch.created",
        entity_type="redeem_code_batch",
        entity_id=batch.id,
        organization_id=drop.organization_id,
        artist_id=drop.artist_id,
        details={"quantity": payload.quantity, "cardId": card.id},
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
async def list_code_batches(context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "codes:read")
    statement = (
        select(RedeemCodeBatch)
        .join(Drop, RedeemCodeBatch.drop_id == Drop.id)
        .order_by(RedeemCodeBatch.id.desc())
    )
    if not context.is_root:
        statement = statement.where(Drop.organization_id == context.membership.organization_id)
        if context.membership.access_level != "company_admin":
            statement = statement.where(Drop.artist_id.in_(context.assigned_artist_ids))
    batches = await session.scalars(statement)
    usage_rows = (
        await session.execute(
            select(
                RedeemCode.batch_id,
                func.count(RedeemCode.code),
                func.coalesce(func.sum(RedeemCode.used_count), 0),
            )
            .where(RedeemCode.batch_id.is_not(None))
            .group_by(RedeemCode.batch_id)
        )
    ).all()
    usage = {
        batch_id: {"codeCount": count, "usedCount": used_count}
        for batch_id, count, used_count in usage_rows
    }
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
                    "codeCount": usage.get(batch.id, {}).get("codeCount", 0),
                    "usedCount": usage.get(batch.id, {}).get("usedCount", 0),
                    "csvExportUrl": f"/api/admin/redeem-code-batches/{batch.id}/export",
                    "qrZipUrl": f"/api/admin/redeem-code-batches/{batch.id}/qr.zip",
                }
                for batch in batches
            ]
        },
    }


@router.get("/redeem-code-batches/{batch_id}/export")
async def export_code_batch(
    batch_id: str, context: CurrentAdmin, session: DbSession
) -> StreamingResponse:
    _require_scoped_action(context, "codes:read")
    batch = await scoped_code_batch_or_404(batch_id, context, session)
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


@router.get("/redeem-code-batches/{batch_id}/codes")
async def list_redeem_codes(
    batch_id: str,
    context: CurrentAdmin,
    session: DbSession,
    code_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """Return an operator-facing page of codes so individual codes can be disabled.

    The CSV remains the bulk-fulfillment format. This small paginated view is for
    operational exceptions such as a damaged or leaked physical card. Raw codes
    are intentionally available only behind the admin role, just like the CSV.
    """
    _require_scoped_action(context, "codes:read")
    await scoped_code_batch_or_404(batch_id, context, session)
    if code_status not in {None, "active", "disabled", "expired", "exhausted"}:
        raise AppError(422, "INVALID_CODE_STATUS", "코드 상태가 올바르지 않습니다.")

    codes = await session.scalars(
        select(RedeemCode).where(RedeemCode.batch_id == batch_id).order_by(RedeemCode.code)
    )
    filtered = [
        code for code in codes if code_status is None or redeem_code_status(code) == code_status
    ]
    page = filtered[offset : offset + limit]
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "code": code.code,
                    "status": redeem_code_status(code),
                    "usedCount": code.used_count,
                    "maxUses": code.max_uses,
                    "expiresAt": (
                        code.expires_at.replace(tzinfo=UTC).isoformat()
                        if code.expires_at and code.expires_at.tzinfo is None
                        else code.expires_at.isoformat()
                        if code.expires_at
                        else None
                    ),
                    "qrUrl": f"/api/admin/redeem-codes/{code.code}/qr",
                }
                for code in page
            ],
            "total": len(filtered),
            "limit": limit,
            "offset": offset,
        },
    }


@router.get("/redeem-codes/{code_id}/qr")
async def redeem_code_qr(code_id: str, context: CurrentAdmin, session: DbSession) -> Response:
    """Render a printable QR whose payload is the redeem code itself."""
    _require_scoped_action(context, "codes:read")
    code = await scoped_redeem_code_or_404(code_id, context, session)
    return Response(
        content=await asyncio.to_thread(qr_png_bytes, code.code),
        media_type="image/png",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/redeem-code-batches/{batch_id}/qr.zip")
async def redeem_code_batch_qr_zip(
    batch_id: str, context: CurrentAdmin, session: DbSession
) -> Response:
    """Package a batch's printable QR PNGs for production fulfillment."""
    _require_scoped_action(context, "codes:read")
    await scoped_code_batch_or_404(batch_id, context, session)
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
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "codes:write")
    code = await scoped_redeem_code_or_404(code_id, context, session)
    if payload.status == "disabled":
        code.disabled_at = datetime.now(UTC)
    elif payload.status == "expired":
        code.disabled_at = None
        code.expires_at = datetime.now(UTC)
    else:
        code.disabled_at = None
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="redeem_code.status_changed",
        entity_type="redeem_code",
        entity_id=code.code,
        organization_id=(await session.get(Drop, code.drop_id)).organization_id,
        artist_id=(await session.get(Drop, code.drop_id)).artist_id,
        details={"status": payload.status},
    )
    await session.commit()
    return {"ok": True, "data": {"code": code.code, "status": redeem_code_status(code)}}


@router.get("/audit-logs")
async def audit_logs(
    context: CurrentAdmin,
    session: DbSession,
    action: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, alias="pageSize", ge=1, le=100),
) -> dict:
    filters = [AuditLog.action == action] if action else []
    if not context.is_root:
        filters.extend(
            [
                AuditLog.organization_id == context.membership.organization_id,
                or_(
                    AuditLog.artist_id.is_(None),
                    AuditLog.artist_id.in_(context.assigned_artist_ids),
                ),
            ]
        )
    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(
                AuditLog.actor_user_id.ilike(pattern),
                AuditLog.action.ilike(pattern),
                AuditLog.entity_type.ilike(pattern),
                AuditLog.entity_id.ilike(pattern),
            )
        )
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*filters))
    logs = await session.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
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
                    "organizationId": log.organization_id,
                    "artistId": log.artist_id,
                    "metadata": log.details,
                    "createdAt": log.created_at.isoformat(),
                }
                for log in logs
            ],
            "meta": {
                "pagination": {
                    "page": page,
                    "pageSize": page_size,
                    "total": total or 0,
                }
            },
        },
    }


@router.post("/cards/{card_id}/publish")
async def publish(card_id: str, admin: RootAdminUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.status == "pending_review" or (
        card.status == "draft" and card.owner_artist_id is not None
    ):
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
