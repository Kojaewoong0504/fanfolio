from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success
from tests.contract.test_social_card_trading import seed_social_cards


def test_fan_recommendations_expose_versioned_server_ranked_contract(
    actors: dict[str, TestClient],
) -> None:
    response = assert_success(actors["fan"].get("/api/fans/recommendations"))
    assert response["meta"]["algorithmVersion"] == "fan-v1"
    assert response["meta"]["ranking"] == "server"
    assert all("recommendationScore" in item for item in response["items"])


def test_recommendation_analytics_accepts_candidate_attribution(
    actors: dict[str, TestClient],
) -> None:
    response = assert_success(
        actors["fan"].post(
            "/api/analytics/events",
            json={
                "eventName": "recommendation.impression",
                "source": "fan-v1",
                "dedupeKey": "fan-recommendation-impression-otherFan",
                "metadata": {"candidateUserId": "otherFan", "position": 1},
            },
        ),
        201,
    )
    assert response["eventName"] == "recommendation.impression"
    stats = assert_success(actors["admin"].get("/api/admin/statistics", params={"period": 7}))
    assert stats["recommendationQuality"]["algorithmVersion"] == "fan-v1"
    assert stats["recommendationQuality"]["impressions"] == 1


def test_block_hides_social_surfaces_and_prevents_trades(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    ids = seed_social_cards()

    blocked = assert_success(actors["fan"].post("/api/me/blocks/otherFan"), 201)
    assert blocked["blockedUserId"] == "otherFan"
    assert_error(actors["fan"].post("/api/me/follows/otherFan"), 404, "FAN_NOT_FOUND")
    assert all(
        item["id"] != "otherFan"
        for item in assert_success(actors["fan"].get("/api/fans", params={"query": "other"}))[
            "items"
        ]
    )
    assert_error(
        actors["fan"].get("/api/fans/otherFan/collection"),
        404,
        "COLLECTION_NOT_FOUND",
    )
    assert_error(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        404,
        "TRADE_USER_UNAVAILABLE",
    )

    assert_success(actors["fan"].delete("/api/me/blocks/otherFan"))
    assert_success(actors["fan"].post("/api/me/follows/otherFan"), 201)


def test_trade_accept_is_single_use(app: FastAPI, actors: dict[str, TestClient]) -> None:
    ids = seed_social_cards()
    proposal = assert_success(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        201,
    )
    assert_success(actors["otherFan"].post(f"/api/me/trades/{proposal['id']}/accept"))
    assert_error(
        actors["otherFan"].post(f"/api/me/trades/{proposal['id']}/accept"),
        409,
        "TRADE_NOT_PENDING",
    )


def test_report_is_recorded_in_support_queue(app: FastAPI, actors: dict[str, TestClient]) -> None:
    report = assert_success(
        actors["fan"].post(
            "/api/me/reports",
            json={
                "targetType": "user",
                "targetId": "otherFan",
                "reason": "거래 사기 의심",
                "body": "거래 제안 이후 응답 없이 반복해서 연락이 끊겼습니다.",
            },
        ),
        201,
    )

    assert report["category"] == "report"
    assert report["status"] == "open"
    assert report["targetType"] == "user"
    assert report["targetId"] == "otherFan"
    assert "otherFan" in report["messages"][0]["body"]


def test_event_report_is_recorded_in_support_queue(actors: dict[str, TestClient]) -> None:
    report = assert_success(
        actors["fan"].post(
            "/api/me/reports",
            json={
                "targetType": "event",
                "targetId": "event_live_1",
                "reason": "부적절한 이벤트 정보",
                "body": "이벤트 안내에 실제 운영과 다른 내용이 표시됩니다.",
            },
        ),
        201,
    )
    assert report["category"] == "report"
    assert "event_live_1" in report["messages"][0]["body"]


def test_admin_can_hide_reported_fan_collection_during_review(
    actors: dict[str, TestClient],
) -> None:
    report = assert_success(
        actors["fan"].post(
            "/api/me/reports",
            json={
                "targetType": "user",
                "targetId": "otherFan",
                "reason": "검토 요청",
                "body": "공개 컬렉션을 우선 숨겨 주세요.",
            },
        ),
        201,
    )
    action = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{report['id']}/actions",
            json={"action": "hide_collection", "note": "신고 검토 중 임시 숨김"},
        ),
        201,
    )
    assert any(item["kind"] == "collection_hidden" for item in action["evidence"])
    hidden_notifications = assert_success(actors["otherFan"].get("/api/notifications"))["items"]
    assert any(
        item["eventKey"] == f"support_collection_visibility:{report['id']}:hidden"
        and item["entityType"] == "support_ticket"
        and item["entityId"] == report["id"]
        for item in hidden_notifications
    )
    assert_error(
        actors["fan"].get("/api/fans/otherFan/collection"),
        404,
        "COLLECTION_NOT_FOUND",
    )
    restored = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{report['id']}/actions",
            json={"action": "restore_collection"},
        ),
        201,
    )
    assert any(item["kind"] == "collection_restored" for item in restored["evidence"])
    restored_notifications = assert_success(actors["otherFan"].get("/api/notifications"))["items"]
    assert any(
        item["eventKey"] == f"support_collection_visibility:{report['id']}:restored"
        and item["entityType"] == "support_ticket"
        and item["entityId"] == report["id"]
        for item in restored_notifications
    )
    assert actors["fan"].get("/api/fans/otherFan/collection").status_code == 200
