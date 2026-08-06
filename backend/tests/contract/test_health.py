from typing import Any

from fastapi.testclient import TestClient

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


def test_configured_frontend_origin_is_allowed_for_cookie_requests(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"
