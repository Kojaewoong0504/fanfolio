from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_magic_link_request_accepts_signup_or_login_email(
    client: TestClient, seeded: dict[str, object]
) -> None:
    response = client.post(
        "/api/auth/magic-link/request",
        json={"email": "fan@example.com", "purpose": "login"},
    )
    data = assert_success(response, 202)

    assert data["delivery"] == "queued"


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
