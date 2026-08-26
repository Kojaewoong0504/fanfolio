from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_admin_can_create_list_and_update_content_calendar_entry(
    actors: dict[str, TestClient],
) -> None:
    admin = actors["admin"]
    created = assert_success(
        admin.post(
            "/api/admin/content-calendar",
            json={
                "contentType": "card",
                "contentId": "card_demo",
                "title": "여름 카드 공개",
                "startsAt": "2026-09-01T10:00:00Z",
                "endsAt": "2026-09-01T11:00:00Z",
                "notes": "운영 검수 완료 후 공개",
            },
        ),
        201,
    )
    entry = created["entry"]
    assert entry["contentType"] == "card"
    assert entry["status"] == "scheduled"

    listed = assert_success(admin.get("/api/admin/content-calendar"))
    assert any(item["id"] == entry["id"] for item in listed["items"])

    updated = assert_success(
        admin.patch(
            f"/api/admin/content-calendar/{entry['id']}",
            json={"status": "published", "notes": "공개 완료"},
        )
    )
    assert updated["entry"]["status"] == "published"


def test_admin_calendar_rejects_overlapping_entries_for_same_content(
    actors: dict[str, TestClient],
) -> None:
    admin = actors["admin"]
    payload = {
        "contentType": "event",
        "contentId": "event_demo",
        "title": "이벤트 공개",
        "startsAt": "2026-09-02T10:00:00Z",
        "endsAt": "2026-09-02T11:00:00Z",
    }
    assert_success(admin.post("/api/admin/content-calendar", json=payload), 201)
    conflict = admin.post(
        "/api/admin/content-calendar",
        json={**payload, "title": "중복 일정", "startsAt": "2026-09-02T10:30:00Z"},
    )
    assert_error(conflict, 409, "CALENDAR_ENTRY_CONFLICT")
