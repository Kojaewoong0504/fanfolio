import asyncio
import csv
import json
from datetime import UTC, datetime, timedelta
from io import BytesIO, StringIO
from secrets import token_urlsafe
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import qrcode
from fastapi import APIRouter, BackgroundTasks, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import and_, delete, func, or_, select, update

from app.admin_access import AdminContext
from app.dependencies import CurrentAdmin, DbSession, RootAdminUser
from app.effects import validate_effect_config
from app.errors import AppError
from app.models import (
    AchievementDefinition,
    AdminMembership,
    AnalyticsEvent,
    ApprovalRequest,
    Artist,
    ArtistProfile,
    Asset,
    AuditLog,
    Card,
    CardCollaborationComment,
    CardCombination,
    CardEffectVersion,
    CardPack,
    CardPackCard,
    CardPackOpening,
    CollectionCampaign,
    ContentCalendarEntry,
    Drop,
    EngagementEvent,
    LevelPolicyVersion,
    LevelThreshold,
    Member,
    MissionDefinition,
    Notification,
    NotificationDelivery,
    Organization,
    OrganizationArtist,
    PassSeason,
    PassTier,
    PointBalance,
    PointLedger,
    PointTransaction,
    RedeemCode,
    RedeemCodeBatch,
    RefreshToken,
    RewardCatalog,
    RewardGrant,
    Role,
    ShopOrder,
    ShopOrderEntitlement,
    ShopProduct,
    SupportEvidence,
    SupportMessage,
    SupportTicket,
    TradeHold,
    TradeItem,
    TradeProposal,
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
    ApprovalCreateRequest,
    ApprovalDecisionRequest,
    ArtistAccountCreate,
    ArtistReviewSubmitRequest,
    CardEffectReviewDecision,
    CardPackCreate,
    CodeBatchRequest,
    CollectionCampaignCreate,
    CollectionCampaignUpdate,
    ContentCalendarCreate,
    ContentCalendarUpdate,
    DropCardLinkRequest,
    DropCreateRequest,
    DropStatusUpdate,
    DropUpdateRequest,
    LevelPolicyCreate,
    MissionDefinitionCreate,
    MissionDefinitionUpdate,
    PassSeasonCreate,
    PointAdjustmentRequest,
    RedeemCodeStatusUpdate,
    RewardCatalogCreate,
    ShopProductCreate,
    ShopProductUpdate,
    SupportMessageCreate,
    SupportTicketActionRequest,
    SupportTicketUpdate,
)
from app.services import (
    active_review_request,
    create_review_request,
    grant_points,
    notify_fans,
    notify_platform_reviewers,
    notify_user_once,
    record_audit,
    record_engagement_event,
    record_review_decision,
    release_card_data,
    reverse_points,
    spend_points,
    submit_card_for_release_review,
)
from app.storage import configured_asset_storage, storage_response
from app.tasks import enqueue_engagement_event

router = APIRouter(prefix="/api/admin", tags=["admin"])
router.include_router(partner_router)
LENTICULAR_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _csv_download(
    filename: str,
    headers: list[str],
    rows: list[list[object]],
    *,
    include_bom: bool = False,
) -> StreamingResponse:
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    prefix = "\ufeff" if include_bom else ""
    payload = (prefix + output.getvalue()).encode("utf-8")
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _card_scope_filters(context: CurrentAdmin) -> list[object]:
    if context.is_root:
        return []
    return [
        Card.artist_id.in_(context.assigned_artist_ids),
        or_(
            Card.organization_id == context.membership.organization_id,
            Card.organization_id.is_(None),
        ),
    ]


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


def _statistics_change(current: float, previous: float) -> float:
    if previous == 0:
        return 100.0 if current else 0.0
    return round((current - previous) / previous * 100, 1)


def _calendar_entry_data(entry: ContentCalendarEntry) -> dict[str, object]:
    return {
        "id": entry.id,
        "contentType": entry.content_type,
        "contentId": entry.content_id,
        "title": entry.title,
        "startsAt": entry.starts_at.isoformat(),
        "endsAt": entry.ends_at.isoformat(),
        "status": entry.status,
        "notes": entry.notes,
        "createdBy": entry.created_by,
    }


async def _calendar_conflict(
    session: DbSession,
    *,
    content_type: str,
    content_id: str,
    starts_at: datetime,
    ends_at: datetime,
    exclude_id: str | None = None,
) -> bool:
    query = select(ContentCalendarEntry.id).where(
        ContentCalendarEntry.content_type == content_type,
        ContentCalendarEntry.content_id == content_id,
        ContentCalendarEntry.status != "cancelled",
        ContentCalendarEntry.starts_at < ends_at,
        ContentCalendarEntry.ends_at > starts_at,
    )
    if exclude_id:
        query = query.where(ContentCalendarEntry.id != exclude_id)
    return await session.scalar(query) is not None


