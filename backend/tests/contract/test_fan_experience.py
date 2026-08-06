from typing import Any

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


def test_notifications_can_be_marked_as_read(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    notifications = assert_success(fan.get("/api/notifications"))
    notification_id = notifications["items"][0]["id"]

    updated = assert_success(
        fan.patch(f"/api/notifications/{notification_id}", json={"read": True})
    )
    assert updated["readAt"] is not None
