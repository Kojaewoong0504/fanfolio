from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_magic_link_request_accepts_signup_or_login_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "fan@example.com", "purpose": "login"},
    )
    data = assert_success(response, 202)

    assert data["delivery"] == "queued"


def test_authenticated_user_can_log_out(actors: dict[str, TestClient]) -> None:
    response = actors["fan"].post("/api/auth/logout")

    assert response.status_code == 204
