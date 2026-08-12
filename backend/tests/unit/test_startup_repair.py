import asyncio
from types import SimpleNamespace

from app import main


def test_demo_asset_repair_failure_does_not_abort_startup(monkeypatch) -> None:
    class FakeSessionContext:
        async def __aenter__(self) -> object:
            return object()

        async def __aexit__(self, *_: object) -> None:
            return None

    async def failing_repair(_: object) -> None:
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(main, "SessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr(main, "ensure_demo_card_asset", failing_repair)

    asyncio.run(
        main._repair_demo_card_assets_if_enabled(SimpleNamespace(repair_demo_card_assets=True))
    )
