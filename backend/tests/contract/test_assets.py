import asyncio
import base64
from io import BytesIO
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from starlette.background import BackgroundTasks

from app import tasks, upload_safety
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.errors import AppError
from app.models import Asset
from app.routers import assets as assets_router
from tests.conftest import assert_error, assert_success

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def event_banner_png(color: tuple[int, int, int] = (42, 36, 112)) -> bytes:
    image = Image.new("RGB", (1600, 800), color)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class FakeDirectStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.read_count = 0

    def asset_path(self, asset_id: str, suffix: str = "") -> str:
        return f"s3://test-bucket/fanfolio/assets/{asset_id}{suffix}"

    def presigned_upload_url(self, asset_id: str, *, content_type: str, expires_in: int) -> str:
        return f"https://storage.test/{asset_id}?type={content_type}&expires={expires_in}"

    def save_bytes(self, asset_id: str, content: bytes, *, content_type: str | None = None) -> str:
        path = self.asset_path(asset_id, ".bin")
        self.objects[path] = content
        return path

    def save_derived_bytes(
        self,
        asset_id: str,
        suffix: str,
        content: bytes,
        *,
        content_type: str | None = None,
    ) -> str:
        path = self.asset_path(asset_id, suffix)
        self.objects[path] = content
        return path

    def exists(self, storage_path: str) -> bool:
        return storage_path in self.objects

    def size_bytes(self, storage_path: str) -> int:
        return len(self.objects[storage_path])

    def read_bytes(self, storage_path: str) -> bytes:
        self.read_count += 1
        return self.objects[storage_path]

    def delete(self, storage_path: str) -> None:
        self.objects.pop(storage_path, None)


def asset_upload_completed_at(asset_id: str):
    async def load_completed_at():
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            return asset.upload_completed_at

    return asyncio.run(load_completed_at())


def test_background_removal_can_dispatch_to_celery(monkeypatch: Any) -> None:
    dispatched: list[str] = []
    monkeypatch.setattr(tasks.settings, "task_queue_mode", "celery")
    monkeypatch.setattr(
        tasks.process_background_removal_task,
        "delay",
        lambda job_id: dispatched.append(job_id),
    )

    tasks.enqueue_background_removal("job_celery_test", BackgroundTasks())

    assert dispatched == ["job_celery_test"]


def test_celery_beat_schedules_expired_upload_cleanup() -> None:
    schedule = tasks.celery_app.conf.beat_schedule["cleanup-expired-uploads"]

    assert schedule["task"] == "fanfolio.cleanup_expired_uploads"
    assert schedule["schedule"] == get_settings().upload_cleanup_interval_seconds


def test_artist_can_presign_and_upload_an_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "handwriting.png",
                "contentType": "image/png",
                "purpose": "handwriting",
            },
        ),
        201,
    )

    assert asset["assetId"].startswith("asset_")
    assert asset["uploadUrl"] == f"/api/uploads/{asset['assetId']}/content"
    assert asset["expiresAt"]
    assert asset["maxUploadBytes"] == get_settings().max_upload_bytes

    uploaded = actors["artist"].put(
        asset["uploadUrl"], content=b"fake-png", headers={"Content-Type": "image/png"}
    )
    assert uploaded.status_code == 204, uploaded.text
    completed = assert_success(
        actors["artist"].post(f"/api/uploads/{asset['assetId']}/complete"), 200
    )
    assert completed["assetId"] == asset["assetId"]
    assert completed["status"] == "ready"


def test_artist_can_upload_browser_recorded_webm_voice(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "browser-recording.webm",
                "contentType": "audio/webm",
                "purpose": "voice",
            },
        ),
        201,
    )

    uploaded = actors["artist"].put(
        asset["uploadUrl"],
        content=b"browser-recording",
        headers={"Content-Type": "audio/webm"},
    )
    assert uploaded.status_code == 204, uploaded.text


