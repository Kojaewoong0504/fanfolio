import asyncio
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import (
    AdminArtistAssignment,
    AdminMembership,
    Notification,
    NotificationDelivery,
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
    user_id: str,
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


def create_platform_client(app: FastAPI, user_id: str) -> TestClient:
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
                "name": f"{rarity} notification card",
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
    return assert_success(artist.post(f"/api/artist/cards/{card['id']}/submit-review"))


def test_submission_notifies_scoped_company_reviewers_once(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    manager = create_partner_client(app, user_id="review_manager")
    second_manager = create_partner_client(app, user_id="review_manager_two")
    out_of_scope = create_partner_client(
        app,
        user_id="review_manager_other",
        organization_id="org_other",
        assigned_artist_ids=[],
    )

    card = submit_studio_card(actors["artist"], rarity="R")

    items = assert_success(manager.get("/api/admin/notifications"))["items"]
    assert items[0]["kind"] == "card_partner_review_requested"
    assert items[0]["entityId"] == card["id"]
    assert items[0]["eventKey"] == f"card:{card['id']}:partner:1"
    assert len(assert_success(second_manager.get("/api/admin/notifications"))["items"]) == 1
    assert assert_success(out_of_scope.get("/api/admin/notifications"))["items"] == []

    duplicate = actors["artist"].post(f"/api/artist/cards/{card['id']}/submit-review")
    assert duplicate.status_code == 409
    assert len(assert_success(manager.get("/api/admin/notifications"))["items"]) == 1


def test_special_company_approval_notifies_platform_operators_once(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    manager = create_partner_client(app, user_id="special_review_manager")
    platform = create_platform_client(app, "platform_notified")
    other_platform = create_platform_client(app, "platform_notified_two")
    card = submit_studio_card(actors["artist"], rarity="Special")

    assert_success(
        manager.post(f"/api/admin/cards/{card['id']}/review/partner", json={"decision": "approved"})
    )

    items = assert_success(platform.get("/api/admin/notifications"))["items"]
    assert items[0]["kind"] == "card_platform_review_requested"
    assert items[0]["entityId"] == card["id"]
    assert items[0]["eventKey"] == f"card:{card['id']}:platform:1"
    assert len(assert_success(other_platform.get("/api/admin/notifications"))["items"]) == 1

    invalid_repeat = manager.post(
        f"/api/admin/cards/{card['id']}/review/partner",
        json={"decision": "approved"},
    )
    assert invalid_repeat.status_code == 409
    assert len(assert_success(platform.get("/api/admin/notifications"))["items"]) == 1


def test_admin_notification_list_and_read_update_are_user_scoped(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    manager = create_partner_client(app, user_id="notification_reader")
    other_manager = create_partner_client(app, user_id="notification_other")
    card = submit_studio_card(actors["artist"], rarity="R")

    first_page = assert_success(manager.get("/api/admin/notifications"))
    notification = first_page["items"][0]
    assert first_page["unreadCount"] == 1
    assert notification["isRead"] is False

    updated = assert_success(
        manager.patch(f"/api/admin/notifications/{notification['id']}", json={"read": True})
    )
    assert updated["id"] == notification["id"]
    assert updated["isRead"] is True
    assert assert_success(manager.get("/api/admin/notifications"))["unreadCount"] == 0

    assert_error(
        other_manager.patch(f"/api/admin/notifications/{notification['id']}", json={"read": True}),
        404,
        "NOTIFICATION_NOT_FOUND",
    )
    assert (
        assert_success(other_manager.get("/api/admin/notifications"))["items"][0]["entityId"]
        == card["id"]
    )


def test_root_operations_metrics_exposes_notification_delivery_status(
    app: FastAPI,
) -> None:
    root = admin_client(
        app,
        asyncio.run(
            create_admin_actor(
                user_id="delivery_metrics_root",
                access_level="root",
                organization_id=None,
                assigned_artist_ids=[],
            )
        ),
    )

    async def seed_deliveries() -> None:
        async with SessionLocal() as session:
            notification = Notification(
                id="delivery_metrics_notification",
                user_id="delivery_metrics_root",
                kind="system",
                title="Delivery metrics",
                event_key="delivery-metrics:1",
            )
            session.add(notification)
            session.add_all(
                [
                    NotificationDelivery(
                        id="delivery_metrics_email_delivered",
                        notification_id=notification.id,
                        channel="email",
                        destination="fan@example.test",
                        idempotency_key="delivery-metrics:email:1",
                        status="delivered",
                    ),
                    NotificationDelivery(
                        id="delivery_metrics_push_retry",
                        notification_id=notification.id,
                        channel="push",
                        destination="fcm-token-metrics",
                        idempotency_key="delivery-metrics:push:1",
                        status="retry",
                    ),
                    NotificationDelivery(
                        id="delivery_metrics_push_dead",
                        notification_id=notification.id,
                        channel="push",
                        destination="fcm-token-dead",
                        idempotency_key="delivery-metrics:push:2",
                        status="dead_letter",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_deliveries())
    delivery = assert_success(root.get("/api/admin/card-operations/metrics"))[
        "notificationDelivery"
    ]
    assert delivery["email"]["delivered"] == 1
    assert delivery["push"]["retry"] == 1
    assert delivery["push"]["dead_letter"] == 1


def test_root_can_retry_failed_notification_delivery_without_exposing_destination(
    app: FastAPI,
    seeded: dict[str, object],
) -> None:
    root = admin_client(
        app,
        asyncio.run(
            create_admin_actor(
                user_id="delivery_retry_root",
                access_level="root",
                organization_id=None,
                assigned_artist_ids=[],
            )
        ),
    )

    async def seed_delivery() -> None:
        async with SessionLocal() as session:
            notification = Notification(
                id="delivery_retry_notification",
                user_id="delivery_retry_root",
                kind="system",
                title="Retry delivery",
                event_key="delivery-retry:1",
            )
            session.add(notification)
            session.add(
                NotificationDelivery(
                    id="delivery_retry_dead_letter",
                    notification_id=notification.id,
                    channel="email",
                    destination="private@example.test",
                    idempotency_key="delivery-retry:email:1",
                    status="dead_letter",
                    attempt_count=3,
                    last_error="provider unavailable",
                )
            )
            await session.commit()

    asyncio.run(seed_delivery())
    queue = assert_success(
        root.get("/api/admin/notification-deliveries?status=dead_letter&channel=email")
    )
    assert queue["items"][0]["id"] == "delivery_retry_dead_letter"
    assert "destination" not in queue["items"][0]
    assert queue["items"][0]["notification"]["title"] == "Retry delivery"
    response = assert_success(
        root.post("/api/admin/notification-deliveries/delivery_retry_dead_letter/retry")
    )
    assert response["id"] == "delivery_retry_dead_letter"
    assert response["status"] == "pending"
    assert response["attemptCount"] == 3
    assert "destination" not in response
