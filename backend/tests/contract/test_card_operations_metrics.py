from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_admin_can_read_card_operations_metrics_and_exports(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    admin = actors["admin"]
    redeemed = assert_success(
        fan.post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "manual"}),
        201,
    )

    metrics = assert_success(admin.get("/api/admin/card-operations/metrics"))
    assert metrics["issuedCards"] >= 1
    assert metrics["redeem"]["success"] >= 1
    assert any(row["rarity"] for row in metrics["byRarity"])

    history = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}/history"))
    assert history["userCardId"] == redeemed["userCardId"]
    assert history["items"][0]["action"] == "grant"

    for path, required_header in (
        ("/api/admin/cards/export", "card_id,name,artist_id"),
        ("/api/admin/audit-logs/export", "id,actor_id,action"),
    ):
        response = admin.get(path)
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        assert response.content.startswith("\ufeff".encode("utf-8"))
        assert required_header.encode("utf-8") in response.content
