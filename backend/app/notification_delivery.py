"""Durable delivery outbox for optional email and push notifications."""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.mailer import MailDeliveryError, deliver_notification_email
from app.models import Notification, NotificationDelivery, PushDevice
from app.push import FirebasePushProvider, PushDeliveryError
from app.retry import decide_retry

logger = logging.getLogger(__name__)


def build_delivery(*, notification_id: str, channel: str, destination: str) -> NotificationDelivery:
    """Build one idempotent outbox row; callers insert it in their transaction."""
    return NotificationDelivery(
        id=f"delivery_{uuid4().hex[:12]}",
        notification_id=notification_id,
        channel=channel,
        destination=destination,
        idempotency_key=f"{notification_id}:{channel}:{destination}",
        status="pending",
        attempt_count=0,
    )


async def process_notification_delivery(delivery_id: str) -> None:
    """Claim one delivery, call its provider, then persist the outcome."""
    async with SessionLocal() as session:
        delivery = await session.scalar(
            select(NotificationDelivery)
            .where(NotificationDelivery.id == delivery_id)
            .with_for_update()
        )
        if delivery is None or delivery.status in {"sent", "dead_letter"}:
            return
        notification = await session.get(Notification, delivery.notification_id)
        if notification is None:
            delivery.status = "dead_letter"
            delivery.last_error = "notification_not_found"
            await session.commit()
            return
        delivery.status = "sending"
        delivery.attempt_count += 1
        await session.commit()
        title, body, channel, destination, attempt_count = (
            notification.title,
            notification.body or "",
            delivery.channel,
            delivery.destination,
            delivery.attempt_count,
        )

    try:
        settings = get_settings()
        if channel == "email":
            await deliver_notification_email(destination, title, body)
        elif settings.push_delivery_mode == "fcm":
            await asyncio.to_thread(
                FirebasePushProvider(settings).send,
                destination,
                title,
                body,
                {"notificationId": notification.id},
            )
        else:
            logger.info("Push notification delivery skipped in console mode")
    except (MailDeliveryError, PushDeliveryError, OSError) as exc:
        settings = get_settings()
        permanent = isinstance(exc, PushDeliveryError) and exc.permanent
        decision = decide_retry(
            attempt_count=attempt_count,
            now=datetime.now(UTC),
            max_attempts=settings.engagement_event_max_attempts,
            base_delay_seconds=settings.engagement_event_retry_base_seconds,
            max_delay_seconds=settings.engagement_event_retry_max_seconds,
        )
        async with SessionLocal() as session:
            failed = await session.get(NotificationDelivery, delivery_id)
            if failed:
                failed.status = "dead_letter" if permanent else decision.status
                failed.next_attempt_at = None if permanent else decision.next_attempt_at
                failed.last_error = str(exc)[:500]
                if permanent:
                    device = await session.scalar(
                        select(PushDevice).where(PushDevice.token == destination)
                    )
                    if device:
                        device.enabled = False
                await session.commit()
        return

    async with SessionLocal() as session:
        delivered = await session.get(NotificationDelivery, delivery_id)
        if delivered:
            delivered.status = "sent"
            delivered.sent_at = datetime.now(UTC)
            delivered.next_attempt_at = None
            delivered.last_error = None
            await session.commit()


async def process_due_notification_deliveries(limit: int = 100) -> int:
    current_time = datetime.now(UTC)
    async with SessionLocal() as session:
        ids = list(
            await session.scalars(
                select(NotificationDelivery.id)
                .where(
                    NotificationDelivery.status.in_({"pending", "failed"}),
                    (NotificationDelivery.next_attempt_at.is_(None))
                    | (NotificationDelivery.next_attempt_at <= current_time),
                )
                .order_by(NotificationDelivery.created_at)
                .limit(limit)
            )
        )
    for delivery_id in ids:
        await process_notification_delivery(delivery_id)
    return len(ids)
