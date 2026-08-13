from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import and_, desc, or_, select

from app.dependencies import CurrentAdmin, DbSession, FanUser
from app.errors import AppError
from app.event_services import (
    event_in_scope,
    public_event_status,
    reconcile_due_event_notifications,
    validate_event_asset,
    validate_event_connections,
    validate_transition,
)
from app.models import Artist, Asset, Event
from app.schemas import EventCreateRequest, EventReviewRequest, EventUpdateRequest
from app.services import record_audit
from app.storage import configured_asset_storage, storage_response

router = APIRouter(prefix="/api", tags=["events"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin-events"])


def _scope_filters(context: CurrentAdmin) -> list[object]:
    if context.is_root or context.is_platform_operator:
        return []
    if context.organization is None:
        return [Event.id == ""]
    filters: list[object] = [Event.organization_id == context.organization.id]
    if context.membership.access_level != "company_admin":
        filters.append(Event.artist_id.in_(context.assigned_artist_ids))
    return filters


def _event_admin_data(event: Event, *, now: datetime | None = None) -> dict:
    return {
        "id": event.id,
        "organizationId": event.organization_id,
        "artistId": event.artist_id,
        "title": event.title,
        "summary": event.summary,
        "description": event.description,
        "heroAssetId": event.hero_asset_id,
        "heroUrl": f"/api/admin/events/{event.id}/hero",
        "eventType": event.event_type,
        "workflowStatus": event.workflow_status,
        "displayStatus": public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        ),
        "startsAt": event.starts_at.isoformat(),
        "endsAt": event.ends_at.isoformat() if event.ends_at else None,
        "featured": event.featured,
        "priority": event.priority,
        "ctaLabel": event.cta_label,
        "dropId": event.drop_id,
        "cardId": event.card_id,
        "achievementId": event.achievement_id,
        "externalUrl": event.external_url,
        "reviewNote": event.review_note,
        "publishedAt": event.published_at.isoformat() if event.published_at else None,
        "createdAt": event.created_at.isoformat() if event.created_at else None,
        "updatedAt": event.updated_at.isoformat() if event.updated_at else None,
    }


def _event_cta(event: Event) -> tuple[str, str | None]:
    if event.event_type == "external":
        return event.cta_label or "자세히 보기", event.external_url
    if event.event_type == "card_drop":
        return (
            event.cta_label or "카드 보러가기",
            f"/drops/{event.drop_id}" if event.drop_id else None,
        )
    if event.event_type == "card":
        return (
            event.cta_label or "카드 보러가기",
            f"/cards/{event.card_id}" if event.card_id else None,
        )
    if event.event_type == "fan_mission":
        return (
            event.cta_label or "미션 참여하기",
            f"/missions/{event.achievement_id}" if event.achievement_id else None,
        )
    return event.cta_label or "이벤트 보기", f"/events/{event.id}"


async def _fan_data(event: Event, session: DbSession, *, now: datetime | None = None) -> dict:
    artist = await session.get(Artist, event.artist_id) if event.artist_id else None
    cta_label, target = _event_cta(event)
    asset = await session.get(Asset, event.hero_asset_id)
    return {
        "id": event.id,
        "artistId": event.artist_id,
        "artistName": artist.name if artist else None,
        "title": event.title,
        "summary": event.summary,
        "description": event.description,
        "eventType": event.event_type,
        "status": public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        ),
        "startsAt": event.starts_at.isoformat(),
        "endsAt": event.ends_at.isoformat() if event.ends_at else None,
        "heroUrl": f"/api/events/{event.id}/hero" if asset else None,
        "ctaLabel": cta_label,
        "ctaTarget": target,
    }


def _public_filter(status_value: str, now: datetime) -> object:
    if status_value == "active":
        return and_(Event.starts_at <= now, or_(Event.ends_at.is_(None), Event.ends_at > now))
    if status_value == "upcoming":
        return Event.starts_at > now
    return Event.ends_at.is_not(None) & (Event.ends_at <= now)


