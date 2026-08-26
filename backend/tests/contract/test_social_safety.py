from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success
from tests.contract.test_social_card_trading import seed_social_cards


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
    assert "otherFan" in report["messages"][0]["body"]
