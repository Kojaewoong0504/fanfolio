from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import ConsentRecord, RefreshToken, Session, User
from tests.conftest import assert_error, assert_success


def test_fan_can_export_safe_personal_data(actors: dict[str, TestClient]) -> None:
    data = assert_success(actors["fan"].get("/api/me/privacy/export"))

    assert data["profile"]["id"] == "fan"
    assert data["profile"]["role"] == "fan"
    assert "passwordHash" not in data["profile"]
    assert "refreshToken" not in data
    assert "accessToken" not in data
    assert isinstance(data["collection"], list)
    assert isinstance(data["orders"], list)
    assert isinstance(data["supportTickets"], list)
    assert isinstance(data["consents"], list)


def test_fan_can_record_and_read_consent_history(actors: dict[str, TestClient]) -> None:
    response = actors["fan"].post(
        "/api/me/privacy/consents",
        json={
            "policyKey": "privacy",
            "policyVersion": "2026-08-18",
            "granted": True,
            "source": "settings",
        },
    )
    data = assert_success(response, 201)
    assert data["policyKey"] == "privacy"
    assert data["policyVersion"] == "2026-08-18"
    assert data["granted"] is True
    assert data["source"] == "settings"
    assert data["createdAt"]

    history = assert_success(actors["fan"].get("/api/me/privacy/consents"))
    assert history["items"][-1]["policyKey"] == "privacy"
    assert history["items"][-1]["granted"] is True

    exported = assert_success(actors["fan"].get("/api/me/privacy/export"))
    assert exported["consents"][-1]["policyKey"] == "privacy"

    async def count_records() -> int:
        async with SessionLocal() as session:
            from sqlalchemy import func

            return int(
                await session.scalar(
                    select(func.count(ConsentRecord.id)).where(ConsentRecord.user_id == "fan")
                )
                or 0
            )

    import asyncio

    assert asyncio.run(count_records()) == 1


def test_fan_account_deletion_anonymizes_identity_and_revokes_sessions(
    actors: dict[str, TestClient],
) -> None:
    assert_error(
        actors["fan"].request("DELETE", "/api/me/privacy/account", json={"confirmation": "delete"}),
        422,
        "INVALID_ACCOUNT_DELETION_CONFIRMATION",
    )

    response = actors["fan"].request(
        "DELETE",
        "/api/me/privacy/account",
        json={"confirmation": "DELETE MY ACCOUNT"},
    )
    assert response.status_code == 204, response.text

    async def read_deleted_user() -> tuple[User | None, int, int]:
        async with SessionLocal() as session:
            user = await session.get(User, "fan")
            active_sessions = await session.scalar(
                select(func.count(Session.token)).where(Session.user_id == "fan")
            )
            active_refresh = await session.scalar(
                select(func.count(RefreshToken.jti)).where(
                    RefreshToken.user_id == "fan",
                    RefreshToken.revoked_at.is_(None),
                )
            )
            return user, int(active_sessions or 0), int(active_refresh or 0)

    import asyncio

    user, active_sessions, active_refresh = asyncio.run(read_deleted_user())
    assert user is not None
    assert user.email is None
    assert user.nickname == "탈퇴한 사용자"
    assert user.password_hash is None
    assert active_sessions == 0
    assert active_refresh == 0

    assert_error(actors["fan"].get("/api/home"), 401, "AUTH_REQUIRED")
