import asyncio
import base64
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.admin_access import (
    PARTNER_ACTIONS,
    PLATFORM_ACTIONS,
    ROOT_ACTIONS,
    AdminContext,
    load_admin_context,
)
from app.db.session import SessionLocal
from app.errors import AppError
from app.models import (
    AdminArtistAssignment,
    AdminMembership,
    Artist,
    Asset,
    Card,
    Drop,
    OrganizationArtist,
    RefreshToken,
    Session,
    User,
)
from app.routers import assets as assets_router
from app.schemas import (
    AdminCardReleaseDecisionRequest,
    CardReviewDecisionItem,
    CardReviewRequestItem,
    NotificationItem,
    OrganizationMemberCreate,
    OrganizationMemberUpdate,
    ReleasePolicy,
    ReleaseStatus,
    ReviewDecision,
    ReviewStage,
)
from app.services import ensure_admin_bootstrap
from app.storage import StorageObjectNotFound, configured_asset_storage
from tests.conftest import assert_error, assert_success

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
ORGANIZATION_LOGO_BYTES = PNG_1X1 + b"organization-logo"
FIRST_LOGO_BYTES = PNG_1X1 + b"first-logo"
SECOND_LOGO_BYTES = PNG_1X1 + b"second-logo"


def test_root_actions_expose_redeem_code_read_and_write_contract() -> None:
    assert {"codes:read", "codes:write"} <= ROOT_ACTIONS


def create_partner(
    admin: TestClient,
    *,
    slug: str = "starwave",
    email: str = "manager@starwave.com",
    access_level: str = "manager",
    artist_ids: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    organization = assert_success(
        admin.post(
            "/api/admin/organizations",
            json={
                "name": "스타웨이브 엔터테인먼트",
                "slug": slug,
                "contactName": "김담당",
                "contactEmail": "partner@starwave.com",
            },
        ),
        201,
    )
    assigned = artist_ids if artist_ids is not None else ["artist_nova3"]
    assert_success(
        admin.put(
            f"/api/admin/organizations/{organization['id']}/artists",
            json={"artistIds": assigned},
        )
    )
    member = assert_success(
        admin.post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": email,
                # Partner members share the same role-scoped nickname index as
                # fan accounts, so each fixture member needs a stable unique
                # display name when a test creates multiple organizations.
                "displayName": f"{slug} 운영자",
                "accessLevel": access_level,
                "artistIds": assigned,
            },
        ),
        201,
    )
    return organization, member


def login_partner(app: Any, member: dict[str, Any]) -> TestClient:
    partner = TestClient(app)
    login = assert_success(
        partner.post(
            "/api/auth/admin/login",
            headers={"X-Fanfolio-Client": "admin"},
            json={
                "email": member["email"],
                "password": member["temporaryPassword"],
            },
        )
    )
    partner.headers["Authorization"] = f"Bearer {login['accessToken']}"
    partner.headers["X-Fanfolio-Client"] = "admin"
    return partner


def upload_organization_logo(
    admin: TestClient,
    *,
    purpose: str = "organization_logo",
    content: bytes = ORGANIZATION_LOGO_BYTES,
) -> str:
    presigned = assert_success(
        admin.post(
            "/api/uploads/presign",
            json={
                "fileName": "starwave-logo.png",
                "contentType": "image/png",
                "purpose": purpose,
            },
        ),
        201,
    )
    asset_id = presigned["assetId"]
    response = admin.put(
        f"/api/uploads/{asset_id}/content",
        content=content,
        headers={"Content-Type": "image/png"},
    )
    assert response.status_code == 204
    return asset_id


