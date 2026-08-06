from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_health_check_returns_common_success_contract(client: TestClient) -> None:
    data = assert_success(client.get("/api/health"))

    assert data["status"] == "healthy"