@router.get("/content-calendar")
async def list_content_calendar(context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("cards:read")
    entries = (
        await session.scalars(
            select(ContentCalendarEntry).order_by(
                ContentCalendarEntry.starts_at, ContentCalendarEntry.created_at
            )
        )
    ).all()
    return {"ok": True, "data": {"items": [_calendar_entry_data(entry) for entry in entries]}}


@router.post("/content-calendar", status_code=status.HTTP_201_CREATED)
async def create_content_calendar(
    payload: ContentCalendarCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("cards:write")
    if await _calendar_conflict(
        session,
        content_type=payload.content_type,
        content_id=payload.content_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    ):
        raise AppError(409, "CALENDAR_ENTRY_CONFLICT", "같은 콘텐츠에 겹치는 일정이 있습니다.")
    entry = ContentCalendarEntry(
        id=f"calendar_{uuid4().hex[:12]}",
        content_type=payload.content_type,
        content_id=payload.content_id,
        title=payload.title,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        notes=payload.notes,
        created_by=context.user.id,
    )
    session.add(entry)
    await session.commit()
    return {"ok": True, "data": {"entry": _calendar_entry_data(entry)}}


@router.patch("/content-calendar/{entry_id}")
async def update_content_calendar(
    entry_id: str,
    payload: ContentCalendarUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("cards:write")
    entry = await session.get(ContentCalendarEntry, entry_id)
    if not entry:
        raise AppError(404, "CALENDAR_ENTRY_NOT_FOUND", "일정을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    starts_at = values.get("starts_at", entry.starts_at)
    ends_at = values.get("ends_at", entry.ends_at)
    if ends_at <= starts_at:
        raise AppError(422, "INVALID_CALENDAR_WINDOW", "종료 시각은 시작 시각보다 뒤여야 합니다.")
    if await _calendar_conflict(
        session,
        content_type=entry.content_type,
        content_id=entry.content_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_id=entry.id,
    ):
        raise AppError(409, "CALENDAR_ENTRY_CONFLICT", "같은 콘텐츠에 겹치는 일정이 있습니다.")
    for field, value in values.items():
        setattr(entry, field, value)
    await session.commit()
    return {"ok": True, "data": {"entry": _calendar_entry_data(entry)}}


@router.get("/statistics")
async def admin_statistics(
    context: CurrentAdmin,
    session: DbSession,
    period: int = Query(default=30),
    compare: bool = Query(default=True),
    organization_id: str | None = Query(default=None, alias="organizationId"),
    artist_id: str | None = Query(default=None, alias="artistId"),
    pack_id: str | None = Query(default=None, alias="packId"),
) -> dict:
    """Return durable, permission-scoped statistics for the production admin UI."""
    context.require_action("statistics:read")
    if period not in {7, 30, 90}:
        raise AppError(
            422, "INVALID_STATISTICS_PERIOD", "조회 기간은 7일, 30일, 90일만 지원합니다."
        )
    if not context.is_root:
        own_organization_id = context.membership.organization_id
        if organization_id and organization_id != own_organization_id:
            raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
        organization_id = own_organization_id
    if artist_id:
        context.require_artist(artist_id)

    scoped_organization_artist_ids: set[str] | None = None
    if artist_id:
        scoped_organization_artist_ids = {artist_id}
    elif organization_id:
        scoped_organization_artist_ids = set(
            await session.scalars(
                select(OrganizationArtist.artist_id).where(
                    OrganizationArtist.organization_id == organization_id
                )
            )
        )
    elif not context.is_root:
        scoped_organization_artist_ids = set(context.assigned_artist_ids)

    pack_filters: list[object] = []
    if organization_id and context.is_root:
        legacy_pack_scope = (
            CardPack.artist_id.in_(scoped_organization_artist_ids)
            if scoped_organization_artist_ids
            else CardPack.id == "__no_scoped_pack__"
        )
        pack_filters.append(
            or_(
                CardPack.organization_id == organization_id,
                and_(CardPack.organization_id.is_(None), legacy_pack_scope),
            )
        )
    if artist_id:
        pack_filters.append(CardPack.artist_id == artist_id)
    if not context.is_root:
        pack_filters.extend(
            [
                CardPack.artist_id.in_(context.assigned_artist_ids),
                or_(
                    CardPack.organization_id == context.membership.organization_id,
                    CardPack.organization_id.is_(None),
                ),
            ]
        )
    if pack_id:
        selected_pack = await session.scalar(
            select(CardPack).where(CardPack.id == pack_id, *pack_filters)
        )
        if selected_pack is None:
            raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")

    now = datetime.now(UTC)
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    current_start = today_start - timedelta(days=period - 1)
    previous_start = current_start - timedelta(days=period)
    card_filters = _card_scope_filters(context)
    if organization_id and context.is_root:
        legacy_card_scope = (
            Card.artist_id.in_(scoped_organization_artist_ids)
            if scoped_organization_artist_ids
            else Card.id == "__no_scoped_card__"
        )
        card_filters.append(
            or_(
                Card.organization_id == organization_id,
                and_(Card.organization_id.is_(None), legacy_card_scope),
            )
        )
    if artist_id:
        card_filters.append(Card.artist_id == artist_id)

    async def range_snapshot(start_at: datetime, end_at: datetime) -> dict:
        user_card_stmt = (
            select(UserCard.user_id, UserCard.acquired_at, UserCard.redeem_code_id)
            .join(Card, UserCard.card_id == Card.id)
            .where(
                *card_filters,
                UserCard.acquired_at >= start_at,
                UserCard.acquired_at < end_at,
            )
        )
        if pack_id:
            user_card_stmt = user_card_stmt.join(
                CardPackOpening, CardPackOpening.user_card_id == UserCard.id
            ).where(CardPackOpening.pack_id == pack_id)
        user_cards = list((await session.execute(user_card_stmt)).all())

        opening_stmt = (
            select(
                CardPackOpening.user_id,
                CardPackOpening.created_at,
                CardPackOpening.pack_id,
                CardPackOpening.card_id,
            )
            .join(Card, CardPackOpening.card_id == Card.id)
            .where(
                *card_filters,
                CardPackOpening.created_at >= start_at,
                CardPackOpening.created_at < end_at,
            )
        )
        if pack_id:
            opening_stmt = opening_stmt.where(CardPackOpening.pack_id == pack_id)
        openings = list((await session.execute(opening_stmt)).all())

        analytics_filters: list[object] = [
            AnalyticsEvent.created_at >= start_at,
            AnalyticsEvent.created_at < end_at,
        ]
        if organization_id:
            legacy_analytics_scope = (
                AnalyticsEvent.artist_id.in_(scoped_organization_artist_ids)
                if scoped_organization_artist_ids
                else AnalyticsEvent.id == "__no_scoped_analytics__"
            )
            analytics_filters.append(
                or_(
                    AnalyticsEvent.organization_id == organization_id,
                    and_(
                        AnalyticsEvent.organization_id.is_(None),
                        legacy_analytics_scope,
                    ),
                )
            )
        if artist_id:
            analytics_filters.append(AnalyticsEvent.artist_id == artist_id)
        elif not context.is_root:
            analytics_filters.append(AnalyticsEvent.artist_id.in_(context.assigned_artist_ids))
        if pack_id:
            analytics_filters.append(AnalyticsEvent.pack_id == pack_id)
        analytics = list(
            (
                await session.execute(
                    select(
                        AnalyticsEvent.event_name,
                        AnalyticsEvent.user_id,
                        AnalyticsEvent.created_at,
                        AnalyticsEvent.metadata_json,
                    ).where(*analytics_filters)
                )
            ).all()
        )
        xp_stmt = (
            select(XpLedger.user_id, XpLedger.created_at, EngagementEvent.payload)
            .join(EngagementEvent, EngagementEvent.id == XpLedger.event_id)
            .where(XpLedger.created_at >= start_at, XpLedger.created_at < end_at)
        )
        xp_rows = list((await session.execute(xp_stmt)).all())
        if scoped_organization_artist_ids is not None:
            xp_rows = [
                row
                for row in xp_rows
                if (row.payload or {}).get("artistId") in scoped_organization_artist_ids
            ]
        active_users = {row.user_id for row in user_cards if row.user_id}
        active_users.update(row.user_id for row in openings if row.user_id)
        active_users.update(row.user_id for row in analytics if row.user_id)
        active_users.update(row.user_id for row in xp_rows if row.user_id)
        return {
            "userCards": user_cards,
            "openings": openings,
            "analytics": analytics,
            "xpRows": xp_rows,
            "activeFans": len(active_users),
        }

    current = await range_snapshot(current_start, now)
    previous = (
        await range_snapshot(previous_start, current_start)
        if compare
        else {
            "userCards": [],
            "openings": [],
            "analytics": [],
            "activeFans": 0,
        }
    )

    current_events = [row.event_name for row in current["analytics"]]
    previous_events = [row.event_name for row in previous["analytics"]]
    recognized = current_events.count("redemption.recognized")
    registered = sum(1 for row in current["userCards"] if row.redeem_code_id)
    viewed = current_events.count("collection.card_viewed")
    pack_openings = len(current["openings"])
    previous_pack_openings = len(previous["openings"])
    issued_cards = len(current["userCards"])
    previous_issued_cards = len(previous["userCards"])
    registration_rate = round(registered / recognized * 100, 1) if recognized else 0.0
    previous_recognized = previous_events.count("redemption.recognized")
    previous_registered = sum(1 for row in previous["userCards"] if row.redeem_code_id)
    previous_registration_rate = (
        round(previous_registered / previous_recognized * 100, 1) if previous_recognized else 0.0
    )

    trend_days = [current_start.date() + timedelta(days=index) for index in range(period)]
    trend = []
    for day in trend_days:
        next_day = day + timedelta(days=1)
        day_users = {
            row.user_id for row in current["userCards"] if day <= row.acquired_at.date() < next_day
        }
        day_users.update(
            row.user_id for row in current["openings"] if day <= row.created_at.date() < next_day
        )
        day_users.update(
            row.user_id for row in current["xpRows"] if day <= row.created_at.date() < next_day
        )
        trend.append(
            {
                "date": day.isoformat(),
                "activeFans": len(day_users),
                "packOpenings": sum(
                    1 for row in current["openings"] if day <= row.created_at.date() < next_day
                ),
            }
        )

    packs = list(
        (
            await session.scalars(
                select(CardPack).where(*pack_filters).order_by(CardPack.name, CardPack.version)
            )
        ).all()
    )
    if pack_id:
        packs = [pack for pack in packs if pack.id == pack_id]
    current_openings_by_pack: dict[str, int] = {}
    previous_openings_by_pack: dict[str, int] = {}
    for row in current["openings"]:
        current_openings_by_pack[row.pack_id] = current_openings_by_pack.get(row.pack_id, 0) + 1
    for row in previous["openings"]:
        previous_openings_by_pack[row.pack_id] = previous_openings_by_pack.get(row.pack_id, 0) + 1
    pack_performance = [
        {
            "id": pack.id,
            "name": pack.name,
            "artistId": pack.artist_id,
            "seasonName": pack.season_name,
            "openings": current_openings_by_pack.get(pack.id, 0),
            "registrationRate": 100.0 if current_openings_by_pack.get(pack.id, 0) else 0.0,
            "change": _statistics_change(
                current_openings_by_pack.get(pack.id, 0),
                previous_openings_by_pack.get(pack.id, 0),
            ),
        }
        for pack in packs
    ]

    odds_stmt = (
        select(Card.rarity, CardPackCard.probability)
        .join(CardPackCard, CardPackCard.card_id == Card.id)
        .join(CardPack, CardPack.id == CardPackCard.pack_id)
        .where(*card_filters, *pack_filters, CardPackCard.enabled.is_(True))
    )
    if pack_id:
        odds_stmt = odds_stmt.where(CardPackCard.pack_id == pack_id)
    odds_rows = list((await session.execute(odds_stmt)).all())
    published_by_rarity: dict[str, float] = {}
    for rarity, probability in odds_rows:
        key = rarity or "N"
        published_by_rarity[key] = published_by_rarity.get(key, 0.0) + float(probability)
    published_total = sum(published_by_rarity.values()) or 1.0
    opening_card_counts: dict[str, int] = {}
    for row in current["openings"]:
        opening_card_counts[row.card_id] = opening_card_counts.get(row.card_id, 0) + 1
    actual_by_rarity: dict[str, int] = {}
    if opening_card_counts:
        rarity_rows = list(
            (
                await session.execute(
                    select(Card.id, Card.rarity).where(Card.id.in_(opening_card_counts))
                )
            ).all()
        )
        for card_row_id, rarity in rarity_rows:
            key = rarity or "N"
            actual_by_rarity[key] = actual_by_rarity.get(key, 0) + opening_card_counts[card_row_id]
    actual_total = sum(actual_by_rarity.values()) or 1
    odds_integrity = []
    for rarity in ("UR", "SR", "R", "N"):
        published = round(published_by_rarity.get(rarity, 0.0) / published_total * 100, 2)
        actual = round(actual_by_rarity.get(rarity, 0) / actual_total * 100, 2)
        odds_integrity.append(
            {
                "rarity": rarity,
                "published": published,
                "actual": actual,
                "variance": round(actual - published, 2),
            }
        )

    organizations = list(
        (
            await session.scalars(
                select(Organization)
                .where(
                    Organization.status == "active",
                    *(
                        []
                        if context.is_root
                        else [Organization.id == context.membership.organization_id]
                    ),
                )
                .order_by(Organization.name)
            )
        ).all()
    )
    artist_stmt = select(Artist)
    if artist_id:
        artist_stmt = artist_stmt.where(Artist.id == artist_id)
    elif organization_id:
        artist_stmt = artist_stmt.join(
            OrganizationArtist, OrganizationArtist.artist_id == Artist.id
        ).where(OrganizationArtist.organization_id == organization_id)
    elif not context.is_root:
        artist_stmt = artist_stmt.where(Artist.id.in_(context.assigned_artist_ids))
    artists = list((await session.scalars(artist_stmt.order_by(Artist.name))).all())
    tracking_filters: list[object] = []
    if organization_id:
        legacy_tracking_scope = (
            AnalyticsEvent.artist_id.in_(scoped_organization_artist_ids)
            if scoped_organization_artist_ids
            else AnalyticsEvent.id == "__no_scoped_tracking__"
        )
        tracking_filters.append(
            or_(
                AnalyticsEvent.organization_id == organization_id,
                and_(AnalyticsEvent.organization_id.is_(None), legacy_tracking_scope),
            )
        )
    if artist_id:
        tracking_filters.append(AnalyticsEvent.artist_id == artist_id)
    elif not context.is_root:
        tracking_filters.append(AnalyticsEvent.artist_id.in_(context.assigned_artist_ids))
    if pack_id:
        tracking_filters.append(AnalyticsEvent.pack_id == pack_id)
    tracking_since = await session.scalar(
        select(func.min(AnalyticsEvent.created_at)).where(*tracking_filters)
    )
    failed_count = current_events.count("redemption.failed")
    funnel_base = recognized or 1
    return {
        "ok": True,
        "data": {
            "scope": {
                "kind": "root" if context.is_root else "partner",
                "organizationId": organization_id,
                "artistId": artist_id,
                "packId": pack_id,
            },
            "period": {"days": period, "compare": compare},
            "trackingSince": (tracking_since or now).isoformat(),
            "filters": {
                "organizations": [
                    {"id": organization.id, "name": organization.name}
                    for organization in organizations
                ],
                "artists": [{"id": artist.id, "name": artist.name} for artist in artists],
                "packs": [
                    {"id": pack.id, "name": pack.name, "artistId": pack.artist_id} for pack in packs
                ],
            },
            "kpis": {
                "activeFans": {
                    "current": current["activeFans"],
                    "previous": previous["activeFans"],
                    "change": _statistics_change(current["activeFans"], previous["activeFans"]),
                },
                "issuedCards": {
                    "current": issued_cards,
                    "previous": previous_issued_cards,
                    "change": _statistics_change(issued_cards, previous_issued_cards),
                },
                "packOpenings": {
                    "current": pack_openings,
                    "previous": previous_pack_openings,
                    "change": _statistics_change(pack_openings, previous_pack_openings),
                },
                "registrationRate": {
                    "current": registration_rate,
                    "previous": previous_registration_rate,
                    "change": round(registration_rate - previous_registration_rate, 1),
                },
            },
            "trend": trend,
            "funnel": [
                {"key": "recognized", "label": "인증번호 인식", "count": recognized, "rate": 100.0},
                {
                    "key": "registered",
                    "label": "카드 등록",
                    "count": registered,
                    "rate": round(registered / funnel_base * 100, 1),
                },
                {
                    "key": "collectionViewed",
                    "label": "컬렉션 확인",
                    "count": viewed,
                    "rate": round(viewed / funnel_base * 100, 1),
                },
            ],
            "packPerformance": pack_performance,
            "operationHealth": {
                "redemptionFailures": failed_count,
                "duplicateAttempts": sum(
                    1
                    for row in current["analytics"]
                    if (row.metadata_json or {}).get("errorCode") == "REDEEM_CODE_ALREADY_USED"
                ),
                "oddsStatus": "attention"
                if any(abs(item["variance"]) >= 1 for item in odds_integrity)
                else "normal",
            },
            "oddsIntegrity": odds_integrity,
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


@router.post("/notification-deliveries/{delivery_id}/retry")
async def retry_notification_delivery(
    delivery_id: str,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("engagement:retry")
    delivery = await session.get(NotificationDelivery, delivery_id)
    if delivery is None:
        raise AppError(404, "DELIVERY_NOT_FOUND", "알림 전달 작업을 찾을 수 없습니다.")
    if delivery.status not in {"failed", "retry", "dead_letter"}:
        raise AppError(409, "DELIVERY_NOT_RETRYABLE", "실패한 전달 작업만 재시도할 수 있습니다.")
    delivery.status = "pending"
    delivery.next_attempt_at = None
    delivery.last_error = None
    delivery.sent_at = None
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="notification_delivery.retried",
        entity_type="notification_delivery",
        entity_id=delivery.id,
        details={"channel": delivery.channel},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": delivery.id,
            "channel": delivery.channel,
            "status": delivery.status,
            "attemptCount": delivery.attempt_count,
            "nextAttemptAt": delivery.next_attempt_at.isoformat()
            if delivery.next_attempt_at
            else None,
        },
    }


@router.get("/notification-deliveries")
async def list_notification_deliveries(
    context: CurrentAdmin,
    session: DbSession,
    delivery_status: str | None = Query(default=None, alias="status"),
    channel: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, alias="pageSize", ge=1, le=100),
) -> dict:
    context.require_action("engagement:retry")
    filters = []
    if delivery_status:
        filters.append(NotificationDelivery.status == delivery_status)
    if channel:
        filters.append(NotificationDelivery.channel == channel)
    total = await session.scalar(
        select(func.count()).select_from(NotificationDelivery).where(*filters)
    )
    rows = list(
        await session.scalars(
            select(NotificationDelivery)
            .where(*filters)
            .order_by(NotificationDelivery.created_at.desc(), NotificationDelivery.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    notification_ids = {row.notification_id for row in rows}
    notifications = (
        {
            notification.id: notification
            for notification in await session.scalars(
                select(Notification).where(Notification.id.in_(notification_ids))
            )
        }
        if notification_ids
        else {}
    )
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": row.id,
                    "notificationId": row.notification_id,
                    "channel": row.channel,
                    "status": row.status,
                    "attemptCount": row.attempt_count,
                    "nextAttemptAt": row.next_attempt_at.isoformat()
                    if row.next_attempt_at
                    else None,
                    "lastError": row.last_error,
                    "sentAt": row.sent_at.isoformat() if row.sent_at else None,
                    "createdAt": row.created_at.isoformat(),
                    "notification": {
                        "kind": notifications[row.notification_id].kind,
                        "title": notifications[row.notification_id].title,
                    }
                    if row.notification_id in notifications
                    else None,
                }
                for row in rows
            ],
            "pagination": {"page": page, "pageSize": page_size, "total": total or 0},
        },
    }


async def _admin_support_ticket_data(session: DbSession, ticket: SupportTicket) -> dict:
    owner = await session.get(User, ticket.user_id)
    messages = list(
        await session.scalars(
            select(SupportMessage)
            .where(SupportMessage.ticket_id == ticket.id)
            .order_by(SupportMessage.created_at, SupportMessage.id)
        )
    )
    authors = (
        {
            author.id: author
            for author in await session.scalars(
                select(User).where(User.id.in_({message.author_user_id for message in messages}))
            )
        }
        if messages
        else {}
    )
    evidence = list(
        await session.scalars(
            select(SupportEvidence)
            .where(SupportEvidence.ticket_id == ticket.id)
            .order_by(SupportEvidence.created_at, SupportEvidence.id)
        )
    )
    return {
        "id": ticket.id,
        "userId": ticket.user_id,
        "userEmail": owner.email if owner else None,
        "userNickname": owner.nickname if owner else None,
        "category": ticket.category,
        "subject": ticket.subject,
        "status": ticket.status,
        "assignedAdminId": ticket.assigned_admin_id,
        "evidence": [
            {
                "id": item.id,
                "kind": item.kind,
                "referenceId": item.reference_id,
                "note": item.note,
                "createdAt": item.created_at.isoformat(),
            }
            for item in evidence
        ],
        "createdAt": ticket.created_at.isoformat(),
        "updatedAt": ticket.updated_at.isoformat(),
        "closedAt": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "messages": [
            {
                "id": message.id,
                "authorUserId": message.author_user_id,
                "authorRole": authors.get(message.author_user_id).role.value
                if authors.get(message.author_user_id)
                else "unknown",
                "body": message.body,
                "createdAt": message.created_at.isoformat(),
            }
            for message in messages
        ],
    }


@router.get("/support-tickets")
async def admin_support_tickets(
    context: CurrentAdmin,
    session: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, alias="pageSize", ge=1, le=100),
) -> dict:
    context.require_action("support:read")
    filters = []
    if status_filter:
        filters.append(SupportTicket.status == status_filter)
    if category:
        filters.append(SupportTicket.category == category)
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(SupportTicket.subject.ilike(pattern), SupportTicket.user_id.ilike(pattern))
        )
    total = await session.scalar(select(func.count()).select_from(SupportTicket).where(*filters))
    tickets = list(
        await session.scalars(
            select(SupportTicket)
            .where(*filters)
            .order_by(SupportTicket.updated_at.desc(), SupportTicket.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return {
        "ok": True,
        "data": {
            "items": [await _admin_support_ticket_data(session, ticket) for ticket in tickets],
            "pagination": {"page": page, "pageSize": page_size, "total": total or 0},
        },
    }


@router.get("/support-tickets/{ticket_id}")
async def admin_support_ticket(ticket_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("support:read")
    ticket = await session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AppError(404, "SUPPORT_TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.")
    return {"ok": True, "data": await _admin_support_ticket_data(session, ticket)}


@router.patch("/support-tickets/{ticket_id}")
async def update_admin_support_ticket(
    ticket_id: str,
    payload: SupportTicketUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("support:write")
    ticket = await session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AppError(404, "SUPPORT_TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.")
    allowed_transitions = {
        "open": {"open", "in_progress"},
        "in_progress": {"in_progress", "answered", "closed"},
        "answered": {"answered", "in_progress", "closed"},
        "closed": {"closed", "open"},
    }
    next_status = payload.status or ticket.status
    if next_status not in allowed_transitions[ticket.status]:
        raise AppError(
            409,
            "SUPPORT_TICKET_INVALID_TRANSITION",
            f"{ticket.status} 상태에서는 {next_status} 상태로 변경할 수 없습니다.",
        )
    if ticket.status == "closed" and next_status not in {"open", "closed"}:
        raise AppError(
            409, "SUPPORT_TICKET_REOPEN_REQUIRED", "종료된 문의는 먼저 다시 열어 주세요."
        )
    previous_status = ticket.status
    ticket.status = next_status
    if payload.assigned_admin_id is not None:
        assignee = await session.get(User, payload.assigned_admin_id)
        if assignee is None or assignee.role.value != "admin":
            raise AppError(
                422, "SUPPORT_ASSIGNEE_INVALID", "활성 관리자만 담당자로 지정할 수 있습니다."
            )
        ticket.assigned_admin_id = assignee.id
    elif payload.status in {"in_progress", "answered"}:
        ticket.assigned_admin_id = context.user.id
    ticket.closed_at = datetime.now(UTC) if next_status == "closed" else None
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="support_ticket.status_changed",
        entity_type="support_ticket",
        entity_id=ticket.id,
        details={"previousStatus": previous_status, "nextStatus": ticket.status},
    )
    await session.commit()
    return {"ok": True, "data": await _admin_support_ticket_data(session, ticket)}


@router.post("/support-tickets/{ticket_id}/actions", status_code=status.HTTP_201_CREATED)
async def act_on_support_ticket(
    ticket_id: str,
    payload: SupportTicketActionRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    """Record case actions and stage high-impact mutations for dual approval."""
    context.require_action("support:write")
    ticket = await session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AppError(404, "SUPPORT_TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.")
    if payload.action == "grant_points" and not payload.amount:
        raise AppError(422, "INVALID_POINT_AMOUNT", "포인트 조정 금액은 0이 아닌 정수여야 합니다.")
    now = datetime.now(UTC)
    if payload.action == "assign":
        assignee_id = payload.reference_id or context.user.id
        assignee = await session.get(User, assignee_id)
        if assignee is None or assignee.role.value != "admin":
            raise AppError(
                422, "SUPPORT_ASSIGNEE_INVALID", "활성 관리자만 담당자로 지정할 수 있습니다."
            )
        ticket.assigned_admin_id = assignee.id
        session.add(
            SupportEvidence(
                id=f"evidence_{uuid4().hex[:12]}",
                ticket_id=ticket.id,
                actor_user_id=context.user.id,
                kind="assignment",
                reference_id=assignee.id,
                note=payload.note,
            )
        )
    elif payload.action == "record_evidence":
        if not payload.reference_id and not payload.note:
            raise AppError(422, "SUPPORT_EVIDENCE_REQUIRED", "근거 ID 또는 운영 메모가 필요합니다.")
        session.add(
            SupportEvidence(
                id=f"evidence_{uuid4().hex[:12]}",
                ticket_id=ticket.id,
                actor_user_id=context.user.id,
                kind="case_note",
                reference_id=payload.reference_id,
                note=payload.note,
            )
        )
    elif payload.action == "hold_trade":
        if not payload.reference_id:
            raise AppError(422, "TRADE_REFERENCE_REQUIRED", "거래 ID가 필요합니다.")
        proposal = await session.get(TradeProposal, payload.reference_id)
        if proposal is None:
            raise AppError(404, "TRADE_NOT_FOUND", "거래를 찾을 수 없습니다.")
        if proposal.status != "pending":
            raise AppError(409, "TRADE_NOT_PENDING", "대기 중인 거래만 보류할 수 있습니다.")
        existing = await session.scalar(
            select(TradeHold).where(TradeHold.proposal_id == proposal.id)
        )
        if existing and existing.released_at is None:
            raise AppError(409, "TRADE_ALREADY_HELD", "이미 보류된 거래입니다.")
        session.add(
            TradeHold(
                id=f"trade_hold_{uuid4().hex[:12]}",
                proposal_id=proposal.id,
                ticket_id=ticket.id,
                reason=payload.note,
                created_at=now,
            )
        )
        session.add(
            SupportEvidence(
                id=f"evidence_{uuid4().hex[:12]}",
                ticket_id=ticket.id,
                actor_user_id=context.user.id,
                kind="trade_hold",
                reference_id=proposal.id,
                note=payload.note,
            )
        )
    elif payload.action == "release_trade":
        if not payload.reference_id:
            raise AppError(422, "TRADE_REFERENCE_REQUIRED", "거래 ID가 필요합니다.")
        hold = await session.scalar(
            select(TradeHold).where(
                TradeHold.proposal_id == payload.reference_id,
                TradeHold.released_at.is_(None),
            )
        )
        if hold is None:
            raise AppError(404, "TRADE_HOLD_NOT_FOUND", "활성 거래 보류를 찾을 수 없습니다.")
        hold.released_at = now
        session.add(
            SupportEvidence(
                id=f"evidence_{uuid4().hex[:12]}",
                ticket_id=ticket.id,
                actor_user_id=context.user.id,
                kind="trade_release",
                reference_id=payload.reference_id,
                note=payload.note,
            )
        )
    elif payload.action in {"refund_order", "grant_points"}:
        if not payload.reference_id:
            raise AppError(422, "ACTION_REFERENCE_REQUIRED", "대상 ID가 필요합니다.")
        approval = ApprovalRequest(
            id=f"approval_{uuid4().hex[:12]}",
            kind=payload.action,
            entity_type="shop_order" if payload.action == "refund_order" else "user",
            entity_id=payload.reference_id,
            requested_by=context.user.id,
            payload={"ticketId": ticket.id, "amount": payload.amount},
            reason=payload.note,
        )
        session.add(approval)
        session.add(
            SupportEvidence(
                id=f"evidence_{uuid4().hex[:12]}",
                ticket_id=ticket.id,
                actor_user_id=context.user.id,
                kind="approval_requested",
                reference_id=approval.id,
                note=payload.note,
            )
        )
    elif payload.action == "resolve":
        ticket.status = "closed"
        ticket.closed_at = now
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action=f"support_ticket.{payload.action}",
        entity_type="support_ticket",
        entity_id=ticket.id,
        details={"referenceId": payload.reference_id, "note": payload.note},
    )
    await session.commit()
    return {"ok": True, "data": await _admin_support_ticket_data(session, ticket)}


def approval_data(item: ApprovalRequest) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "entityType": item.entity_type,
        "entityId": item.entity_id,
        "requestedBy": item.requested_by,
        "approvedBy": item.approved_by,
        "status": item.status,
        "payload": item.payload or {},
        "reason": item.reason,
        "createdAt": item.created_at.isoformat(),
        "decidedAt": item.decided_at.isoformat() if item.decided_at else None,
    }


async def _execute_approved_refund(
    item: ApprovalRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    order = await session.scalar(
        select(ShopOrder).where(ShopOrder.id == item.entity_id).with_for_update()
    )
    if order is None:
        raise AppError(404, "SHOP_ORDER_NOT_FOUND", "환불할 주문을 찾을 수 없습니다.")
    if order.status != "completed" or not order.point_ledger_id:
        raise AppError(409, "SHOP_ORDER_NOT_REFUNDABLE", "환불할 수 없는 주문입니다.")
    entitlement = await session.scalar(
        select(ShopOrderEntitlement)
        .where(ShopOrderEntitlement.order_id == order.id)
        .with_for_update()
    )
    if entitlement and entitlement.status == "opened":
        raise AppError(409, "SHOP_ORDER_NOT_REFUNDABLE", "이미 사용한 상품은 환불할 수 없습니다.")
    if entitlement:
        entitlement.status = "revoked"
    else:
        reward_grant = await session.scalar(
            select(RewardGrant)
            .where(
                RewardGrant.user_id == order.user_id,
                RewardGrant.rule_key == f"shop_order:{order.id}",
            )
            .with_for_update()
        )
        if (
            reward_grant is None
            or reward_grant.revoked_at is not None
            or reward_grant.claimed_at is not None
        ):
            raise AppError(
                409, "SHOP_ORDER_NOT_REFUNDABLE", "지급 정보를 확인할 수 없는 주문입니다."
            )
        reward_grant.revoked_at = datetime.now(UTC)
    original = await session.get(PointLedger, order.point_ledger_id)
    if original is None or original.amount >= 0:
        raise AppError(409, "SHOP_ORDER_LEDGER_INVALID", "주문 원장을 확인할 수 없습니다.")
    event = await record_engagement_event(
        session,
        user_id=order.user_id,
        kind="points_refunded",
        source_type="admin_shop_refund",
        source_id=f"{order.id}:{item.id}",
        payload={"orderId": order.id, "points": order.price_points, "approvalId": item.id},
    )
    ledger = await reverse_points(
        session,
        user_id=order.user_id,
        source_event_id=event.id,
        rule_key=f"admin_shop_refund:{order.id}",
        amount=order.price_points,
        reversed_ledger_id=original.id,
        description=f"{order.product_name} 관리자 환불",
        metadata={"orderId": order.id, "approvalId": item.id, "actorId": context.user.id},
    )
    transaction = PointTransaction(
        id=f"point_tx_{uuid4().hex[:12]}",
        user_id=order.user_id,
        operation="refund",
        idempotency_key=f"approval:{item.id}",
        amount=order.price_points,
        ledger_id=ledger.id,
        status="completed",
    )
    session.add(transaction)
    order.status = "refunded"
    order.refund_transaction_id = transaction.id
    order.refunded_at = datetime.now(UTC)
    return {"orderId": order.id, "balance": ledger.balance_after}


async def _execute_approved_point_adjustment(
    item: ApprovalRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    amount = int((item.payload or {}).get("amount") or 0)
    if amount == 0:
        raise AppError(422, "INVALID_POINT_AMOUNT", "승인된 조정 포인트가 없습니다.")
    user = await session.get(User, item.entity_id)
    if user is None or user.role.value != "fan":
        raise AppError(404, "FAN_NOT_FOUND", "포인트를 조정할 팬을 찾을 수 없습니다.")
    event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="points_adjusted",
        source_type="approved_admin_point_adjustment",
        source_id=item.id,
        payload={"amount": amount, "approvalId": item.id},
    )
    ledger = await (
        grant_points(
            session,
            user_id=user.id,
            source_event_id=event.id,
            rule_key=f"approved_admin_adjustment:{item.id}",
            amount=amount,
            description=item.reason or "승인된 관리자 포인트 조정",
            metadata={"actorId": context.user.id},
        )
        if amount > 0
        else spend_points(
            session,
            user_id=user.id,
            source_event_id=event.id,
            rule_key=f"approved_admin_adjustment:{item.id}",
            amount=abs(amount),
            description=item.reason or "승인된 관리자 포인트 조정",
            metadata={"actorId": context.user.id},
        )
    )
    transaction = PointTransaction(
        id=f"point_tx_{uuid4().hex[:12]}",
        user_id=user.id,
        operation="adjustment",
        idempotency_key=f"approval:{item.id}",
        amount=amount,
        ledger_id=ledger.id,
        status="completed",
    )
    session.add(transaction)
    return {"userId": user.id, "amount": amount, "balance": ledger.balance_after}


@router.get("/approvals")
async def list_admin_approvals(context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("audit:read")
    items = list(
        await session.scalars(
            select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc()).limit(100)
        )
    )
    return {"ok": True, "data": {"items": [approval_data(item) for item in items]}}


@router.post("/approvals", status_code=status.HTTP_201_CREATED)
async def create_admin_approval(
    payload: ApprovalCreateRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("audit:read")
    duplicate = await session.scalar(
        select(ApprovalRequest).where(
            ApprovalRequest.kind == payload.kind,
            ApprovalRequest.entity_type == payload.entity_type,
            ApprovalRequest.entity_id == payload.entity_id,
            ApprovalRequest.status == "pending",
        )
    )
    if duplicate:
        return {"ok": True, "data": approval_data(duplicate), "replayed": True}
    item = ApprovalRequest(
        id=f"approval_{uuid4().hex[:12]}",
        kind=payload.kind,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        requested_by=context.user.id,
        payload=payload.payload,
        reason=payload.reason,
    )
    session.add(item)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="approval.requested",
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        details={"kind": payload.kind},
    )
    await session.commit()
    return {"ok": True, "data": approval_data(item)}


@router.post("/approvals/{approval_id}/approve")
async def approve_admin_approval(
    approval_id: str, payload: ApprovalDecisionRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("audit:read")
    item = await session.get(ApprovalRequest, approval_id)
    if item is None:
        raise AppError(404, "APPROVAL_NOT_FOUND", "승인 요청을 찾을 수 없습니다.")
    if item.status != "pending":
        return {"ok": True, "data": {**approval_data(item), "replayed": True}}
    if item.requested_by == context.user.id:
        raise AppError(409, "APPROVAL_SELF_APPROVAL", "요청자 본인은 승인할 수 없습니다.")
    execution = None
    if item.kind == "refund_order":
        execution = await _execute_approved_refund(item, context, session)
    elif item.kind == "grant_points":
        execution = await _execute_approved_point_adjustment(item, context, session)
    item.status = "approved"
    item.approved_by = context.user.id
    item.decided_at = datetime.now(UTC)
    if item.kind == "product_publish":
        product = await session.get(ShopProduct, item.entity_id)
        if product is not None:
            product.status = "published"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="approval.approved",
        entity_type=item.entity_type,
        entity_id=item.entity_id,
        details={"approvalId": item.id},
    )
    await session.commit()
    return {"ok": True, "data": {**approval_data(item), "execution": execution}}


@router.post("/approvals/{approval_id}/reject")
async def reject_admin_approval(
    approval_id: str, payload: ApprovalDecisionRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("audit:read")
    item = await session.get(ApprovalRequest, approval_id)
    if item is None:
        raise AppError(404, "APPROVAL_NOT_FOUND", "승인 요청을 찾을 수 없습니다.")
    if item.status != "pending":
        return {"ok": True, "data": approval_data(item), "replayed": True}
    item.status = "rejected"
    item.approved_by = context.user.id
    item.reason = payload.reason or item.reason
    item.decided_at = datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="approval.rejected",
        entity_type=item.entity_type,
        entity_id=item.entity_id,
        details={"approvalId": item.id},
    )
    await session.commit()
    return {"ok": True, "data": approval_data(item)}


@router.post("/support-tickets/{ticket_id}/messages", status_code=status.HTTP_201_CREATED)
async def reply_admin_support_ticket(
    ticket_id: str,
    payload: SupportMessageCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("support:write")
    ticket = await session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AppError(404, "SUPPORT_TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.")
    if ticket.status == "closed":
        raise AppError(409, "SUPPORT_TICKET_CLOSED", "종료된 문의에는 답변할 수 없습니다.")
    message = SupportMessage(
        id=f"support_message_{uuid4().hex[:12]}",
        ticket_id=ticket.id,
        author_user_id=context.user.id,
        body=payload.body.strip(),
    )
    ticket.status = "answered"
    ticket.assigned_admin_id = context.user.id
    session.add(message)
    await notify_user_once(
        session,
        user_id=ticket.user_id,
        kind="support_ticket_answered",
        title="고객센터 문의에 답변이 도착했어요",
        body=ticket.subject,
        entity_type="support_ticket",
        entity_id=ticket.id,
        event_key=f"support:{ticket.id}:answer:{message.id}",
    )
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="support_ticket.replied",
        entity_type="support_ticket",
        entity_id=ticket.id,
        details={"messageId": message.id},
    )
    await session.commit()
    return {"ok": True, "data": await _admin_support_ticket_data(session, ticket)}


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


def card_pack_data(pack: CardPack, cards: list[dict] | None = None) -> dict:
    return {
        "id": pack.id,
        "artistId": pack.artist_id,
        "name": pack.name,
        "seasonName": pack.season_name,
        "version": pack.version,
        "imageUrl": pack.image_url,
        "description": pack.description,
        "status": pack.status,
        "publishedAt": pack.published_at.isoformat() if pack.published_at else None,
        "cards": cards or [],
    }


async def validate_card_pack_input(payload: CardPackCreate, session: DbSession) -> None:
    if len({item.card_id for item in payload.cards}) != len(payload.cards):
        raise AppError(
            422, "DUPLICATE_PACK_CARD", "카드팩에 같은 카드를 중복으로 넣을 수 없습니다."
        )
    total = sum(item.probability for item in payload.cards if item.enabled)
    if payload.cards and abs(total - 100) > 0.001:
        raise AppError(422, "INVALID_PACK_ODDS", "공개 확률의 합계는 100%여야 합니다.")
    cards = await session.scalars(
        select(Card).where(Card.id.in_([item.card_id for item in payload.cards]))
    )
    card_rows = cards.all()
    if len(card_rows) != len(payload.cards):
        raise AppError(404, "CARD_NOT_FOUND", "카드팩에 포함할 카드를 찾을 수 없습니다.")
    if any(card.status != "published" for card in card_rows):
        raise AppError(
            422,
            "PACK_CARDS_NOT_PUBLISHED",
            "공개되지 않은 카드는 카드팩에 포함할 수 없습니다.",
        )


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


def mission_data(mission: MissionDefinition) -> dict:
    return {
        "id": mission.id,
        "title": mission.title,
        "description": mission.description,
        "organizationId": mission.organization_id,
        "artistId": mission.artist_id,
        "eventKind": mission.event_kind,
        "targetValue": mission.target_value,
        "recurrence": mission.recurrence,
        "conditionPayload": mission.condition_payload or {},
        "rewardPayload": mission.reward_payload or {},
        "status": mission.status,
        "startsAt": _iso_utc(mission.starts_at),
        "endsAt": _iso_utc(mission.ends_at),
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
        "description": season.description,
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


def ensure_mission_visible(context: AdminContext, mission: MissionDefinition) -> None:
    if context.is_root or context.is_platform_operator:
        return
    if context.organization is None or mission.organization_id != context.organization.id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    if context.membership.access_level == "company_admin":
        return
    if mission.artist_id is None or mission.artist_id not in context.assigned_artist_ids:
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
    if context.is_root or context.is_platform_operator:
        return
    if achievement.organization_id is None:
        if "engagement:approve_global" not in context.allowed_actions:
            raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")
        return
    if context.membership.access_level != "company_admin":
        raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")


def ensure_pass_season_approver_scope(context: AdminContext, season: PassSeason) -> None:
    if context.is_root or context.is_platform_operator:
        return
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
    if artist_id is None:
        artist_scoped_ids = set(
            (
                await session.scalars(
                    select(RewardCatalog.id).where(
                        RewardCatalog.id.in_(normalized),
                        RewardCatalog.artist_id.is_not(None),
                    )
                )
            ).all()
        )
        if artist_scoped_ids:
            raise AppError(
                422,
                "GLOBAL_REWARD_REQUIRED",
                "전체 레벨에는 전체 보상만 연결할 수 있습니다.",
            )
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


def level_policy_data(policy: LevelPolicyVersion, thresholds: list[LevelThreshold]) -> dict:
    return {
        "id": policy.id,
        "name": policy.name,
        "status": policy.status,
        "isActive": policy.is_active,
        "effectiveAt": _iso_utc(policy.effective_at),
        "thresholds": [
            {
                "id": item.id,
                "level": item.level,
                "requiredXp": item.required_xp,
                "label": item.label,
            }
            for item in thresholds
        ],
    }


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


@router.get("/engagement/missions")
async def list_admin_missions(context: CurrentAdmin, session: DbSession) -> dict:
    rows = await session.scalars(
        select(MissionDefinition)
        .where(*engagement_scope_filters(context, MissionDefinition))
        .order_by(MissionDefinition.title, MissionDefinition.id)
    )
    return {"ok": True, "data": {"items": [mission_data(item) for item in rows]}}


@router.post("/engagement/missions", status_code=status.HTTP_201_CREATED)
async def create_mission(
    payload: MissionDefinitionCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    _require_engagement_write(context)
    organization_id, artist_id = await require_engagement_scope(
        session, context, payload.organization_id, payload.artist_id
    )
    mission = MissionDefinition(
        id=f"mission_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=artist_id,
        title=payload.title,
        description=payload.description,
        event_kind=payload.event_kind,
        target_value=payload.target_value,
        recurrence=payload.recurrence,
        condition_payload=payload.condition_payload,
        reward_payload=payload.reward_payload,
        status="draft",
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(mission)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="mission.created",
        entity_type="mission",
        entity_id=mission.id,
        organization_id=mission.organization_id,
        artist_id=mission.artist_id,
        details={"eventKind": mission.event_kind, "recurrence": mission.recurrence},
    )
    await session.commit()
    return {"ok": True, "data": mission_data(mission)}


@router.patch("/engagement/missions/{mission_id}")
async def update_mission(
    mission_id: str,
    payload: MissionDefinitionUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_engagement_write(context)
    mission = await session.get(MissionDefinition, mission_id)
    if mission is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_mission_visible(context, mission)
    if mission.status != "draft":
        raise AppError(409, "MISSION_EDIT_LOCKED", "초안 상태의 미션만 수정할 수 있습니다.")
    if "organization_id" in payload.model_fields_set or "artist_id" in payload.model_fields_set:
        organization_id, artist_id = await require_engagement_scope(
            session,
            context,
            payload.organization_id
            if "organization_id" in payload.model_fields_set
            else mission.organization_id,
            payload.artist_id if "artist_id" in payload.model_fields_set else mission.artist_id,
        )
        mission.organization_id = organization_id
        mission.artist_id = artist_id
    for field, attribute in (
        ("title", "title"),
        ("description", "description"),
        ("event_kind", "event_kind"),
        ("target_value", "target_value"),
        ("recurrence", "recurrence"),
        ("condition_payload", "condition_payload"),
        ("reward_payload", "reward_payload"),
        ("starts_at", "starts_at"),
        ("ends_at", "ends_at"),
    ):
        if field in payload.model_fields_set:
            setattr(mission, attribute, getattr(payload, field))
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="mission.updated",
        entity_type="mission",
        entity_id=mission.id,
        organization_id=mission.organization_id,
        artist_id=mission.artist_id,
        details={"status": mission.status},
    )
    await session.commit()
    return {"ok": True, "data": mission_data(mission)}


async def transition_mission_status(
    mission_id: str,
    context: AdminContext,
    session: DbSession,
    *,
    required_status: str,
    next_status: str,
    action: str,
) -> dict:
    mission = await session.get(MissionDefinition, mission_id)
    if mission is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_mission_visible(context, mission)
    if mission.status != required_status:
        raise AppError(
            409,
            "INVALID_MISSION_STATUS",
            "현재 상태에서는 미션 검수 상태를 전환할 수 없습니다.",
        )
    mission.status = next_status
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action=action,
        entity_type="mission",
        entity_id=mission.id,
        organization_id=mission.organization_id,
        artist_id=mission.artist_id,
        details={"previousStatus": required_status, "nextStatus": next_status},
    )
    await session.commit()
    return {"ok": True, "data": mission_data(mission)}


@router.post("/engagement/missions/{mission_id}/submit")
async def submit_mission_review(mission_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_engagement_write(context)
    return await transition_mission_status(
        mission_id,
        context,
        session,
        required_status="draft",
        next_status="pending_review",
        action="mission.submitted",
    )


@router.post("/engagement/missions/{mission_id}/approve")
async def approve_mission(mission_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    mission = await session.get(MissionDefinition, mission_id)
    if mission is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_mission_visible(context, mission)
    _require_engagement_approve(context)
    if mission.organization_id is None:
        if not context.is_root and "engagement:approve_global" not in context.allowed_actions:
            raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")
    elif (
        not context.is_root
        and not context.is_platform_operator
        and context.membership.access_level != "company_admin"
    ):
        raise AppError(
            403, "ADMIN_WRITE_REQUIRED", "파트너 관리자만 미션을 공개 승인할 수 있습니다."
        )
    if mission.status != "pending_review":
        raise AppError(
            409,
            "INVALID_MISSION_STATUS",
            "검수 대기 중인 미션만 공개 승인할 수 있습니다.",
        )
    mission.status = "published"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="mission.published",
        entity_type="mission",
        entity_id=mission.id,
        organization_id=mission.organization_id,
        artist_id=mission.artist_id,
        details={"previousStatus": "pending_review", "nextStatus": "published"},
    )
    await session.commit()
    return {"ok": True, "data": mission_data(mission)}


@router.post("/engagement/missions/{mission_id}/disable")
async def disable_mission(mission_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    mission = await session.get(MissionDefinition, mission_id)
    if mission is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    ensure_mission_visible(context, mission)
    _require_engagement_approve(context)
    if mission.organization_id is None:
        if not context.is_root and "engagement:approve_global" not in context.allowed_actions:
            raise AppError(403, "ADMIN_WRITE_REQUIRED", "이 작업을 수행할 권한이 없습니다.")
    elif (
        not context.is_root
        and not context.is_platform_operator
        and context.membership.access_level != "company_admin"
    ):
        raise AppError(
            403, "ADMIN_WRITE_REQUIRED", "파트너 관리자만 미션을 비활성화할 수 있습니다."
        )
    if mission.status != "published":
        raise AppError(
            409,
            "INVALID_MISSION_STATUS",
            "공개 중인 미션만 비활성화할 수 있습니다.",
        )
    mission.status = "disabled"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="mission.disabled",
        entity_type="mission",
        entity_id=mission.id,
        organization_id=mission.organization_id,
        artist_id=mission.artist_id,
        details={"previousStatus": "published", "nextStatus": "disabled"},
    )
    await session.commit()
    return {"ok": True, "data": mission_data(mission)}


@router.get("/engagement/level-policies")
async def list_level_policies(context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("engagement:manage_global")
    policies = list(
        await session.scalars(
            select(LevelPolicyVersion).order_by(
                LevelPolicyVersion.created_at.desc(), LevelPolicyVersion.id
            )
        )
    )
    items = []
    for policy in policies:
        thresholds = list(
            await session.scalars(
                select(LevelThreshold)
                .where(LevelThreshold.policy_version_id == policy.id)
                .order_by(LevelThreshold.level)
            )
        )
        items.append(level_policy_data(policy, thresholds))
    return {"ok": True, "data": {"items": items}}


@router.post("/engagement/level-policies", status_code=status.HTTP_201_CREATED)
async def create_level_policy(
    payload: LevelPolicyCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("engagement:manage_global")
    policy = LevelPolicyVersion(
        id=f"level_policy_{uuid4().hex[:12]}",
        name=payload.name,
        status="draft",
        is_active=False,
        effective_at=payload.effective_at,
    )
    session.add(policy)
    for threshold in payload.thresholds:
        session.add(
            LevelThreshold(
                id=f"level_threshold_{uuid4().hex[:12]}",
                policy_version_id=policy.id,
                level=threshold.level,
                required_xp=threshold.required_xp,
                label=threshold.label,
            )
        )
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="level_policy.created",
        entity_type="level_policy",
        entity_id=policy.id,
        details={"thresholdCount": len(payload.thresholds)},
    )
    await session.commit()
    thresholds = list(
        await session.scalars(
            select(LevelThreshold)
            .where(LevelThreshold.policy_version_id == policy.id)
            .order_by(LevelThreshold.level)
        )
    )
    return {"ok": True, "data": level_policy_data(policy, thresholds)}


@router.post("/engagement/level-policies/{policy_id}/publish")
async def publish_level_policy(policy_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("engagement:manage_global")
    policy = await session.get(LevelPolicyVersion, policy_id)
    if policy is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "레벨 정책을 찾을 수 없습니다.")
    if policy.status != "draft":
        raise AppError(409, "INVALID_LEVEL_POLICY_STATUS", "초안 정책만 공개할 수 있습니다.")
    thresholds = list(
        await session.scalars(
            select(LevelThreshold).where(LevelThreshold.policy_version_id == policy.id)
        )
    )
    if not thresholds:
        raise AppError(409, "LEVEL_POLICY_EMPTY", "레벨 기준을 하나 이상 등록해 주세요.")
    await session.execute(
        update(LevelPolicyVersion)
        .where(LevelPolicyVersion.is_active.is_(True))
        .values(is_active=False)
    )
    policy.status = "published"
    policy.is_active = True
    policy.effective_at = policy.effective_at or datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="level_policy.published",
        entity_type="level_policy",
        entity_id=policy.id,
        details={"thresholdCount": len(thresholds)},
    )
    await session.commit()
    thresholds.sort(key=lambda item: item.level)
    return {"ok": True, "data": level_policy_data(policy, thresholds)}


@router.post("/engagement/points/adjustments")
async def adjust_fan_points(
    payload: PointAdjustmentRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("engagement:points_adjust")
    if payload.amount == 0:
        raise AppError(422, "INVALID_POINT_AMOUNT", "조정 포인트는 0이 될 수 없습니다.")
    user = await session.get(User, payload.user_id)
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "팬을 찾을 수 없습니다.")
    idempotency_key = payload.idempotency_key or uuid4().hex
    existing_transaction = await session.scalar(
        select(PointTransaction).where(
            PointTransaction.user_id == user.id,
            PointTransaction.operation == "adjustment",
            PointTransaction.idempotency_key == idempotency_key,
        )
    )
    if existing_transaction and existing_transaction.ledger_id:
        ledger = await session.get(PointLedger, existing_transaction.ledger_id)
        if ledger is not None:
            return {
                "ok": True,
                "data": {
                    "userId": user.id,
                    "amount": payload.amount,
                    "balance": ledger.balance_after,
                    "replayed": True,
                },
            }
    source_id = f"admin_adjustment:{payload.user_id}:{idempotency_key}"
    event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="points_adjusted",
        source_type="admin_point_adjustment",
        source_id=source_id,
        payload={"amount": payload.amount, "reason": payload.reason},
    )
    if payload.amount > 0:
        ledger = await grant_points(
            session,
            user_id=user.id,
            source_event_id=event.id,
            rule_key="admin_point_adjustment",
            amount=payload.amount,
            description=payload.reason,
            metadata={"actorId": context.user.id},
        )
    else:
        ledger = await spend_points(
            session,
            user_id=user.id,
            source_event_id=event.id,
            rule_key="admin_point_adjustment",
            amount=abs(payload.amount),
            description=payload.reason,
            metadata={"actorId": context.user.id},
        )
    transaction = existing_transaction or PointTransaction(
        id=f"point_tx_{uuid4().hex[:12]}",
        user_id=user.id,
        operation="adjustment",
        idempotency_key=idempotency_key,
        amount=payload.amount,
        status="completed",
    )
    transaction.ledger_id = ledger.id
    session.add(transaction)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="points.adjusted",
        entity_type="user",
        entity_id=user.id,
        details={"amount": payload.amount, "reason": payload.reason, "eventId": event.id},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {"userId": user.id, "amount": payload.amount, "balance": ledger.balance_after},
    }


@router.get("/engagement/events")
async def list_engagement_events(
    context: CurrentAdmin,
    session: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
) -> dict:
    context.require_action("engagement:retry")
    filters = []
    if status_filter:
        filters.append(EngagementEvent.status == status_filter)
    rows = list(
        await session.scalars(
            select(EngagementEvent).where(*filters).order_by(EngagementEvent.id.desc()).limit(100)
        )
    )
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": event.id,
                    "userId": event.user_id,
                    "kind": event.kind,
                    "sourceType": event.source_type,
                    "sourceId": event.source_id,
                    "status": event.status,
                    "attemptCount": event.attempt_count,
                    "errorCode": event.error_code,
                    "errorMessage": event.error_message,
                }
                for event in rows
            ]
        },
    }


@router.post("/engagement/events/{event_id}/retry")
async def retry_engagement_event(
    event_id: str,
    context: CurrentAdmin,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
    context.require_action("engagement:retry")
    event = await session.get(EngagementEvent, event_id)
    if event is None:
        raise AppError(404, "ENGAGEMENT_EVENT_NOT_FOUND", "성장 이벤트를 찾을 수 없습니다.")
    if event.status != "failed":
        raise AppError(409, "INVALID_ENGAGEMENT_STATUS", "실패한 이벤트만 재처리할 수 있습니다.")
    event.status = "pending"
    event.error_code = None
    event.error_message = None
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="engagement_event.retried",
        entity_type="engagement_event",
        entity_id=event.id,
        details={"previousStatus": "failed"},
    )
    await session.commit()
    enqueue_engagement_event(event.id, background_tasks)
    return {"ok": True, "data": {"id": event.id, "status": event.status}}


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
        # Rewards do not have a separate review transition. They become
        # fan-facing catalog entries when an authorized admin registers them.
        status="published",
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


@router.get("/engagement/rewards/{reward_id}/image")
async def admin_reward_image(reward_id: str, context: CurrentAdmin, session: DbSession) -> Response:
    reward = await session.scalar(
        select(RewardCatalog).where(
            RewardCatalog.id == reward_id,
            *engagement_scope_filters(context, RewardCatalog),
        )
    )
    asset_id = (
        reward.metadata_.get("imageAssetId")
        if reward and isinstance(reward.metadata_, dict)
        else None
    )
    asset = await session.get(Asset, asset_id) if asset_id else None
    if not asset or asset.purpose != "reward_image" or not asset.storage_path:
        raise AppError(404, "REWARD_IMAGE_NOT_FOUND", "보상 이미지를 찾을 수 없습니다.")
    return storage_response(
        configured_asset_storage(), asset.storage_path, media_type=asset.content_type or "image/png"
    )


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
        description=payload.description,
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


@router.patch("/engagement/pass-seasons/{season_id}")
async def update_pass_season(
    season_id: str,
    payload: PassSeasonCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_engagement_write(context)
    season = await scoped_pass_season_or_404(season_id, context, session)
    organization_id, artist_id = await require_engagement_scope(
        session, context, payload.organization_id, payload.artist_id
    )
    reward_ids = [tier.reward_id for tier in payload.tiers if tier.reward_id]
    await validate_reward_scope(session, reward_ids, organization_id, artist_id)
    season.organization_id = organization_id
    season.artist_id = artist_id
    season.title = payload.title
    season.description = payload.description
    season.starts_at = payload.starts_at
    season.ends_at = payload.ends_at
    season.is_paid = False
    await session.execute(delete(PassTier).where(PassTier.season_id == season.id))
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
        action="pass_season.updated",
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
            RewardGrant.revoked_at.is_(None),
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


@router.get("/card-operations/metrics")
async def card_operations_metrics(context: CurrentAdmin, session: DbSession) -> dict:
    """Return scoped operational counters for the card lifecycle dashboard."""
    _require_scoped_action(context, "audit:read")
    card_scope = _card_scope_filters(context)

    pack_openings = (
        await session.scalar(
            select(func.count())
            .select_from(CardPackOpening)
            .join(Card, Card.id == CardPackOpening.card_id)
            .where(*card_scope)
        )
        or 0
    )
    issued_cards = (
        await session.scalar(
            select(func.count())
            .select_from(UserCard)
            .join(Card, Card.id == UserCard.card_id)
            .where(*card_scope)
        )
        or 0
    )
    card_holders = (
        await session.scalar(
            select(func.count(func.distinct(UserCard.user_id)))
            .select_from(UserCard)
            .join(Card, Card.id == UserCard.card_id)
            .where(*card_scope)
        )
        or 0
    )
    combinations = (
        await session.scalar(
            select(func.count())
            .select_from(CardCombination)
            .join(Card, Card.id == CardCombination.result_card_id)
            .where(*card_scope)
        )
        or 0
    )
    trade_rows = await session.execute(
        select(TradeProposal.status, func.count(func.distinct(TradeProposal.id)))
        .select_from(TradeProposal)
        .join(TradeItem, TradeItem.proposal_id == TradeProposal.id)
        .join(UserCard, UserCard.id == TradeItem.user_card_id)
        .join(Card, Card.id == UserCard.card_id)
        .where(*card_scope)
        .group_by(TradeProposal.status)
    )
    trade_counts = {status: count for status, count in trade_rows}
    redeem_success = (
        await session.scalar(
            select(func.count())
            .select_from(UserCard)
            .join(Card, Card.id == UserCard.card_id)
            .where(*card_scope, UserCard.redeem_code_id.is_not(None))
        )
        or 0
    )
    audit_scope = []
    if not context.is_root:
        audit_scope = [
            AuditLog.organization_id == context.membership.organization_id,
            or_(AuditLog.artist_id.is_(None), AuditLog.artist_id.in_(context.assigned_artist_ids)),
        ]
    redeem_failures = (
        await session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(*audit_scope, AuditLog.action == "redemption.failed")
        )
        or 0
    )
    rarity_rows = await session.execute(
        select(Card.rarity, func.count(UserCard.id))
        .select_from(UserCard)
        .join(Card, Card.id == UserCard.card_id)
        .where(*card_scope)
        .group_by(Card.rarity)
        .order_by(Card.rarity)
    )
    holder_rows = await session.execute(
        select(Card.id, Card.name, func.count(func.distinct(UserCard.user_id)))
        .select_from(Card)
        .outerjoin(UserCard, UserCard.card_id == Card.id)
        .where(*card_scope)
        .group_by(Card.id, Card.name)
        .order_by(Card.name, Card.id)
    )
    delivery_summary: dict[str, dict[str, int]] = {}
    if context.is_root:
        delivery_rows = await session.execute(
            select(
                NotificationDelivery.channel, NotificationDelivery.status, func.count()
            ).group_by(NotificationDelivery.channel, NotificationDelivery.status)
        )
        for channel, delivery_status, count in delivery_rows:
            delivery_summary.setdefault(channel, {})[delivery_status] = count
    return {
        "ok": True,
        "data": {
            "packOpenings": pack_openings,
            "issuedCards": issued_cards,
            "cardHolders": card_holders,
            "redeem": {"success": redeem_success, "failure": redeem_failures},
            "combinations": combinations,
            "trades": {
                "total": sum(trade_counts.values()),
                "pending": trade_counts.get("pending", 0),
                "accepted": trade_counts.get("accepted", 0),
                "rejected": trade_counts.get("rejected", 0),
                "cancelled": trade_counts.get("cancelled", 0),
                "expired": trade_counts.get("expired", 0),
            },
            "byRarity": [
                {"rarity": rarity or "미지정", "issued": count} for rarity, count in rarity_rows
            ],
            "cards": [
                {"cardId": card_id, "cardName": name, "holders": count}
                for card_id, name, count in holder_rows
            ],
            "notificationDelivery": delivery_summary,
        },
    }


@router.get("/operations/overview")
async def operations_overview(context: CurrentAdmin, session: DbSession) -> dict:
    """Return one permission-scoped queue summary for the operations dashboard."""
    _require_scoped_action(context, "audit:read")
    card_scope = _card_scope_filters(context)
    product_scope = (
        [] if context.is_root else [ShopProduct.artist_id.in_(context.assigned_artist_ids)]
    )

    failed_deliveries = (
        await session.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .where(NotificationDelivery.status.in_(("failed", "dead_letter")))
        )
        or 0
    )
    retryable_deliveries = (
        await session.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .where(NotificationDelivery.status == "retry")
        )
        or 0
    )
    failed_events = (
        await session.scalar(
            select(func.count())
            .select_from(EngagementEvent)
            .where(EngagementEvent.status.in_(("failed", "dead_letter")))
        )
        or 0
    )
    open_support = (
        await session.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.status.in_(("open", "in_progress")))
        )
        or 0
    )
    pending_trades = (
        await session.scalar(
            select(func.count())
            .select_from(TradeProposal)
            .join(TradeItem, TradeItem.proposal_id == TradeProposal.id)
            .join(UserCard, UserCard.id == TradeItem.user_card_id)
            .join(Card, Card.id == UserCard.card_id)
            .where(TradeProposal.status == "pending", *card_scope)
        )
        or 0
    )
    refunded_orders = (
        await session.scalar(
            select(func.count())
            .select_from(ShopOrder)
            .join(ShopProduct, ShopProduct.id == ShopOrder.product_id)
            .where(ShopOrder.status == "refunded", *product_scope)
        )
        or 0
    )
    failed_point_transactions = (
        await session.scalar(
            select(func.count())
            .select_from(PointTransaction)
            .where(PointTransaction.status == "failed")
        )
        or 0
    )
    unclaimed_rewards = (
        await session.scalar(
            select(func.count())
            .select_from(RewardGrant)
            .where(RewardGrant.claimed_at.is_(None), RewardGrant.revoked_at.is_(None))
        )
        or 0
    )
    recent_logs = list(
        await session.scalars(
            select(AuditLog)
            .where(
                AuditLog.action.in_(
                    (
                        "notification_delivery.retried",
                        "support_ticket.replied",
                        "support_ticket.status_changed",
                        "shop_order.refunded",
                        "trade.accepted",
                        "reward.revoked",
                    )
                )
            )
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(10)
        )
    )
    return {
        "ok": True,
        "data": {
            "queues": {
                "failedDeliveries": failed_deliveries,
                "retryableDeliveries": retryable_deliveries,
                "failedEngagementEvents": failed_events,
                "openSupportTickets": open_support,
                "pendingTrades": pending_trades,
                "refundedOrders": refunded_orders,
                "failedPointTransactions": failed_point_transactions if context.is_root else 0,
                "unclaimedRewards": unclaimed_rewards,
            },
            "recentActions": [
                {
                    "id": log.id,
                    "action": log.action,
                    "entityType": log.entity_type,
                    "entityId": log.entity_id,
                    "createdAt": log.created_at.isoformat(),
                }
                for log in recent_logs
            ],
        },
    }


