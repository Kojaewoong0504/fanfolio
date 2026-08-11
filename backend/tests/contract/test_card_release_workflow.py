import asyncio
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import (
    AdminArtistAssignment,
    AdminMembership,
    Organization,
    OrganizationArtist,
    Role,
    User,
)
from app.models import (
    Session as LoginSession,
)
from tests.conftest import assert_error, assert_success


def admin_client(app: FastAPI, session_token: str) -> TestClient:
    client = TestClient(app)
    client.cookies.set("fanfolio_session", session_token)
    return client


async def create_admin_actor(
    *,
    user_id: str,
    access_level: str,
    organization_id: str | None = "org_starwave",
    assigned_artist_ids: list[str] | None = None,
) -> str:
    token = f"test-session-{user_id}"
    async with SessionLocal() as session:
        if organization_id and await session.get(Organization, organization_id) is None:
            session.add(
                Organization(
                    id=organization_id,
                    name="스타웨이브 엔터테인먼트",
                    slug=organization_id.replace("_", "-"),
                    status="active",
                )
            )
        organization_artist_ids = (
            ["artist_nova3"] if assigned_artist_ids is None else assigned_artist_ids
        )
        if organization_id:
            for artist_id in organization_artist_ids:
                if (
                    await session.get(
                        OrganizationArtist,
                        {"organization_id": organization_id, "artist_id": artist_id},
                    )
                    is None
                ):
                    session.add(
                        OrganizationArtist(organization_id=organization_id, artist_id=artist_id)
                    )
        session.add(User(id=user_id, email=f"{user_id}@example.test", role=Role.ADMIN))
        session.add(LoginSession(token=token, user_id=user_id))
        session.add(
            AdminMembership(
                user_id=user_id,
                organization_id=organization_id,
                access_level=access_level,
                status="active",
                display_name=user_id,
            )
        )
        for artist_id in assigned_artist_ids or []:
            session.add(AdminArtistAssignment(admin_user_id=user_id, artist_id=artist_id))
        await session.commit()
    return token


def create_partner_client(
    app: FastAPI,
    *,
    user_id: str = "partner_manager",
    access_level: str = "manager",
    organization_id: str | None = "org_starwave",
    assigned_artist_ids: list[str] | None = None,
) -> TestClient:
    token = asyncio.run(
        create_admin_actor(
            user_id=user_id,
            access_level=access_level,
            organization_id=organization_id,
            assigned_artist_ids=(
                ["artist_nova3"] if assigned_artist_ids is None else assigned_artist_ids
            ),
        )
    )
    return admin_client(app, token)


def create_platform_client(app: FastAPI, user_id: str = "platform_operator") -> TestClient:
    token = asyncio.run(
        create_admin_actor(
            user_id=user_id,
            access_level="platform_operator",
            organization_id=None,
            assigned_artist_ids=[],
        )
    )
    return admin_client(app, token)


def submit_studio_card(artist: TestClient, *, rarity: str = "R") -> dict[str, Any]:
    card = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": "template_signature_v1",
                "name": f"{rarity} release card",
                "seasonName": "2026 SUMMER",
                "rarity": rarity,
                "imageAssetId": "asset_card_image",
                "artistId": "artist_nova3",
                "memberId": "member_yuna",
                "issueLimit": 100,
            },
        ),
        201,
    )
    return assert_success(
        artist.post(
            f"/api/artist/cards/{card['id']}/submit-review",
            json={"reviewNote": "검수 요청합니다."},
        )
    )


