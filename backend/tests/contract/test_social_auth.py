import asyncio
from urllib.parse import parse_qs, urlparse

from app.core.config import get_settings
from app.oauth import OAuthProfile, fetch_oauth_profile


def _configure_social(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "google-client")
    monkeypatch.setattr(settings, "google_client_secret", "google-secret")
    monkeypatch.setattr(settings, "kakao_client_id", "kakao-client")
    monkeypatch.setattr(settings, "kakao_client_secret", "kakao-secret")


def test_google_oauth_code_flow_links_account_and_issues_jwt(client, seeded, monkeypatch) -> None:
    _configure_social(monkeypatch)

    start = client.get("/api/auth/oauth/google/start?client=fan", follow_redirects=False)
    assert start.status_code == 302
    provider_url = start.headers["location"]
    state = parse_qs(urlparse(provider_url).query)["state"][0]

    async def fake_profile(provider: str, code: str, redirect_uri: str) -> OAuthProfile:
        assert provider == "google"
        assert code == "provider-code"
        assert redirect_uri.endswith("/google/callback")
        return OAuthProfile("google", "google-sub-1", "social@example.com", "소셜 팬")

    monkeypatch.setattr("app.routers.auth.fetch_oauth_profile", fake_profile)
    callback = client.get(
        f"/api/auth/oauth/google/callback?code=provider-code&state={state}",
        follow_redirects=False,
    )
    assert callback.status_code == 302
    exchange_code = parse_qs(urlparse(callback.headers["location"]).query)["code"][0]

    exchanged = client.post(
        "/api/auth/oauth/exchange",
        json={"code": exchange_code, "client": "fan"},
        headers={"X-Fanfolio-Client": "fan"},
    )
    assert exchanged.status_code == 200, exchanged.text
    body = exchanged.json()
    assert body["data"]["accessToken"]
    assert body["data"]["onboardingCompleted"] is False
    assert "fanfolio_fan_refresh" in exchanged.headers.get("set-cookie", "")

    me = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {body['data']['accessToken']}",
            "X-Fanfolio-Client": "fan",
        },
    )
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "social@example.com"


def test_oauth_state_cannot_be_replayed(client, seeded, monkeypatch) -> None:
    _configure_social(monkeypatch)
    start = client.get("/api/auth/oauth/kakao/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    async def fake_profile(provider: str, code: str, redirect_uri: str) -> OAuthProfile:
        return OAuthProfile("kakao", "kakao-sub-1", "kakao@example.com", "카카오 팬")

    monkeypatch.setattr("app.routers.auth.fetch_oauth_profile", fake_profile)
    first = client.get(
        f"/api/auth/oauth/kakao/callback?code=provider-code&state={state}",
        follow_redirects=False,
    )
    assert first.status_code == 302
    second = client.get(
        f"/api/auth/oauth/kakao/callback?code=provider-code&state={state}",
        follow_redirects=False,
    )
    assert "error=SOCIAL_STATE_INVALID" in second.headers["location"]


def test_kakao_profile_does_not_require_email_permission(monkeypatch) -> None:
    _configure_social(monkeypatch)

    async def fake_provider_request(client, method: str, url: str, **kwargs):
        if method == "POST":
            return {"access_token": "kakao-access-token"}
        return {
            "id": 1537071,
            "properties": {
                "nickname": "고재웅",
                "profile_image": "https://cdn.example/profile.png",
            },
            "kakao_account": {},
        }

    monkeypatch.setattr("app.oauth._provider_request", fake_provider_request)

    profile = asyncio.run(
        fetch_oauth_profile("kakao", "provider-code", "http://localhost/callback")
    )

    assert profile == OAuthProfile(
        "kakao", "1537071", None, "고재웅", "https://cdn.example/profile.png"
    )


def test_kakao_login_creates_account_with_subject_when_email_is_unavailable(
    client, seeded, monkeypatch
) -> None:
    _configure_social(monkeypatch)

    start = client.get("/api/auth/oauth/kakao/start?client=fan", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    async def fake_profile(provider: str, code: str, redirect_uri: str) -> OAuthProfile:
        return OAuthProfile(
            "kakao",
            "kakao-sub-without-email",
            None,
            "고재웅",
            "https://cdn.example/profile.png",
        )

    monkeypatch.setattr("app.routers.auth.fetch_oauth_profile", fake_profile)
    callback = client.get(
        f"/api/auth/oauth/kakao/callback?code=provider-code&state={state}",
        follow_redirects=False,
    )
    assert callback.status_code == 302
    exchange_code = parse_qs(urlparse(callback.headers["location"]).query)["code"][0]

    exchanged = client.post(
        "/api/auth/oauth/exchange",
        json={"code": exchange_code, "client": "fan"},
        headers={"X-Fanfolio-Client": "fan"},
    )
    assert exchanged.status_code == 200, exchanged.text
    access_token = exchanged.json()["data"]["accessToken"]

    me = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Fanfolio-Client": "fan",
        },
    )
    assert me.status_code == 200
    assert me.json()["data"]["email"] is None
    assert me.json()["data"]["nickname"] == "고재웅"
    assert me.json()["data"]["profileImageUrl"] == "https://cdn.example/profile.png"
