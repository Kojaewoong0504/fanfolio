from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_admin_can_create_list_and_activate_a_drop(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["admin"].post(
            "/api/admin/drops",
            json={
                "name": "2026 봄 컴백 드롭",
                "startsAt": "2026-03-01T00:00:00Z",
                "endsAt": "2026-03-31T23:59:59Z",
            },
        ),
        201,
    )

    assert created["status"] == "draft"
    assert created["name"] == "2026 봄 컴백 드롭"

    listed = assert_success(actors["admin"].get("/api/admin/drops"))
    assert any(drop["id"] == created["id"] for drop in listed["items"])

    activated = assert_success(
        actors["admin"].patch(
            f"/api/admin/drops/{created['id']}/status",
            json={"status": "live"},
        )
    )
    assert activated == {"id": created["id"], "status": "live"}

    notifications = assert_success(actors["fan"].get("/api/notifications"))
    event = next(item for item in notifications["items"] if item["kind"] == "drop_started")
    assert event["title"] == "새 드롭이 시작되었어요"


def test_fan_cannot_manage_drops(actors: dict[str, TestClient]) -> None:
    assert_error(actors["fan"].get("/api/admin/drops"), 403, "FORBIDDEN")


def test_admin_can_list_users_and_change_a_user_role(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    users = assert_success(actors["admin"].get("/api/admin/users"))
    fan = next(user for user in users["items"] if user["id"] == "fan")
    assert fan["role"] == "fan"

    updated = assert_success(
        actors["admin"].patch("/api/admin/users/fan/role", json={"role": "artist"})
    )
    assert updated == {"id": "fan", "role": "artist"}
    logs = assert_success(actors["admin"].get("/api/admin/audit-logs"))
    role_log = next(item for item in logs["items"] if item["action"] == "user.role_changed")
    assert role_log["entityId"] == "fan"


def test_admin_cannot_change_own_role_or_fan_manage_users(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    assert_error(
        actors["admin"].patch("/api/admin/users/admin/role", json={"role": "fan"}),
        409,
        "CANNOT_CHANGE_OWN_ROLE",
    )
    assert_error(actors["fan"].get("/api/admin/users"), 403, "FORBIDDEN")


def test_publishing_a_card_creates_audit_log_and_fan_notification(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    published = assert_success(actors["admin"].post("/api/admin/cards/card_draft/publish"))
    assert published["status"] == "published"

    notifications = assert_success(actors["fan"].get("/api/notifications"))
    event = next(item for item in notifications["items"] if item["kind"] == "card_published")
    assert event["title"] == "새 카드가 공개되었어요"

    logs = assert_success(actors["admin"].get("/api/admin/audit-logs"))
    log = next(item for item in logs["items"] if item["action"] == "card.published")
    assert log["actorId"] == "admin"
    assert log["entityId"] == "card_draft"


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