def test_artist_can_reopen_an_owned_creative_layer_asset(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "artist-sticker.png",
                "contentType": "image/png",
                "purpose": "handwriting",
            },
        ),
        201,
    )
    uploaded = actors["artist"].put(asset["uploadUrl"], content=PNG_1X1)
    assert uploaded.status_code == 204, uploaded.text

    reopened = actors["artist"].get(f"/api/assets/{asset['assetId']}/content")

    assert reopened.status_code == 200, reopened.text
    assert reopened.content == PNG_1X1
    assert reopened.headers["content-type"].startswith("image/png")
    assert_error(
        actors["fan"].get(f"/api/assets/{asset['assetId']}/content"),
        403,
        "FORBIDDEN",
    )


def test_upload_rejects_expired_urls_and_oversized_content(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "upload_url_ttl_seconds", -1)
    expired = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "expired.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )
    assert_error(
        actors["artist"].put(expired["uploadUrl"], content=b"expired"),
        410,
        "UPLOAD_URL_EXPIRED",
    )

    monkeypatch.setattr(settings, "upload_url_ttl_seconds", 900)
    monkeypatch.setattr(settings, "max_upload_bytes", 4)
    oversized = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "large.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )
    assert_error(
        actors["artist"].put(oversized["uploadUrl"], content=b"12345"),
        413,
        "UPLOAD_TOO_LARGE",
    )


def test_upload_rejects_obvious_executable_content(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "unsafe.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )

    assert_error(
        actors["artist"].put(asset["uploadUrl"], content=b"MZ\x90\x00fake executable"),
        422,
        "UNSAFE_UPLOAD",
    )


def test_organization_logo_upload_accepts_images_and_rejects_non_images(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    image = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "logo.png",
                "contentType": "image/png",
                "purpose": "organization_logo",
            },
        ),
        201,
    )
    assert image["assetId"].startswith("asset_")
    assert image["maxUploadBytes"] == 2 * 1024 * 1024

    assert_error(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "logo.pdf",
                "contentType": "application/pdf",
                "purpose": "organization_logo",
            },
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_event_banner_presign_rejects_non_image_content(actors: dict[str, TestClient]) -> None:
    assert_error(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "event-brief.pdf",
                "contentType": "application/pdf",
                "purpose": "event_banner",
            },
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_event_banner_api_upload_precomputes_webp_derivative(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )

    uploaded = actors["admin"].put(asset["uploadUrl"], content=event_banner_png())

    assert uploaded.status_code == 204, uploaded.text
    storage = assets_router.configured_asset_storage()
    derivative_path = storage.asset_path(asset["assetId"], "-event-hero-v1.webp")
    assert storage.exists(derivative_path)
    with Image.open(BytesIO(storage.read_bytes(derivative_path))) as derivative:
        assert derivative.format == "WEBP"
        assert derivative.size == (1200, 600)


def test_completed_event_banner_api_upload_is_immutable(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "immutable-event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )
    first_content = event_banner_png((42, 36, 112))
    assert actors["admin"].put(asset["uploadUrl"], content=first_content).status_code == 204
    storage = assets_router.configured_asset_storage()
    derivative_path = storage.asset_path(asset["assetId"], "-event-hero-v1.webp")
    first_derivative = storage.read_bytes(derivative_path)

    assert_error(
        actors["admin"].put(asset["uploadUrl"], content=event_banner_png((230, 40, 70))),
        409,
        "UPLOAD_ALREADY_COMPLETED",
    )

    assert storage.read_bytes(derivative_path) == first_derivative
    assert storage.read_bytes(storage.asset_path(asset["assetId"], ".bin")) == first_content


def test_event_banner_api_upload_failure_keeps_asset_incomplete(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "retry-local-event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )
    ensure_derivative = assets_router.ensure_event_hero_derivative

    def fail_derivative(*args: object, **kwargs: object) -> str:
        raise OSError("derived storage unavailable")

    monkeypatch.setattr(assets_router, "ensure_event_hero_derivative", fail_derivative)
    with pytest.raises(OSError, match="derived storage unavailable"):
        actors["admin"].put(asset["uploadUrl"], content=event_banner_png())

    assert asset_upload_completed_at(asset["assetId"]) is None

    monkeypatch.setattr(assets_router, "ensure_event_hero_derivative", ensure_derivative)
    assert actors["admin"].put(asset["uploadUrl"], content=event_banner_png()).status_code == 204


def test_organization_logo_upload_is_limited_to_two_megabytes(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    presigned = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "oversized-logo.png",
                "contentType": "image/png",
                "purpose": "organization_logo",
            },
        ),
        201,
    )
    oversized_logo = PNG_1X1 + b"x" * (2 * 1024 * 1024 + 1 - len(PNG_1X1))
    response = actors["admin"].put(
        f"/api/uploads/{presigned['assetId']}/content",
        content=oversized_logo,
        headers={"Content-Type": "image/png"},
    )
    assert_error(response, 413, "UPLOAD_TOO_LARGE")