@router.get("/cards/export")
async def export_cards(
    context: CurrentAdmin,
    session: DbSession,
    q: str | None = None,
    card_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=5000, ge=1, le=10000),
) -> StreamingResponse:
    _require_scoped_action(context, "cards:read")
    filters = _card_scope_filters(context)
    if q:
        filters.append(Card.name.ilike(f"%{q}%"))
    if card_status:
        filters.append(Card.status == card_status)
    cards = await session.scalars(select(Card).where(*filters).order_by(Card.id).limit(limit))
    return _csv_download(
        "fanfolio-cards.csv",
        [
            "card_id",
            "name",
            "artist_id",
            "member_id",
            "rarity",
            "status",
            "issue_limit",
            "season_name",
        ],
        [
            [
                card.id,
                card.name,
                card.artist_id,
                card.member_id,
                card.rarity,
                card.status,
                card.issue_limit,
                card.season_name,
            ]
            for card in cards
        ],
        include_bom=True,
    )


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
        filters.append(
            or_(
                Card.organization_id == context.membership.organization_id,
                Card.organization_id.is_(None),
            )
        )
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
            "sourceImageUrl": f"/api/admin/cards/{card.id}/image" if card.image_asset_id else None,
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


def _card_pack_card_data(link: CardPackCard, card: Card) -> dict:
    return {
        "id": link.id,
        "cardId": card.id,
        "name": card.name,
        "rarity": card.rarity,
        "memberId": card.member_id,
        "artistId": card.artist_id,
        "imageUrl": card.image_url,
        "position": link.position,
        "probability": link.probability,
        "enabled": link.enabled,
    }