def test_seeded_admin_has_a_root_membership(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def load_membership() -> AdminMembership | None:
        async with SessionLocal() as session:
            return await session.get(AdminMembership, "admin")

    membership = asyncio.run(load_membership())
    assert membership is not None
    assert membership.organization_id is None
    assert membership.access_level == "root"
    assert membership.status == "active"


def test_bootstrap_repairs_a_missing_root_membership(client: TestClient, monkeypatch: Any) -> None:
    client.post("/api/test/reset")
    settings = SimpleNamespace(
        admin_bootstrap_email="root@fanfolio.test",
        admin_bootstrap_password="safe-bootstrap-password",
    )
    monkeypatch.setattr("app.services.get_settings", lambda: settings)

    async def bootstrap_twice() -> tuple[User | None, AdminMembership | None, int]:
        async with SessionLocal() as session:
            await ensure_admin_bootstrap(session)
            user = await session.scalar(select(User).where(User.email == "root@fanfolio.test"))
            assert user is not None
            membership = await session.get(AdminMembership, user.id)
            await session.delete(membership)
            await session.commit()
            await ensure_admin_bootstrap(session)
            repaired = await session.get(AdminMembership, user.id)
            count = len((await session.scalars(select(AdminMembership))).all())
            return user, repaired, count

    user, membership, count = asyncio.run(bootstrap_twice())
    assert user is not None
    assert membership is not None
    assert membership.access_level == "root"
    assert membership.organization_id is None
    assert count == 1


def test_admin_me_exposes_the_root_scope(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    context = assert_success(actors["admin"].get("/api/admin/me"))

    assert context["user"]["id"] == "admin"
    assert context["accessLevel"] == "root"
    assert context["organization"] is None
    assert context["assignedArtists"] == []
    assert "organizations:manage" in context["allowedActions"]


def test_partner_action_map_includes_company_admin_and_drop_code_scope() -> None:
    assert PARTNER_ACTIONS["company_admin"] == frozenset(
        {
            "organization:read",
            "organization:manage_scoped",
            "members:manage_scoped",
            "artists:read",
            "artists:write",
            "cards:read",
            "cards:write",
            "cards:submit_review",
            "drops:read",
            "drops:write",
            "drops:submit",
            "codes:read",
            "codes:write",
            "engagement:write",
            "engagement:approve",
            "events:read",
            "events:write",
            "events:submit",
            "audit:read",
            "statistics:read",
            "support:read",
            "support:write",
        }
    )
    assert {"drops:read", "drops:write", "drops:submit"} <= PARTNER_ACTIONS["manager"]
    assert "engagement:write" in PARTNER_ACTIONS["manager"]
    assert "engagement:approve" not in PARTNER_ACTIONS["manager"]
    assert {"codes:read", "codes:write"} <= PARTNER_ACTIONS["manager"]
    assert {"drops:read", "drops:write", "codes:read"} <= PARTNER_ACTIONS["editor"]
    assert "engagement:write" in PARTNER_ACTIONS["editor"]
    assert "engagement:approve" not in PARTNER_ACTIONS["editor"]
    assert "drops:submit" not in PARTNER_ACTIONS["editor"]
    assert "codes:write" not in PARTNER_ACTIONS["editor"]
    assert "codes:read" in PARTNER_ACTIONS["viewer"]
    assert "statistics:read" in PARTNER_ACTIONS["viewer"]
    assert "codes:write" not in PARTNER_ACTIONS["viewer"]
    assert "drops:write" not in PARTNER_ACTIONS["viewer"]


def test_organization_member_schemas_accept_company_admin_access_level() -> None:
    create_payload = OrganizationMemberCreate.model_validate(
        {
            "email": "company-admin@starwave.com",
            "displayName": "Company Admin",
            "accessLevel": "company_admin",
            "artistIds": [],
        }
    )
    update_payload = OrganizationMemberUpdate.model_validate({"accessLevel": "company_admin"})

    assert create_payload.access_level == "company_admin"
    assert update_payload.access_level == "company_admin"


def test_root_can_create_company_admin_partner_member(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(
        actors["admin"],
        email="company-admin@starwave.com",
        access_level="company_admin",
    )

    assert organization["status"] == "active"
    assert member["accessLevel"] == "company_admin"
    assert len(member["temporaryPassword"]) >= 16


def test_platform_operator_can_review_platform_stage_but_not_manage_partners() -> None:
    assert "cards:read" in PLATFORM_ACTIONS
    assert "cards:review_platform" in PLATFORM_ACTIONS
    assert "notifications:read" in PLATFORM_ACTIONS
    assert "cards:review" not in PLATFORM_ACTIONS
    assert "cards:write" not in PLATFORM_ACTIONS
    assert "organizations:manage" not in PLATFORM_ACTIONS
    assert "codes:manage" not in PLATFORM_ACTIONS
    assert "audit:read" not in PLATFORM_ACTIONS
    assert "statistics:read" not in PLATFORM_ACTIONS


def test_platform_operator_membership_must_not_belong_to_an_organization() -> None:
    async def persist_memberships() -> tuple[str | None, Any]:
        async with SessionLocal() as session:
            session.add_all(
                [
                    User(id="platform_operator", email="platform@example.test", role="ADMIN"),
                    User(
                        id="company_manager_without_org",
                        email="manager-scope@example.test",
                        role="ADMIN",
                    ),
                    AdminMembership(
                        user_id="platform_operator",
                        organization_id=None,
                        access_level="platform_operator",
                        status="active",
                        display_name="플랫폼 운영자",
                    ),
                ]
            )
            await session.commit()

            scoped_company = AdminMembership(
                user_id="company_manager_without_org",
                organization_id=None,
                access_level="manager",
                status="active",
                display_name="회사 운영자",
            )
            session.add(scoped_company)
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()

            membership = await session.get(AdminMembership, "platform_operator")
            context = await load_admin_context(session, membership_user())
            return membership.organization_id if membership else "missing", context.organization

    def membership_user() -> User:
        return User(id="platform_operator", email="platform@example.test", role="ADMIN")

    organization_id, organization = asyncio.run(persist_memberships())
    assert organization_id is None
    assert organization is None


def test_release_workflow_schemas_expose_storage_contracts() -> None:
    release_status: ReleaseStatus = "pending_platform_review"
    release_policy: ReleasePolicy = "partner_and_platform"
    review_stage: ReviewStage = "platform"
    review_decision: ReviewDecision = "changes_requested"

    decision = AdminCardReleaseDecisionRequest(stage=review_stage, decision=review_decision)
    request_item = CardReviewRequestItem(
        id="review_request_1",
        cardId="card_special",
        version=2,
        stage="partner",
        status="pending",
        snapshot={"name": "Special Card"},
    )
    decision_item = CardReviewDecisionItem(
        id="decision_1",
        requestId=request_item.id,
        reviewerUserId="platform_operator",
        decision="approved",
        note=None,
        decidedAt="2026-08-11T00:00:00Z",
    )
    notification = NotificationItem(
        id="notification_1",
        kind="card_platform_review_requested",
        title="검수 요청",
        body=None,
        isRead=False,
        createdAt="2026-08-11T00:00:00Z",
        entityType="card",
        entityId="card_special",
        eventKey="card:card_special:platform:2",
    )

    assert release_status == "pending_platform_review"
    assert release_policy == "partner_and_platform"
    assert decision.decision == "changes_requested"
    assert request_item.stage == "partner"
    assert decision_item.reviewer_user_id == "platform_operator"
    assert notification.entity_id == "card_special"


def test_root_can_manage_partner_organization_and_member(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])

    assert organization["status"] == "active"
    assert member["accessLevel"] == "manager"
    assert member["assignedArtists"] == [
        {"id": "artist_nova3", "name": "드림스케이프", "imageUrl": "/src/assets/hero.png"}
    ]
    assert len(member["temporaryPassword"]) >= 16

    listed = assert_success(actors["admin"].get("/api/admin/organizations"))
    assert listed["meta"]["pagination"]["total"] == 1
    assert listed["items"][0]["id"] == organization["id"]
    listed_by_slug = assert_success(
        actors["admin"].get("/api/admin/organizations", params={"query": "starwave"})
    )
    assert listed_by_slug["items"][0]["id"] == organization["id"]

    detail = assert_success(actors["admin"].get(f"/api/admin/organizations/{organization['id']}"))
    assert detail["memberCount"] == 1
    assert detail["artistCount"] == 1

    updated = assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}",
            json={"name": "스타웨이브 그룹", "status": "suspended"},
        )
    )
    assert updated["name"] == "스타웨이브 그룹"
    assert updated["status"] == "suspended"


