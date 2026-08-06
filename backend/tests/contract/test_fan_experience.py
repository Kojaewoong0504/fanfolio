from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_authenticated_fan_can_read_current_user_state(actors: dict[str, TestClient]) -> None:
    me = assert_success(actors["fan"].get("/api/me"))

    assert me["id"] == "fan"
    assert me["email"] == "fan@example.com"
    assert me["role"] == "fan"
    assert me["onboardingCompleted"] is False


def test_authenticated_fan_can_complete_onboarding(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    profile = assert_success(
        fan.patch(
            "/api/me/profile",
            json={
                "nickname": "별빛팬",
                "favoriteArtistIds": ["artist_nova3"],
                "favoriteMemberIds": ["member_yuna"],
            },
        )
    )

    assert profile["nickname"] == "별빛팬"
    assert profile["onboardingCompleted"] is True


def test_fan_can_read_and_update_notification_email_preferences(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    current = assert_success(fan.get("/api/me/notification-preferences"))
    assert current == {"emailEnabled": False}

    updated = assert_success(
        fan.patch("/api/me/notification-preferences", json={"emailEnabled": True})
    )
    assert updated == {"emailEnabled": True}
    assert assert_success(fan.get("/api/me/notification-preferences")) == {"emailEnabled": True}

    other_fan = actors["otherFan"]
    assert assert_success(other_fan.get("/api/me/notification-preferences")) == {
        "emailEnabled": False
    }


def test_card_detail_is_available_only_to_its_owner(
    app: Any, actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    redeemed = assert_success(
        fan.post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}), 201
    )

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["isOfficial"] is True
    assert detail["serialNumber"] == 1
    assert detail["acquisitionSource"] == "redeem_code"

    other_fan = TestClient(app)
    other_fan.cookies.set("fanfolio_session", seeded["sessions"]["otherFan"])
    assert_error(
        other_fan.get(f"/api/me/cards/{redeemed['userCardId']}"), 404, "USER_CARD_NOT_FOUND"
    )


def test_catalog_returns_only_published_cards_to_fans(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"artistId": "artist_nova3"})
    )

    assert all(card["status"] == "published" for card in catalog["items"])
    assert all(card["isOfficial"] is True for card in catalog["items"])


def test_catalog_supports_search_and_pagination(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"q": "사인", "page": 1, "pageSize": 1})
    )

    assert len(catalog["items"]) == 1
    assert catalog["items"][0]["name"] == "컴백 기념 사인 카드"
    assert catalog["meta"]["pagination"] == {"page": 1, "pageSize": 1, "total": 1}


def test_notifications_can_be_marked_as_read(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    notifications = assert_success(fan.get("/api/notifications"))
    notification_id = notifications["items"][0]["id"]

    updated = assert_success(
        fan.patch(f"/api/notifications/{notification_id}", json={"read": True})
    )
    assert updated["readAt"] is not None


def test_fan_can_read_unread_count_and_mark_all_notifications_as_read(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    count = assert_success(fan.get("/api/notifications/unread-count"))
    assert count["unreadCount"] == 1

    cleared = assert_success(fan.patch("/api/notifications/read-all"))
    assert cleared["updatedCount"] == 1

    count = assert_success(fan.get("/api/notifications/unread-count"))
    assert count["unreadCount"] == 0


@pytest.mark.anyio
async def test_fan_can_receive_notifications_over_an_sse_stream(
    seeded: dict[str, Any],
) -> None:
    from app.db.session import SessionLocal
    from app.models import User
    from app.routers.fan import notification_stream

    async with SessionLocal() as session:
        user = await session.get(User, "fan")
        assert user is not None
        response = await notification_stream(user, session)
        first_event = await response.body_iterator.__anext__()
        await response.body_iterator.aclose()

    assert "event: notification" in first_event
    assert '"id": "notification_1"' in first_event
