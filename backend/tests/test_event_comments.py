from datetime import UTC, datetime, timedelta

from .conftest import assert_success
from .test_event_applications import create_event_banner


def publish_comment_event(actors):
    now = datetime.now(UTC)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "title": "팬 댓글 참여 이벤트",
            "summary": "댓글로 참여해 주세요.",
            "description": "좋아하는 순간을 댓글로 남겨 주세요.",
            "heroAssetId": create_event_banner(actors),
            "eventType": "comment",
            "startsAt": (now - timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "noticeItems": ["서로를 존중하는 댓글을 남겨 주세요."],
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


def test_comment_event_exposes_comment_cta_and_persists_comments(actors, seeded):
    event_id = publish_comment_event(actors)

    detail = assert_success(actors["fan"].get(f"/api/events/{event_id}"))
    assert detail["eventType"] == "comment"
    assert detail["ctaLabel"] == "댓글 참여하기"
    assert detail["ctaTarget"] == f"/events/{event_id}#comments"

    before = assert_success(actors["fan"].get(f"/api/events/{event_id}/comments"))
    assert before["items"] == []
    created = assert_success(
        actors["fan"].post(
            f"/api/events/{event_id}/comments", json={"body": "이번 라이브 정말 기대돼요!"}
        ),
        201,
    )
    assert created["body"] == "이번 라이브 정말 기대돼요!"

    after = assert_success(actors["fan"].get(f"/api/events/{event_id}/comments"))
    assert after["items"][0]["body"] == "이번 라이브 정말 기대돼요!"


def test_admin_can_review_comments_and_public_feed_hides_rejected_comments(actors, seeded):
    event_id = publish_comment_event(actors)
    created = assert_success(
        actors["fan"].post(
            f"/api/events/{event_id}/comments", json={"body": "검토가 필요한 댓글입니다."}
        ),
        201,
    )
    assert created["status"] == "pending"

    comments = assert_success(actors["admin"].get(f"/api/admin/events/{event_id}/comments"))
    assert comments["items"][0]["status"] == "pending"
    reviewed = assert_success(
        actors["admin"].patch(
            f"/api/admin/events/{event_id}/comments/{created['id']}",
            json={"status": "rejected", "note": "이벤트 주제와 무관한 댓글"},
        )
    )
    assert reviewed["status"] == "rejected"
    public_comments = assert_success(actors["fan"].get(f"/api/events/{event_id}/comments"))
    assert public_comments["items"][0]["status"] == "rejected"