def test_partner_context_is_scoped_and_cannot_use_root_routes(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    context = assert_success(partner.get("/api/admin/me"))
    assert context["accessLevel"] == "manager"
    assert context["organization"]["id"] == organization["id"]
    assert [item["id"] for item in context["assignedArtists"]] == ["artist_nova3"]
    assert "cards:write" in context["allowedActions"]
    assert "organizations:manage" not in context["allowedActions"]
    assert_error(
        partner.get("/api/admin/organizations"),
        403,
        "ADMIN_ROOT_REQUIRED",
    )


def test_company_admin_can_read_only_own_organization_and_members(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    first_org, company_admin = create_partner(
        actors["admin"],
        email="company-admin@starwave.com",
        access_level="company_admin",
    )
    second_org, _ = create_partner(
        actors["admin"],
        slug="moonlight",
        email="manager@moonlight.com",
    )
    partner = login_partner(app, company_admin)

    detail = assert_success(partner.get(f"/api/admin/organizations/{first_org['id']}"))
    assert detail["id"] == first_org["id"]
    members = assert_success(partner.get(f"/api/admin/organizations/{first_org['id']}/members"))
    assert [item["id"] for item in members["items"]] == [company_admin["id"]]

    assert_error(partner.get("/api/admin/organizations"), 403, "ADMIN_ROOT_REQUIRED")
    assert_error(
        partner.get(f"/api/admin/organizations/{second_org['id']}"),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        partner.get(f"/api/admin/organizations/{second_org['id']}/members"),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_company_admin_catalog_includes_every_artist_linked_to_own_organization(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_second_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_company_second", name="세컨드 웨이브"))
            await session.commit()

    asyncio.run(add_second_artist())
    organization, company_admin = create_partner(
        actors["admin"],
        email="company-catalog@starwave.com",
        access_level="company_admin",
        artist_ids=["artist_nova3"],
    )
    assert_success(
        actors["admin"].put(
            f"/api/admin/organizations/{organization['id']}/artists",
            json={"artistIds": ["artist_nova3", "artist_company_second"]},
        )
    )

    catalog = assert_success(login_partner(app, company_admin).get("/api/admin/catalog"))

    assert {item["id"] for item in catalog["artists"]} == {
        "artist_nova3",
        "artist_company_second",
    }


def test_company_admin_can_manage_only_subordinate_members_in_own_organization(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, company_admin = create_partner(
        actors["admin"],
        email="company-admin@starwave.com",
        access_level="company_admin",
    )
    other_organization, _ = create_partner(
        actors["admin"],
        slug="moonlight",
        email="manager@moonlight.com",
    )
    partner = login_partner(app, company_admin)

    created = assert_success(
        partner.post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "editor@starwave.com",
                "displayName": "콘텐츠 에디터",
                "accessLevel": "editor",
                "artistIds": ["artist_nova3"],
            },
        ),
        201,
    )
    assert created["accessLevel"] == "editor"
    updated = assert_success(
        partner.patch(
            f"/api/admin/organizations/{organization['id']}/members/{created['id']}",
            json={"displayName": "콘텐츠 매니저", "accessLevel": "manager"},
        )
    )
    assert updated["displayName"] == "콘텐츠 매니저"
    assert updated["accessLevel"] == "manager"

    reset = assert_success(
        partner.post(
            f"/api/admin/organizations/{organization['id']}/members/{created['id']}/reset-password",
            json={},
        )
    )
    assert reset["id"] == created["id"]
    assert len(reset["temporaryPassword"]) >= 16

    reset_login = TestClient(app)
    assert_success(
        reset_login.post(
            "/api/auth/admin/login",
            headers={"X-Fanfolio-Client": "admin"},
            json={"email": reset["email"], "password": reset["temporaryPassword"]},
        )
    )
    reassigned = assert_success(
        partner.put(
            f"/api/admin/organizations/{organization['id']}/members/{created['id']}/artists",
            json={"artistIds": []},
        )
    )
    assert reassigned["assignedArtists"] == []

    assert_error(
        partner.post(
            f"/api/admin/organizations/{organization['id']}/members",
            json={
                "email": "elevated@starwave.com",
                "displayName": "권한 상승",
                "accessLevel": "company_admin",
                "artistIds": [],
            },
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
    assert_error(
        partner.patch(
            f"/api/admin/organizations/{organization['id']}/members/{created['id']}",
            json={"accessLevel": "company_admin"},
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
    assert_error(
        partner.put(
            f"/api/admin/organizations/{organization['id']}/members/{company_admin['id']}/artists",
            json={"artistIds": []},
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
    assert_error(
        partner.post(
            f"/api/admin/organizations/{other_organization['id']}/members",
            json={
                "email": "outside@moonlight.com",
                "displayName": "범위 밖",
                "accessLevel": "editor",
                "artistIds": [],
            },
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        partner.patch(
            f"/api/admin/organizations/{other_organization['id']}/members/{created['id']}",
            json={"status": "suspended"},
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )
    assert_error(
        partner.put(
            f"/api/admin/organizations/{other_organization['id']}/members/{created['id']}/artists",
            json={"artistIds": []},
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_member_assignment_must_stay_inside_its_organization(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def add_second_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            await session.commit()

    asyncio.run(add_second_artist())
    first_org, member = create_partner(actors["admin"])
    second_org = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "문라이트 컴퍼니", "slug": "moonlight"},
        ),
        201,
    )
    assert_success(
        actors["admin"].put(
            f"/api/admin/organizations/{second_org['id']}/artists",
            json={"artistIds": ["artist_other"]},
        )
    )

    assert_error(
        actors["admin"].put(
            f"/api/admin/organizations/{first_org['id']}/members/{member['id']}/artists",
            json={"artistIds": ["artist_nova3", "artist_other"]},
        ),
        409,
        "ARTIST_OUTSIDE_ORGANIZATION",
    )


def test_unlinking_an_organization_artist_removes_staff_assignments(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])

    assert_success(
        actors["admin"].put(
            f"/api/admin/organizations/{organization['id']}/artists",
            json={"artistIds": []},
        )
    )

    async def assignment_state() -> tuple[int, int]:
        async with SessionLocal() as session:
            org_links = (
                await session.scalars(
                    select(OrganizationArtist).where(
                        OrganizationArtist.organization_id == organization["id"]
                    )
                )
            ).all()
            member_links = (
                await session.scalars(
                    select(AdminArtistAssignment).where(
                        AdminArtistAssignment.admin_user_id == member["id"]
                    )
                )
            ).all()
            return len(org_links), len(member_links)

    assert asyncio.run(assignment_state()) == (0, 0)


def test_suspending_a_member_revokes_sessions_and_refresh_tokens(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])
    partner = TestClient(app)
    login = assert_success(
        partner.post(
            "/api/auth/admin/login",
            headers={"X-Fanfolio-Client": "admin"},
            json={
                "email": member["email"],
                "password": member["temporaryPassword"],
            },
        )
    )
    partner.headers["Authorization"] = f"Bearer {login['accessToken']}"
    partner.headers["X-Fanfolio-Client"] = "admin"
    pending_asset = assert_success(
        partner.post(
            "/api/uploads/presign",
            json={
                "fileName": "partner-card.png",
                "contentType": "image/png",
                "purpose": "card",
            },
        ),
        201,
    )

    async def add_legacy_session() -> None:
        async with SessionLocal() as session:
            session.add(Session(token="partner-legacy-session", user_id=member["id"]))
            await session.commit()

    asyncio.run(add_legacy_session())
    assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}/members/{member['id']}",
            json={"status": "suspended"},
        )
    )

    async def revoked_state() -> tuple[int, bool]:
        async with SessionLocal() as session:
            sessions = (
                await session.scalars(select(Session).where(Session.user_id == member["id"]))
            ).all()
            token = await session.scalar(
                select(RefreshToken).where(RefreshToken.user_id == member["id"])
            )
            return len(sessions), bool(token and token.revoked_at)

    assert asyncio.run(revoked_state()) == (0, True)
    assert_error(
        partner.post("/api/auth/refresh", headers={"X-Fanfolio-Client": "admin"}),
        401,
        "AUTH_TOKEN_INVALID",
    )
    assert_error(
        partner.get(
            "/api/admin/me",
            headers={
                "Authorization": f"Bearer {login['accessToken']}",
                "X-Fanfolio-Client": "admin",
            },
        ),
        403,
        "ADMIN_ACCESS_SUSPENDED",
    )
    assert_error(
        TestClient(app).post(
            "/api/auth/admin/login",
            headers={"X-Fanfolio-Client": "admin"},
            json={
                "email": member["email"],
                "password": member["temporaryPassword"],
            },
        ),
        403,
        "ADMIN_ACCESS_SUSPENDED",
    )
    assert_error(
        partner.post(
            "/api/auth/admin/change-password",
            json={
                "currentPassword": member["temporaryPassword"],
                "newPassword": "Partner-password-after-suspension-2026!",
            },
        ),
        403,
        "ADMIN_ACCESS_SUSPENDED",
    )
    assert_error(
        partner.post(
            "/api/uploads/presign",
            json={
                "fileName": "blocked.png",
                "contentType": "image/png",
                "purpose": "card",
            },
        ),
        403,
        "ADMIN_ACCESS_SUSPENDED",
    )
    assert_error(
        partner.post(f"/api/uploads/{pending_asset['assetId']}/complete"),
        403,
        "ADMIN_ACCESS_SUSPENDED",
    )


def test_partner_catalog_and_cards_hide_unassigned_artists(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_unassigned_content() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_secret", name="시크릿 그룹"))
            session.add(
                Card(
                    id="card_secret",
                    name="숨겨진 카드",
                    status="draft",
                    artist_id="artist_secret",
                    image_url="/secret.png",
                )
            )
            await session.commit()

    asyncio.run(add_unassigned_content())
    _, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    catalog = assert_success(partner.get("/api/admin/catalog"))
    assert [artist["id"] for artist in catalog["artists"]] == ["artist_nova3"]
    cards = assert_success(partner.get("/api/admin/cards"))
    assert "card_secret" not in {card["id"] for card in cards["items"]}
    assert_error(
        partner.get("/api/admin/cards/card_secret"),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_partner_card_list_includes_catalog_metadata_for_the_admin_table(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    cards = assert_success(partner.get("/api/admin/cards"))["items"]
    published = next(card for card in cards if card["id"] == "card_published")

    assert published["artistId"] == "artist_nova3"
    assert published["memberId"] == "member_yuna"
    assert published["seasonName"] == "2026 SPRING"
    # This fixture intentionally has no uploaded front asset, but the list
    # contract must still expose the field so the UI can load real thumbnails
    # when an asset exists.
    assert "sourceImageUrl" in published
    assert published["sourceImageUrl"] is None

    detail = assert_success(partner.get("/api/admin/cards/card_published"))
    assert detail["backImageUrl"] == "/api/admin/cards/card_published/back-image"


def test_partner_logo_is_optional_and_ready_logo_asset_is_exposed(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    without_logo = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "로고 없는 회사", "slug": "without-logo"},
        ),
        201,
    )
    assert without_logo["logoAssetId"] is None
    assert without_logo["logoUrl"] is None

    legacy_logo = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "기존 로고 URL 회사",
                "slug": "legacy-logo-url",
                "logoUrl": "https://cdn.example.test/legacy-logo.png",
            },
        ),
        201,
    )
    assert legacy_logo["logoAssetId"] is None
    assert legacy_logo["logoUrl"] == "https://cdn.example.test/legacy-logo.png"

    asset_id = upload_organization_logo(actors["admin"], content=ORGANIZATION_LOGO_BYTES)
    with_logo = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "스타웨이브 엔터테인먼트",
                "slug": "starwave-logo",
                "logoAssetId": asset_id,
            },
        ),
        201,
    )
    assert with_logo["logoAssetId"] == asset_id
    assert with_logo["logoUrl"] == f"/api/organizations/{with_logo['id']}/logo"

    logo = actors["admin"].get(with_logo["logoUrl"])
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"
    assert logo.content == ORGANIZATION_LOGO_BYTES


def test_partner_logo_can_be_replaced_and_removed(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    first_asset_id = upload_organization_logo(actors["admin"], content=FIRST_LOGO_BYTES)
    organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "교체 테스트", "slug": "logo-replace", "logoAssetId": first_asset_id},
        ),
        201,
    )
    logo_url = organization["logoUrl"]
    first_logo = actors["admin"].get(logo_url)
    assert first_logo.status_code == 200
    assert first_logo.content == FIRST_LOGO_BYTES

    second_asset_id = upload_organization_logo(actors["admin"], content=SECOND_LOGO_BYTES)
    replaced = assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}",
            json={"logoAssetId": second_asset_id},
        )
    )
    assert replaced["logoAssetId"] == second_asset_id
    assert replaced["logoUrl"] == logo_url
    second_logo = actors["admin"].get(logo_url)
    assert second_logo.status_code == 200
    assert second_logo.content == SECOND_LOGO_BYTES

    removed = assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}",
            json={"logoAssetId": None},
        )
    )
    assert removed["logoAssetId"] is None
    assert removed["logoUrl"] is None
    assert actors["admin"].get(logo_url).status_code == 404