def test_normal_card_needs_one_company_approval_before_drop_linking(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner = create_partner_client(app)
    card = submit_studio_card(actors["artist"], rarity="R")

    assert card["releaseStatus"] == "pending_partner_review"
    assert card["releasePolicy"] == "partner_only"
    assert card["reviewVersion"] == 1

    approved = assert_success(
        partner.post(f"/api/admin/cards/{card['id']}/review/partner", json={"decision": "approved"})
    )
    assert approved["releaseStatus"] == "approved"

    drop = assert_success(
        partner.post(
            "/api/admin/drops",
            json={"name": "승인 카드 드롭", "artistId": "artist_nova3"},
        ),
        201,
    )
    linked = assert_success(
        partner.post(f"/api/admin/drops/{drop['id']}/cards", json={"cardId": card["id"]})
    )
    assert linked["releaseStatus"] == "drop_ready"
    assert linked["dropId"] == drop["id"]


def test_special_card_needs_company_and_platform_approval(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner = create_partner_client(app)
    platform = create_platform_client(app)
    card = submit_studio_card(actors["artist"], rarity="Special")

    partner_approved = assert_success(
        partner.post(f"/api/admin/cards/{card['id']}/review/partner", json={"decision": "approved"})
    )
    assert partner_approved["releaseStatus"] == "pending_platform_review"

    drop = assert_success(
        partner.post(
            "/api/admin/drops",
            json={"name": "스페셜 드롭", "artistId": "artist_nova3"},
        ),
        201,
    )
    assert_error(
        partner.post(f"/api/admin/drops/{drop['id']}/cards", json={"cardId": card["id"]}),
        409,
        "CARD_RELEASE_NOT_APPROVED",
    )

    platform_approved = assert_success(
        platform.post(
            f"/api/admin/cards/{card['id']}/review/platform",
            json={"decision": "approved"},
        )
    )
    assert platform_approved["releaseStatus"] == "approved"


def test_stage_decisions_reject_wrong_roles_and_scope(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner = create_partner_client(app, user_id="partner_decider")
    editor = create_partner_client(app, user_id="partner_editor", access_level="editor")
    viewer = create_partner_client(app, user_id="partner_viewer", access_level="viewer")
    out_of_scope = create_partner_client(
        app,
        user_id="partner_out_of_scope",
        organization_id="org_other",
        assigned_artist_ids=[],
    )
    card = submit_studio_card(actors["artist"], rarity="R")

    assert_error(
        actors["admin"].post(
            f"/api/admin/cards/{card['id']}/review/partner",
            json={"decision": "approved"},
        ),
        403,
        "ADMIN_PARTNER_REVIEW_REQUIRED",
    )
    for denied in (editor, viewer):
        assert_error(
            denied.post(
                f"/api/admin/cards/{card['id']}/review/partner",
                json={"decision": "approved"},
            ),
            403,
            "ADMIN_PARTNER_REVIEW_REQUIRED",
        )
    assert_error(
        out_of_scope.post(
            f"/api/admin/cards/{card['id']}/review/partner",
            json={"decision": "approved"},
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )

    special = submit_studio_card(actors["artist"], rarity="Special")
    assert_success(
        partner.post(
            f"/api/admin/cards/{special['id']}/review/partner",
            json={"decision": "approved"},
        )
    )
    assert_error(
        partner.post(
            f"/api/admin/cards/{special['id']}/review/platform",
            json={"decision": "approved"},
        ),
        403,
        "ADMIN_PLATFORM_REVIEW_REQUIRED",
    )


def test_changes_requested_requires_note_and_resubmission_creates_new_review_version(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner = create_partner_client(app)
    submitted = submit_studio_card(actors["artist"], rarity="R")

    assert_error(
        partner.post(
            f"/api/admin/cards/{submitted['id']}/review/partner",
            json={"decision": "changes_requested"},
        ),
        422,
        "REVIEW_NOTE_REQUIRED",
    )
    changes = assert_success(
        partner.post(
            f"/api/admin/cards/{submitted['id']}/review/partner",
            json={"decision": "changes_requested", "note": "이미지를 수정해 주세요."},
        )
    )
    assert changes["releaseStatus"] == "changes_requested"
    assert changes["reviewNote"] == "이미지를 수정해 주세요."

    updated = assert_success(
        actors["artist"].patch(
            f"/api/artist/cards/{submitted['id']}",
            json={"name": "수정된 카드"},
        )
    )
    assert updated["releaseStatus"] == "draft"
    resubmitted = assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{submitted['id']}/submit-review",
            json={"reviewNote": "수정했습니다."},
        )
    )
    assert resubmitted["releaseStatus"] == "pending_partner_review"
    assert resubmitted["reviewVersion"] == 2