@router.get("/events")
async def list_events(
    user: FanUser,
    session: DbSession,
    status_value: str = Query(
        default="active", alias="status", pattern="^(active|upcoming|ended)$"
    ),
    artist_id: str | None = Query(default=None, alias="artistId"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, alias="pageSize", ge=1, le=50),
) -> dict:
    del user
    now = datetime.now(UTC)
    await reconcile_due_event_notifications(session, now=now)
    filters = [
        Event.workflow_status.in_(["scheduled", "published"]),
        _public_filter(status_value, now),
    ]
    if status_value == "ended":
        filters.append(Event.ends_at >= now - timedelta(days=90))
    if artist_id:
        filters.append(Event.artist_id == artist_id)
    total = len((await session.scalars(select(Event.id).where(*filters))).all())
    rows = await session.scalars(
        select(Event)
        .where(*filters)
        .order_by(desc(Event.priority), Event.starts_at)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "ok": True,
        "data": {
            "items": [await _fan_data(row, session, now=now) for row in rows],
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": (total + page_size - 1) // page_size,
            },
        },
    }


@router.get("/events/{event_id}")
async def get_event(event_id: str, user: FanUser, session: DbSession) -> dict:
    del user
    event = await session.get(Event, event_id)
    now = datetime.now(UTC)
    if (
        event is None
        or event.workflow_status not in {"scheduled", "published"}
        or public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        )
        is None
    ):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    return {"ok": True, "data": await _fan_data(event, session, now=now)}


@router.get("/events/{event_id}/hero")
async def get_event_hero(event_id: str, user: FanUser, session: DbSession):
    del user
    event = await session.get(Event, event_id)
    now = datetime.now(UTC)
    if (
        event is None
        or event.workflow_status not in {"scheduled", "published"}
        or public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        )
        is None
    ):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    asset = await session.get(Asset, event.hero_asset_id)
    if asset is None or not asset.storage_path:
        raise AppError(404, "EVENT_ASSET_NOT_READY", "이벤트 이미지가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(),
        asset.storage_path,
        media_type=asset.content_type or "image/webp",
        filename=asset.file_name,
    )


@router.get("/home")
async def home(user: FanUser, session: DbSession) -> dict:
    now = datetime.now(UTC)
    await reconcile_due_event_notifications(session, now=now)
    base = [Event.workflow_status.in_(["scheduled", "published"]), _public_filter("active", now)]
    featured = await session.scalar(
        select(Event)
        .where(*base)
        .order_by(
            desc(Event.featured), desc(Event.priority), Event.starts_at, desc(Event.updated_at)
        )
        .limit(1)
    )
    upcoming = await session.scalars(
        select(Event)
        .where(Event.workflow_status.in_(["scheduled", "published"]), Event.starts_at > now)
        .order_by(Event.starts_at)
        .limit(3)
    )
    artist = None
    if user.favorite_artist_ids:
        artist_row = await session.get(Artist, user.favorite_artist_ids[0])
        if artist_row:
            artist = {
                "id": artist_row.id,
                "name": artist_row.name,
                "imageUrl": artist_row.image_url,
            }
    return {
        "ok": True,
        "data": {
            "featuredEvent": await _fan_data(featured, session, now=now) if featured else None,
            "upcomingEvents": [await _fan_data(item, session, now=now) for item in upcoming],
            "favoriteArtist": artist,
            "newCards": [],
        },
    }


