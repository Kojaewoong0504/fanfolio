from datetime import UTC, datetime

from app.models import SupportMessage, SupportTicket


def test_support_ticket_has_operational_state_and_owner_fields() -> None:
    ticket = SupportTicket(
        id="ticket_1",
        user_id="fan_1",
        category="trade",
        subject="거래가 완료되지 않았어요",
        status="open",
    )

    assert ticket.status == "open"
    assert ticket.category == "trade"
    assert ticket.assigned_admin_id is None
    assert ticket.closed_at is None


def test_support_messages_keep_author_and_message_order() -> None:
    created_at = datetime(2026, 8, 26, 9, 0, tzinfo=UTC)
    message = SupportMessage(
        id="message_1",
        ticket_id="ticket_1",
        author_user_id="fan_1",
        body="거래 제안이 보이지 않아요.",
        created_at=created_at,
    )

    assert message.author_user_id == "fan_1"
    assert message.body == "거래 제안이 보이지 않아요."
    assert message.created_at == created_at
