import asyncio
from typing import Any

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Artist, Organization, RewardCatalog
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


def test_direct_achievement_transitions_hide_company_level_scope_from_manager(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, company_admin_member = create_partner(
        actors["admin"],
        email="company-admin-direct@starwave.com",
        access_level="company_admin",
    )
    manager_member = assert_success(
        actors["admin"].post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "manager-direct@starwave.com",
                "displayName": "직접 접근 매니저",
                "accessLevel": "manager",
                "artistIds": ["artist_nova3"],
            },
        ),
        201,
    )
    company_admin = login_partner(app, company_admin_member)
    manager = login_partner(app, manager_member)

    org_draft = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(artistId=None, title="회사 초안 업적"),
        ),
        201,
    )
    org_pending = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(artistId=None, title="회사 대기 업적"),
        ),
        201,
    )
    org_published = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(artistId=None, title="회사 공개 업적"),
        ),
        201,
    )
    assert_success(
        company_admin.post(f"/api/admin/engagement/achievements/{org_pending['id']}/submit")
    )
    assert_success(
        company_admin.post(f"/api/admin/engagement/achievements/{org_published['id']}/submit")
    )
    assert_success(
        company_admin.post(f"/api/admin/engagement/achievements/{org_published['id']}/approve")
    )

    listed = assert_success(manager.get("/api/admin/engagement/achievements"))["items"]
    assert all(item["artistId"] is not None for item in listed)
    assert_error(
        manager.post(f"/api/admin/engagement/achievements/{org_draft['id']}/submit"),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        manager.post(f"/api/admin/engagement/achievements/{org_pending['id']}/approve"),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        manager.post(f"/api/admin/engagement/achievements/{org_published['id']}/disable"),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_direct_achievement_transitions_hide_company_level_scope_from_editor(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, company_admin_member = create_partner(
        actors["admin"],
        email="company-admin-editor-direct@starwave.com",
        access_level="company_admin",
    )
    editor_member = assert_success(
        actors["admin"].post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "editor-direct@starwave.com",
                "displayName": "직접 접근 에디터",
                "accessLevel": "editor",
                "artistIds": ["artist_nova3"],
            },
        ),
        201,
    )
    company_admin = login_partner(app, company_admin_member)
    editor = login_partner(app, editor_member)

    org_pending = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(artistId=None, title="에디터 차단 업적"),
        ),
        201,
    )
    assert_success(
        company_admin.post(f"/api/admin/engagement/achievements/{org_pending['id']}/submit")
    )

    assert_error(
        editor.post(f"/api/admin/engagement/achievements/{org_pending['id']}/submit"),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        editor.post(f"/api/admin/engagement/achievements/{org_pending['id']}/approve"),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        editor.post(f"/api/admin/engagement/achievements/{org_pending['id']}/disable"),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_achievement_create_validates_reward_ids_against_partner_scope(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def seed_rewards() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            session.add(
                Organization(
                    id="org_other_rewards",
                    name="문라이트 엔터테인먼트",
                    slug="moonlight-rewards",
                    status="active",
                )
            )
            session.add_all(
                [
                    RewardCatalog(
                        id="reward_nova_badge",
                        organization_id="org_starwave",
                        artist_id="artist_nova3",
                        reward_type="badge",
                        name="NOVA Badge",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_company_title",
                        organization_id="org_starwave",
                        artist_id=None,
                        reward_type="title",
                        name="Company Title",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_other_artist",
                        organization_id="org_starwave",
                        artist_id="artist_other",
                        reward_type="badge",
                        name="Other Artist Badge",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_other_org",
                        organization_id="org_other_rewards",
                        artist_id=None,
                        reward_type="title",
                        name="Other Org Title",
                        status="published",
                    ),
                ]
            )
            await session.commit()

    organization, company_admin_member = create_partner(
        actors["admin"],
        slug="starwave-rewards",
        email="company-admin-rewards@starwave.com",
        access_level="company_admin",
    )

    async def align_reward_scope() -> None:
        async with SessionLocal() as session:
            for reward_id in ("reward_nova_badge", "reward_company_title", "reward_other_artist"):
                reward = await session.get(RewardCatalog, reward_id)
                if reward is not None:
                    reward.organization_id = organization["id"]
            await session.commit()

    asyncio.run(seed_rewards())
    asyncio.run(align_reward_scope())
    manager_member = assert_success(
        actors["admin"].post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "manager-rewards@starwave.com",
                "displayName": "보상 매니저",
                "accessLevel": "manager",
                "artistIds": ["artist_nova3"],
            },
        ),
        201,
    )
    company_admin = login_partner(app, company_admin_member)
    manager = login_partner(app, manager_member)

    company_draft = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(artistId=None, rewardIds=["reward_company_title"]),
        ),
        201,
    )
    assert company_draft["rewardIds"] == ["reward_company_title"]

    manager_draft = assert_success(
        manager.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(rewardIds=["reward_nova_badge"]),
        ),
        201,
    )
    assert manager_draft["rewardIds"] == ["reward_nova_badge"]

    for reward_id in ("reward_company_title", "reward_other_artist", "reward_other_org"):
        assert_error(
            manager.post(
                "/api/admin/engagement/achievements",
                json=achievement_payload(title=f"차단 {reward_id}", rewardIds=[reward_id]),
            ),
            404,
            "RESOURCE_NOT_FOUND",
        )


