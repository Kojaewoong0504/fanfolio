import base64
from typing import Any

from fastapi.testclient import TestClient
from starlette.background import BackgroundTasks

from app import tasks, upload_safety
from app.core.config import get_settings
from app.errors import AppError
from app.routers import assets as assets_router
from tests.conftest import assert_error, assert_success

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class FakeDirectStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def asset_path(self, asset_id: str, suffix: str = "") -> str:
        return f"s3://test-bucket/fanfolio/assets/{asset_id}{suffix}"

    def presigned_upload_url(self, asset_id: str, *, content_type: str, expires_in: int) -> str:
        return f"https://storage.test/{asset_id}?type={content_type}&expires={expires_in}"

    def save_bytes(self, asset_id: str, content: bytes) -> str:
        path = self.asset_path(asset_id, ".bin")
        self.objects[path] = content
        return path

    def exists(self, storage_path: str) -> bool:
        return storage_path in self.objects

    def size_bytes(self, storage_path: str) -> int:
        return len(self.objects[storage_path])

    def read_bytes(self, storage_path: str) -> bytes:
        return self.objects[storage_path]

    def delete(self, storage_path: str) -> None:
        self.objects.pop(storage_path, None)


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

    storage.objects[f"s3://test-bucket/fanfolio/assets/{asset['assetId']}.bin"] = b"safe bytes"
    completed = assert_success(
        actors["artist"].post(asset["completeUrl"]),
        200,
    )
    assert completed["status"] == "ready"


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
