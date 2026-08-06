import asyncio
from types import SimpleNamespace

import pytest

from app import rate_limit
from app.errors import AppError


class FakeRedis:
    def __init__(self, count: int) -> None:
        self.count = count

    async def eval(self, *_args: object) -> int:
        return self.count

    async def ttl(self, *_args: object) -> int:
        return 12


def test_redis_rate_limit_uses_shared_atomic_counter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(
            rate_limit_backend="redis",
            rate_limit_redis_url="redis://example/1",
        ),
    )
    fake = FakeRedis(count=2)
    monkeypatch.setattr(rate_limit, "_get_redis_client", lambda: fake)

    asyncio.run(
        rate_limit.enforce_rate_limit("magic-link:alice@example.com", limit=2, window_seconds=60)
    )


def test_redis_rate_limit_returns_contract_error_after_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(
            rate_limit_backend="redis",
            rate_limit_redis_url="redis://example/1",
        ),
    )
    monkeypatch.setattr(rate_limit, "_get_redis_client", lambda: FakeRedis(count=3))

    with pytest.raises(AppError) as raised:
        asyncio.run(rate_limit.enforce_rate_limit("redemption:fan-1", limit=2, window_seconds=60))

    assert raised.value.status_code == 429
    assert raised.value.code == "RATE_LIMITED"