def test_s3_direct_upload_is_completed_only_after_server_scan(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    storage = FakeDirectStorage()
    monkeypatch.setattr(get_settings(), "storage_backend", "s3")
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: storage)
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "direct.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )

    assert asset["uploadMode"] == "direct"
    assert asset["uploadUrl"].startswith("https://storage.test/")
    assert asset["completeUrl"] == f"/api/uploads/{asset['assetId']}/complete"

    staging_path = storage.asset_path(asset["assetId"], "-upload.bin")
    storage.objects[staging_path] = b"safe bytes"
    completed = assert_success(
        actors["artist"].post(asset["completeUrl"]),
        200,
    )
    assert completed["status"] == "ready"
    canonical_path = storage.asset_path(asset["assetId"], ".bin")
    assert storage.objects[canonical_path] == b"safe bytes"
    assert not storage.exists(staging_path)
    retried = assert_success(actors["artist"].post(asset["completeUrl"]), 200)
    assert retried == completed

    storage.objects[staging_path] = b"changed after completion"
    owned_content = actors["artist"].get(f"/api/assets/{asset['assetId']}/content")
    assert owned_content.status_code == 200, owned_content.text
    assert owned_content.content == b"safe bytes"


def test_direct_event_banner_completion_precomputes_webp_derivative(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    storage = FakeDirectStorage()
    monkeypatch.setattr(get_settings(), "storage_backend", "s3")
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: storage)
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "direct-event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )
    staging_path = storage.asset_path(asset["assetId"], "-upload.bin")
    storage.objects[staging_path] = event_banner_png()

    completed = assert_success(actors["admin"].post(asset["completeUrl"]), 200)

    assert completed["status"] == "ready"
    assert storage.read_count == 1
    assert storage.exists(storage.asset_path(asset["assetId"], ".bin"))
    assert not storage.exists(staging_path)
    derivative_path = storage.asset_path(asset["assetId"], "-event-hero-v1.webp")
    with Image.open(BytesIO(storage.objects[derivative_path])) as derivative:
        assert derivative.format == "WEBP"
        assert derivative.size == (1200, 600)
    first_derivative = storage.objects[derivative_path]

    retried = assert_success(actors["admin"].post(asset["completeUrl"]), 200)

    assert retried == completed
    assert storage.read_count == 1
    assert storage.objects[derivative_path] == first_derivative


def test_direct_event_banner_completion_retries_after_derivative_storage_failure(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    storage = FakeDirectStorage()
    monkeypatch.setattr(get_settings(), "storage_backend", "s3")
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: storage)
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "retry-event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )
    storage.objects[storage.asset_path(asset["assetId"], "-upload.bin")] = event_banner_png()
    save_derived_bytes = storage.save_derived_bytes

    def fail_derived_storage(
        asset_id: str,
        suffix: str,
        content: bytes,
        *,
        content_type: str | None = None,
    ) -> str:
        raise OSError("derived storage unavailable")

    monkeypatch.setattr(storage, "save_derived_bytes", fail_derived_storage)
    with pytest.raises(OSError, match="derived storage unavailable"):
        actors["admin"].post(asset["completeUrl"])

    assert asset_upload_completed_at(asset["assetId"]) is None

    monkeypatch.setattr(storage, "save_derived_bytes", save_derived_bytes)
    completed = assert_success(actors["admin"].post(asset["completeUrl"]), 200)

    assert completed["status"] == "ready"
    assert storage.exists(storage.asset_path(asset["assetId"], "-event-hero-v1.webp"))


