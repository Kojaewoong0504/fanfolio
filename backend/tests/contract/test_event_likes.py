from datetime import UTC, datetime, timedelta

from tests.conftest import assert_error, assert_success
from tests.test_event_applications import create_event_banner


def _public_event_id(actors):
    now = datetime.now(UTC)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "artistId": None,
            "title": "좋아요 계약 테스트 이벤트",
            "summary": "이벤트 좋아요 저장 테스트",
            "description": "이벤트 좋아요 저장 테스트용 공개 이벤트",
            "heroAssetId": create_event_banner(actors),
            "eventType": "announcement",
            "startsAt": (now - timedelta(days=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "applicationStartsAt": (now - timedelta(days=1)).isoformat(),
            "applicationEndsAt": (now + timedelta(days=1)).isoformat(),
            "noticeItems": [],
            "relatedCardIds": [],
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200
    return event_id


def test_event_likes_are_server_backed_and_idempotent(actors):
    event_id = _public_event_id(actors)

    assert assert_success(actors["fan"].get("/api/me/event-likes"))["items"] == []
    first = assert_success(actors["fan"].put(f"/api/me/event-likes/{event_id}"))
    second = assert_success(actors["fan"].put(f"/api/me/event-likes/{event_id}"))
    assert first == second == {"eventId": event_id, "liked": True}
    assert assert_success(actors["fan"].get("/api/me/event-likes"))["items"] == [event_id]

    removed = assert_success(actors["fan"].delete(f"/api/me/event-likes/{event_id}"))
    removed_again = assert_success(actors["fan"].delete(f"/api/me/event-likes/{event_id}"))
    assert removed == removed_again == {"eventId": event_id, "liked": False}
    assert assert_success(actors["fan"].get("/api/me/event-likes"))["items"] == []


def test_event_likes_reject_unknown_events(actors):
    assert_error(
        actors["fan"].put("/api/me/event-likes/event-does-not-exist"),
        404,
        "EVENT_NOT_FOUND",
    )
