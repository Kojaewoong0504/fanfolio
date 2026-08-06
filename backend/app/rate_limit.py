"""Shared rate limiting for abuse-sensitive endpoints.

Development and contract tests use a process-local window so the API can run
without infrastructure. Production must use Redis: a memory-only limiter is
not shared by Uvicorn workers or multiple application instances.
"""

import asyncio
import time
from typing import Final

from redis.asyncio import Redis

from app.core.config import get_settings
from app.errors import AppError

_windows: dict[str, list[float]] = {}
_lock = asyncio.Lock()
_redis_client: Redis | None = None
_redis_url: str | None = None

# INCR + EXPIRE must be one atomic operation. The expiry starts with the first
# request, producing a fixed window and avoiding a race between workers.
_INCREMENT_SCRIPT: Final[str] = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


def _redis_key(key: str) -> str:
    return f"fanfolio:rate-limit:{key}"


def _get_redis_client() -> Redis:
    global _redis_client, _redis_url
    settings = get_settings()
    if _redis_client is None or _redis_url != settings.rate_limit_redis_url:
        _redis_client = Redis.from_url(settings.rate_limit_redis_url, decode_responses=True)
        _redis_url = settings.rate_limit_redis_url
    return _redis_client


async def _enforce_memory_limit(key: str, *, limit: int, window_seconds: int) -> None:
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


async def _enforce_redis_limit(key: str, *, limit: int, window_seconds: int) -> None:
    redis = _get_redis_client()
    try:
        count = int(
            await redis.eval(
                _INCREMENT_SCRIPT,
                1,
                _redis_key(key),
                window_seconds,
            )
        )
        if count <= limit:
            return

        retry_after = max(1, int(await redis.ttl(_redis_key(key))))
        raise AppError(
            429,
            "RATE_LIMITED",
            f"요청이 너무 많습니다. {retry_after}초 후 다시 시도해 주세요.",
        )
    except AppError:
        raise
    except Exception as error:
        # Failing open would make the limiter disappear exactly when Redis is
        # unhealthy. A 503 lets the caller retry and alerts the operator.
        raise AppError(
            503,
            "RATE_LIMITER_UNAVAILABLE",
            "요청 제한 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        ) from error


async def enforce_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Reject requests above the configured window limit.

    ``RATE_LIMIT_BACKEND=memory`` is intentionally suitable only for local
    development and tests. Production startup rejects that setting.
    """
    if get_settings().rate_limit_backend == "redis":
        await _enforce_redis_limit(key, limit=limit, window_seconds=window_seconds)
        return
    await _enforce_memory_limit(key, limit=limit, window_seconds=window_seconds)


async def reset_rate_limits() -> None:
    """Reset local state and close the optional Redis pool for test isolation."""
    global _redis_client, _redis_url
    async with _lock:
        _windows.clear()
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        _redis_url = None
