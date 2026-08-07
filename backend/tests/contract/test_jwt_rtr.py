from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_magic_link_login_returns_access_jwt_and_scoped_refresh_cookie(
    client: TestClient, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)

    response = client.post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["fan"]},
        headers={"X-Fanfolio-Client": "fan"},
    )
    data = assert_success(response)

    assert isinstance(data["accessToken"], str)
    assert response.cookies.get("fanfolio_fan_refresh")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]

    me = client.get(
        "/api/me",
        headers={
            "X-Fanfolio-Client": "fan",
            "Authorization": f"Bearer {data['accessToken']}",
        },
    )
    assert_success(me)


def test_production_refresh_cookie_supports_cross_origin_frontend(
    app, seeded: dict[str, object], monkeypatch
) -> None:
    """The deployed fan app and API use different origins."""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "app_env", "production")
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)

    response = TestClient(app).post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["fan"]},
        headers={"X-Fanfolio-Client": "fan"},
    )

    assert "SameSite=none" in response.headers["set-cookie"]
    assert "Secure" in response.headers["set-cookie"]


def test_refresh_rotation_rejects_replay_and_revokes_the_family(
    app, seeded: dict[str, object]
) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)
    browser = TestClient(app)
    login = browser.post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["fan"]},
        headers={"X-Fanfolio-Client": "fan"},
    )
    old_refresh = login.cookies.get("fanfolio_fan_refresh")
    assert old_refresh

    rotated = browser.post("/api/auth/refresh", headers={"X-Fanfolio-Client": "fan"})
    rotated_data = assert_success(rotated)
    new_refresh = rotated.cookies.get("fanfolio_fan_refresh")
    assert new_refresh and new_refresh != old_refresh
    assert rotated_data["accessToken"]

    replay_client = TestClient(app)
    replay_client.cookies.set("fanfolio_fan_refresh", old_refresh)
    replay = replay_client.post("/api/auth/refresh", headers={"X-Fanfolio-Client": "fan"})
    assert_error(replay, 401, "AUTH_TOKEN_INVALID")

    browser.cookies.set("fanfolio_fan_refresh", new_refresh)
    family_after_replay = browser.post("/api/auth/refresh", headers={"X-Fanfolio-Client": "fan"})
    assert_error(family_after_replay, 401, "AUTH_TOKEN_INVALID")


def test_refresh_cookie_is_client_scoped(app, seeded: dict[str, object]) -> None:
    tokens = seeded["magicLinkTokens"]
    assert isinstance(tokens, dict)
    browser = TestClient(app)
    login = browser.post(
        "/api/auth/magic-link/verify",
        json={"token": tokens["fan"]},
        headers={"X-Fanfolio-Client": "fan"},
    )
    fan_refresh = login.cookies.get("fanfolio_fan_refresh")
    assert fan_refresh

    browser.cookies.set("fanfolio_admin_refresh", fan_refresh)
    response = browser.post("/api/auth/refresh", headers={"X-Fanfolio-Client": "admin"})
    assert_error(response, 401, "AUTH_TOKEN_INVALID")
