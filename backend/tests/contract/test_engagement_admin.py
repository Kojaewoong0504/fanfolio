import asyncio
from typing import Any

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Artist
from tests.conftest import assert_error, assert_success
from tests.contract.test_admin_partner_access import create_partner, login_partner


def achievement_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "첫 카드 등록",
        "description": "첫 공식 카드를 등록하면 달성합니다.",
        "artistId": "artist_nova3",
        "conditionType": "first_card",
        "targetValue": 1,
        "rewardIds": [],
        "xpBonus": 50,
    }
    payload.update(overrides)
    return payload


def test_company_manager_can_draft_only_assigned_artist_achievement(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_unassigned_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            await session.commit()

    asyncio.run(add_unassigned_artist())
    _, member = create_partner(actors["admin"])
    company_client = login_partner(app, member)

    draft = assert_success(
        company_client.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(),
        ),
        201,
    )
    assert draft["status"] == "draft"
    assert draft["artistId"] == "artist_nova3"

    assert_error(
        company_client.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(title="범위 밖 업적", artistId="artist_other"),
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_company_super_admin_can_publish_company_achievement(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-admin@starwave.com",
        access_level="company_admin",
    )
    company_admin_client = login_partner(app, member)

    draft = assert_success(
        company_admin_client.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(),
        ),
        201,
    )
    pending = assert_success(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/submit")
    )
    assert pending["status"] == "pending_review"

    published = assert_success(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/approve")
    )
    assert published["status"] == "published"
    assert published["organizationId"] is not None


def test_achievement_review_status_transitions_are_constrained(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-admin-flow@starwave.com",
        access_level="company_admin",
    )
    company_admin_client = login_partner(app, member)

    draft = assert_success(
        company_admin_client.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(title="상태 전이 업적"),
        ),
        201,
    )
    assert_error(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/approve"),
        409,
        "INVALID_ACHIEVEMENT_STATUS",
    )

    pending = assert_success(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/submit")
    )
    assert pending["status"] == "pending_review"
    published = assert_success(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/approve")
    )
    assert published["status"] == "published"
    disabled = assert_success(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/disable")
    )
    assert disabled["status"] == "disabled"

    assert_error(
        company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/submit"),
        409,
        "INVALID_ACHIEVEMENT_STATUS",
    )


def test_editor_cannot_publish_achievement(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="editor-engagement@starwave.com",
        access_level="editor",
    )
    editor_client = login_partner(app, member)

    assert_error(
        editor_client.post("/api/admin/engagement/achievements/achievement_1/approve"),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
