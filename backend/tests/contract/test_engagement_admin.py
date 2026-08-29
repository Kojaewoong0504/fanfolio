import asyncio
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import (
    AchievementDefinition,
    Artist,
    Card,
    CardPack,
    CardPackCard,
    Drop,
    EngagementEvent,
    Organization,
    OrganizationArtist,
    RewardCatalog,
    RewardGrant,
    UserCard,
    XpLedger,
)
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


def pass_season_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "NOVA Free Pass",
        "description": "앨범 발매 기간에만 참여할 수 있는 시즌 패스입니다.",
        "artistId": "artist_nova3",
        "startsAt": "2026-08-01T00:00:00Z",
        "endsAt": "2026-08-31T00:00:00Z",
        "tiers": [
            {"tier": 1, "requiredXp": 30, "rewardId": None},
            {"tier": 2, "requiredXp": 60, "rewardId": None},
        ],
    }
    payload.update(overrides)
    return payload


def mission_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "댓글로 응원하기",
        "description": "아티스트 이벤트에 댓글을 남겨 보세요.",
        "artistId": "artist_nova3",
        "eventKind": "event_commented",
        "targetValue": 1,
        "recurrence": "daily",
        "conditionPayload": {"eventType": "comment"},
        "rewardPayload": {"xp": 20, "points": 5},
    }
    payload.update(overrides)
    return payload


