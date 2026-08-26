from app.models import NotificationDelivery


def test_notification_delivery_has_idempotent_channel_state() -> None:
    delivery = NotificationDelivery(
        id="delivery_1",
        notification_id="notification_1",
        channel="email",
        destination="fan@example.test",
        idempotency_key="notification_1:email:fan@example.test",
        status="pending",
        attempt_count=0,
    )

    assert delivery.status == "pending"
    assert delivery.attempt_count == 0
    assert delivery.next_attempt_at is None
