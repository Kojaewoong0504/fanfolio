"""Small process-local rate limiter for the MVP abuse-sensitive endpoints.

The limiter deliberately has no extra dependency, which keeps local development
and the contract tests self-contained. In a multi-worker deployment this
should be replaced with the same interface backed by Redis so all workers share
the window.
"""

import asyncio
import time

from app.errors import AppError

_windows: dict[str, list[float]] = {}
_lock = asyncio.Lock()


async def enforce_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    cutoff = now - window_seconds
    async with _lock:
        timestamps = [timestamp for timestamp in _windows.get(key, []) if timestamp > cutoff]
        if len(timestamps) >= limit:
            retry_after = max(1, int(timestamps[0] + window_seconds - now))
            _windows[key] = timestamps
            raise AppError(
                429,
                "RATE_LIMITED",
                f"요청이 너무 많습니다. {retry_after}초 후 다시 시도해 주세요.",
            )
        timestamps.append(now)
        _windows[key] = timestamps


async def reset_rate_limits() -> None:
    """Reset state for isolated test fixtures and local development resets."""
    async with _lock:
        _windows.clear()