def test_partner_logo_rejects_unready_or_wrong_purpose_assets(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    unready = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "unready.png",
                "contentType": "image/png",
                "purpose": "organization_logo",
            },
        ),
        201,
    )
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "준비 안 됨", "slug": "logo-unready", "logoAssetId": unready["assetId"]},
        ),
        409,
        "ASSET_NOT_READY",
    )

    wrong_purpose_id = upload_organization_logo(actors["admin"], purpose="card")
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "잘못된 목적", "slug": "logo-purpose", "logoAssetId": wrong_purpose_id},
        ),
        422,
        "INVALID_LOGO_ASSET",
    )


def test_partner_logo_rejects_wrong_owner_non_image_or_missing_storage_assets(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    other_owner_asset_id = upload_organization_logo(actors["artist"])
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "다른 소유자",
                "slug": "logo-owner",
                "logoAssetId": other_owner_asset_id,
            },
        ),
        422,
        "INVALID_LOGO_ASSET",
    )

    non_image_asset_id = upload_organization_logo(actors["admin"])
    missing_storage_asset_id = upload_organization_logo(actors["admin"])

    async def corrupt_assets() -> None:
        async with SessionLocal() as session:
            non_image = await session.get(Asset, non_image_asset_id)
            assert non_image is not None
            non_image.content_type = "application/pdf"

            missing_storage = await session.get(Asset, missing_storage_asset_id)
            assert missing_storage is not None
            assert missing_storage.storage_path is not None
            configured_asset_storage().delete(missing_storage.storage_path)
            await session.commit()

    asyncio.run(corrupt_assets())

    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "이미지 아님",
                "slug": "logo-content-type",
                "logoAssetId": non_image_asset_id,
            },
        ),
        422,
        "INVALID_LOGO_ASSET",
    )
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "파일 없음",
                "slug": "logo-missing-storage",
                "logoAssetId": missing_storage_asset_id,
            },
        ),
        409,
        "ASSET_NOT_READY",
    )


