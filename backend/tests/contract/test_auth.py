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


def test_magic_link_request_preserves_signup_purpose(
    client: TestClient, seeded: dict[str, object], monkeypatch: Any
) -> None:
    delivered: list[tuple[str, str, str]] = []

    async def fake_deliver(email: str, token: str, purpose: str) -> None:
        delivered.append((email, token, purpose))

    monkeypatch.setattr("app.routers.auth.deliver_magic_link", fake_deliver)
    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "new-signup@example.com", "purpose": "signup"},
    )

    data = assert_success(response, 202)
    assert data["delivery"] == "queued"
    assert delivered[0][0] == "new-signup@example.com"
    assert delivered[0][2] == "signup"
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


def test_magic_link_requests_are_rate_limited(
    client: TestClient, seeded: dict[str, object]
) -> None:
    payload = {"email": "rate-limit@example.com", "purpose": "login"}

    for _ in range(5):
        assert client.post("/api/auth/magic-link/request", json=payload).status_code == 202

    assert_error(client.post("/api/auth/magic-link/request", json=payload), 429, "RATE_LIMITED")


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


def test_browser_clients_keep_fan_and_admin_sessions_separate(
    app: FastAPI, seeded: dict[str, Any]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)

    fan_client = TestClient(app)
    fan_login = fan_client.post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["fan"]},
        headers={"X-Fanfolio-Client": "fan"},
    )
    assert fan_login.status_code == 200, fan_login.text
    fan_session = fan_login.cookies.get("fanfolio_fan_session")
    assert fan_session

    admin_login = fan_client.post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["admin"]},
        headers={"X-Fanfolio-Client": "admin"},
    )
    assert admin_login.status_code == 200, admin_login.text
    admin_session = admin_login.cookies.get("fanfolio_admin_session")
    assert admin_session

    browser = TestClient(app)
    browser.cookies.set("fanfolio_fan_session", fan_session)
    browser.cookies.set("fanfolio_admin_session", admin_session)
    fan_state = browser.get("/api/me", headers={"X-Fanfolio-Client": "fan"})
    admin_state = browser.get("/api/admin/dashboard", headers={"X-Fanfolio-Client": "admin"})

    assert fan_state.status_code == 200, fan_state.text
    assert fan_state.json()["data"]["role"] == "fan"
    assert admin_state.status_code == 200, admin_state.text

    fan_logout = browser.post("/api/auth/logout", headers={"X-Fanfolio-Client": "fan"})
    assert fan_logout.status_code == 204, fan_logout.text
    admin_after_fan_logout = browser.get(
        "/api/admin/dashboard", headers={"X-Fanfolio-Client": "admin"}
    )
    assert admin_after_fan_logout.status_code == 200, admin_after_fan_logout.text


def test_logout_invalidates_the_server_session(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    assert fan.post("/api/auth/logout").status_code == 204
    assert_error(fan.get("/api/me/collection"), 401, "AUTH_REQUIRED")


def test_admin_can_issue_an_artist_login_and_artist_can_change_the_temporary_password(
    actors: dict[str, TestClient],
) -> None:
    issued = actors["admin"].post(
        "/api/admin/artist-accounts",
        json={"username": "dreamscape-studio", "displayName": "드림스케이프 담당자"},
    )
    account = assert_success(issued, 201)
    assert account["username"] == "dreamscape-studio"
    assert account["temporaryPassword"]

    login = actors["admin"].post(
        "/api/auth/artist/login",
        json={"username": "dreamscape-studio", "password": account["temporaryPassword"]},
    )
    login_data = assert_success(login)
    assert login_data["mustChangePassword"] is True
    assert login_data["user"]["role"] == "artist"
    access_token = login_data["accessToken"]
    assert access_token

    changed = actors["admin"].post(
        "/api/auth/artist/change-password",
        headers={"Authorization": f"Bearer {access_token}", "X-Fanfolio-Client": "artist"},
        json={
            "currentPassword": account["temporaryPassword"],
            "newPassword": "Safer-password-2026!",
        },
    )
    assert_success(changed)

    old_login = actors["admin"].post(
        "/api/auth/artist/login",
        json={"username": "dreamscape-studio", "password": account["temporaryPassword"]},
    )
    assert_error(old_login, 401, "INVALID_CREDENTIALS")

    new_login = actors["admin"].post(
        "/api/auth/artist/login",
        json={"username": "dreamscape-studio", "password": "Safer-password-2026!"},
    )
    assert_success(new_login)


def test_artist_password_login_rejects_fan_and_admin_clients(
    actors: dict[str, TestClient],
) -> None:
    issued = actors["admin"].post(
        "/api/admin/artist-accounts",
        json={"username": "private-studio", "displayName": "Private Studio"},
    )
    account = assert_success(issued, 201)

    response = actors["admin"].post(
        "/api/auth/artist/login",
        headers={"X-Fanfolio-Client": "fan"},
        json={"username": "private-studio", "password": account["temporaryPassword"]},
    )
    assert_error(response, 403, "ARTIST_CLIENT_REQUIRED")