@router.get("/card-packs")
async def list_card_packs(
    context: CurrentAdmin,
    session: DbSession,
    q: str | None = None,
    pack_status: str | None = Query(default=None, alias="status"),
) -> dict:
    _require_scoped_action(context, "cards:read")
    filters = []
    if q:
        filters.append(or_(CardPack.name.ilike(f"%{q}%"), CardPack.season_name.ilike(f"%{q}%")))
    if pack_status:
        filters.append(CardPack.status == pack_status)
    if not context.is_root:
        filters.append(CardPack.artist_id.in_(context.assigned_artist_ids))
        filters.append(
            or_(
                CardPack.organization_id == context.membership.organization_id,
                CardPack.organization_id.is_(None),
            )
        )
    packs = list(
        await session.scalars(
            select(CardPack)
            .where(*filters)
            .order_by(CardPack.created_at.desc(), CardPack.id.desc())
        )
    )
    cards_by_pack: dict[str, list[dict]] = {pack.id: [] for pack in packs}
    if packs:
        rows = await session.execute(
            select(CardPackCard, Card)
            .join(Card, CardPackCard.card_id == Card.id)
            .where(CardPackCard.pack_id.in_(cards_by_pack))
            .order_by(CardPackCard.position, CardPackCard.id)
        )
        for link, card in rows:
            cards_by_pack[link.pack_id].append(_card_pack_card_data(link, card))
    return {
        "ok": True,
        "data": {"items": [card_pack_data(pack, cards_by_pack[pack.id]) for pack in packs]},
    }