def test_public_partner_logo_revalidates_linked_asset_invariants(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    wrong_purpose_asset_id = upload_organization_logo(actors["admin"])
    wrong_purpose_organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "목적 변경",
                "slug": "logo-mutated-purpose",
                "logoAssetId": wrong_purpose_asset_id,
            },
        ),
        201,
    )
    non_image_asset_id = upload_organization_logo(actors["admin"])
    non_image_organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "타입 변경",
                "slug": "logo-mutated-type",
                "logoAssetId": non_image_asset_id,
            },
        ),
        201,
    )

    async def mutate_linked_assets() -> None:
        async with SessionLocal() as session:
            wrong_purpose = await session.get(Asset, wrong_purpose_asset_id)
            assert wrong_purpose is not None
            wrong_purpose.purpose = "card"

            non_image = await session.get(Asset, non_image_asset_id)
            assert non_image is not None
            non_image.content_type = "application/pdf"
            await session.commit()

    asyncio.run(mutate_linked_assets())

    assert_error(
        actors["admin"].get(wrong_purpose_organization["logoUrl"]),
        404,
        "ASSET_NOT_FOUND",
    )
    assert_error(
        actors["admin"].get(non_image_organization["logoUrl"]),
        404,
        "ASSET_NOT_FOUND",
    )


