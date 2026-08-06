from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_invalid_request_uses_the_common_error_envelope(client: TestClient) -> None:
    response = client.post("/api/auth/magic-link/request", json={"email": "not-email"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_health_check_returns_common_success_contract(client: TestClient) -> None:
    data = assert_success(client.get("/api/health"))

    assert data["status"] == "healthy"
