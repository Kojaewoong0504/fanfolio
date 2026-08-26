from datetime import UTC, datetime

from app.retry import RetryDecision, decide_retry


def test_retry_schedule_is_bounded_and_dead_letters_after_max_attempts() -> None:
    now = datetime(2026, 8, 26, tzinfo=UTC)

    first = decide_retry(attempt_count=1, now=now, max_attempts=5, base_delay_seconds=30)
    assert first == RetryDecision(
        status="failed", next_attempt_at=datetime(2026, 8, 26, 0, 0, 30, tzinfo=UTC)
    )

    last = decide_retry(attempt_count=5, now=now, max_attempts=5, base_delay_seconds=30)
    assert last.status == "dead_letter"
    assert last.next_attempt_at is None


def test_retry_delay_is_capped() -> None:
    now = datetime(2026, 8, 26, tzinfo=UTC)
    decision = decide_retry(
        attempt_count=10,
        now=now,
        max_attempts=12,
        base_delay_seconds=30,
        max_delay_seconds=120,
    )
    assert decision.next_attempt_at == datetime(2026, 8, 26, 0, 2, tzinfo=UTC)
