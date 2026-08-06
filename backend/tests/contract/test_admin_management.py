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
    assert users["meta"]["pagination"] == {"page": 1, "pageSize": 20, "total": 4}
    admin_user = next(user for user in users["items"] if user["id"] == "admin")
    assert admin_user["isCurrentUser"] is True
    fan = next(user for user in users["items"] if user["id"] == "fan")
    assert fan["role"] == "fan"
    assert fan["isCurrentUser"] is False

    filtered = assert_success(
        actors["admin"].get(
            "/api/admin/users",
            params={"q": "fan@example.com", "role": "fan", "page": 1, "pageSize": 1},
        )
    )
    assert filtered["meta"]["pagination"] == {"page": 1, "pageSize": 1, "total": 2}
    assert [user["email"] for user in filtered["items"]] == ["fan@example.com"]

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
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
    sent: list[tuple[str, str, str]] = []

    async def fake_deliver(email: str, title: str, body: str) -> None:
        sent.append((email, title, body))

    monkeypatch.setattr("app.services.deliver_notification_email", fake_deliver)
    assert_success(
        actors["fan"].patch("/api/me/notification-preferences", json={"emailEnabled": True})
    )

    published = assert_success(actors["admin"].post("/api/admin/cards/card_draft/publish"))
    assert published["status"] == "published"

    notifications = assert_success(actors["fan"].get("/api/notifications"))
    event = next(item for item in notifications["items"] if item["kind"] == "card_published")
    assert event["title"] == "새 카드가 공개되었어요"

    logs = assert_success(actors["admin"].get("/api/admin/audit-logs"))
    log = next(item for item in logs["items"] if item["action"] == "card.published")
    assert log["actorId"] == "admin"
    assert log["entityId"] == "card_draft"
    assert sent == [
        ("fan@example.com", "새 카드가 공개되었어요", "비공개 카드 카드를 확인해보세요.")
    ]


def test_admin_can_review_an_artist_card_before_publishing(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    draft = assert_success(
        actors["artist"].post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "관리자 검수 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "signatureText": "검수 부탁드려요.",
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(actors["artist"].post(f"/api/artist/cards/{draft['id']}/submit-review"))

    detail = assert_success(actors["admin"].get(f"/api/admin/cards/{draft['id']}"))
    assert detail["signatureText"] == "검수 부탁드려요."
    assert detail["status"] == "pending_review"
    assert_error(
        actors["admin"].post(f"/api/admin/cards/{draft['id']}/publish"),
        409,
        "REVIEW_REQUIRED",
    )

    approved = assert_success(
        actors["admin"].post(
            f"/api/admin/cards/{draft['id']}/review",
            json={"decision": "approve", "note": "이미지와 문구를 확인했습니다."},
        )
    )
    assert approved == {"id": draft["id"], "status": "approved"}
    published = assert_success(actors["admin"].post(f"/api/admin/cards/{draft['id']}/publish"))
    assert published["status"] == "published"

    revision = assert_success(
        actors["artist"].post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "수정 요청 검증 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(actors["artist"].post(f"/api/artist/cards/{revision['id']}/submit-review"))
    changes_requested = assert_success(
        actors["admin"].post(
            f"/api/admin/cards/{revision['id']}/review",
            json={"decision": "request_changes", "note": "손글씨 위치를 조정해 주세요."},
        )
    )
    assert changes_requested == {"id": revision["id"], "status": "changes_requested"}


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


def test_admin_dashboard_includes_recent_audit_activity(
    actors: dict[str, TestClient],
) -> None:
    published = assert_success(actors["admin"].post("/api/admin/cards/card_draft/publish"))
    assert published["status"] == "published"

    dashboard = assert_success(actors["admin"].get("/api/admin/dashboard"))
    assert dashboard["recentActivity"][0] == {
        "action": "card.published",
        "actorId": "admin",
        "entityType": "card",
        "entityId": "card_draft",
    }


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
    assert rows[0] == "code,card_id,drop_id,expires_at,used_count,max_uses,qr_image_url"
    assert all(row.startswith("NOVA-CSV-") for row in rows[1:])


def test_admin_code_batch_requires_live_drop_and_published_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    draft_drop = assert_success(
        actors["admin"].post("/api/admin/drops", json={"name": "준비 중인 드롭"}), 201
    )
    payload = {
        "dropId": draft_drop["id"],
        "cardId": seeded["ids"]["publishedCardId"],
        "quantity": 1,
        "maxUsesPerCode": 1,
        "expiresAt": "2026-12-31T23:59:59Z",
        "prefix": "NOVA-GUARD",
    }
    assert_error(
        actors["admin"].post("/api/admin/redeem-code-batches", json=payload),
        409,
        "DROP_NOT_LIVE",
    )
    payload["dropId"] = seeded["ids"]["liveDropId"]
    payload["cardId"] = "card_draft"
    assert_error(
        actors["admin"].post("/api/admin/redeem-code-batches", json=payload),
        409,
        "CARD_NOT_PUBLISHED",
    )


def test_admin_code_batch_rejects_unsafe_qr_prefix(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    response = actors["admin"].post(
        "/api/admin/redeem-code-batches",
        json={
            "dropId": seeded["ids"]["liveDropId"],
            "cardId": seeded["ids"]["publishedCardId"],
            "quantity": 1,
            "maxUsesPerCode": 1,
            "expiresAt": "2026-12-31T23:59:59Z",
            "prefix": "../unsafe",
        },
    )

    assert_error(response, 422, "VALIDATION_ERROR")
