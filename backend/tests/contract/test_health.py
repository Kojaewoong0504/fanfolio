from fastapi.testclient import TestClient

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


def test_configured_frontend_origin_is_allowed_for_cookie_requests(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"
