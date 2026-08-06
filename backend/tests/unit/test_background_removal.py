import asyncio
from types import SimpleNamespace
from typing import Any, Self

from app import services
from app.models import Asset, BackgroundRemovalJob


class FakeSession:
    def __init__(self, job: Any, asset: Any) -> None:
        self.job = job
        self.asset = asset
        self.commits = 0

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def get(self, model: type[Any], identifier: str) -> Any:
        if model is BackgroundRemovalJob:
            return self.job
        if model is Asset:
            return self.asset
        raise AssertionError(f"unexpected model: {model}")

    async def commit(self) -> None:
        self.commits += 1


class FailingStorage:
    def read_bytes(self, _: str) -> bytes:
        raise RuntimeError("object store temporarily unavailable")


def test_background_removal_marks_provider_failures_as_failed(monkeypatch: Any) -> None:
    job = SimpleNamespace(id="job_retry", asset_id="asset_remote", status="queued")
    asset = SimpleNamespace(id="asset_remote", storage_path="s3://bucket/object.bin")
    session = FakeSession(job, asset)

    monkeypatch.setattr(services, "SessionLocal", lambda: session)
    monkeypatch.setattr(services, "configured_asset_storage", lambda: FailingStorage())

    asyncio.run(services.process_background_removal(job.id))

    assert job.status == "failed"
    assert session.commits == 2
