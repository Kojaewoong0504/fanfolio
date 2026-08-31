from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import get_settings
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


def test_fan_can_sign_up_and_log_in_with_email_and_password(
    client: TestClient, seeded: dict[str, object]
) -> None:
    signup = client.post(
        "/api/auth/fan/signup",
        headers={"X-Fanfolio-Client": "fan"},
        json={"email": "password-fan@example.com", "password": "fan-password-2026"},
    )
    signup_data = assert_success(signup, 201)
    assert signup_data["user"]["role"] == "fan"
    assert signup_data["accessToken"]
    assert "fanfolio_fan_refresh=" in signup.headers["set-cookie"]

    client.post("/api/auth/logout", headers={"X-Fanfolio-Client": "fan"})
    login = client.post(
        "/api/auth/fan/login",
        headers={"X-Fanfolio-Client": "fan"},
        json={"email": "password-fan@example.com", "password": "fan-password-2026"},
    )
    login_data = assert_success(login)
    assert login_data["user"]["email"] == "password-fan@example.com"
    assert login_data["onboardingCompleted"] is False

    refreshed = client.post(
        "/api/auth/refresh",
        headers={"X-Fanfolio-Client": "fan"},
    )
    refreshed_data = assert_success(refreshed)
    assert refreshed_data["accessToken"]


def test_fan_password_login_rejects_invalid_credentials(
    client: TestClient, seeded: dict[str, object]
) -> None:
    response = client.post(
        "/api/auth/fan/login",
        headers={"X-Fanfolio-Client": "fan"},
        json={"email": "fan@example.com", "password": "wrong-password"},
    )
    assert_error(response, 401, "INVALID_CREDENTIALS")


def test_admin_password_login_and_first_password_change(
    client: TestClient, seeded: dict[str, object]
) -> None:
    login = client.post(
        "/api/auth/admin/login",
        headers={"X-Fanfolio-Client": "admin"},
        json={"email": "admin@example.com", "password": "test-admin-password"},
    )
    data = assert_success(login)
    assert data["user"]["role"] == "admin"
    assert data["mustChangePassword"] is False
    access_token = data["accessToken"]

    changed = client.post(
        "/api/auth/admin/change-password",
        headers={
            "X-Fanfolio-Client": "admin",
            "Authorization": f"Bearer {access_token}",
        },
        json={"currentPassword": "test-admin-password", "newPassword": "new-admin-password-123"},
    )
    assert_success(changed)

    old_login = client.post(
        "/api/auth/admin/login",
        json={"email": "admin@example.com", "password": "test-admin-password"},
    )
    assert_error(old_login, 401, "INVALID_CREDENTIALS")
    new_login = client.post(
        "/api/auth/admin/login",
        json={"email": "admin@example.com", "password": "new-admin-password-123"},
    )
    assert_success(new_login)


def test_admin_password_login_rejects_artist_client(
    client: TestClient, seeded: dict[str, object]
) -> None:
    response = client.post(
        "/api/auth/admin/login",
        headers={"X-Fanfolio-Client": "artist"},
        json={"email": "admin@example.com", "password": "test-admin-password"},
    )
    assert_error(response, 403, "ADMIN_CLIENT_REQUIRED")


def test_hosted_staging_login_uses_a_secure_cross_site_refresh_cookie(
    actors: dict[str, TestClient], monkeypatch: Any
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "staging")

    response = actors["admin"].post(
        "/api/auth/admin/login",
        headers={"X-Fanfolio-Client": "admin"},
        json={"email": "admin@example.com", "password": "test-admin-password"},
    )

    assert_success(response)
    cookie = response.headers["set-cookie"]
    assert "fanfolio_admin_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=none" in cookie


def test_admin_can_issue_another_admin_account_with_one_time_password(
    actors: dict[str, TestClient], seeded: dict[str, object]
) -> None:
    response = actors["admin"].post(
        "/api/admin/admin-accounts",
        json={"email": "operator@example.com", "displayName": "운영 담당자"},
    )
    data = assert_success(response, 201)
    assert data["email"] == "operator@example.com"
    assert data["role"] == "admin"
    assert len(data["temporaryPassword"]) >= 12

    login = actors["admin"].post(
        "/api/auth/admin/login",
        json={"email": "operator@example.com", "password": data["temporaryPassword"]},
    )
    login_data = assert_success(login)
    assert login_data["mustChangePassword"] is True


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
    assert "fanfolio_artist_refresh" in new_login.cookies

    refreshed = actors["admin"].post("/api/auth/refresh", headers={"X-Fanfolio-Client": "artist"})
    refreshed_data = assert_success(refreshed)
    assert refreshed_data["accessToken"]
    restored = actors["admin"].get(
        "/api/artist/cards",
        headers={
            "X-Fanfolio-Client": "artist",
            "Authorization": f"Bearer {refreshed_data['accessToken']}",
        },
    )
    assert restored.status_code == 200, restored.text


