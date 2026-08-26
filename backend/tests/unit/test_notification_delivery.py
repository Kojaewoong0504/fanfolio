from app.notification_delivery import build_delivery


def test_build_delivery_uses_stable_target_idempotency_key() -> None:
    delivery = build_delivery(
        notification_id="notification_1",
        channel="email",
        destination="fan@example.test",
    )

    assert delivery.idempotency_key == "notification_1:email:fan@example.test"
    assert delivery.status == "pending"
    assert delivery.attempt_count == 0
