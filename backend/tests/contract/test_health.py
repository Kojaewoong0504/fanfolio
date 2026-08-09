import logging
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.routers import health
from tests.conftest import assert_success


def test_invalid_request_uses_the_common_error_envelope(client: TestClient) -> None:
    response = client.post("/api/auth/magic-link/request", json={"email": "not-email"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_health_check_returns_common_success_contract(client: TestClient) -> None:
    data = assert_success(client.get("/api/health"))

    assert data["status"] == "healthy"


def test_readiness_check_verifies_database_and_runtime_configuration(
    client: TestClient,
) -> None:
    data = assert_success(client.get("/api/health/ready"))

    assert data["status"] == "ready"


def test_readiness_checks_the_task_broker_when_celery_is_enabled(
    client: TestClient,
    monkeypatch: Any,
) -> None:
    checked = False

    async def fake_check_task_queue() -> None:
        nonlocal checked
        checked = True

    monkeypatch.setattr(health, "_check_task_queue", fake_check_task_queue)

    data = assert_success(client.get("/api/health/ready"))

    assert data["status"] == "ready"
    assert checked is True


def test_readiness_checks_the_shared_rate_limit_backend(
    client: TestClient, monkeypatch: Any
) -> None:
    checked = False

    async def fake_check_rate_limit_backend() -> None:
        nonlocal checked
        checked = True

    monkeypatch.setattr(health, "check_rate_limit_backend", fake_check_rate_limit_backend)

    data = assert_success(client.get("/api/health/ready"))

    assert data["status"] == "ready"
    assert checked is True


def test_readiness_checks_storage_and_upload_scanner(client: TestClient, monkeypatch: Any) -> None:
    checked = {"storage": False, "scanner": False}

    async def fake_check_storage_backend() -> None:
        checked["storage"] = True

    async def fake_check_upload_scanner() -> None:
        checked["scanner"] = True

    monkeypatch.setattr(health, "_check_storage_backend", fake_check_storage_backend)
    monkeypatch.setattr(health, "_check_upload_scanner", fake_check_upload_scanner)

    data = assert_success(client.get("/api/health/ready"))

    assert data["status"] == "ready"
    assert checked == {"storage": True, "scanner": True}


def test_readiness_fails_when_the_s3_bucket_is_unavailable(
    client: TestClient, monkeypatch: Any
) -> None:
    class UnavailableStorage:
        def check_ready(self) -> None:
            raise OSError("bucket is unavailable")

    monkeypatch.setattr(get_settings(), "storage_backend", "s3")
    monkeypatch.setattr(health, "configured_asset_storage", lambda: UnavailableStorage())

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"


def test_readiness_returns_service_unavailable_when_rate_limiter_is_down(
    client: TestClient,
    monkeypatch: Any,
) -> None:
    async def failed_check_rate_limit_backend() -> None:
        raise OSError("redis is unavailable")

    monkeypatch.setattr(health, "check_rate_limit_backend", failed_check_rate_limit_backend)

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"


def test_readiness_returns_service_unavailable_when_task_broker_is_down(
    client: TestClient,
    monkeypatch: Any,
) -> None:
    async def failed_check_task_queue() -> None:
        raise OSError("redis is unavailable")

    monkeypatch.setattr(health, "_check_task_queue", failed_check_task_queue)

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_READY"


def test_readiness_logs_only_the_safe_dependency_error_type(
    client: TestClient, monkeypatch: Any, caplog: Any
) -> None:
    async def failed_check_rate_limit_backend() -> None:
        raise OSError("redis://user:secret@example.com:6379/1")

    monkeypatch.setattr(health, "check_rate_limit_backend", failed_check_rate_limit_backend)

    with caplog.at_level(logging.WARNING, logger="app.routers.health"):
        response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert "OSError" in caplog.text
    assert "secret" not in caplog.text
    assert "redis://" not in caplog.text


def test_configured_frontend_origin_is_allowed_for_cookie_requests(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_production_rejects_state_changing_requests_from_an_untrusted_origin(
    client: TestClient, monkeypatch: Any
) -> None:
    monkeypatch.setattr(get_settings(), "app_env", "production")
    monkeypatch.setattr(get_settings(), "frontend_origins", "https://fanfolio-fan.vercel.app")

    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "fan@example.com", "purpose": "login"},
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_ORIGIN_INVALID"


def test_scoped_vercel_preview_origin_passes_cors_and_csrf_checks(
    monkeypatch: Any,
) -> None:
    preview_origin = (
        "https://fanfolio-admin-git-feature-auth-abc123-kojaewoong0504s-projects.vercel.app"
    )
    monkeypatch.setenv(
        "FRONTEND_PREVIEW_PROJECTS",
        "fanfolio-fan,fanfolio-admin,fanfolio-studio",
    )
    monkeypatch.setenv(
        "FRONTEND_PREVIEW_DOMAIN",
        "kojaewoong0504s-projects.vercel.app",
    )
    get_settings.cache_clear()

    try:
        with TestClient(create_app()) as preview_client:
            preflight = preview_client.options(
                "/api/auth/admin/login",
                headers={
                    "Origin": preview_origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type,x-fanfolio-client",
                },
            )
            rejected_payload = preview_client.post(
                "/api/auth/magic-link/request",
                json={"email": "not-email"},
                headers={"Origin": preview_origin},
            )
    finally:
        get_settings.cache_clear()

    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == preview_origin
    assert rejected_payload.status_code == 422
    assert rejected_payload.json()["error"]["code"] == "VALIDATION_ERROR"
