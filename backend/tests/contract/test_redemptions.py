from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_valid_qr_code_issues_official_card_and_updates_collection(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    code = seeded["codes"]["valid"]

    redeemed = assert_success(
        fan.post("/api/redemptions", json={"code": code, "source": "qr"}), 201
    )

    assert redeemed["cardId"] == seeded["ids"]["publishedCardId"]
    assert redeemed["serialNumber"] == 1
    assert redeemed["redirectTo"] == f"/reveal/{redeemed['userCardId']}"

    collection = assert_success(fan.get("/api/me/collection"))
    assert collection["summary"]["ownedCount"] == 1
    assert collection["cards"][0]["userCardId"] == redeemed["userCardId"]
    assert collection["cards"][0]["isOfficial"] is True

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["acquisitionSource"] == "qr"

    notifications = assert_success(fan.get("/api/notifications"))
    event = next(item for item in notifications["items"] if item["kind"] == "card_redeemed")
    assert event["title"] == "카드를 컬렉션에 추가했어요"
    logs = assert_success(actors["admin"].get("/api/admin/audit-logs"))
    assert any(log["action"] == "redemption.created" for log in logs["items"])


def test_redeeming_same_code_twice_returns_conflict_without_extra_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    code = seeded["codes"]["valid"]

    assert_success(fan.post("/api/redemptions", json={"code": code, "source": "manual"}), 201)
    assert_error(
        fan.post("/api/redemptions", json={"code": code, "source": "manual"}),
        409,
        "REDEEM_CODE_ALREADY_USED",
    )

    collection = assert_success(fan.get("/api/me/collection"))
    assert collection["summary"]["ownedCount"] == 1
    detail = assert_success(fan.get(f"/api/me/cards/{collection['cards'][0]['userCardId']}"))
    assert detail["acquisitionSource"] == "manual"


def test_invalid_code_does_not_change_collection(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]

    assert_error(
        fan.post("/api/redemptions", json={"code": "WRONG-CODE", "source": "manual"}),
        404,
        "REDEEM_CODE_NOT_FOUND",
    )
    collection = assert_success(fan.get("/api/me/collection"))
    assert collection["summary"]["ownedCount"] == 0


def test_redemption_rejects_expired_ended_unpublished_and_exhausted_states(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    cases = [
        ("expired", 409, "REDEEM_CODE_EXPIRED"),
        ("endedDrop", 409, "DROP_NOT_LIVE"),
        ("unpublished", 409, "CARD_NOT_PUBLISHED"),
        ("exhausted", 409, "REDEEM_LIMIT_REACHED"),
    ]

    for name, status_code, error_code in cases:
        assert_error(
            fan.post("/api/redemptions", json={"code": seeded["codes"][name], "source": "qr"}),
            status_code,
            error_code,
        )