def test_supabase_direct_upload_uses_the_object_storage_flow(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    storage = FakeDirectStorage()
    monkeypatch.setattr(get_settings(), "storage_backend", "supabase")
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: storage)

    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "supabase.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )

    assert asset["uploadMode"] == "direct"
    assert asset["completeUrl"] == f"/api/uploads/{asset['assetId']}/complete"


def test_upload_fails_closed_when_clamav_is_unavailable(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    async def unavailable(_: bytes) -> None:
        raise AppError(503, "UPLOAD_SCAN_UNAVAILABLE", "scanner unavailable")

    monkeypatch.setattr(get_settings(), "asset_scan_mode", "clamav")
    monkeypatch.setattr(upload_safety, "_scan_with_clamav", unavailable)
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={"fileName": "needs-scan.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )

    assert_error(
        actors["artist"].put(asset["uploadUrl"], content=b"safe bytes"),
        503,
        "UPLOAD_SCAN_UNAVAILABLE",
    )


def test_fan_cannot_presign_an_asset(actors: dict[str, TestClient]) -> None:
    assert_error(
        actors["fan"].post(
            "/api/uploads/presign",
            json={"fileName": "card.png", "contentType": "image/png", "purpose": "card"},
        ),
        403,
        "FORBIDDEN",
    )


def test_artist_can_read_own_background_removal_job(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["artist"].post(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/background-removal"
        ),
        202,
    )
    job = assert_success(actors["artist"].get(f"/api/background-removal-jobs/{created['jobId']}"))

    assert job["jobId"] == created["jobId"]
    assert job["status"] == "failed"


def test_artist_cannot_read_another_artists_background_removal_job(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["artist"].post(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/background-removal"
        ),
        202,
    )

    assert_error(
        actors["fan"].get(f"/api/background-removal-jobs/{created['jobId']}"),
        403,
        "FORBIDDEN",
    )


def test_uploaded_handwriting_job_returns_a_transparent_result(
    actors: dict[str, TestClient],
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "handwriting.png",
                "contentType": "image/png",
                "purpose": "handwriting",
            },
        ),
        201,
    )
    uploaded = actors["artist"].put(
        asset["uploadUrl"], content=PNG_1X1, headers={"Content-Type": "image/png"}
    )
    assert uploaded.status_code == 204

    created = assert_success(
        actors["artist"].post(f"/api/assets/{asset['assetId']}/background-removal"), 202
    )
    job = assert_success(actors["artist"].get(f"/api/background-removal-jobs/{created['jobId']}"))
    assert job["status"] == "completed"
    assert job["transparentImageUrl"] == f"/api/assets/{asset['assetId']}/transparent"


def test_preview_image_is_rendered_from_uploaded_card_layers(actors: dict[str, TestClient]) -> None:
    assets = []
    for purpose, file_name in (("card", "card.png"), ("handwriting", "handwriting.png")):
        asset = assert_success(
            actors["artist"].post(
                "/api/uploads/presign",
                json={
                    "fileName": file_name,
                    "contentType": "image/png",
                    "purpose": purpose,
                },
            ),
            201,
        )
        assert actors["artist"].put(asset["uploadUrl"], content=PNG_1X1).status_code == 204
        assets.append(asset["assetId"])

    draft = assert_success(
        actors["artist"].post(
            "/api/artist/cards",
            json={
                "templateId": "template_signature_v1",
                "name": "렌더링 테스트 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": assets[0],
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(
        actors["artist"].patch(
            f"/api/artist/cards/{draft['id']}",
            json={"handwritingAssetId": assets[1], "handwritingTransform": {"x": 0, "y": 0}},
        )
    )
    preview = assert_success(actors["artist"].post(f"/api/artist/cards/{draft['id']}/preview"))
    assert preview["previewImageUrl"].endswith(f"/api/artist/cards/{draft['id']}/preview/image")

    image = actors["artist"].get(preview["previewImageUrl"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
