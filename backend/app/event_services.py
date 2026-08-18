"""Business rules for managed fan events."""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_access import AdminContext
from app.errors import AppError
from app.models import AchievementDefinition, Asset, Card, Drop, Event, Notification

EVENT_TYPES = {"announcement", "comment", "card_drop", "card", "fan_mission", "external"}
WORKFLOW_STATUSES = {
    "draft",
    "pending_review",
    "changes_requested",
    "approved",
    "scheduled",
    "published",
    "ended",
}


def public_event_status(
    workflow_status: str,
    *,
    starts_at: datetime,
    ends_at: datetime | None,
    now: datetime | None = None,
) -> str | None:
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    start = starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=UTC)
    end = ends_at if ends_at is None or ends_at.tzinfo else ends_at.replace(tzinfo=UTC)
    if workflow_status == "ended" or end is not None and end <= now:
        return "ended"
    if workflow_status in {"scheduled", "published"}:
        return "active" if start <= now else "upcoming"
    return None


def validate_event_links(
    *,
    event_type: str,
    drop: Drop | None = None,
    card: Card | None = None,
    achievement: AchievementDefinition | None = None,
    external_url: str | None = None,
) -> None:
    if event_type not in EVENT_TYPES:
        raise AppError(422, "EVENT_TYPE_INVALID", "이벤트 유형이 올바르지 않습니다.")
    values = [drop, card, achievement, external_url]
    if event_type in {"announcement", "comment"}:
        if any(values):
            raise AppError(
                422, "EVENT_LINK_INVALID", "공지·댓글 이벤트는 연결 대상을 가질 수 없습니다."
            )
        return
    expected = {
        "card_drop": drop,
        "card": card,
        "fan_mission": achievement,
        "external": external_url,
    }[event_type]
    if expected is None or sum(value is not None for value in values) != 1:
        raise AppError(422, "EVENT_LINK_INVALID", "이벤트 유형에 맞는 연결 대상 하나가 필요합니다.")
    if event_type == "external" and (
        not isinstance(external_url, str) or urlparse(external_url).scheme != "https"
    ):
        raise AppError(422, "EVENT_URL_INVALID", "외부 링크는 HTTPS만 사용할 수 있습니다.")


def validate_transition(current: str, target: str) -> None:
    allowed = {
        "draft": {"pending_review"},
        "changes_requested": {"pending_review"},
        "pending_review": {"changes_requested", "approved"},
        "approved": {"scheduled", "published"},
        "scheduled": {"published", "ended"},
        "published": {"ended"},
        "ended": set(),
    }
    if target not in allowed.get(current, set()):
        raise AppError(
            409,
            "EVENT_TRANSITION_INVALID",
            f"{current} 상태에서 {target}(으)로 변경할 수 없습니다.",
        )


async def validate_event_asset(session: AsyncSession, asset_id: str) -> Asset:
    asset = await session.get(Asset, asset_id)
    if (
        asset is None
        or asset.purpose != "event_banner"
        or asset.upload_completed_at is None
        or asset.content_type not in {"image/png", "image/jpeg", "image/webp"}
    ):
        raise AppError(422, "EVENT_ASSET_INVALID", "완료된 이벤트 배너 이미지를 선택해 주세요.")
    return asset


async def validate_event_connections(session: AsyncSession, event: Event) -> None:
    drop = await session.get(Drop, event.drop_id) if event.drop_id else None
    card = await session.get(Card, event.card_id) if event.card_id else None
    achievement = (
        await session.get(AchievementDefinition, event.achievement_id)
        if event.achievement_id
        else None
    )
    validate_event_links(
        event_type=event.event_type,
        drop=drop,
        card=card,
        achievement=achievement,
        external_url=event.external_url,
    )
    if event.event_type == "card_drop" and (
        drop is None or drop.status not in {"scheduled", "live"}
    ):
        raise AppError(
            422, "EVENT_DROP_NOT_READY", "공개 가능한 드롭만 이벤트에 연결할 수 있습니다."
        )
    if event.event_type == "card" and (card is None or card.release_status != "published"):
        raise AppError(422, "EVENT_CARD_NOT_READY", "공개된 카드만 이벤트에 연결할 수 있습니다.")
    if event.event_type == "fan_mission" and (
        achievement is None or achievement.status != "published"
    ):
        raise AppError(422, "EVENT_MISSION_NOT_READY", "공개된 미션만 이벤트에 연결할 수 있습니다.")


async def create_event_notification(session: AsyncSession, event: Event) -> int:
    if event.notification_sent_at is not None:
        return 0
    from app.models import Role, User

    users = await session.scalars(select(User).where(User.role == Role.FAN))
    count = 0
    key = f"event_started:{event.id}"
    for user in users:
        existing = await session.scalar(
            select(Notification.id).where(
                Notification.user_id == user.id, Notification.event_key == key
            )
        )
        if existing:
            continue
        session.add(
            Notification(
                id=f"notification_event_{event.id}_{user.id}",
                user_id=user.id,
                kind="event_started",
                title="새 이벤트가 시작되었어요",
                body=event.title,
                entity_type="event",
                entity_id=event.id,
                event_key=key,
            )
        )
        count += 1
    event.notification_sent_at = datetime.now(UTC)
    return count


async def reconcile_due_event_notifications(
    session: AsyncSession, *, now: datetime | None = None
) -> int:
    now = now or datetime.now(UTC)
    events = await session.scalars(
        select(Event).where(
            Event.workflow_status.in_(["scheduled", "published"]),
            Event.starts_at <= now,
            Event.notification_sent_at.is_(None),
        )
    )
    count = 0
    for event in events:
        count += await create_event_notification(session, event)
    from app.models import EventApplication

    deadline_events = await session.scalars(
        select(Event).where(
            Event.workflow_status.in_(["scheduled", "published"]),
            Event.application_ends_at.is_not(None),
        )
    )
    for event in deadline_events:
        deadline = event.application_ends_at
        if deadline is None:
            continue
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=UTC)
        if not now < deadline <= now + timedelta(hours=24):
            continue
        applications = await session.scalars(
            select(EventApplication).where(
                EventApplication.event_id == event.id,
                EventApplication.status == "submitted",
            )
        )
        for application in applications:
            key = f"event_application_deadline:{event.id}:{application.user_id}"
            existing = await session.scalar(
                select(Notification.id).where(
                    Notification.user_id == application.user_id,
                    Notification.event_key == key,
                )
            )
            if existing:
                continue
            session.add(
                Notification(
                    id=f"notification_event_deadline_{event.id}_{application.user_id}",
                    user_id=application.user_id,
                    kind="event_application_deadline",
                    title="이벤트 신청 마감이 임박했어요",
                    body=event.title,
                    entity_type="event",
                    entity_id=event.id,
                    event_key=key,
                )
            )
            count += 1
    if count:
        await session.commit()
    return count


def event_in_scope(context: AdminContext, event: Event) -> bool:
    if context.is_root or context.is_platform_operator:
        return True
    if context.organization is None or event.organization_id != context.organization.id:
        return False
    return (
        context.membership.access_level == "company_admin"
        or event.artist_id in context.assigned_artist_ids
    )
