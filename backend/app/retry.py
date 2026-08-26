"""Small, provider-independent retry policy used by background work."""

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class RetryDecision:
    status: str
    next_attempt_at: datetime | None


def decide_retry(
    *,
    attempt_count: int,
    now: datetime,
    max_attempts: int,
    base_delay_seconds: int,
    max_delay_seconds: int = 3600,
) -> RetryDecision:
    """Return the next state without sleeping or calling a provider."""
    if attempt_count >= max_attempts:
        return RetryDecision(status="dead_letter", next_attempt_at=None)
    exponent = max(attempt_count - 1, 0)
    delay = min(base_delay_seconds * (2**exponent), max_delay_seconds)
    return RetryDecision(status="failed", next_attempt_at=now + timedelta(seconds=delay))
