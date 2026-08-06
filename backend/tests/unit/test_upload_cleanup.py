import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, Self

from app import services


class FakeSession:
    def __init__(self, assets: list[Any]) -> None:
        self.assets = assets
        self.committed = False

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def scalars(self, _: Any) -> list[Any]:
        return self.assets

    async def commit(self) -> None:
        self.committed = True


class FakeStorage:
    def __init__(self, failing: set[str] | None = None) -> None:
        self.deleted: list[str] = []
        self.failing = failing or set()

    def delete(self, storage_path: str) -> None:
        if storage_path in self.failing:
            raise OSError("temporary storage failure")
        self.deleted.append(storage_path)


def test_cleanup_expired_uploads_deletes_only_uncompleted_objects(monkeypatch: Any) -> None:
    asset = SimpleNamespace(
        storage_path="s3://bucket/fanfolio/assets/abandoned.bin",
        upload_expires_at=datetime.now(UTC) - timedelta(minutes=1),
        upload_completed_at=None,
    )
    session = FakeSession([asset])
    storage = FakeStorage()

    monkeypatch.setattr(services, "SessionLocal", lambda: session)
    monkeypatch.setattr(services, "configured_asset_storage", lambda: storage)

    cleaned = asyncio.run(services.cleanup_expired_uploads())

    assert cleaned == 1
    assert storage.deleted == ["s3://bucket/fanfolio/assets/abandoned.bin"]
    assert asset.storage_path is None
    assert session.committed is True


def test_cleanup_expired_uploads_keeps_failed_deletions_for_retry(monkeypatch: Any) -> None:
    failed_path = "s3://bucket/fanfolio/assets/retry.bin"
    successful_path = "s3://bucket/fanfolio/assets/clean.bin"
    assets = [
        SimpleNamespace(
            id="asset_retry",
            storage_path=failed_path,
            upload_expires_at=datetime.now(UTC) - timedelta(minutes=1),
            upload_completed_at=None,
        ),
        SimpleNamespace(
            id="asset_clean",
            storage_path=successful_path,
            upload_expires_at=datetime.now(UTC) - timedelta(minutes=1),
            upload_completed_at=None,
        ),
    ]
    session = FakeSession(assets)
    storage = FakeStorage({failed_path})

    monkeypatch.setattr(services, "SessionLocal", lambda: session)
    monkeypatch.setattr(services, "configured_asset_storage", lambda: storage)

    cleaned = asyncio.run(services.cleanup_expired_uploads())

    assert cleaned == 1
    assert assets[0].storage_path == failed_path
    assert assets[1].storage_path is None
    assert storage.deleted == [successful_path]
    assert session.committed is True
