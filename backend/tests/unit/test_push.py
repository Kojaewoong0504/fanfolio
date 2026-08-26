import json
from typing import Any, Self

from app import push
from app.core.config import Settings


def test_firebase_push_provider_exchanges_a_service_account_token_and_sends_message(
    monkeypatch: Any,
) -> None:
    requests: list[tuple[str, bytes, dict[str, str]]] = []

    class FakeResponse:
        def __init__(self, payload: dict[str, Any]) -> None:
            self.payload = json.dumps(payload).encode()

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return self.payload

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        requests.append((request.full_url, request.data, dict(request.header_items())))
        if request.full_url == "https://oauth2.example/token":
            return FakeResponse({"access_token": "oauth-access-token"})
        return FakeResponse({"name": "projects/fnafolio/messages/123"})

    monkeypatch.setattr(push.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(push.jwt, "encode", lambda claims, key, algorithm: "signed-jwt")
    settings = Settings(
        app_env="test",
        push_delivery_mode="fcm",
        firebase_project_id="fnafolio",
        firebase_client_email="firebase-adminsdk@example.iam.gserviceaccount.com",
        firebase_private_key="private-key",
        firebase_token_url="https://oauth2.example/token",
        firebase_api_base_url="https://fcm.example",
    )

    push.FirebasePushProvider(settings).send(
        token="device-token",
        title="새 카드가 공개되었어요",
        body="새로운 카드를 확인해 보세요.",
        data={"notificationId": "notification_123"},
    )

    assert len(requests) == 2
    token_url, token_body, token_headers = requests[0]
    assert token_url == "https://oauth2.example/token"
    assert b"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" in token_body
    assert b"assertion=signed-jwt" in token_body
    assert token_headers["Content-type"] == "application/x-www-form-urlencoded"

    fcm_url, fcm_body, fcm_headers = requests[1]
    assert fcm_url == "https://fcm.example/v1/projects/fnafolio/messages:send"
    assert fcm_headers["Authorization"] == "Bearer oauth-access-token"
    assert json.loads(fcm_body) == {
        "message": {
            "token": "device-token",
            "notification": {
                "title": "새 카드가 공개되었어요",
                "body": "새로운 카드를 확인해 보세요.",
            },
            "data": {"notificationId": "notification_123"},
        }
    }


def test_firebase_push_provider_does_not_leak_credentials_on_failure(monkeypatch: Any) -> None:
    class TokenResponse:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"access_token":"oauth-access-token"}'

    calls = 0

    def fail_urlopen(*_: object, **__: object) -> TokenResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            return TokenResponse()
        raise OSError("network unavailable")

    monkeypatch.setattr(push.urllib.request, "urlopen", fail_urlopen)
    monkeypatch.setattr(push.jwt, "encode", lambda claims, key, algorithm: "signed-jwt")
    settings = Settings(
        app_env="test",
        push_delivery_mode="fcm",
        firebase_project_id="fnafolio",
        firebase_client_email="service-account@example.com",
        firebase_private_key="private-key",
    )

    try:
        push.FirebasePushProvider(settings).send("device-token", "title", "body")
    except push.PushDeliveryError as error:
        assert str(error) == "Firebase push delivery failed"
        assert "private-key" not in str(error)
    else:
        raise AssertionError("FCM delivery failure must be surfaced")


def test_firebase_push_provider_marks_client_token_errors_permanent(monkeypatch: Any) -> None:
    class BadResponse:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"access_token":"oauth-access-token"}'

    calls = 0

    def fail_urlopen(request: Any, timeout: float) -> BadResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            return BadResponse()
        raise __import__("urllib.error", fromlist=["HTTPError"]).HTTPError(
            request.full_url, 400, "bad token", {}, None
        )

    monkeypatch.setattr(push.urllib.request, "urlopen", fail_urlopen)
    monkeypatch.setattr(push.jwt, "encode", lambda claims, key, algorithm: "signed-jwt")
    settings = Settings(
        app_env="test",
        push_delivery_mode="fcm",
        firebase_project_id="fnafolio",
        firebase_client_email="service@example.com",
        firebase_private_key="private-key",
    )

    try:
        push.FirebasePushProvider(settings).send("stale-token", "title", "body")
    except push.PushDeliveryError as error:
        assert error.permanent is True
    else:
        raise AssertionError("invalid FCM token errors must be permanent")
