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
    AchievementDefinition,
    AdminMembership,
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    Card,
    CollectionCampaign,
    Drop,
    EngagementEvent,
    Member,
    Notification,
    OrganizationArtist,
    PassSeason,
    PassTier,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    RewardCatalog,
    RewardGrant,
    Role,
    User,
    UserCard,
    XpLedger,
)
from app.passwords import hash_password
from app.routers.admin_partners import router as partner_router
from app.schemas import (
    AchievementDefinitionCreate,
    AdminAccountCreate,
    AdminArtistProfileUpdate,
    AdminArtistUpdate,
    AdminCardCreate,
    AdminCardReleaseDecisionRequest,
    AdminCardReviewRequest,
    AdminCardUpdate,
    AdminNotificationReadRequest,
    AdminUserRoleUpdate,
    ArtistAccountCreate,
    ArtistReviewSubmitRequest,
    CodeBatchRequest,
    CollectionCampaignCreate,
    CollectionCampaignUpdate,
    DropCardLinkRequest,
    DropCreateRequest,
    DropStatusUpdate,
    DropUpdateRequest,
    PassSeasonCreate,
    RedeemCodeStatusUpdate,
    RewardCatalogCreate,
)
from app.services import (
    active_review_request,
    create_review_request,
    notify_fans,
    notify_platform_reviewers,
    record_audit,
    record_review_decision,
    release_card_data,
    submit_card_for_release_review,
)
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


def notification_data(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "isRead": notification.is_read,
        "createdAt": notification.created_at.isoformat(),
        "entityType": notification.entity_type,
        "entityId": notification.entity_id,
        "eventKey": notification.event_key,
    }