@admin_router.get("/events")
async def admin_list_events(
    context: CurrentAdmin,
    session: DbSession,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    q: str | None = None,
    status_value: str | None = Query(default=None, alias="status"),
    artist_id: str | None = Query(default=None, alias="artistId"),
    type_value: str | None = Query(default=None, alias="type"),
) -> dict:
    context.require_action("events:read")
    filters = _scope_filters(context)
    if q:
        filters.append(or_(Event.title.ilike(f"%{q}%"), Event.summary.ilike(f"%{q}%")))
    if status_value:
        filters.append(Event.workflow_status == status_value)
    if artist_id:
        filters.append(Event.artist_id == artist_id)
    if type_value:
        filters.append(Event.event_type == type_value)
    total = len((await session.scalars(select(Event.id).where(*filters))).all())
    rows = await session.scalars(
        select(Event)
        .where(*filters)
        .order_by(desc(Event.updated_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "ok": True,
        "data": {
            "items": [_event_admin_data(item) for item in rows],
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": (total + page_size - 1) // page_size,
            },
        },
    }


@admin_router.post("/events", status_code=status.HTTP_201_CREATED)
async def admin_create_event(
    payload: EventCreateRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("events:write")
    organization_id = payload.organization_id
    if not context.is_root:
        if context.organization is None or organization_id not in {None, context.organization.id}:
            raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
        organization_id = context.organization.id
        context.require_artist(payload.artist_id)
    elif organization_id is None and payload.artist_id is not None:
        raise AppError(422, "EVENT_SCOPE_INVALID", "서비스 이벤트는 아티스트를 지정할 수 없습니다.")
    await validate_event_asset(session, payload.hero_asset_id)
    event = Event(
        id=f"event_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=payload.artist_id,
        title=payload.title,
        summary=payload.summary,
        description=payload.description,
        hero_asset_id=payload.hero_asset_id,
        event_type=payload.event_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        featured=payload.featured,
        priority=payload.priority if context.is_root else 0,
        cta_label=payload.cta_label,
        drop_id=payload.drop_id,
        card_id=payload.card_id,
        achievement_id=payload.achievement_id,
        external_url=payload.external_url,
        created_by=context.user.id,
    )
    session.add(event)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.created",
        entity_type="event",
        entity_id=event.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.get("/events/{event_id}")
async def admin_get_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:read")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.get("/events/{event_id}/hero")
async def admin_get_event_hero(
    event_id: str, context: CurrentAdmin, session: DbSession
) -> Response:
    context.require_action("events:read")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    asset = await validate_event_asset(session, event.hero_asset_id)
    return storage_response(
        configured_asset_storage(),
        asset.storage_path,
        media_type=asset.content_type or "image/webp",
        filename=asset.file_name,
    )


@admin_router.patch("/events/{event_id}")
async def admin_update_event(
    event_id: str, payload: EventUpdateRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("events:write")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    if event.workflow_status not in {"draft", "changes_requested"}:
        raise AppError(
            409, "EVENT_EDIT_LOCKED", "검수 중이거나 공개된 이벤트는 편집할 수 없습니다."
        )
    for field, value in (
        ("title", payload.title),
        ("summary", payload.summary),
        ("description", payload.description),
        ("hero_asset_id", payload.hero_asset_id),
        ("event_type", payload.event_type),
        ("starts_at", payload.starts_at),
        ("ends_at", payload.ends_at),
        ("featured", payload.featured),
        ("cta_label", payload.cta_label),
        ("drop_id", payload.drop_id),
        ("card_id", payload.card_id),
        ("achievement_id", payload.achievement_id),
        ("external_url", payload.external_url),
    ):
        setattr(event, field, value)
    if context.is_root:
        event.priority = payload.priority
    await validate_event_asset(session, event.hero_asset_id)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.updated",
        entity_type="event",
        entity_id=event.id,
        details={"workflowStatus": event.workflow_status},
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.post("/events/{event_id}/submit")
async def admin_submit_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:submit")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    validate_transition(event.workflow_status, "pending_review")
    await validate_event_asset(session, event.hero_asset_id)
    await validate_event_connections(session, event)
    event.workflow_status = "pending_review"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.submitted",
        entity_type="event",
        entity_id=event.id,
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.post("/events/{event_id}/review")
async def admin_review_event(
    event_id: str, payload: EventReviewRequest, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("events:review")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    target = "approved" if payload.decision == "approve" else "changes_requested"
    validate_transition(event.workflow_status, target)
    if target == "approved":
        await validate_event_connections(session, event)
    event.workflow_status = target
    event.reviewed_by = context.user.id
    event.review_note = payload.note
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.reviewed",
        entity_type="event",
        entity_id=event.id,
        details={"decision": payload.decision, "note": payload.note},
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.post("/events/{event_id}/publish")
async def admin_publish_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:publish")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    target = "published" if event.starts_at <= datetime.now(UTC) else "scheduled"
    validate_transition(event.workflow_status, target)
    event.workflow_status = target
    event.published_at = event.published_at or datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.published",
        entity_type="event",
        entity_id=event.id,
        details={"workflowStatus": target},
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.post("/events/{event_id}/end")
async def admin_end_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:publish")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    validate_transition(event.workflow_status, "ended")
    event.workflow_status = "ended"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.ended",
        entity_type="event",
        entity_id=event.id,
    )
    await session.commit()
    return {"ok": True, "data": _event_admin_data(event)}


@admin_router.delete("/events/{event_id}")
async def admin_delete_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:write")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    if event.published_at is not None:
        raise AppError(409, "EVENT_DELETE_LOCKED", "공개 이력이 있는 이벤트는 삭제할 수 없습니다.")
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.deleted",
        entity_type="event",
        entity_id=event.id,
    )
    await session.delete(event)
    await session.commit()
    return {"ok": True, "data": {"deleted": True}}