def test_development_startup_bootstraps_a_stable_local_artist_studio_login(
    client: TestClient, monkeypatch: Any
) -> None:
    from app.core.config import Settings

    assert client.post("/api/test/reset").status_code == 204
    local_settings = Settings(
        app_env="development",
        database_url=get_settings().database_url,
        auto_create_schema=False,
        local_artist_studio_username="local-artist-studio",
        local_artist_studio_password="local-artist-password-2026",
    )
    monkeypatch.setattr("app.main.get_settings", lambda: local_settings)
    monkeypatch.setattr("app.services.get_settings", lambda: local_settings)

    with TestClient(client.app):
        login = client.post(
            "/api/auth/artist/login",
            json={
                "username": "local-artist-studio",
                "password": "local-artist-password-2026",
            },
        )

    assert login.status_code == 200, login.text
    assert login.json()["data"]["mustChangePassword"] is False


def test_development_startup_bootstraps_a_stable_local_admin_login(
    client: TestClient, monkeypatch: Any
) -> None:
    from app.core.config import Settings

    assert client.post("/api/test/reset").status_code == 204
    local_settings = Settings(
        app_env="development",
        database_url=get_settings().database_url,
        auto_create_schema=False,
        local_admin_email="local-admin@example.com",
        local_admin_password="local-admin-password-2026",
    )
    monkeypatch.setattr("app.main.get_settings", lambda: local_settings)
    monkeypatch.setattr("app.services.get_settings", lambda: local_settings)

    with TestClient(client.app):
        login = client.post(
            "/api/auth/admin/login",
            json={
                "email": "local-admin@example.com",
                "password": "local-admin-password-2026",
            },
        )

    assert login.status_code == 200, login.text
    assert login.json()["data"]["user"]["role"] == "admin"
    assert login.json()["data"]["mustChangePassword"] is False


def test_admin_can_list_artist_accounts_without_exposing_passwords(
    actors: dict[str, TestClient],
) -> None:
    issued = actors["admin"].post(
        "/api/admin/artist-accounts",
        json={"username": "persistent-studio", "displayName": "영속 계정 담당자"},
    )
    account = assert_success(issued, 201)

    listed = actors["admin"].get("/api/admin/artist-accounts")
    data = assert_success(listed)
    item = next(entry for entry in data["items"] if entry["id"] == account["id"])

    assert item == {
        "id": account["id"],
        "username": "persistent-studio",
        "displayName": "영속 계정 담당자",
        "mustChangePassword": True,
    }
    assert "temporaryPassword" not in item


def test_admin_can_reset_an_artist_password_and_revoke_existing_refresh_tokens(
    actors: dict[str, TestClient],
) -> None:
    issued = actors["admin"].post(
        "/api/admin/artist-accounts",
        json={"username": "recoverable-studio", "displayName": "복구 가능한 스튜디오"},
    )
    account = assert_success(issued, 201)
    old_password = account["temporaryPassword"]

    artist_browser = TestClient(actors["admin"].app)
    logged_in = artist_browser.post(
        "/api/auth/artist/login",
        headers={"X-Fanfolio-Client": "artist"},
        json={"username": "recoverable-studio", "password": old_password},
    )
    assert_success(logged_in)
    assert "fanfolio_artist_refresh" in logged_in.cookies

    reset = actors["admin"].post(f"/api/admin/artist-accounts/{account['id']}/reset-password")
    reset_account = assert_success(reset)
    assert reset_account["temporaryPassword"] != old_password
    assert reset_account["mustChangePassword"] is True

    stale_refresh = artist_browser.post(
        "/api/auth/refresh", headers={"X-Fanfolio-Client": "artist"}
    )
    assert_error(stale_refresh, 401, "AUTH_TOKEN_INVALID")

    old_login = artist_browser.post(
        "/api/auth/artist/login",
        headers={"X-Fanfolio-Client": "artist"},
        json={"username": "recoverable-studio", "password": old_password},
    )
    assert_error(old_login, 401, "INVALID_CREDENTIALS")

    new_login = artist_browser.post(
        "/api/auth/artist/login",
        headers={"X-Fanfolio-Client": "artist"},
        json={
            "username": "recoverable-studio",
            "password": reset_account["temporaryPassword"],
        },
    )
    new_login_data = assert_success(new_login)
    assert new_login_data["mustChangePassword"] is True


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