@router.get("/notifications")
async def admin_notifications(context: CurrentAdmin, session: DbSession) -> dict:
    notifications = (
        await session.scalars(
            select(Notification)
            .where(Notification.user_id == context.user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        )
    ).all()
    unread_count = sum(not item.is_read for item in notifications)
    return {
        "ok": True,
        "data": {
            "items": [notification_data(item) for item in notifications],
            "unreadCount": unread_count,
        },
    }


@router.patch("/notifications/{notification_id}")
async def read_admin_notification(
    notification_id: str,
    payload: AdminNotificationReadRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    notification = await session.get(Notification, notification_id)
    if notification is None or notification.user_id != context.user.id:
        raise AppError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.")
    notification.is_read = payload.read
    notification.read_at = datetime.now(UTC) if payload.read else None
    await session.commit()
    return {"ok": True, "data": notification_data(notification)}


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


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def achievement_data(achievement: AchievementDefinition) -> dict:
    payload = achievement.condition_payload or {}
    reward_ids = payload.get("rewardIds")
    if not isinstance(reward_ids, list):
        reward_ids = [payload["rewardId"]] if payload.get("rewardId") else []
    return {
        "id": achievement.id,
        "title": achievement.title,
        "description": achievement.description,
        "organizationId": achievement.organization_id,
        "artistId": achievement.artist_id,
        "memberId": payload.get("memberId"),
        "conditionType": achievement.condition_type,
        "targetValue": achievement.target_value,
        "conditionPayload": payload,
        "rewardIds": reward_ids,
        "xpBonus": payload.get("xpBonus", 0),
        "status": achievement.status,
        "startsAt": _iso_utc(achievement.starts_at),
        "endsAt": _iso_utc(achievement.ends_at),
    }


def reward_data(reward: RewardCatalog) -> dict:
    return {
        "id": reward.id,
        "organizationId": reward.organization_id,
        "artistId": reward.artist_id,
        "rewardType": reward.reward_type,
        "name": reward.name,
        "metadata": reward.metadata_,
        "status": reward.status,
    }


def pass_tier_data(tier: PassTier) -> dict:
    return {
        "id": tier.id,
        "seasonId": tier.season_id,
        "tier": tier.tier,
        "requiredXp": tier.required_xp,
        "rewardId": tier.reward_id,
    }


async def pass_season_data(session: DbSession, season: PassSeason) -> dict:
    tiers = list(
        await session.scalars(
            select(PassTier)
            .where(PassTier.season_id == season.id)
            .order_by(PassTier.tier, PassTier.id)
        )
    )
    return {
        "id": season.id,
        "title": season.title,
        "organizationId": season.organization_id,
        "artistId": season.artist_id,
        "status": season.status,
        "isPaid": False,
        "startsAt": season.starts_at.isoformat() if season.starts_at else None,
        "endsAt": season.ends_at.isoformat() if season.ends_at else None,
        "tiers": [pass_tier_data(tier) for tier in tiers],
    }


def _require_scoped_action(context: AdminContext, action: str) -> None:
    if not context.is_root:
        context.require_action(action)


def _require_engagement_write(context: AdminContext) -> None:
    if (
        "engagement:write" not in context.allowed_actions
        and "engagement:manage_global" not in context.allowed_actions
    ):
        raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")


def _require_engagement_approve(context: AdminContext) -> None:
    if (
        "engagement:approve" not in context.allowed_actions
        and "engagement:approve_global" not in context.allowed_actions
    ):
        raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")


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


async def require_engagement_scope(
    session: DbSession,
    context: AdminContext,
    organization_id: str | None,
    artist_id: str | None,
) -> tuple[str | None, str | None]:
    if context.is_root or context.is_platform_operator:
        if organization_id is None and artist_id is None:
            return None, None
        if organization_id is None or artist_id is None:
            raise AppError(
                422,
                "ENGAGEMENT_SCOPE_REQUIRED",
                "조직과 아티스트 범위를 함께 선택해 주세요.",
            )
        await _organization_artist_or_404(session, context, organization_id, artist_id)
        return organization_id, artist_id

    if context.organization is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    scoped_organization_id = context.organization.id
    if organization_id is not None and organization_id != scoped_organization_id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if artist_id is None:
        if context.membership.access_level == "company_admin":
            return scoped_organization_id, None
        raise AppError(422, "ARTIST_REQUIRED", "아티스트를 선택해 주세요.")
    await _organization_artist_or_404(session, context, scoped_organization_id, artist_id)
    return scoped_organization_id, artist_id


async def scoped_achievement_or_404(
    achievement_id: str,
    context: AdminContext,
    session: DbSession,
) -> AchievementDefinition:
    achievement = await session.get(AchievementDefinition, achievement_id)
    if achievement is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_achievement_visible(context, achievement)
    return achievement


def ensure_achievement_visible(context: AdminContext, achievement: AchievementDefinition) -> None:
    if context.is_root or context.is_platform_operator:
        return
    if context.organization is None or achievement.organization_id != context.organization.id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if context.membership.access_level == "company_admin":
        return
    if achievement.artist_id is None or achievement.artist_id not in context.assigned_artist_ids:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")


def ensure_pass_season_visible(context: AdminContext, season: PassSeason) -> None:
    if context.is_root or context.is_platform_operator:
        return
    if context.organization is None or season.organization_id != context.organization.id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if context.membership.access_level == "company_admin":
        return
    if season.artist_id is None or season.artist_id not in context.assigned_artist_ids:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")


def ensure_engagement_approver_scope(
    context: AdminContext, achievement: AchievementDefinition
) -> None:
    if achievement.organization_id is None:
        if "engagement:approve_global" not in context.allowed_actions:
            raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")
        return
    if context.membership.access_level != "company_admin":
        raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")


def ensure_pass_season_approver_scope(context: AdminContext, season: PassSeason) -> None:
    if season.organization_id is None:
        if "engagement:approve_global" not in context.allowed_actions:
            raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")
        return
    if context.membership.access_level != "company_admin":
        raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")


async def validate_reward_scope(
    session: DbSession,
    reward_ids: list[str],
    organization_id: str | None,
    artist_id: str | None,
) -> None:
    if not reward_ids:
        return
    normalized = set(reward_ids)
    scope_filters = [
        RewardCatalog.organization_id.is_(None)
        if organization_id is None
        else RewardCatalog.organization_id == organization_id,
        RewardCatalog.artist_id.is_(None)
        if artist_id is None
        else RewardCatalog.artist_id == artist_id,
    ]
    visible_ids = set(
        (
            await session.scalars(
                select(RewardCatalog.id).where(
                    RewardCatalog.id.in_(normalized),
                    *scope_filters,
                )
            )
        ).all()
    )
    if visible_ids != normalized:
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


def ensure_not_root_partner_drop(context: AdminContext, drop: Drop) -> None:
    if context.is_root and drop.organization_id is not None:
        raise AppError(
            403,
            "ADMIN_WRITE_REQUIRED",
            "파트너 범위 드롭은 해당 조직 관리자가 발행해야 합니다.",
        )


def engagement_scope_filters(context: AdminContext, model: type) -> list[object]:
    if context.is_root:
        return []
    if context.is_platform_operator:
        return [model.organization_id.is_(None)]
    if context.organization is None:
        return [model.id == ""]
    filters: list[object] = [model.organization_id == context.organization.id]
    if context.membership.access_level != "company_admin":
        filters.append(model.artist_id.in_(context.assigned_artist_ids))
    return filters


@router.get("/engagement/achievements")
async def list_admin_achievements(context: CurrentAdmin, session: DbSession) -> dict:
    rows = await session.scalars(
        select(AchievementDefinition)
        .where(*engagement_scope_filters(context, AchievementDefinition))
        .order_by(AchievementDefinition.title, AchievementDefinition.id)
    )
    return {"ok": True, "data": {"items": [achievement_data(item) for item in rows]}}


@router.post("/engagement/achievements", status_code=status.HTTP_201_CREATED)
async def create_achievement(
    payload: AchievementDefinitionCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_engagement_write(context)
    organization_id, artist_id = await require_engagement_scope(
        session, context, payload.organization_id, payload.artist_id
    )
    await validate_reward_scope(session, payload.reward_ids, organization_id, artist_id)
    achievement = AchievementDefinition(
        id=f"achievement_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=artist_id,
        title=payload.title,
        description=payload.description,
        condition_type=payload.condition_type,
        target_value=payload.target_value,
        condition_payload=payload.condition_payload,
        reward_rule_key=payload.reward_ids[0] if payload.reward_ids else None,
        status="draft",
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(achievement)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="achievement.created",
        entity_type="achievement",
        entity_id=achievement.id,
        organization_id=achievement.organization_id,
        artist_id=achievement.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": achievement_data(achievement)}


async def transition_achievement_status(
    achievement_id: str,
    context: AdminContext,
    session: DbSession,
    *,
    required_status: str,
    next_status: str,
    action: str,
) -> dict:
    achievement = await scoped_achievement_or_404(achievement_id, context, session)
    if achievement.status != required_status:
        raise AppError(
            409,
            "INVALID_ACHIEVEMENT_STATUS",
            "현재 상태에서는 업적 검수 상태를 전환할 수 없습니다.",
        )
    achievement.status = next_status
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action=action,
        entity_type="achievement",
        entity_id=achievement.id,
        organization_id=achievement.organization_id,
        artist_id=achievement.artist_id,
        details={"previousStatus": required_status, "nextStatus": next_status},
    )
    await session.commit()
    return {"ok": True, "data": achievement_data(achievement)}


@router.post("/engagement/achievements/{achievement_id}/submit")
async def submit_achievement_review(
    achievement_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_engagement_write(context)
    return await transition_achievement_status(
        achievement_id,
        context,
        session,
        required_status="draft",
        next_status="pending_review",
        action="achievement.submitted",
    )


@router.post("/engagement/achievements/{achievement_id}/approve")
async def approve_achievement(
    achievement_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    achievement = await session.get(AchievementDefinition, achievement_id)
    if achievement is not None:
        ensure_achievement_visible(context, achievement)
    _require_engagement_approve(context)
    if achievement is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_engagement_approver_scope(context, achievement)
    if achievement.status != "pending_review":
        raise AppError(
            409,
            "INVALID_ACHIEVEMENT_STATUS",
            "검수 대기 중인 업적만 공개 승인할 수 있습니다.",
        )
    achievement.status = "published"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="achievement.published",
        entity_type="achievement",
        entity_id=achievement.id,
        organization_id=achievement.organization_id,
        artist_id=achievement.artist_id,
        details={"previousStatus": "pending_review", "nextStatus": "published"},
    )
    await session.commit()
    return {"ok": True, "data": achievement_data(achievement)}


@router.post("/engagement/achievements/{achievement_id}/disable")
async def disable_achievement(
    achievement_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    achievement = await session.get(AchievementDefinition, achievement_id)
    if achievement is not None:
        ensure_achievement_visible(context, achievement)
    _require_engagement_approve(context)
    if achievement is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_engagement_approver_scope(context, achievement)
    if achievement.status != "published":
        raise AppError(
            409,
            "INVALID_ACHIEVEMENT_STATUS",
            "공개 중인 업적만 비활성화할 수 있습니다.",
        )
    achievement.status = "disabled"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="achievement.disabled",
        entity_type="achievement",
        entity_id=achievement.id,
        organization_id=achievement.organization_id,
        artist_id=achievement.artist_id,
        details={"previousStatus": "published", "nextStatus": "disabled"},
    )
    await session.commit()
    return {"ok": True, "data": achievement_data(achievement)}


@router.get("/engagement/rewards")
async def list_admin_rewards(context: CurrentAdmin, session: DbSession) -> dict:
    rows = await session.scalars(
        select(RewardCatalog)
        .where(*engagement_scope_filters(context, RewardCatalog))
        .order_by(RewardCatalog.name, RewardCatalog.id)
    )
    return {"ok": True, "data": {"items": [reward_data(item) for item in rows]}}


@router.post("/engagement/rewards", status_code=status.HTTP_201_CREATED)
async def create_admin_reward(
    payload: RewardCatalogCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    """Create a scoped reward before it is selected by an achievement or pass tier."""

    _require_engagement_write(context)
    organization_id, artist_id = await require_engagement_scope(
        session, context, payload.organization_id, payload.artist_id
    )
    reward = RewardCatalog(
        id=f"reward_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=artist_id,
        reward_type=payload.reward_type,
        name=payload.name,
        metadata_=payload.metadata,
        status="draft",
    )
    session.add(reward)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="reward.created",
        entity_type="reward",
        entity_id=reward.id,
        organization_id=reward.organization_id,
        artist_id=reward.artist_id,
        details={"rewardType": reward.reward_type},
    )
    await session.commit()
    return {"ok": True, "data": reward_data(reward)}


@router.get("/engagement/pass-seasons")
async def list_admin_pass_seasons(context: CurrentAdmin, session: DbSession) -> dict:
    rows = list(
        await session.scalars(
            select(PassSeason)
            .where(*engagement_scope_filters(context, PassSeason))
            .order_by(PassSeason.title, PassSeason.id)
        )
    )
    return {
        "ok": True,
        "data": {"items": [await pass_season_data(session, season) for season in rows]},
    }


@router.post("/engagement/pass-seasons", status_code=status.HTTP_201_CREATED)
async def create_pass_season(
    payload: PassSeasonCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_engagement_write(context)
    organization_id, artist_id = await require_engagement_scope(
        session, context, payload.organization_id, payload.artist_id
    )
    reward_ids = [tier.reward_id for tier in payload.tiers if tier.reward_id]
    await validate_reward_scope(session, reward_ids, organization_id, artist_id)
    season = PassSeason(
        id=f"pass_season_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=artist_id,
        title=payload.title,
        status="draft",
        is_paid=False,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(season)
    for tier in payload.tiers:
        session.add(
            PassTier(
                id=f"pass_tier_{uuid4().hex[:12]}",
                season_id=season.id,
                tier=tier.tier,
                required_xp=tier.required_xp,
                reward_id=tier.reward_id,
            )
        )
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="pass_season.created",
        entity_type="pass_season",
        entity_id=season.id,
        organization_id=season.organization_id,
        artist_id=season.artist_id,
        details={"isPaid": False, "tierCount": len(payload.tiers)},
    )
    await session.commit()
    return {"ok": True, "data": await pass_season_data(session, season)}


async def scoped_pass_season_or_404(
    season_id: str,
    context: AdminContext,
    session: DbSession,
) -> PassSeason:
    season = await session.get(PassSeason, season_id)
    if season is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_pass_season_visible(context, season)
    return season


async def transition_pass_season_status(
    season_id: str,
    context: AdminContext,
    session: DbSession,
    *,
    required_status: str,
    next_status: str,
    action: str,
) -> dict:
    season = await scoped_pass_season_or_404(season_id, context, session)
    if season.status != required_status:
        raise AppError(
            409,
            "INVALID_PASS_SEASON_STATUS",
            "현재 상태에서는 팬 패스 검수 상태를 전환할 수 없습니다.",
        )
    season.status = next_status
    season.is_paid = False
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action=action,
        entity_type="pass_season",
        entity_id=season.id,
        organization_id=season.organization_id,
        artist_id=season.artist_id,
        details={"previousStatus": required_status, "nextStatus": next_status, "isPaid": False},
    )
    await session.commit()
    return {"ok": True, "data": await pass_season_data(session, season)}


@router.post("/engagement/pass-seasons/{season_id}/submit")
async def submit_pass_season_review(
    season_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_engagement_write(context)
    return await transition_pass_season_status(
        season_id,
        context,
        session,
        required_status="draft",
        next_status="pending_review",
        action="pass_season.submitted",
    )


@router.post("/engagement/pass-seasons/{season_id}/approve")
async def approve_pass_season(season_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    season = await session.get(PassSeason, season_id)
    if season is not None:
        ensure_pass_season_visible(context, season)
    _require_engagement_approve(context)
    if season is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_pass_season_approver_scope(context, season)
    if season.status != "pending_review":
        raise AppError(
            409,
            "INVALID_PASS_SEASON_STATUS",
            "검수 대기 중인 팬 패스만 공개 승인할 수 있습니다.",
        )
    season.status = "published"
    season.is_paid = False
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="pass_season.published",
        entity_type="pass_season",
        entity_id=season.id,
        organization_id=season.organization_id,
        artist_id=season.artist_id,
        details={"previousStatus": "pending_review", "nextStatus": "published", "isPaid": False},
    )
    await session.commit()
    return {"ok": True, "data": await pass_season_data(session, season)}


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
    xp_filters = []
    reward_filters = []
    if not context.is_root:
        if context.organization is None:
            xp_filters.append(Drop.organization_id.is_(None))
            reward_filters.append(RewardCatalog.organization_id.is_(None))
        else:
            xp_filters.append(Drop.organization_id == context.organization.id)
            reward_filters.append(RewardCatalog.organization_id == context.organization.id)
            if context.membership.access_level != "company_admin":
                xp_filters.append(Card.artist_id.in_(context.assigned_artist_ids))
                reward_filters.append(RewardCatalog.artist_id.in_(context.assigned_artist_ids))
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    active_achievements = await session.scalar(
        select(func.count())
        .select_from(AchievementDefinition)
        .where(
            *engagement_scope_filters(context, AchievementDefinition),
            AchievementDefinition.status == "published",
        )
    )
    earned_xp_today = await session.scalar(
        select(func.coalesce(func.sum(XpLedger.amount), 0))
        .select_from(XpLedger)
        .join(EngagementEvent, EngagementEvent.id == XpLedger.event_id)
        .join(UserCard, UserCard.id == EngagementEvent.source_id)
        .join(Card, Card.id == UserCard.card_id)
        .join(Drop, Drop.id == UserCard.drop_id)
        .where(
            XpLedger.created_at >= today_start,
            EngagementEvent.source_type == "user_card",
            *xp_filters,
        )
    )
    claimable_rewards = await session.scalar(
        select(func.count())
        .select_from(RewardGrant)
        .join(RewardCatalog, RewardCatalog.id == RewardGrant.reward_id)
        .where(
            RewardGrant.claimed_at.is_(None),
            RewardCatalog.status == "published",
            *reward_filters,
        )
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
            "growthSummary": {
                "activeAchievements": active_achievements or 0,
                "earnedXpToday": earned_xp_today or 0,
                "claimableRewards": claimable_rewards or 0,
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
    design_config = card.design_config if isinstance(card.design_config, dict) else {}
    back_config = design_config.get("back") if isinstance(design_config.get("back"), dict) else {}
    back_image_asset_id = back_config.get("backImageAssetId") or back_config.get("imageAssetId")
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
        "backImageAssetId": back_image_asset_id,
        "reviewNote": card.review_note,
        "handwritingTransform": card.handwriting_transform,
        "hasVoice": card.has_voice,
        "sourceImageUrl": f"/api/admin/cards/{card.id}/image" if card.image_asset_id else None,
        "previewImageUrl": (
            f"/api/admin/cards/{card.id}/preview/image" if card.preview_storage_path else None
        ),
        "backImageUrl": f"/api/admin/cards/{card.id}/back-image" if back_image_asset_id else None,
        **release_card_data(card),
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
        back = design_config.get("back") if isinstance(design_config.get("back"), dict) else {}
        back_image_asset_id = back.get("backImageAssetId") or back.get("imageAssetId")
        if not back_image_asset_id:
            return
        asset = await session.get(Asset, back_image_asset_id)
        if not asset or asset.purpose != "card":
            raise AppError(404, "ASSET_NOT_FOUND", "뒷면 카드 자산을 찾을 수 없습니다.")
        if context is not None and not context.is_root and asset.owner_id != context.user.id:
            raise AppError(404, "ASSET_NOT_FOUND", "뒷면 카드 자산을 찾을 수 없습니다.")
        path = asset.processed_storage_path or asset.storage_path
        if not path:
            raise AppError(409, "ASSET_NOT_READY", "뒷면 카드 자산이 아직 준비되지 않았습니다.")
        if storage is None:
            storage = configured_asset_storage()
        if not storage.exists(path):
            raise AppError(409, "ASSET_NOT_READY", "뒷면 카드 자산이 아직 준비되지 않았습니다.")
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


@router.get("/cards/{card_id}/back-image")
async def card_back_image(card_id: str, context: CurrentAdmin, session: DbSession) -> Response:
    """Serve the optional back-side card artwork during operator review."""
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_artist(card.artist_id)
    design_config = card.design_config if isinstance(card.design_config, dict) else {}
    back_config = design_config.get("back") if isinstance(design_config.get("back"), dict) else {}
    asset_id = back_config.get("backImageAssetId") or back_config.get("imageAssetId")
    asset = await session.get(Asset, asset_id) if asset_id else None
    path = asset.processed_storage_path or asset.storage_path if asset else None
    if not asset or not path:
        raise AppError(404, "CARD_BACK_IMAGE_NOT_FOUND", "카드 뒷면 이미지를 찾을 수 없습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "image/png"
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
    if card.status not in {"draft", "changes_requested"} or card.release_status not in {
        "draft",
        "changes_requested",
    }:
        raise AppError(409, "INVALID_CARD_STATUS", "검수 요청할 수 없는 상태입니다.")
    card.review_note = payload.review_note if payload else None
    await submit_card_for_release_review(session, card=card)
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


def release_decision_payload(payload: dict) -> tuple[str, str | None]:
    decision = payload.get("decision")
    note = payload.get("note")
    if decision not in {"approved", "changes_requested"}:
        raise AppError(422, "INVALID_REVIEW_DECISION", "검수 결정을 확인해 주세요.")
    if decision == "changes_requested" and not note:
        raise AppError(422, "REVIEW_NOTE_REQUIRED", "수정 요청 사유를 입력해 주세요.")
    return decision, note


async def reviewed_card_or_404(card_id: str, session: DbSession) -> Card:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    return card


@router.post("/cards/{card_id}/review/partner")
async def decide_partner_review(
    card_id: str,
    context: CurrentAdmin,
    session: DbSession,
    payload: AdminCardReleaseDecisionRequest,
) -> dict:
    if context.membership.access_level not in {"company_admin", "manager"}:
        raise AppError(403, "ADMIN_PARTNER_REVIEW_REQUIRED", "회사 검수 권한이 필요합니다.")
    decision, note = release_decision_payload(payload.model_dump())
    card = await reviewed_card_or_404(card_id, session)
    context.require_artist(card.artist_id)
    if card.release_status != "pending_partner_review":
        raise AppError(
            409, "INVALID_REVIEW_STATUS", "회사 검수 대기 중인 카드만 검수할 수 있습니다."
        )
    request = await active_review_request(session, card=card, stage="partner")
    if request is None:
        raise AppError(409, "INVALID_REVIEW_STATUS", "회사 검수 요청을 찾을 수 없습니다.")
    await record_review_decision(
        session,
        request=request,
        reviewer_user_id=context.user.id,
        decision=decision,
        note=note,
    )
    if decision == "changes_requested":
        card.release_status = "changes_requested"
        card.status = "changes_requested"
        # The artist studio reads this field as the actionable reviewer feedback.
        card.review_note = note
    elif card.release_policy == "partner_and_platform":
        card.release_status = "pending_platform_review"
        card.status = "pending_review"
        await create_review_request(session, card=card, stage="platform")
        await notify_platform_reviewers(session, card=card)
    else:
        card.release_status = "approved"
        card.status = "approved"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card.partner_review_decided",
        entity_type="card",
        entity_id=card.id,
        organization_id=context.membership.organization_id,
        artist_id=card.artist_id,
        details={"decision": decision, "note": note},
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


@router.post("/cards/{card_id}/review/platform")
async def decide_platform_review(
    card_id: str,
    context: CurrentAdmin,
    session: DbSession,
    payload: AdminCardReleaseDecisionRequest,
) -> dict:
    if not context.is_platform_operator:
        raise AppError(403, "ADMIN_PLATFORM_REVIEW_REQUIRED", "플랫폼 검수 권한이 필요합니다.")
    decision, note = release_decision_payload(payload.model_dump())
    card = await reviewed_card_or_404(card_id, session)
    if card.release_status != "pending_platform_review":
        raise AppError(
            409, "INVALID_REVIEW_STATUS", "플랫폼 검수 대기 중인 카드만 검수할 수 있습니다."
        )
    request = await active_review_request(session, card=card, stage="platform")
    if request is None:
        raise AppError(409, "INVALID_REVIEW_STATUS", "플랫폼 검수 요청을 찾을 수 없습니다.")
    await record_review_decision(
        session,
        request=request,
        reviewer_user_id=context.user.id,
        decision=decision,
        note=note,
    )
    if decision == "changes_requested":
        card.release_status = "changes_requested"
        card.status = "changes_requested"
        # Keep the latest requested change visible when the artist reopens the card.
        card.review_note = note
    else:
        card.release_status = "approved"
        card.status = "approved"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card.platform_review_decided",
        entity_type="card",
        entity_id=card.id,
        artist_id=card.artist_id,
        details={"decision": decision, "note": note},
    )
    await session.commit()
    return {"ok": True, "data": admin_card_data(card)}


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
    elif organization_id is not None or artist_id is not None:
        raise AppError(
            403,
            "ADMIN_WRITE_REQUIRED",
            "파트너 범위 드롭은 해당 조직 관리자가 발행해야 합니다.",
        )
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


@router.post("/drops/{drop_id}/cards")
async def link_card_to_drop(
    drop_id: str,
    context: CurrentAdmin,
    session: DbSession,
    payload: DropCardLinkRequest,
) -> dict:
    _require_scoped_action(context, "drops:write")
    drop = await scoped_drop_or_404(drop_id, context, session)
    ensure_not_root_partner_drop(context, drop)
    card = await session.get(Card, payload.card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.artist_id != drop.artist_id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if not context.is_root:
        context.require_artist(card.artist_id)
    if card.release_status != "approved":
        raise AppError(
            409,
            "CARD_RELEASE_NOT_APPROVED",
            "모든 필수 검수가 끝난 카드만 드롭에 연결할 수 있습니다.",
        )
    card.release_status = "published" if drop.status == "live" else "drop_ready"
    card.status = "published" if drop.status == "live" else "approved"
    card.drop_id = drop.id
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="drop.card_linked",
        entity_type="drop",
        entity_id=drop.id,
        organization_id=drop.organization_id,
        artist_id=drop.artist_id,
        details={"cardId": card.id},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {"dropId": drop.id, "cardId": card.id, **admin_card_data(card)},
    }


@router.patch("/drops/{drop_id}/status")
async def update_drop_status(
    drop_id: str, payload: DropStatusUpdate, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_scoped_action(context, "drops:write")
    drop = await scoped_drop_or_404(drop_id, context, session)
    ensure_not_root_partner_drop(context, drop)
    previous_status = drop.status
    drop.status = payload.status
    if previous_status != "live" and payload.status == "live":
        linked_cards = await session.scalars(
            select(Card).where(Card.drop_id == drop.id, Card.release_status == "drop_ready")
        )
        for card in linked_cards:
            card.release_status = "published"
            card.status = "published"
        await record_audit(
            session,
            actor_user_id=context.user.id,
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
    ensure_not_root_partner_drop(context, drop)
    card = await session.get(Card, payload.card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if not context.is_root and card.artist_id != drop.artist_id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if drop.status != "live":
        raise AppError(409, "DROP_NOT_LIVE", "진행 중인 드롭에만 코드를 발급할 수 있습니다.")
    # Operational cards created in the admin console predate the studio
    # workflow. Keep their existing code-batch path intact; artist-studio
    # cards must have completed review and be linked to this exact drop.
    if card.owner_artist_id is not None and (
        card.release_status not in {"drop_ready", "published"} or card.drop_id != drop.id
    ):
        raise AppError(
            409,
            "CARD_NOT_LINKED_TO_DROP",
            "드롭에 연결된 카드에만 코드를 발급할 수 있습니다.",
        )
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
