from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_admin_dashboard_and_card_list_are_backed_by_database(
    actors: dict[str, TestClient],
) -> None:
    dashboard = assert_success(actors["admin"].get("/api/admin/dashboard"))
    assert dashboard["metrics"]["totalCards"] == 2
    assert dashboard["metrics"]["publishedCards"] == 1

    cards = assert_success(actors["admin"].get("/api/admin/cards"))
    assert cards["meta"]["pagination"]["total"] == 2
    assert {card["id"] for card in cards["items"]} == {"card_published", "card_draft"}

    drafts = assert_success(actors["admin"].get("/api/admin/cards", params={"status": "draft"}))
    assert [card["id"] for card in drafts["items"]] == ["card_draft"]


def test_admin_code_batch_creates_codes_and_downloads_csv(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    batch = assert_success(
        actors["admin"].post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": seeded["ids"]["liveDropId"],
                "cardId": seeded["ids"]["publishedCardId"],
                "quantity": 3,
                "maxUsesPerCode": 1,
                "expiresAt": "2026-12-31T23:59:59Z",
                "prefix": "NOVA-CSV",
            },
        ),
        201,
    )

    export = actors["admin"].get(batch["csvExportUrl"])
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    rows = export.text.strip().splitlines()
    assert len(rows) == 4
    assert rows[0] == "code,card_id,drop_id,expires_at,used_count,max_uses"
    assert all(row.startswith("NOVA-CSV-") for row in rows[1:])
