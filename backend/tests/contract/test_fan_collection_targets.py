from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_success


def _published_pack(admin: TestClient, seeded: dict[str, Any]) -> str:
    payload = {
        "artistId": "artist_nova3",
        "name": "목표 카드팩",
        "seasonName": "목표 시즌",
        "version": "v1.0",
        "cards": [{"cardId": seeded["ids"]["publishedCardId"], "position": 1, "probability": 100}],
    }
    pack = assert_success(admin.post("/api/admin/card-packs", json=payload), 201)
    assert_success(admin.post(f"/api/admin/card-packs/{pack['id']}/publish"))
    return pack["id"]


def test_fan_wishlist_is_server_synced_and_idempotent(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    assert_success(
        fan.post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "manual"}),
        201,
    )
    card_id = assert_success(fan.get("/api/me/collection"))["cards"][0]["cardId"]

    added = assert_success(fan.put(f"/api/me/wishlist/{card_id}"))
    assert added["cardId"] == card_id
    assert added["saved"] is True
    assert_success(fan.put(f"/api/me/wishlist/{card_id}"))

    wishlist = assert_success(fan.get("/api/me/wishlist"))
    assert wishlist["items"] == [{"cardId": card_id}]

    removed = assert_success(fan.delete(f"/api/me/wishlist/{card_id}"))
    assert removed["saved"] is False
    assert_success(fan.delete(f"/api/me/wishlist/{card_id}"))
    assert assert_success(fan.get("/api/me/wishlist"))["items"] == []


def test_fan_can_save_a_public_unowned_card_as_a_wanted_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    card_id = seeded["ids"]["publishedCardId"]
    added = assert_success(fan.put(f"/api/me/wishlist/{card_id}"))
    assert added == {"cardId": card_id, "saved": True}
    assert assert_success(fan.get("/api/me/wishlist"))["items"] == [{"cardId": card_id}]


def test_fan_collection_goal_reports_progress_and_notifies_once(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    pack_id = _published_pack(actors["admin"], seeded)
    mission = assert_success(
        actors["admin"].post(
            "/api/admin/engagement/missions",
            json={
                "title": "컬렉션 완성 미션",
                "eventKind": "collection_goal_completed",
                "targetValue": 1,
                "recurrence": "once",
                "conditionPayload": {"packId": pack_id},
                "rewardPayload": {"xp": 11},
            },
        ),
        201,
    )
    assert_success(actors["admin"].post(f"/api/admin/engagement/missions/{mission['id']}/submit"))
    assert_success(actors["admin"].post(f"/api/admin/engagement/missions/{mission['id']}/approve"))

    created = assert_success(fan.post("/api/me/collection-goals", json={"packId": pack_id}), 201)
    assert created["packId"] == pack_id
    assert created["targetCount"] == 1
    assert created["ownedCount"] == 0
    assert created["completionRate"] == 0

    listed = assert_success(fan.get("/api/me/collection-goals"))
    assert listed["items"][0]["id"] == created["id"]

    opened = assert_success(fan.post(f"/api/me/card-packs/{pack_id}/open"), 201)
    refreshed = assert_success(fan.get("/api/me/collection-goals"))["items"][0]
    assert refreshed["ownedCount"] == 1
    assert refreshed["completionRate"] == 100
    assert refreshed["completedAt"] is not None
    missions = assert_success(fan.get("/api/me/missions"))["items"]
    completed_mission = next(item for item in missions if item["id"] == mission["id"])
    assert completed_mission["completed"] is True

    notifications = assert_success(fan.get("/api/notifications"))["items"]
    goal_notifications = [
        item for item in notifications if item["kind"] == "collection_goal_completed"
    ]
    assert len(goal_notifications) == 1
    assert opened["userCardId"]

    assert_success(fan.get("/api/me/collection-goals"))
    notifications_again = assert_success(fan.get("/api/notifications"))["items"]
    assert (
        len([item for item in notifications_again if item["kind"] == "collection_goal_completed"])
        == 1
    )