@router.post("/card-packs", status_code=status.HTTP_201_CREATED)
async def create_card_pack(
    payload: CardPackCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "cards:write")
    context.require_write()
    await validate_card_pack_input(payload, session)
    artist = await session.get(Artist, payload.artist_id)
    if artist is None:
        raise AppError(404, "ARTIST_NOT_FOUND", "아티스트를 찾을 수 없습니다.")
    if not context.is_root:
        context.require_artist(artist.id)
    card_rows = list(
        await session.scalars(
            select(Card).where(Card.id.in_([item.card_id for item in payload.cards]))
        )
    )
    cards_by_id = {card.id: card for card in card_rows}
    if any(card.artist_id != artist.id for card in card_rows):
        raise AppError(422, "PACK_ARTIST_MISMATCH", "카드팩과 카드의 아티스트가 일치해야 합니다.")
    pack = CardPack(
        id=f"pack_{uuid4().hex[:12]}",
        organization_id=context.membership.organization_id,
        artist_id=artist.id,
        name=payload.name,
        season_name=payload.season_name,
        version=payload.version,
        image_url=payload.image_url,
        description=payload.description,
        status="draft",
    )
    session.add(pack)
    links = []
    for item in payload.cards:
        link = CardPackCard(
            id=f"pack_card_{uuid4().hex[:12]}",
            pack_id=pack.id,
            card_id=item.card_id,
            position=item.position,
            probability=item.probability,
            enabled=item.enabled,
        )
        session.add(link)
        links.append((link, cards_by_id[item.card_id]))
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card_pack.created",
        entity_type="card_pack",
        entity_id=pack.id,
        organization_id=context.membership.organization_id,
        artist_id=pack.artist_id,
        details={"cardCount": len(links)},
    )
    await session.commit()
    return {
        "ok": True,
        "data": card_pack_data(pack, [_card_pack_card_data(link, card) for link, card in links]),
    }


