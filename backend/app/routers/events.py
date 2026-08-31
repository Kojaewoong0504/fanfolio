import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Query, Response, status
from sqlalchemy import and_, desc, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from app.dependencies import CurrentAdmin, DbSession, FanUser
from app.errors import AppError
from app.event_checkin import check_in_token_hash, create_check_in_token, verify_check_in_token
from app.event_services import (
    event_in_scope,
    public_event_status,
    reconcile_due_event_notifications,
    validate_event_asset,
    validate_event_connections,
    validate_transition,
)
from app.image_processing import InvalidEventHeroError, ensure_event_hero_derivative
from app.models import (
    Artist,
    Asset,
    Card,
    Drop,
    Event,
    EventApplication,
    EventComment,
    EventRelatedCard,
    Member,
    Notification,
    User,
)
from app.schemas import (
    EventCheckInRequest,
    EventCommentCreateRequest,
    EventCommentReviewRequest,
    EventCreateRequest,
    EventDrawRequest,
    EventReviewRequest,
    EventUpdateRequest,
)
from app.services import record_analytics_event, record_audit, record_engagement_event
from app.storage import StorageObjectNotFound, configured_asset_storage, storage_response
from app.tasks import enqueue_engagement_event

router = APIRouter(prefix="/api", tags=["events"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin-events"])


def _utc_datetime(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def _home_card_image_url(card: Card) -> str:
    if card.image_asset_id:
        return f"/api/cards/{card.id}/image?client=fan"
    return card.image_url


def _home_card_data(card: Card, artist: Artist | None, member: Member | None) -> dict:
    return {
        "id": card.id,
        "status": card.status,
        "isOfficial": card.is_official,
        "name": card.name,
        "imageUrl": _home_card_image_url(card),
        "artistId": artist.id if artist else card.artist_id,
        "artistName": artist.name if artist else None,
        "memberId": member.id if member else card.member_id,
        "memberName": member.name if member else None,
    }


def _scope_filters(context: CurrentAdmin) -> list[object]:
    if context.is_root or context.is_platform_operator:
        return []
    if context.organization is None:
        return [Event.id == ""]
    filters: list[object] = [Event.organization_id == context.organization.id]
    if context.membership.access_level != "company_admin":
        filters.append(Event.artist_id.in_(context.assigned_artist_ids))
    return filters


async def _event_admin_data(
    session: DbSession, event: Event, *, now: datetime | None = None
) -> dict:
    related_card_ids = list(
        await session.scalars(
            select(EventRelatedCard.card_id)
            .where(EventRelatedCard.event_id == event.id)
            .order_by(EventRelatedCard.position)
        )
    )
    applicant_count = int(
        await session.scalar(
            select(func.count(EventApplication.id)).where(
                EventApplication.event_id == event.id,
                EventApplication.status.in_(["submitted", "winner"]),
            )
        )
        or 0
    )
    return {
        "id": event.id,
        "organizationId": event.organization_id,
        "artistId": event.artist_id,
        "title": event.title,
        "summary": event.summary,
        "description": event.description,
        "noticeItems": event.notice_items or [],
        "relatedCardIds": related_card_ids,
        "heroAssetId": event.hero_asset_id,
        "heroUrl": f"/api/admin/events/{event.id}/hero",
        "eventType": event.event_type,
        "workflowStatus": event.workflow_status,
        "displayStatus": public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        ),
        "startsAt": event.starts_at.isoformat(),
        "endsAt": event.ends_at.isoformat() if event.ends_at else None,
        "venue": event.venue,
        "participantLimit": event.participant_limit,
        "applicantCount": applicant_count,
        "applicationStartsAt": event.application_starts_at.isoformat()
        if event.application_starts_at
        else None,
        "applicationEndsAt": event.application_ends_at.isoformat()
        if event.application_ends_at
        else None,
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
    if event.event_type == "comment":
        return event.cta_label or "댓글 참여하기", f"/events/{event.id}#comments"
    return event.cta_label or "이벤트 보기", f"/events/{event.id}"


async def _validate_related_cards(
    session: DbSession, context: CurrentAdmin, card_ids: list[str]
) -> list[Card]:
    if not card_ids:
        return []
    cards = list(await session.scalars(select(Card).where(Card.id.in_(card_ids))))
    by_id = {card.id: card for card in cards}
    if len(by_id) != len(card_ids):
        raise AppError(
            422, "EVENT_RELATED_CARD_INVALID", "관련 카드 중 존재하지 않는 카드가 있습니다."
        )
    if not context.is_root:
        for card in cards:
            if card.artist_id not in context.assigned_artist_ids:
                raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    return [by_id[card_id] for card_id in card_ids]


async def _replace_related_cards(session: DbSession, event: Event, cards: list[Card]) -> None:
    existing = list(
        await session.scalars(select(EventRelatedCard).where(EventRelatedCard.event_id == event.id))
    )
    for relation in existing:
        await session.delete(relation)
    for position, card in enumerate(cards):
        session.add(
            EventRelatedCard(
                id=f"event_related_{uuid4().hex[:16]}",
                event_id=event.id,
                card_id=card.id,
                position=position,
            )
        )


async def _fan_related_cards(session: DbSession, event_id: str) -> list[dict]:
    relation_rows = list(
        await session.scalars(
            select(EventRelatedCard)
            .where(EventRelatedCard.event_id == event_id)
            .order_by(EventRelatedCard.position)
        )
    )
    if not relation_rows:
        return []
    cards = list(
        await session.scalars(
            select(Card).where(Card.id.in_([row.card_id for row in relation_rows]))
        )
    )
    cards_by_id = {card.id: card for card in cards}
    result = []
    for relation in relation_rows:
        card = cards_by_id.get(relation.card_id)
        if not card:
            continue
        artist = await session.get(Artist, card.artist_id) if card.artist_id else None
        member = await session.get(Member, card.member_id) if card.member_id else None
        result.append(
            {
                "id": card.id,
                "name": card.name,
                "imageUrl": _home_card_image_url(card),
                "artistId": card.artist_id,
                "artistName": artist.name if artist else None,
                "memberId": card.member_id,
                "memberName": member.name if member else None,
                "rarity": card.rarity,
            }
        )
    return result


async def _fan_data(
    event: Event,
    session: DbSession,
    *,
    user_id: str | None = None,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(UTC)
    artist = await session.get(Artist, event.artist_id) if event.artist_id else None
    cta_label, target = _event_cta(event)
    asset = await session.get(Asset, event.hero_asset_id)
    related_cards = await _fan_related_cards(session, event.id)
    participant_count = int(
        (
            await session.scalar(
                select(func.count(EventApplication.id)).where(
                    EventApplication.event_id == event.id,
                    EventApplication.status == "submitted",
                )
            )
        )
        or 0
    )
    applied = False
    if user_id:
        applied = (
            await session.scalar(
                select(EventApplication.id).where(
                    EventApplication.event_id == event.id,
                    EventApplication.user_id == user_id,
                    EventApplication.status == "submitted",
                )
            )
            is not None
        )
    window_start = _utc_datetime(event.application_starts_at or event.starts_at)
    window_end = _utc_datetime(event.application_ends_at or event.ends_at)
    if applied:
        application_status = "applied"
    elif now < window_start:
        application_status = "upcoming"
    elif window_end and now > window_end:
        application_status = "closed"
    elif event.participant_limit and participant_count >= event.participant_limit:
        application_status = "full"
    else:
        application_status = "available"
    return {
        "id": event.id,
        "artistId": event.artist_id,
        "artistName": artist.name if artist else None,
        "title": event.title,
        "summary": event.summary,
        "description": event.description,
        "noticeItems": event.notice_items or [],
        "relatedCards": related_cards,
        "eventType": event.event_type,
        "status": public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        ),
        "startsAt": event.starts_at.isoformat(),
        "endsAt": event.ends_at.isoformat() if event.ends_at else None,
        "venue": event.venue,
        "participantLimit": event.participant_limit,
        "participantCount": participant_count,
        "applicationStartsAt": event.application_starts_at.isoformat()
        if event.application_starts_at
        else None,
        "applicationEndsAt": event.application_ends_at.isoformat()
        if event.application_ends_at
        else None,
        "applicationStatus": application_status,
        "applied": applied,
        "heroUrl": f"/api/events/{event.id}/hero?asset={asset.id}" if asset else None,
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
        default="active", alias="status", pattern="^(all|active|upcoming|ended)$"
    ),
    artist_id: str | None = Query(default=None, alias="artistId"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, alias="pageSize", ge=1, le=50),
) -> dict:
    now = datetime.now(UTC)
    await reconcile_due_event_notifications(session, now=now)
    filters = [
        Event.workflow_status.in_(["scheduled", "published"]),
    ]
    if status_value != "all":
        filters.append(_public_filter(status_value, now))
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
            "items": [await _fan_data(row, session, user_id=user.id, now=now) for row in rows],
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
    await reconcile_due_event_notifications(session, now=now)
    await record_analytics_event(
        session,
        event_name="product.detail_viewed",
        user_id=user.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
        source="event_detail",
        dedupe_key=f"event-detail:{user.id}:{event.id}",
        metadata={"surface": "fan_event"},
    )
    await session.commit()
    return {"ok": True, "data": await _fan_data(event, session, user_id=user.id, now=now)}


async def _require_public_event(event_id: str, session: DbSession) -> tuple[Event, datetime]:
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
    return event, now


def _comment_data(comment: EventComment, user: User) -> dict:
    return {
        "id": comment.id,
        "body": comment.body,
        "authorNickname": user.nickname or "팬",
        "status": comment.status,
        "createdAt": comment.created_at.isoformat(),
    }


@router.get("/events/{event_id}/comments")
async def list_event_comments(event_id: str, user: FanUser, session: DbSession) -> dict:
    event, _ = await _require_public_event(event_id, session)
    rows = await session.execute(
        select(EventComment, User)
        .join(User, User.id == EventComment.user_id)
        .where(
            EventComment.event_id == event.id,
            or_(EventComment.status == "approved", EventComment.user_id == user.id),
        )
        .order_by(desc(EventComment.created_at))
        .limit(50)
    )
    return {
        "ok": True,
        "data": {"items": [_comment_data(comment, author) for comment, author in rows.all()]},
    }


@router.post("/events/{event_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_event_comment(
    event_id: str,
    payload: EventCommentCreateRequest,
    user: FanUser,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
    event, now = await _require_public_event(event_id, session)
    if event.event_type != "comment":
        raise AppError(409, "EVENT_COMMENT_UNAVAILABLE", "댓글 참여 이벤트가 아닙니다.")
    if (
        public_event_status(
            event.workflow_status, starts_at=event.starts_at, ends_at=event.ends_at, now=now
        )
        != "active"
    ):
        raise AppError(409, "EVENT_COMMENT_CLOSED", "현재 댓글을 작성할 수 없는 이벤트입니다.")
    body = payload.body.strip()
    if not body:
        raise AppError(422, "COMMENT_BODY_REQUIRED", "댓글 내용을 입력해 주세요.")
    comment = EventComment(
        id=f"comment_{uuid4().hex[:12]}",
        event_id=event.id,
        user_id=user.id,
        body=body,
    )
    session.add(comment)
    engagement_event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="event_commented",
        source_type="event_comment",
        source_id=comment.id,
        payload={
            "eventId": event.id,
            "organizationId": event.organization_id,
            "artistId": event.artist_id,
        },
    )
    await session.commit()
    await session.refresh(comment)
    enqueue_engagement_event(engagement_event.id, background_tasks)
    return {"ok": True, "data": _comment_data(comment, user)}


@router.post("/events/{event_id}/applications", status_code=status.HTTP_201_CREATED)
async def apply_to_event(
    event_id: str,
    response: Response,
    user: FanUser,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
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
    existing = await session.scalar(
        select(EventApplication).where(
            EventApplication.event_id == event.id,
            EventApplication.user_id == user.id,
            EventApplication.status == "submitted",
        )
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return {
            "ok": True,
            "data": {
                "id": existing.id,
                "eventId": existing.event_id,
                "status": existing.status,
                "createdAt": existing.created_at.isoformat(),
            },
        }
    data = await _fan_data(event, session, user_id=user.id, now=now)
    if data["applicationStatus"] != "available":
        raise AppError(409, "EVENT_APPLICATION_UNAVAILABLE", "현재 신청할 수 없는 이벤트입니다.")
    await record_analytics_event(
        session,
        event_name="conversion.started",
        user_id=user.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
        source="event_application",
        dedupe_key=f"event-application-attempt:{event.id}:{user.id}",
        metadata={"conversion": "event_application", "eventId": event.id},
    )
    application = EventApplication(
        id=f"application_{uuid4().hex[:12]}",
        event_id=event.id,
        user_id=user.id,
        status="submitted",
    )
    session.add(application)
    engagement_event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="event_applied",
        source_type="event_application",
        source_id=application.id,
        payload={
            "eventId": event.id,
            "organizationId": event.organization_id,
            "artistId": event.artist_id,
        },
    )
    await record_analytics_event(
        session,
        event_name="conversion.completed",
        user_id=user.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
        source="event_application",
        dedupe_key=f"event-application:{application.id}",
        metadata={"conversion": "event_application", "eventId": event.id},
    )
    notification_key = f"event_application_submitted:{event.id}:{user.id}"
    notification = await session.scalar(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.event_key == notification_key,
        )
    )
    if notification is None:
        session.add(
            Notification(
                id=f"notification_event_application_{event.id}_{user.id}",
                user_id=user.id,
                kind="event_application_submitted",
                title="이벤트 신청이 완료되었어요",
                body=event.title,
                entity_type="event",
                entity_id=event.id,
                event_key=notification_key,
            )
        )
    try:
        await session.commit()
    except IntegrityError:
        # The unique event/user constraint is the final authority when two
        # requests arrive at the same time. Return the same idempotent result
        # as a repeated sequential request instead of leaking a 500.
        await session.rollback()
        existing = await session.scalar(
            select(EventApplication).where(
                EventApplication.event_id == event.id,
                EventApplication.user_id == user.id,
                EventApplication.status == "submitted",
            )
        )
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return {
            "ok": True,
            "data": {
                "id": existing.id,
                "eventId": existing.event_id,
                "status": existing.status,
                "createdAt": existing.created_at.isoformat(),
            },
        }
    await session.refresh(application)
    enqueue_engagement_event(engagement_event.id, background_tasks)
    return {
        "ok": True,
        "data": {
            "id": application.id,
            "eventId": application.event_id,
            "status": application.status,
            "createdAt": application.created_at.isoformat(),
        },
    }


@router.get("/me/event-applications/{application_id}/check-in-pass")
async def get_event_check_in_pass(application_id: str, user: FanUser, session: DbSession) -> dict:
    row = await session.execute(
        select(EventApplication, Event)
        .join(Event, EventApplication.event_id == Event.id)
        .where(EventApplication.id == application_id, EventApplication.user_id == user.id)
    )
    application, event = row.one_or_none() or (None, None)
    if application is None or event is None:
        raise AppError(404, "EVENT_APPLICATION_NOT_FOUND", "이벤트 신청 내역을 찾을 수 없습니다.")
    if application.status not in {"submitted", "winner"}:
        raise AppError(409, "EVENT_CHECKIN_UNAVAILABLE", "현재 체크인할 수 없는 신청 내역입니다.")
    now = datetime.now(UTC)
    event_end = _utc_datetime(event.ends_at) or now + timedelta(days=1)
    expires_at = int((event_end + timedelta(hours=24)).timestamp())
    token = create_check_in_token(
        event_id=event.id, application_id=application.id, expires_at=expires_at
    )
    if application.check_in_token_hash is None:
        application.check_in_token_hash = check_in_token_hash(token)
        application.check_in_token_issued_at = now
        await session.commit()
    elif application.check_in_token_hash != check_in_token_hash(token):
        raise AppError(
            409,
            "EVENT_CHECKIN_PASS_ROTATED",
            "이벤트 일정이 변경되어 체크인 패스를 다시 발급할 수 없습니다.",
        )
    return {
        "ok": True,
        "data": {
            "eventId": event.id,
            "applicationId": application.id,
            "token": token,
            "expiresAt": datetime.fromtimestamp(expires_at, UTC).isoformat(),
            "checkedIn": application.checked_in_at is not None,
        },
    }


@router.get("/events/{event_id}/hero")
async def get_event_hero(event_id: str, session: DbSession) -> Response:
    """Serve only fan-visible event art as browser-cacheable public media.

    Image elements cannot attach the SPA's in-memory bearer token. Repeating
    the event visibility check here keeps unpublished events private while
    allowing published hero art to survive navigation in the browser cache.
    """
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
    storage = configured_asset_storage()
    try:
        optimized_path = await run_in_threadpool(
            ensure_event_hero_derivative,
            storage,
            asset.id,
            asset.storage_path,
        )
        content = await run_in_threadpool(storage.read_bytes, optimized_path)
    except (StorageObjectNotFound, InvalidEventHeroError):
        raise AppError(404, "EVENT_ASSET_NOT_READY", "이벤트 이미지가 아직 준비되지 않았습니다.")
    return Response(
        content=content,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
        },
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
    catalog_filters = [
        Card.status == "published",
        Card.is_official.is_(True),
        or_(
            Card.owner_artist_id.is_(None),
            and_(Card.review_version == 0, Card.drop_id.is_(None)),
            and_(
                Card.release_status == "published", Card.drop_id == Drop.id, Drop.status == "live"
            ),
        ),
    ]
    favorite_artist_ids = set(user.favorite_artist_ids or [])
    favorite_member_ids = set(user.favorite_member_ids or [])
    if favorite_artist_ids or favorite_member_ids:
        catalog_filters.append(
            or_(
                Card.artist_id.in_(favorite_artist_ids),
                Card.member_id.in_(favorite_member_ids),
            )
        )
    new_card_rows = (
        await session.execute(
            select(Card, Artist, Member)
            .select_from(Card)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .outerjoin(Drop, Card.drop_id == Drop.id)
            .where(*catalog_filters)
            .order_by(Artist.name, Member.name, Card.name, Card.id)
            # Return enough of the user's favorite catalog for the fan app to
            # scope editorial cards after switching between multiple artists.
            .limit(12)
        )
    ).all()
    favorite_artists = []
    if user.favorite_artist_ids:
        favorite_artist_rows = (
            await session.scalars(select(Artist).where(Artist.id.in_(user.favorite_artist_ids)))
        ).all()
        artists_by_id = {row.id: row for row in favorite_artist_rows}
        favorite_artists = [
            {
                "id": artist_id,
                "name": artists_by_id[artist_id].name,
                "imageUrl": artists_by_id[artist_id].image_url,
            }
            for artist_id in user.favorite_artist_ids
            if artist_id in artists_by_id
        ]
    return {
        "ok": True,
        "data": {
            "featuredEvent": await _fan_data(featured, session, user_id=user.id, now=now)
            if featured
            else None,
            "upcomingEvents": [
                await _fan_data(item, session, user_id=user.id, now=now) for item in upcoming
            ],
            "favoriteArtists": favorite_artists,
            "favoriteArtist": None,
            "newCards": [
                _home_card_data(card, artist_row, member)
                for card, artist_row, member in new_card_rows
            ],
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
            "items": [await _event_admin_data(session, item) for item in rows],
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
    related_cards = await _validate_related_cards(session, context, payload.related_card_ids)
    event = Event(
        id=f"event_{uuid4().hex[:12]}",
        organization_id=organization_id,
        artist_id=payload.artist_id,
        title=payload.title,
        summary=payload.summary,
        description=payload.description,
        notice_items=payload.notice_items,
        hero_asset_id=payload.hero_asset_id,
        event_type=payload.event_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        venue=payload.venue,
        participant_limit=payload.participant_limit,
        application_starts_at=payload.application_starts_at,
        application_ends_at=payload.application_ends_at,
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
    await session.flush()
    await _replace_related_cards(session, event, related_cards)
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
    return {"ok": True, "data": await _event_admin_data(session, event)}


@admin_router.get("/events/{event_id}")
async def admin_get_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:read")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    return {"ok": True, "data": await _event_admin_data(session, event)}


@admin_router.get("/events/{event_id}/applications")
async def admin_list_event_applications(
    event_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("events:read")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    rows = (
        await session.execute(
            select(EventApplication, User)
            .join(User, User.id == EventApplication.user_id)
            .where(EventApplication.event_id == event.id)
            .order_by(EventApplication.created_at, EventApplication.id)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": application.id,
                    "userId": user.id,
                    "email": user.email,
                    "nickname": user.nickname,
                    "status": application.status,
                    "checkedInAt": application.checked_in_at.isoformat()
                    if application.checked_in_at
                    else None,
                    "createdAt": application.created_at.isoformat(),
                }
                for application, user in rows
            ]
        },
    }


@admin_router.post("/events/{event_id}/check-in")
async def admin_check_in_event_application(
    event_id: str,
    payload: EventCheckInRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("events:write")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    claims = verify_check_in_token(payload.token)
    if claims.get("eventId") != event.id:
        raise AppError(422, "EVENT_CHECKIN_WRONG_EVENT", "다른 이벤트의 체크인 패스입니다.")
    application = await session.get(EventApplication, claims.get("applicationId"))
    if application is None or application.event_id != event.id:
        raise AppError(422, "EVENT_CHECKIN_INVALID", "유효하지 않은 체크인 패스입니다.")
    if application.check_in_token_hash != check_in_token_hash(payload.token):
        raise AppError(401, "EVENT_CHECKIN_INVALID", "유효하지 않은 체크인 패스입니다.")
    if application.status not in {"submitted", "winner"}:
        raise AppError(409, "EVENT_CHECKIN_UNAVAILABLE", "체크인할 수 없는 신청 상태입니다.")
    now = datetime.now(UTC)
    starts_at = _utc_datetime(event.starts_at)
    ends_at = _utc_datetime(event.ends_at)
    if starts_at and now < starts_at:
        raise AppError(409, "EVENT_CHECKIN_NOT_OPEN", "아직 체크인 시간이 아닙니다.")
    if ends_at and now > ends_at + timedelta(hours=24):
        raise AppError(409, "EVENT_CHECKIN_CLOSED", "체크인 가능한 시간이 지났습니다.")
    if application.checked_in_at is not None:
        return {
            "ok": True,
            "data": {
                "eventId": event.id,
                "applicationId": application.id,
                "checkedIn": True,
                "alreadyCheckedIn": True,
                "checkedInAt": application.checked_in_at.isoformat(),
            },
        }
    result = await session.execute(
        update(EventApplication)
        .where(
            EventApplication.id == application.id,
            EventApplication.checked_in_at.is_(None),
        )
        .values(checked_in_at=now, checked_in_by=context.user.id, updated_at=now)
    )
    if result.rowcount != 1:
        await session.rollback()
        application = await session.get(EventApplication, application.id)
        return {
            "ok": True,
            "data": {
                "eventId": event.id,
                "applicationId": application.id,
                "checkedIn": True,
                "alreadyCheckedIn": True,
                "checkedInAt": application.checked_in_at.isoformat(),
            },
        }
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.application_checked_in",
        entity_type="event_application",
        entity_id=application.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
        details={"eventId": event.id},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "eventId": event.id,
            "applicationId": application.id,
            "checkedIn": True,
            "alreadyCheckedIn": False,
            "checkedInAt": now.isoformat(),
        },
    }


@admin_router.get("/events/{event_id}/comments")
async def admin_list_event_comments(
    event_id: str, context: CurrentAdmin, session: DbSession
) -> dict:
    context.require_action("events:read")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    rows = (
        await session.execute(
            select(EventComment, User)
            .join(User, User.id == EventComment.user_id)
            .where(EventComment.event_id == event.id)
            .order_by(EventComment.created_at, EventComment.id)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    **_comment_data(comment, user),
                    "userId": user.id,
                    "email": user.email,
                }
                for comment, user in rows
            ]
        },
    }


@admin_router.patch("/events/{event_id}/comments/{comment_id}")
async def admin_review_event_comment(
    event_id: str,
    comment_id: str,
    payload: EventCommentReviewRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("events:write")
    event = await session.get(Event, event_id)
    comment = await session.get(EventComment, comment_id)
    if (
        event is None
        or comment is None
        or comment.event_id != event_id
        or not event_in_scope(context, event)
    ):
        raise AppError(404, "COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다.")
    comment.status = payload.status
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action=f"event.comment_{payload.status}",
        entity_type="event_comment",
        entity_id=comment.id,
        organization_id=event.organization_id,
        artist_id=event.artist_id,
        details={"eventId": event.id, "note": payload.note}
        if payload.note
        else {"eventId": event.id},
    )
    await session.commit()
    user = await session.get(User, comment.user_id)
    return {"ok": True, "data": _comment_data(comment, user)}


@admin_router.post("/events/{event_id}/draw")
async def admin_draw_event_winners(
    event_id: str,
    payload: EventDrawRequest,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_action("events:write")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    candidates = list(
        await session.scalars(
            select(EventApplication).where(
                EventApplication.event_id == event.id,
                EventApplication.status == "submitted",
            )
        )
    )
    if not candidates:
        raise AppError(409, "EVENT_DRAW_EMPTY", "추첨할 신청자가 없습니다.")
    winner_count = min(payload.winner_count, len(candidates))
    winners = secrets.SystemRandom().sample(candidates, winner_count)
    winner_ids = {winner.id for winner in winners}
    for application in candidates:
        application.status = "winner" if application.id in winner_ids else "not_selected"
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="event.winners_drawn",
        entity_type="event",
        entity_id=event.id,
        details={"winnerCount": winner_count},
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "winnerCount": winner_count,
            "winnerApplicationIds": [winner.id for winner in winners],
        },
    }


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
    if event.workflow_status == "ended":
        raise AppError(409, "EVENT_EDIT_LOCKED", "종료된 이벤트는 편집할 수 없습니다.")
    related_cards = await _validate_related_cards(session, context, payload.related_card_ids)
    for field, value in (
        ("title", payload.title),
        ("summary", payload.summary),
        ("description", payload.description),
        ("notice_items", payload.notice_items),
        ("hero_asset_id", payload.hero_asset_id),
        ("event_type", payload.event_type),
        ("starts_at", payload.starts_at),
        ("ends_at", payload.ends_at),
        ("venue", payload.venue),
        ("participant_limit", payload.participant_limit),
        ("application_starts_at", payload.application_starts_at),
        ("application_ends_at", payload.application_ends_at),
        ("featured", payload.featured),
        ("cta_label", payload.cta_label),
        ("drop_id", payload.drop_id),
        ("card_id", payload.card_id),
        ("achievement_id", payload.achievement_id),
        ("external_url", payload.external_url),
    ):
        setattr(event, field, value)
    await _replace_related_cards(session, event, related_cards)
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
    return {"ok": True, "data": await _event_admin_data(session, event)}


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
    return {"ok": True, "data": await _event_admin_data(session, event)}


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
    return {"ok": True, "data": await _event_admin_data(session, event)}


@admin_router.post("/events/{event_id}/publish")
async def admin_publish_event(event_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("events:publish")
    event = await session.get(Event, event_id)
    if event is None or not event_in_scope(context, event):
        raise AppError(404, "EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.")
    target = "published" if _utc_datetime(event.starts_at) <= datetime.now(UTC) else "scheduled"
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
    return {"ok": True, "data": await _event_admin_data(session, event)}


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
    return {"ok": True, "data": await _event_admin_data(session, event)}


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