def test_public_partner_logo_returns_not_found_when_storage_read_disappears(
    actors: dict[str, TestClient], monkeypatch: Any, seeded: dict[str, Any]
) -> None:
    class RaceStorage:
        def exists(self, storage_path: str) -> bool:
            return True

        def read_bytes(self, storage_path: str) -> bytes:
            raise StorageObjectNotFound(storage_path)

    asset_id = upload_organization_logo(actors["admin"])
    organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "스토리지 레이스", "slug": "logo-storage-race", "logoAssetId": asset_id},
        ),
        201,
    )

    async def move_to_remote_path() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            asset.storage_path = "s3://test-bucket/fanfolio/assets/raced-logo.bin"
            await session.commit()

    asyncio.run(move_to_remote_path())
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: RaceStorage())

    assert_error(
        actors["admin"].get(organization["logoUrl"]),
        404,
        "ASSET_NOT_FOUND",
    )


def test_public_partner_logo_does_not_mask_unrelated_storage_errors(
    actors: dict[str, TestClient], monkeypatch: Any, seeded: dict[str, Any]
) -> None:
    class BrokenStorage:
        def exists(self, storage_path: str) -> bool:
            return True

        def read_bytes(self, storage_path: str) -> bytes:
            raise RuntimeError("storage unavailable")

    asset_id = upload_organization_logo(actors["admin"])
    organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "스토리지 장애", "slug": "logo-storage-error", "logoAssetId": asset_id},
        ),
        201,
    )

    async def move_to_remote_path() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            asset.storage_path = "s3://test-bucket/fanfolio/assets/error-logo.bin"
            await session.commit()

    asyncio.run(move_to_remote_path())
    monkeypatch.setattr(assets_router, "configured_asset_storage", lambda: BrokenStorage())

    with pytest.raises(RuntimeError, match="storage unavailable"):
        actors["admin"].get(organization["logoUrl"])