def test_root_scoped_artist_achievement_rejects_other_organization_reward(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    source_org, _ = create_partner(
        actors["admin"],
        slug="root-source-rewards",
        email="root-source@starwave.com",
        access_level="company_admin",
    )
    other_org, _ = create_partner(
        actors["admin"],
        slug="root-other-rewards",
        email="root-other@starwave.com",
        access_level="company_admin",
    )

    async def seed_rewards() -> None:
        async with SessionLocal() as session:
            session.add_all(
                [
                    RewardCatalog(
                        id="reward_root_scoped_nova",
                        organization_id=source_org["id"],
                        artist_id="artist_nova3",
                        reward_type="badge",
                        name="Root Scoped NOVA",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_root_other_org",
                        organization_id=other_org["id"],
                        artist_id="artist_nova3",
                        reward_type="badge",
                        name="Root Other Org",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_global_title",
                        organization_id=None,
                        artist_id=None,
                        reward_type="title",
                        name="Global Title",
                        status="published",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_rewards())

    scoped = assert_success(
        actors["admin"].post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(
                organizationId=source_org["id"],
                rewardIds=["reward_root_scoped_nova"],
            ),
        ),
        201,
    )
    assert scoped["rewardIds"] == ["reward_root_scoped_nova"]

    assert_error(
        actors["admin"].post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(
                title="타 조직 보상 차단",
                organizationId=source_org["id"],
                rewardIds=["reward_root_other_org"],
            ),
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )
    global_draft = assert_success(
        actors["admin"].post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(
                title="전역 업적",
                artistId=None,
                rewardIds=["reward_global_title"],
            ),
        ),
        201,
    )
    assert global_draft["organizationId"] is None
    assert global_draft["rewardIds"] == ["reward_global_title"]


def test_company_admin_artist_achievement_rejects_other_artist_reward(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_other_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            await session.commit()

    asyncio.run(add_other_artist())
    organization, company_admin_member = create_partner(
        actors["admin"],
        slug="company-artist-rewards",
        email="company-admin-artist-rewards@starwave.com",
        access_level="company_admin",
        artist_ids=["artist_nova3", "artist_other"],
    )

    async def seed_rewards() -> None:
        async with SessionLocal() as session:
            session.add_all(
                [
                    RewardCatalog(
                        id="reward_company_nova_artist",
                        organization_id=organization["id"],
                        artist_id="artist_nova3",
                        reward_type="badge",
                        name="Company NOVA Artist",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_company_other_artist",
                        organization_id=organization["id"],
                        artist_id="artist_other",
                        reward_type="badge",
                        name="Company Other Artist",
                        status="published",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_rewards())
    company_admin = login_partner(app, company_admin_member)

    draft = assert_success(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(rewardIds=["reward_company_nova_artist"]),
        ),
        201,
    )
    assert draft["artistId"] == "artist_nova3"
    assert draft["rewardIds"] == ["reward_company_nova_artist"]

    assert_error(
        company_admin.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(
                title="타 아티스트 보상 차단",
                rewardIds=["reward_company_other_artist"],
            ),
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )
