from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.mailer import MailDeliveryError
from tests.conftest import assert_error, assert_success


def test_magic_link_request_delivers_the_created_token(
    client: TestClient, seeded: dict[str, object], monkeypatch: Any
) -> None:
    delivered: list[tuple[str, str, str]] = []

    async def fake_deliver(email: str, token: str, purpose: str) -> None:
        delivered.append((email, token, purpose))

    monkeypatch.setattr("app.routers.auth.deliver_magic_link", fake_deliver)
    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "fan@example.com", "purpose": "login"},
    )
    data = assert_success(response, 202)

    assert data["delivery"] == "queued"
    assert delivered[0][0] == "fan@example.com"
    assert delivered[0][2] == "login"
    assert delivered[0][1]


def test_magic_link_request_returns_a_delivery_error_when_provider_fails(
    client: TestClient, seeded: dict[str, object], monkeypatch: Any
) -> None:
    async def failing_deliver(_: str, __: str, ___: str) -> None:
        raise MailDeliveryError("provider unavailable")

    monkeypatch.setattr("app.routers.auth.deliver_magic_link", failing_deliver)

    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "fan@example.com", "purpose": "login"},
    )

    assert_error(response, 503, "MAGIC_LINK_DELIVERY_FAILED")


def test_magic_link_verify_rejects_an_unknown_token(
    client: TestClient, seeded: dict[str, object]
) -> None:
    response = client.post("/api/auth/magic-link/verify", json={"token": "not-a-token"})

    assert_error(response, 401, "MAGIC_LINK_INVALID")


def test_magic_link_verify_sets_a_session_and_cannot_be_reused(
    client: TestClient, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)
    token = tokens["fan"]
    assert isinstance(token, str)

    response = client.post("/api/auth/magic-link/verify", json={"token": token})
    data = assert_success(response)

    assert data["user"] == {
        "id": "fan",
        "email": "fan@example.com",
        "role": "fan",
    }
    assert data["onboardingCompleted"] is False
    assert response.cookies.get("fanfolio_session")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Path=/" in response.headers["set-cookie"]

    reused = client.post("/api/auth/magic-link/verify", json={"token": token})
    assert_error(reused, 401, "MAGIC_LINK_INVALID")


def test_magic_link_verify_creates_a_fan_account_for_a_new_email(
    client: TestClient, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)
    token = tokens["newFan"]
    assert isinstance(token, str)

    response = client.post("/api/auth/magic-link/verify", json={"token": token})
    data = assert_success(response)

    assert data["user"]["email"] == "new-fan@example.com"
    assert data["user"]["role"] == "fan"
    assert data["onboardingCompleted"] is False


def test_magic_link_verify_preserves_admin_and_artist_roles(
    client: TestClient, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)

    for role in ("admin", "artist"):
        response = client.post("/api/auth/magic-link/verify", json={"token": tokens[role]})
        data = assert_success(response)
        assert data["user"]["role"] == role


def test_magic_link_verify_rejects_an_expired_token(
    client: TestClient, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)
    token = tokens["expired"]
    assert isinstance(token, str)

    response = client.post("/api/auth/magic-link/verify", json={"token": token})
    assert_error(response, 401, "MAGIC_LINK_INVALID")


def test_authenticated_user_can_log_out(actors: dict[str, TestClient]) -> None:
    response = actors["fan"].post("/api/auth/logout")

    assert response.status_code == 204


def test_admin_and_artist_can_log_out(actors: dict[str, TestClient]) -> None:
    assert actors["admin"].post("/api/auth/logout").status_code == 204
    assert actors["artist"].post("/api/auth/logout").status_code == 204


def test_session_header_can_authenticate_a_browser_admin_client(
    app: FastAPI, seeded: dict[str, Any]
) -> None:
    client = TestClient(app, headers={"X-Fanfolio-Session": seeded["sessions"]["admin"]})
    response = client.get("/api/admin/dashboard")
    assert response.status_code == 200, response.text


def test_logout_invalidates_the_server_session(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    assert fan.post("/api/auth/logout").status_code == 204
    assert_error(fan.get("/api/me/collection"), 401, "AUTH_REQUIRED")