def test_partner_manager_can_update_only_an_assigned_artist(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_unassigned_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_unassigned", name="비공개 아티스트"))
            await session.commit()

    asyncio.run(add_unassigned_artist())
    organization, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    updated = assert_success(
        partner.patch(
            "/api/admin/artists/artist_nova3",
            json={
                "name": "드림스케이프 리뉴얼",
                "imageUrl": "https://cdn.example.test/dreamscape.png",
            },
        )
    )
    assert updated == {
        "id": "artist_nova3",
        "name": "드림스케이프 리뉴얼",
        "imageUrl": "https://cdn.example.test/dreamscape.png",
    }
    logs = assert_success(partner.get("/api/admin/audit-logs"))["items"]
    update_log = next(item for item in logs if item["action"] == "artist.updated")
    assert update_log["organizationId"] == organization["id"]
    assert update_log["artistId"] == "artist_nova3"

    assert_error(
        partner.patch(
            "/api/admin/artists/artist_unassigned",
            json={"name": "노출되면 안 됨"},
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_partner_viewer_cannot_update_an_assigned_artist(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="artist-viewer@starwave.com",
        access_level="viewer",
    )
    viewer = login_partner(app, member)

    assert_error(
        viewer.patch(
            "/api/admin/artists/artist_nova3",
            json={"name": "수정 거부"},
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )


def test_manager_can_create_assigned_drafts_but_cannot_publish_or_review(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    draft = assert_success(
        partner.post(
            "/api/admin/cards",
            json={
                "name": "파트너 제작 카드",
                "artistId": "artist_nova3",
                "memberId": "member_yuna",
                "rarity": "Special",
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert draft["artistId"] == "artist_nova3"
    assert draft["status"] == "draft"

    assert_error(
        partner.post(f"/api/admin/cards/{draft['id']}/publish"),
        403,
        "ADMIN_ROOT_REQUIRED",
    )
    assert_error(
        partner.post(
            f"/api/admin/cards/{draft['id']}/review",
            json={"decision": "approve"},
        ),
        403,
        "ADMIN_ROOT_REQUIRED",
    )


def test_partner_manager_can_only_create_and_list_own_assigned_artist_drops(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    async def add_unassigned_artist() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="문라이트"))
            await session.commit()

    asyncio.run(add_unassigned_artist())
    organization, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    created = assert_success(
        partner.post(
            "/api/admin/drops",
            json={"name": "회사 컴백 드롭", "artistId": "artist_nova3"},
        ),
        201,
    )
    assert created["organizationId"] == organization["id"]
    assert created["artistId"] == "artist_nova3"
    listed = assert_success(partner.get("/api/admin/drops"))["items"]
    assert [item["id"] for item in listed] == [created["id"]]
    submitted = assert_success(partner.post(f"/api/admin/drops/{created['id']}/submit"))
    assert submitted["status"] == "pending_review"

    assert_error(
        partner.post(
            "/api/admin/drops",
            json={"name": "범위 밖 드롭", "artistId": "artist_other"},
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )


def test_partner_editor_can_save_drop_draft_but_cannot_submit_or_mutate_codes(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, editor_member = create_partner(
        actors["admin"],
        email="editor@starwave.com",
        access_level="editor",
    )
    editor = login_partner(app, editor_member)
    draft = assert_success(
        editor.post(
            "/api/admin/drops",
            json={"name": "에디터 초안", "artistId": "artist_nova3"},
        ),
        201,
    )
    assert_error(
        editor.post(f"/api/admin/drops/{draft['id']}/submit"),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
    assert_error(
        editor.post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": draft["id"],
                "cardId": "card_published",
                "quantity": 1,
                "maxUsesPerCode": 1,
                "expiresAt": "2030-01-01T00:00:00+00:00",
                "prefix": "EDITOR",
            },
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )


def test_partner_manager_can_operate_codes_only_for_own_scoped_drop(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])

    async def scope_live_drop() -> None:
        async with SessionLocal() as session:
            drop = await session.get(Drop, "drop_live")
            assert drop is not None
            drop.organization_id = organization["id"]
            drop.artist_id = "artist_nova3"
            await session.commit()

    asyncio.run(scope_live_drop())
    partner = login_partner(app, member)
    batch = assert_success(
        partner.post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": "drop_live",
                "cardId": "card_published",
                "quantity": 1,
                "maxUsesPerCode": 1,
                "expiresAt": "2030-01-01T00:00:00+00:00",
                "prefix": "STARWAVE",
            },
        ),
        201,
    )
    batches = assert_success(partner.get("/api/admin/redeem-code-batches"))["items"]
    assert [item["id"] for item in batches] == [batch["id"]]
    assert partner.get(batch["csvExportUrl"]).status_code == 200
    assert_error(
        partner.get("/api/admin/redeem-code-batches/missing/export"),
        404,
        "BATCH_NOT_FOUND",
    )


def test_partner_cannot_attach_another_users_asset_to_a_card(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    assert_error(
        partner.post(
            "/api/admin/cards",
            json={
                "name": "타인 자산 카드",
                "artistId": "artist_nova3",
                "imageAssetId": seeded["ids"]["imageAssetId"],
            },
        ),
        404,
        "ASSET_NOT_FOUND",
    )


def test_partner_can_submit_an_assigned_draft_for_root_review(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])
    partner = login_partner(app, member)
    draft = assert_success(
        partner.post(
            "/api/admin/cards",
            json={"name": "검수 요청 카드", "artistId": "artist_nova3"},
        ),
        201,
    )

    submitted = assert_success(
        partner.post(
            f"/api/admin/cards/{draft['id']}/submit-review",
            json={"reviewNote": "기업 내부 확인을 마쳤습니다."},
        )
    )

    assert submitted == {
        "id": draft["id"],
        "status": "pending_review",
        "reviewNote": "기업 내부 확인을 마쳤습니다.",
    }
    logs = assert_success(partner.get("/api/admin/audit-logs"))["items"]
    submitted_log = next(
        item
        for item in logs
        if item["action"] == "card.review_submitted" and item["entityId"] == draft["id"]
    )
    assert submitted_log["organizationId"] == organization["id"]
    assert submitted_log["artistId"] == "artist_nova3"


def test_viewer_cannot_create_or_update_cards(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(
        actors["admin"],
        email="viewer@starwave.com",
        access_level="viewer",
    )
    viewer = login_partner(app, member)

    assert_error(
        viewer.post(
            "/api/admin/cards",
            json={"name": "거부할 카드", "artistId": "artist_nova3"},
        ),
        403,
        "ADMIN_WRITE_REQUIRED",
    )
    assert_error(
        viewer.patch("/api/admin/cards/card_draft", json={"name": "수정 거부"}),
        403,
        "ADMIN_WRITE_REQUIRED",
    )


def test_unknown_partner_access_level_cannot_write_cards() -> None:
    context = AdminContext(
        user=SimpleNamespace(id="admin_unknown"),
        membership=SimpleNamespace(access_level="unexpected"),
        organization=SimpleNamespace(id="org_unknown"),
        assigned_artist_ids=frozenset({"artist_nova3"}),
        allowed_actions=frozenset(),
    )

    with pytest.raises(AppError) as captured:
        context.require_write()

    assert captured.value.status_code == 403
    assert captured.value.code == "ADMIN_WRITE_REQUIRED"


def test_partner_root_only_route_matrix_is_denied(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    _, member = create_partner(actors["admin"])
    partner = login_partner(app, member)

    requests = [
        partner.get("/api/admin/organizations"),
        partner.get("/api/admin/users"),
        partner.get("/api/admin/artist-accounts"),
        partner.get("/api/admin/artist-profiles"),
        partner.get("/api/admin/collection-campaigns"),
        partner.patch("/api/admin/users/fan/role", json={"role": "artist"}),
        partner.post(
            "/api/admin/artist-accounts",
            json={"username": "blocked", "displayName": "차단"},
        ),
        partner.post(
            "/api/admin/admin-accounts",
            json={"email": "blocked@example.com", "displayName": "차단"},
        ),
    ]
    for response in requests:
        assert_error(response, 403, "ADMIN_ROOT_REQUIRED")


def test_scoped_audit_log_includes_organization_and_artist(
    actors: dict[str, TestClient], app: Any, seeded: dict[str, Any]
) -> None:
    organization, member = create_partner(actors["admin"])
    partner = login_partner(app, member)
    draft = assert_success(
        partner.post(
            "/api/admin/cards",
            json={"name": "감사 범위 카드", "artistId": "artist_nova3"},
        ),
        201,
    )

    partner_logs = assert_success(partner.get("/api/admin/audit-logs"))
    created = next(
        item
        for item in partner_logs["items"]
        if item["action"] == "card.created" and item["entityId"] == draft["id"]
    )
    assert created["organizationId"] == organization["id"]
    assert created["artistId"] == "artist_nova3"