def seed_dashboard_growth_scope(org_id: str) -> None:
    async def seed() -> None:
        async with SessionLocal() as session:
            session.add_all(
                [
                    Artist(id="artist_dashboard_other", name="다른 아티스트"),
                    Organization(
                        id="org_dashboard_other",
                        name="다른 엔터테인먼트",
                        slug="dashboard-other",
                        status="active",
                    ),
                    OrganizationArtist(
                        organization_id="org_dashboard_other",
                        artist_id="artist_dashboard_other",
                    ),
                    Drop(
                        id="drop_dashboard_own",
                        name="대시보드 자사 드롭",
                        organization_id=org_id,
                        artist_id="artist_nova3",
                        status="live",
                    ),
                    Drop(
                        id="drop_dashboard_other",
                        name="대시보드 타사 드롭",
                        organization_id="org_dashboard_other",
                        artist_id="artist_dashboard_other",
                        status="live",
                    ),
                    Card(
                        id="card_dashboard_own",
                        name="대시보드 자사 카드",
                        artist_id="artist_nova3",
                        status="published",
                        release_status="published",
                        drop_id="drop_dashboard_own",
                    ),
                    Card(
                        id="card_dashboard_other",
                        name="대시보드 타사 카드",
                        artist_id="artist_dashboard_other",
                        status="published",
                        release_status="published",
                        drop_id="drop_dashboard_other",
                    ),
                    UserCard(
                        id="uc_dashboard_own",
                        user_id="fan",
                        card_id="card_dashboard_own",
                        drop_id="drop_dashboard_own",
                        serial_number=1,
                        acquired_at=datetime.now(UTC),
                    ),
                    UserCard(
                        id="uc_dashboard_other",
                        user_id="otherFan",
                        card_id="card_dashboard_other",
                        drop_id="drop_dashboard_other",
                        serial_number=1,
                        acquired_at=datetime.now(UTC),
                    ),
                    EngagementEvent(
                        id="evt_dashboard_own",
                        user_id="fan",
                        kind="card_collected",
                        source_type="user_card",
                        source_id="uc_dashboard_own",
                        payload={"cardId": "card_dashboard_own", "artistId": "artist_nova3"},
                        status="processed",
                        processed_at=datetime.now(UTC),
                    ),
                    EngagementEvent(
                        id="evt_dashboard_other",
                        user_id="otherFan",
                        kind="card_collected",
                        source_type="user_card",
                        source_id="uc_dashboard_other",
                        payload={
                            "cardId": "card_dashboard_other",
                            "artistId": "artist_dashboard_other",
                        },
                        status="processed",
                        processed_at=datetime.now(UTC),
                    ),
                    XpLedger(
                        id="xp_dashboard_own",
                        user_id="fan",
                        event_id="evt_dashboard_own",
                        rule_key="card_collected",
                        amount=40,
                    ),
                    XpLedger(
                        id="xp_dashboard_other",
                        user_id="otherFan",
                        event_id="evt_dashboard_other",
                        rule_key="card_collected",
                        amount=60,
                    ),
                    RewardCatalog(
                        id="reward_dashboard_own",
                        organization_id=org_id,
                        artist_id="artist_nova3",
                        reward_type="title",
                        name="자사 보상",
                        status="published",
                    ),
                    RewardCatalog(
                        id="reward_dashboard_other",
                        organization_id="org_dashboard_other",
                        artist_id="artist_dashboard_other",
                        reward_type="title",
                        name="타사 보상",
                        status="published",
                    ),
                    RewardGrant(
                        id="grant_dashboard_own",
                        user_id="fan",
                        reward_id="reward_dashboard_own",
                        source_event_id="evt_dashboard_own",
                        rule_key="dashboard:own",
                    ),
                    RewardGrant(
                        id="grant_dashboard_other",
                        user_id="otherFan",
                        reward_id="reward_dashboard_other",
                        source_event_id="evt_dashboard_other",
                        rule_key="dashboard:other",
                    ),
                    AchievementDefinition(
                        id="achievement_dashboard_own",
                        organization_id=org_id,
                        artist_id="artist_nova3",
                        title="자사 공개 업적",
                        condition_type="first_card",
                        target_value=1,
                        status="published",
                    ),
                    AchievementDefinition(
                        id="achievement_dashboard_other",
                        organization_id="org_dashboard_other",
                        artist_id="artist_dashboard_other",
                        title="타사 공개 업적",
                        condition_type="first_card",
                        target_value=1,
                        status="published",
                    ),
                    AchievementDefinition(
                        id="achievement_dashboard_draft",
                        organization_id=org_id,
                        artist_id="artist_nova3",
                        title="초안 업적",
                        condition_type="first_card",
                        target_value=1,
                        status="draft",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed())


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


def test_company_manager_can_create_scoped_reward_for_growth_rules(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(
        actors["admin"],
        email="company-reward-manager@starwave.com",
        access_level="company_admin",
    )
    company_client = login_partner(app, member)

    reward = assert_success(
        company_client.post(
            "/api/admin/engagement/rewards",
            json={
                "name": "NOVA 첫 수집가 뱃지",
                "rewardType": "badge",
                "organizationId": organization["id"],
                "artistId": "artist_nova3",
                "metadata": {
                    "label": "FIRST NOVA",
                    "color": "violet",
                    "imagePreset": "ticket",
                },
            },
        ),
        201,
    )
    assert reward["status"] == "published"
    assert reward["organizationId"] == organization["id"]
    assert reward["artistId"] == "artist_nova3"
    assert reward["metadata"]["label"] == "FIRST NOVA"
    assert reward["metadata"]["imagePreset"] == "ticket"

    listed = assert_success(company_client.get("/api/admin/engagement/rewards"))["items"]
    assert any(item["id"] == reward["id"] for item in listed)


def test_admin_dashboard_growth_summary_is_scoped_without_fan_rankings(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(
        actors["admin"],
        email="company-dashboard-growth@starwave.com",
        access_level="company_admin",
    )
    company_client = login_partner(app, member)
    seed_dashboard_growth_scope(organization["id"])

    root_dashboard = assert_success(actors["admin"].get("/api/admin/dashboard"))
    company_dashboard = assert_success(company_client.get("/api/admin/dashboard"))

    assert root_dashboard["growthSummary"] == {
        "activeAchievements": 2,
        "earnedXpToday": 100,
        "claimableRewards": 2,
    }
    assert company_dashboard["growthSummary"] == {
        "activeAchievements": 1,
        "earnedXpToday": 40,
        "claimableRewards": 1,
    }
    assert "fans" not in root_dashboard
    assert "rankings" not in root_dashboard
    assert "fans" not in company_dashboard
    assert "rankings" not in company_dashboard


def test_admin_achievement_persists_review_period(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-achievement-period@starwave.com",
        access_level="manager",
    )
    company_client = login_partner(app, member)

    draft = assert_success(
        company_client.post(
            "/api/admin/engagement/achievements",
            json=achievement_payload(
                title="기간 업적",
                startsAt="2026-08-01T00:00:00Z",
                endsAt="2026-08-31T23:59:00Z",
            ),
        ),
        201,
    )

    assert draft["startsAt"] == "2026-08-01T00:00:00+00:00"
    assert draft["endsAt"] == "2026-08-31T23:59:00+00:00"

    listed = assert_success(company_client.get("/api/admin/engagement/achievements"))["items"]
    persisted = next(item for item in listed if item["id"] == draft["id"])
    assert persisted["startsAt"] == "2026-08-01T00:00:00+00:00"
    assert persisted["endsAt"] == "2026-08-31T23:59:00+00:00"


def test_admin_creates_free_only_pass_season_and_ignores_paid_input(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-pass-manager@starwave.com",
        access_level="manager",
    )
    company_client = login_partner(app, member)

    draft = assert_success(
        company_client.post(
            "/api/admin/engagement/pass-seasons",
            json=pass_season_payload(isPaid=True),
        ),
        201,
    )

    assert draft["status"] == "draft"
    assert draft["artistId"] == "artist_nova3"
    assert draft["isPaid"] is False
    assert draft["description"] == "앨범 발매 기간에만 참여할 수 있는 시즌 패스입니다."
    assert [tier["requiredXp"] for tier in draft["tiers"]] == [30, 60]


def test_admin_updates_artist_season_pass_and_replaces_tiers(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-pass-editor@starwave.com",
        access_level="manager",
    )
    company_client = login_partner(app, member)
    draft = assert_success(
        company_client.post(
            "/api/admin/engagement/pass-seasons",
            json=pass_season_payload(),
        ),
        201,
    )

    updated = assert_success(
        company_client.patch(
            f"/api/admin/engagement/pass-seasons/{draft['id']}",
            json=pass_season_payload(
                title="NOVA COMEBACK 시즌 2",
                description="두 번째 앨범 시즌 한정 패스",
                tiers=[{"tier": 1, "requiredXp": 100, "rewardId": None}],
            ),
        )
    )

    assert updated["title"] == "NOVA COMEBACK 시즌 2"
    assert updated["description"] == "두 번째 앨범 시즌 한정 패스"
    assert [tier["requiredXp"] for tier in updated["tiers"]] == [100]


def test_pass_season_review_status_transitions_match_achievements(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="company-admin-pass-flow@starwave.com",
        access_level="company_admin",
    )
    company_admin_client = login_partner(app, member)

    draft = assert_success(
        company_admin_client.post(
            "/api/admin/engagement/pass-seasons",
            json=pass_season_payload(title="상태 전이 패스"),
        ),
        201,
    )
    assert_error(
        company_admin_client.post(f"/api/admin/engagement/pass-seasons/{draft['id']}/approve"),
        409,
        "INVALID_PASS_SEASON_STATUS",
    )

    pending = assert_success(
        company_admin_client.post(f"/api/admin/engagement/pass-seasons/{draft['id']}/submit")
    )
    assert pending["status"] == "pending_review"
    published = assert_success(
        company_admin_client.post(f"/api/admin/engagement/pass-seasons/{draft['id']}/approve")
    )
    assert published["status"] == "published"


def test_pass_season_scope_is_hidden_from_unassigned_partner_manager(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_unassigned_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            await session.commit()

    asyncio.run(add_unassigned_artist())
    _, member = create_partner(
        actors["admin"],
        email="company-pass-scope@starwave.com",
        access_level="manager",
    )
    company_client = login_partner(app, member)

    assert_error(
        company_client.post(
            "/api/admin/engagement/pass-seasons",
            json=pass_season_payload(title="범위 밖 패스", artistId="artist_other"),
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


def test_partner_manager_can_create_and_submit_scoped_mission_and_company_admin_can_publish(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, manager_member = create_partner(
        actors["admin"],
        email="mission-manager@starwave.com",
        access_level="manager",
    )
    manager = login_partner(app, manager_member)

    draft = assert_success(
        manager.post("/api/admin/engagement/missions", json=mission_payload()),
        201,
    )
    assert draft["status"] == "draft"
    assert draft["eventKind"] == "event_commented"
    assert draft["organizationId"] is not None

    updated = assert_success(
        manager.patch(
            f"/api/admin/engagement/missions/{draft['id']}",
            json={"title": "댓글로 더 크게 응원하기", "targetValue": 3},
        )
    )
    assert updated["title"] == "댓글로 더 크게 응원하기"
    assert updated["targetValue"] == 3

    pending = assert_success(manager.post(f"/api/admin/engagement/missions/{draft['id']}/submit"))
    assert pending["status"] == "pending_review"

    company_admin_member = assert_success(
        actors["admin"].post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "mission-company-admin@starwave.com",
                "displayName": "starwave 회사 관리자",
                "accessLevel": "company_admin",
                "artistIds": ["artist_nova3"],
            },
        ),
        201,
    )
    company_admin = login_partner(app, company_admin_member)
    published = assert_success(
        company_admin.post(f"/api/admin/engagement/missions/{draft['id']}/approve")
    )
    assert published["status"] == "published"

    listed = assert_success(company_admin.get("/api/admin/engagement/missions"))["items"]
    assert any(item["id"] == draft["id"] for item in listed)


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


def test_admin_can_create_card_pack_reward_for_published_pack(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_pack() -> None:
        async with SessionLocal() as session:
            pack = CardPack(
                id="pack_pass_reward",
                artist_id="artist_nova3",
                name="Pass Reward Pack",
                version="v1.0",
                status="published",
            )
            session.add(pack)
            session.add(
                CardPackCard(
                    id="pack_pass_reward_card",
                    pack_id=pack.id,
                    card_id=seeded["ids"]["publishedCardId"],
                    position=1,
                    probability=100,
                )
            )
            await session.commit()

    asyncio.run(seed_pack())
    organization, _ = create_partner(
        actors["admin"], slug="card-pack-reward-scope", email="card-pack-reward-scope@starwave.com"
    )
    created = assert_success(
        actors["admin"].post(
            "/api/admin/engagement/rewards",
            json={
                "name": "패스 카드팩 보상",
                "rewardType": "card_pack",
                "organizationId": organization["id"],
                "artistId": "artist_nova3",
                "metadata": {"cardPackId": "pack_pass_reward"},
            },
        ),
        201,
    )
    assert created["rewardType"] == "card_pack"
    assert created["metadata"]["cardPackId"] == "pack_pass_reward"


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