@router.patch("/card-packs/{pack_id}")
async def update_card_pack(
    pack_id: str,
    payload: CardPackCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "cards:write")
    context.require_write()
    pack = await session.get(CardPack, pack_id)
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "카드팩을 찾을 수 없습니다.")
    context.require_organization(pack.organization_id)
    context.require_artist(pack.artist_id)
    if pack.status == "published":
        raise AppError(
            409,
            "PUBLISHED_PACK_IMMUTABLE",
            "공개된 카드팩은 수정할 수 없습니다. 새 버전을 만들어 주세요.",
        )
    await validate_card_pack_input(payload, session)
    if payload.artist_id != pack.artist_id:
        raise AppError(422, "PACK_ARTIST_IMMUTABLE", "기존 카드팩의 아티스트는 변경할 수 없습니다.")
    card_rows = list(
        await session.scalars(
            select(Card).where(Card.id.in_([item.card_id for item in payload.cards]))
        )
    )
    cards_by_id = {card.id: card for card in card_rows}
    if any(card.artist_id != pack.artist_id for card in card_rows):
        raise AppError(422, "PACK_ARTIST_MISMATCH", "카드팩과 카드의 아티스트가 일치해야 합니다.")
    pack.name = payload.name
    pack.season_name = payload.season_name
    pack.version = payload.version
    pack.image_url = payload.image_url
    pack.description = payload.description
    await session.execute(delete(CardPackCard).where(CardPackCard.pack_id == pack.id))
    links = []
    for item in payload.cards:
        link = CardPackCard(
            id=f"pack_card_{uuid4().hex[:12]}",
            pack_id=pack.id,
            card_id=item.card_id,
            position=item.position,
            probability=item.probability,
            enabled=item.enabled,
        )
        session.add(link)
        links.append((link, cards_by_id[item.card_id]))
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card_pack.updated",
        entity_type="card_pack",
        entity_id=pack.id,
        organization_id=context.membership.organization_id,
        artist_id=pack.artist_id,
        details={"cardCount": len(links)},
    )
    await session.commit()
    return {
        "ok": True,
        "data": card_pack_data(pack, [_card_pack_card_data(link, card) for link, card in links]),
    }


@router.get("/card-packs/{pack_id}")
async def card_pack_detail(pack_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "cards:read")
    pack = await session.get(CardPack, pack_id)
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "카드팩을 찾을 수 없습니다.")
    context.require_organization(pack.organization_id)
    context.require_artist(pack.artist_id)
    rows = list(
        await session.execute(
            select(CardPackCard, Card)
            .join(Card, CardPackCard.card_id == Card.id)
            .where(CardPackCard.pack_id == pack.id)
            .order_by(CardPackCard.position, CardPackCard.id)
        )
    )
    return {
        "ok": True,
        "data": card_pack_data(pack, [_card_pack_card_data(link, card) for link, card in rows]),
    }


@router.post("/card-packs/{pack_id}/publish")
async def publish_card_pack(pack_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "cards:write")
    context.require_write()
    pack = await session.get(CardPack, pack_id)
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "카드팩을 찾을 수 없습니다.")
    context.require_organization(pack.organization_id)
    context.require_artist(pack.artist_id)
    links = list(await session.scalars(select(CardPackCard).where(CardPackCard.pack_id == pack.id)))
    total = sum(link.probability for link in links if link.enabled)
    if not links or abs(total - 100) > 0.001:
        raise AppError(422, "INVALID_PACK_ODDS", "공개 확률의 합계는 100%여야 합니다.")
    card_ids = [link.card_id for link in links if link.enabled]
    unpublished_count = await session.scalar(
        select(func.count())
        .select_from(Card)
        .where(
            Card.id.in_(card_ids),
            Card.status != "published",
        )
    )
    if unpublished_count:
        raise AppError(
            422,
            "PACK_CARDS_NOT_PUBLISHED",
            "공개되지 않은 카드는 카드팩을 공개하기 전에 먼저 공개해야 합니다.",
        )
    pack.status = "published"
    pack.published_at = datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="card_pack.published",
        entity_type="card_pack",
        entity_id=pack.id,
        organization_id=context.membership.organization_id,
        artist_id=pack.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": card_pack_data(pack)}


def admin_shop_product_data(
    product: ShopProduct, artist: Artist | None = None, pack: CardPack | None = None
) -> dict:
    return {
        "id": product.id,
        "artistId": product.artist_id,
        "artistName": artist.name if artist else None,
        "productType": product.product_type,
        "cardPackId": product.card_pack_id,
        "name": product.name,
        "description": product.description,
        "detailContent": product.detail_content or [],
        "fulfillment": product.fulfillment or {},
        "imageUrl": product.image_url,
        "pricePoints": product.price_points,
        "status": product.status,
        "startsAt": product.starts_at.isoformat() if product.starts_at else None,
        "endsAt": product.ends_at.isoformat() if product.ends_at else None,
        "inventoryLimit": product.inventory_limit,
        "soldCount": product.sold_count,
        "perUserLimit": product.per_user_limit,
        "scheduledPublishAt": product.scheduled_publish_at.isoformat()
        if product.scheduled_publish_at
        else None,
        "exposureSlot": product.exposure_slot,
        "fanSegment": product.fan_segment or {},
    }


async def admin_shop_product_row(
    product_id: str, session: DbSession
) -> tuple[ShopProduct, Artist | None, CardPack | None]:
    row = await session.execute(
        select(ShopProduct, Artist, CardPack)
        .join(Artist, ShopProduct.artist_id == Artist.id)
        .outerjoin(CardPack, ShopProduct.card_pack_id == CardPack.id)
        .where(ShopProduct.id == product_id)
    )
    result = row.one_or_none()
    if result is None:
        raise AppError(404, "SHOP_PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.")
    return result


async def validate_shop_product_payload(
    payload: ShopProductCreate, context: CurrentAdmin, session: DbSession
) -> tuple[Artist, CardPack]:
    artist = await session.get(Artist, payload.artist_id)
    if artist is None:
        raise AppError(404, "ARTIST_NOT_FOUND", "아티스트를 찾을 수 없습니다.")
    context.require_artist(payload.artist_id)
    pack = None
    if payload.product_type == "card_pack":
        if not payload.card_pack_id:
            raise AppError(
                422, "SHOP_PRODUCT_LINK_REQUIRED", "카드팩 상품은 공개 카드팩을 연결해 주세요."
            )
        pack = await session.get(CardPack, payload.card_pack_id)
        if pack is None or pack.artist_id != payload.artist_id or pack.status != "published":
            raise AppError(422, "SHOP_CARD_PACK_INVALID", "공개된 아티스트 카드팩을 연결해 주세요.")
    else:
        reward_id = str(payload.fulfillment.get("rewardId") or "")
        reward = await session.get(RewardCatalog, reward_id) if reward_id else None
        if reward is None or reward.status != "published":
            raise AppError(422, "SHOP_REWARD_INVALID", "공개된 상품 보상을 연결해 주세요.")
    return artist, pack


@router.get("/shop/products")
async def admin_shop_products(context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("cards:read")
    query = (
        select(ShopProduct, Artist, CardPack)
        .join(Artist, ShopProduct.artist_id == Artist.id)
        .outerjoin(CardPack, ShopProduct.card_pack_id == CardPack.id)
    )
    if not context.is_root:
        query = query.where(ShopProduct.artist_id.in_(context.assigned_artist_ids))
    rows = list(
        await session.execute(query.order_by(ShopProduct.created_at.desc(), ShopProduct.id))
    )
    return {
        "ok": True,
        "data": {
            "items": [
                admin_shop_product_data(product, artist, pack) for product, artist, pack in rows
            ]
        },
    }


@router.post("/shop/products", status_code=status.HTTP_201_CREATED)
async def create_admin_shop_product(
    payload: ShopProductCreate, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("cards:write")
    artist, _ = await validate_shop_product_payload(payload, context, session)
    product = ShopProduct(
        id=f"shop_product_{uuid4().hex[:12]}",
        artist_id=payload.artist_id,
        product_type=payload.product_type,
        card_pack_id=payload.card_pack_id,
        name=payload.name,
        description=payload.description,
        detail_content=payload.detail_content,
        fulfillment=payload.fulfillment,
        image_url=payload.image_url,
        price_points=payload.price_points,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        inventory_limit=payload.inventory_limit,
        per_user_limit=payload.per_user_limit,
        scheduled_publish_at=payload.scheduled_publish_at,
        exposure_slot=payload.exposure_slot,
        fan_segment=payload.fan_segment,
        status="draft",
    )
    session.add(product)
    await session.commit()
    return {"ok": True, "data": admin_shop_product_data(product, artist)}


@router.get("/shop/products/{product_id}")
async def get_admin_shop_product(
    product_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("cards:read")
    product, artist, pack = await admin_shop_product_row(product_id, session)
    context.require_artist(product.artist_id)
    return {"ok": True, "data": admin_shop_product_data(product, artist, pack)}


@router.patch("/shop/products/{product_id}")
async def update_admin_shop_product(
    product_id: str, payload: ShopProductUpdate, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("cards:write")
    product, artist, pack = await admin_shop_product_row(product_id, session)
    context.require_artist(product.artist_id)
    for field in (
        "name",
        "description",
        "detail_content",
        "fulfillment",
        "image_url",
        "price_points",
        "starts_at",
        "ends_at",
        "status",
        "inventory_limit",
        "per_user_limit",
        "scheduled_publish_at",
        "exposure_slot",
        "fan_segment",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(product, field, value)
    await session.commit()
    return {"ok": True, "data": admin_shop_product_data(product, artist, pack)}


@router.post("/shop/products/{product_id}/publish")
async def publish_admin_shop_product(
    product_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("cards:write")
    product, artist, pack = await admin_shop_product_row(product_id, session)
    context.require_artist(product.artist_id)
    if product.product_type == "card_pack" and (pack is None or pack.status != "published"):
        raise AppError(
            422, "SHOP_CARD_PACK_INVALID", "공개된 카드팩을 연결해야 상품을 공개할 수 있습니다."
        )
    if product.product_type != "card_pack":
        reward_id = str((product.fulfillment or {}).get("rewardId") or "")
        reward = await session.get(RewardCatalog, reward_id) if reward_id else None
        if reward is None or reward.status != "published":
            raise AppError(
                422, "SHOP_REWARD_INVALID", "공개된 상품 보상을 연결해야 상품을 공개할 수 있습니다."
            )
    product.status = "published"
    await session.commit()
    return {"ok": True, "data": admin_shop_product_data(product, artist, pack)}


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
        # Cards without custom artwork still receive the platform-owned,
        # versioned back template for a complete review preview.
        "backImageUrl": f"/api/admin/cards/{card.id}/back-image",
        **release_card_data(card),
    }


async def scoped_effect_version_or_404(
    card_id: str, version_id: str, context: AdminContext, session: DbSession
) -> tuple[Card, CardEffectVersion]:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_organization(card.organization_id)
    context.require_artist(card.artist_id)
    version = await session.get(CardEffectVersion, version_id)
    if not version or version.card_id != card_id:
        raise AppError(404, "EFFECT_VERSION_NOT_FOUND", "효과 버전을 찾을 수 없습니다.")
    return card, version


def admin_collaboration_comment_data(comment: CardCollaborationComment) -> dict:
    return {
        "id": comment.id,
        "cardId": comment.card_id,
        "authorUserId": comment.author_user_id,
        "body": comment.body,
        "mentionUserId": comment.mention_user_id,
        "status": comment.status,
        "reviewVersion": comment.review_version,
        "createdAt": comment.created_at.isoformat() if comment.created_at else None,
        "updatedAt": comment.updated_at.isoformat() if comment.updated_at else None,
    }


@router.get("/cards/{card_id}/comments")
async def admin_card_comments(card_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "cards:read")
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_organization(card.organization_id)
    context.require_artist(card.artist_id)
    comments = await session.scalars(
        select(CardCollaborationComment)
        .where(CardCollaborationComment.card_id == card_id)
        .order_by(CardCollaborationComment.created_at.desc())
    )
    return {
        "ok": True,
        "data": {"items": [admin_collaboration_comment_data(item) for item in comments]},
    }


def admin_effect_version_data(version: CardEffectVersion) -> dict:
    return {
        "id": version.id,
        "cardId": version.card_id,
        "version": version.version,
        "designConfig": version.design_config,
        "status": version.status,
        "reviewNote": version.review_note,
        "submittedAt": version.submitted_at.isoformat() if version.submitted_at else None,
        "approvedAt": version.approved_at.isoformat() if version.approved_at else None,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


@router.get("/cards/{card_id}/effect-versions")
async def admin_effect_versions(card_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    _require_scoped_action(context, "cards:read")
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    context.require_organization(card.organization_id)
    context.require_artist(card.artist_id)
    versions = (
        await session.scalars(
            select(CardEffectVersion)
            .where(CardEffectVersion.card_id == card_id)
            .order_by(CardEffectVersion.version.desc())
        )
    ).all()
    return {"ok": True, "data": {"items": [admin_effect_version_data(item) for item in versions]}}


@router.post("/cards/{card_id}/effect-versions/{version_id}/approve")
async def approve_effect_version(
    card_id: str,
    version_id: str,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "cards:write")
    card, version = await scoped_effect_version_or_404(card_id, version_id, context, session)
    if version.status != "pending_review":
        raise AppError(
            409, "EFFECT_VERSION_INVALID_STATUS", "검수 요청된 효과만 승인할 수 있습니다."
        )
    version.status = "approved"
    version.approved_at = datetime.now(UTC)
    version.review_note = None
    card.design_config = validate_effect_config(version.design_config)
    await session.commit()
    return {"ok": True, "data": admin_effect_version_data(version)}


@router.post("/cards/{card_id}/effect-versions/{version_id}/review")
async def review_effect_version(
    card_id: str,
    version_id: str,
    payload: CardEffectReviewDecision,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    _require_scoped_action(context, "cards:write")
    card, version = await scoped_effect_version_or_404(card_id, version_id, context, session)
    if version.status != "pending_review":
        raise AppError(
            409, "EFFECT_VERSION_INVALID_STATUS", "검수 요청된 효과만 처리할 수 있습니다."
        )
    version.status = "approved" if payload.decision == "approve" else "rejected"
    version.review_note = payload.note
    if payload.decision == "approve":
        version.approved_at = datetime.now(UTC)
        card.design_config = validate_effect_config(version.design_config)
    else:
        version.approved_at = None
    await session.commit()
    return {"ok": True, "data": admin_effect_version_data(version)}


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
    card = Card(
        id=f"card_{uuid4().hex[:10]}",
        organization_id=context.membership.organization_id,
        **values,
    )
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
    context.require_organization(card.organization_id)
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
    context.require_organization(card.organization_id)
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
    context.require_organization(card.organization_id)
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
    context.require_organization(card.organization_id)
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
    context.require_organization(card.organization_id)
    context.require_artist(card.artist_id)
    design_config = card.design_config if isinstance(card.design_config, dict) else {}
    back_config = design_config.get("back") if isinstance(design_config.get("back"), dict) else {}
    asset_id = back_config.get("backImageAssetId") or back_config.get("imageAssetId")
    # Use the platform template when an artist has not supplied a custom back.
    asset = (
        await session.get(Asset, asset_id)
        if asset_id
        else await session.get(Asset, "asset_demo_card_back_template")
    )
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
    context.require_organization(card.organization_id)
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
    context.require_organization(card.organization_id)
    context.require_artist(card.artist_id)
    # Studio-submitted cards are unowned until the first partner review. The
    # approving partner becomes the persisted owner for all later operations.
    if card.organization_id is None and context.organization is not None:
        card.organization_id = context.organization.id
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


@router.get("/users/{user_id}/360")
async def get_user_360(user_id: str, admin: RootAdminUser, session: DbSession) -> dict:
    """Return a read-only, privacy-scoped support view for one fan."""
    user = await session.get(User, user_id)
    if user is None or user.role != Role.FAN:
        raise AppError(404, "USER_NOT_FOUND", "팬 계정을 찾을 수 없습니다.")

    balance = await session.scalar(select(PointBalance).where(PointBalance.user_id == user.id))
    card_rows = list(
        (
            await session.execute(
                select(UserCard, Card)
                .join(Card, Card.id == UserCard.card_id)
                .where(UserCard.user_id == user.id)
                .order_by(UserCard.acquired_at.desc(), UserCard.id.desc())
                .limit(20)
            )
        ).all()
    )
    orders = list(
        await session.scalars(
            select(ShopOrder)
            .where(ShopOrder.user_id == user.id)
            .order_by(ShopOrder.created_at.desc(), ShopOrder.id.desc())
            .limit(10)
        )
    )
    trades = list(
        await session.scalars(
            select(TradeProposal)
            .where(or_(TradeProposal.proposer_id == user.id, TradeProposal.recipient_id == user.id))
            .order_by(TradeProposal.created_at.desc(), TradeProposal.id.desc())
            .limit(10)
        )
    )
    tickets = list(
        await session.scalars(
            select(SupportTicket)
            .where(SupportTicket.user_id == user.id)
            .order_by(SupportTicket.updated_at.desc(), SupportTicket.id.desc())
            .limit(10)
        )
    )
    notifications = list(
        await session.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(10)
        )
    )
    return {
        "ok": True,
        "data": {
            "profile": {
                "id": user.id,
                "email": user.email,
                "nickname": user.nickname,
                "profileImageUrl": user.profile_image_url,
                "onboardingCompleted": user.onboarding_completed,
                "emailNotificationsEnabled": user.notification_email_enabled,
            },
            "account": {
                "pointBalance": balance.balance if balance else 0,
                "cardCount": await session.scalar(
                    select(func.count()).select_from(UserCard).where(UserCard.user_id == user.id)
                )
                or 0,
                "openSupportTickets": sum(
                    ticket.status in {"open", "in_progress"} for ticket in tickets
                ),
            },
            "cards": [
                {
                    "id": user_card.id,
                    "cardId": card.id,
                    "name": card.name,
                    "rarity": card.rarity,
                    "serialNumber": user_card.serial_number,
                    "acquiredAt": user_card.acquired_at.isoformat(),
                    "tradeLocked": user_card.trade_locked_at is not None,
                }
                for user_card, card in card_rows
            ],
            "orders": [
                {
                    "id": order.id,
                    "productName": order.product_name,
                    "pricePoints": order.price_points,
                    "status": order.status,
                    "createdAt": order.created_at.isoformat(),
                }
                for order in orders
            ],
            "trades": [
                {
                    "id": trade.id,
                    "role": "proposer" if trade.proposer_id == user.id else "recipient",
                    "status": trade.status,
                    "expiresAt": trade.expires_at.isoformat(),
                    "createdAt": trade.created_at.isoformat(),
                }
                for trade in trades
            ],
            "supportTickets": [
                {
                    "id": ticket.id,
                    "category": ticket.category,
                    "subject": ticket.subject,
                    "status": ticket.status,
                    "updatedAt": ticket.updated_at.isoformat(),
                }
                for ticket in tickets
            ],
            "recentNotifications": [
                {
                    "id": notification.id,
                    "kind": notification.kind,
                    "title": notification.title,
                    "isRead": notification.is_read,
                    "createdAt": notification.created_at.isoformat(),
                }
                for notification in notifications
            ],
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
    return _csv_download(
        f"{batch_id}.csv",
        ["code", "card_id", "drop_id", "expires_at", "used_count", "max_uses", "qr_image_url"],
        [
            [
                code.code,
                code.card_id,
                code.drop_id,
                batch.expires_at,
                code.used_count,
                code.max_uses,
                f"/api/admin/redeem-codes/{code.code}/qr",
            ]
            for code in codes
        ],
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


@router.get("/audit-logs/export")
async def export_audit_logs(
    context: CurrentAdmin,
    session: DbSession,
    action: str | None = None,
    q: str | None = None,
    limit: int = Query(default=5000, ge=1, le=10000),
) -> StreamingResponse:
    _require_scoped_action(context, "audit:read")
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
    logs = await session.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    return _csv_download(
        "fanfolio-audit-logs.csv",
        [
            "id",
            "actor_id",
            "action",
            "entity_type",
            "entity_id",
            "organization_id",
            "artist_id",
            "created_at",
            "metadata",
        ],
        [
            [
                log.id,
                log.actor_user_id,
                log.action,
                log.entity_type,
                log.entity_id,
                log.organization_id,
                log.artist_id,
                log.created_at.isoformat(),
                json.dumps(log.details or {}, ensure_ascii=False, separators=(",", ":")),
            ]
            for log in logs
        ],
        include_bom=True,
    )


@router.post("/cards/{card_id}/publish")
async def publish(card_id: str, admin: RootAdminUser, session: DbSession) -> dict:
    card = await session.get(Card, card_id)
    if not card:
        raise AppError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if card.owner_artist_id is not None and card.status == "pending_review":
        raise AppError(409, "REVIEW_REQUIRED", "검수 승인 후 카드를 공개할 수 있습니다.")
    if card.owner_artist_id is not None and card.release_status == "approved":
        raise AppError(
            409,
            "CARD_RELEASE_DROP_REQUIRED",
            "아티스트 카드는 승인 후 드롭 공개를 통해 출시해야 합니다.",
        )
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
