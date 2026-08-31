from datetime import UTC, datetime, timedelta
from io import BytesIO

from PIL import Image

from .conftest import assert_success


def _event_banner_png() -> bytes:
    image = Image.new("RGB", (1600, 800), (42, 36, 112))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def create_event_banner(actors):
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "event-banner.png",
                "contentType": "image/png",
                "purpose": "event_banner",
            },
        ),
        201,
    )
    uploaded = actors["artist"].put(
        asset["uploadUrl"], content=_event_banner_png(), headers={"Content-Type": "image/png"}
    )
    assert uploaded.status_code == 204, uploaded.text
    return asset["assetId"]


def test_event_application_is_idempotent_and_exposed_in_public_detail(actors, client, seeded):
    now = datetime.now(UTC)
    starts_at = (now - timedelta(days=1)).isoformat()
    ends_at = (now + timedelta(days=1)).isoformat()
    event_banner_id = create_event_banner(actors)
    catalog = assert_success(actors["fan"].get("/api/catalog/cards?sort=recommended"))
    related_card_id = catalog["items"][0]["id"]
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "artistId": None,
            "title": "드림스케이프 팬 사인회",
            "summary": "팬 사인회 신청",
            "description": "신청 이벤트",
            "heroAssetId": event_banner_id,
            "eventType": "announcement",
            "startsAt": starts_at,
            "endsAt": ends_at,
            "venue": "코엑스 컨퍼런스룸 (3F)",
            "participantLimit": 2,
            "applicationStartsAt": starts_at,
            "applicationEndsAt": ends_at,
            "noticeItems": [
                "신분증을 지참해 주세요.",
                "현장 운영 상황에 따라 일정이 변경될 수 있습니다.",
            ],
            "relatedCardIds": [related_card_id],
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    hidden_hero = client.get(f"/api/events/{event_id}/hero")
    assert hidden_hero.status_code == 404
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200

    public_hero = client.get(f"/api/events/{event_id}/hero")
    assert public_hero.status_code == 200
    assert public_hero.headers["cache-control"].startswith("public, max-age=")
    assert public_hero.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(public_hero.content)) as optimized_hero:
        assert optimized_hero.format == "WEBP"
        assert optimized_hero.size == (1200, 600)

    before = assert_success(actors["fan"].get(f"/api/events/{event_id}"))
    assert before["heroUrl"].endswith(f"/hero?asset={event_banner_id}")
    assert before["venue"] == "코엑스 컨퍼런스룸 (3F)"
    assert before["participantCount"] == 0
    assert before["applicationStatus"] == "available"
    assert before["applied"] is False
    assert before["description"] == "신청 이벤트"
    assert before["noticeItems"] == [
        "신분증을 지참해 주세요.",
        "현장 운영 상황에 따라 일정이 변경될 수 있습니다.",
    ]
    assert before["relatedCards"][0]["id"] == related_card_id

    first = assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"), 201)
    second = assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"))
    assert second["id"] == first["id"]

    after = assert_success(actors["fan"].get(f"/api/events/{event_id}"))
    assert after["participantCount"] == 1
    assert after["applicationStatus"] == "applied"
    assert after["applied"] is True


def test_fan_can_reload_submitted_event_applications_and_receive_confirmation_notification(
    actors, seeded
):
    now = datetime.now(UTC)
    event_banner_id = create_event_banner(actors)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "artistId": None,
            "title": "신청 내역 확인 이벤트",
            "summary": "신청 완료 상태를 다시 확인합니다.",
            "description": "신청 내역 테스트",
            "heroAssetId": event_banner_id,
            "eventType": "announcement",
            "startsAt": (now - timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "applicationStartsAt": (now - timedelta(hours=1)).isoformat(),
            "applicationEndsAt": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200

    applied = assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"), 201)
    applications = assert_success(actors["fan"].get("/api/me/event-applications"))
    item = next(item for item in applications["items"] if item["eventId"] == event_id)
    assert item["applicationId"] == applied["id"]
    assert item["status"] == "submitted"
    assert item["event"]["title"] == "신청 내역 확인 이벤트"

    notifications = assert_success(actors["fan"].get("/api/notifications"))
    confirmation = next(
        item for item in notifications["items"] if item["kind"] == "event_application_submitted"
    )
    assert confirmation["title"] == "이벤트 신청이 완료되었어요"
    assert confirmation["body"] == "신청 내역 확인 이벤트"


def test_event_application_deadline_notification_is_created_for_subscribers(actors):
    now = datetime.now(UTC)
    event_banner_id = create_event_banner(actors)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "artistId": None,
            "title": "마감 임박 알림 이벤트",
            "summary": "마감 임박 알림 테스트",
            "description": "신청자에게만 알림을 보냅니다.",
            "heroAssetId": event_banner_id,
            "eventType": "announcement",
            "startsAt": (now - timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "applicationStartsAt": (now - timedelta(hours=1)).isoformat(),
            "applicationEndsAt": (now + timedelta(hours=12)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200
    assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"), 201)

    assert_success(actors["fan"].get(f"/api/events/{event_id}"))
    notifications = assert_success(actors["fan"].get("/api/notifications"))
    reminder = next(
        item for item in notifications["items"] if item["kind"] == "event_application_deadline"
    )
    assert reminder["title"] == "이벤트 신청 마감이 임박했어요"
    assert reminder["body"] == "마감 임박 알림 이벤트"


def test_admin_can_list_applicants_and_draw_winners(actors):
    now = datetime.now(UTC)
    event_banner_id = create_event_banner(actors)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "artistId": None,
            "title": "추첨 검증 이벤트",
            "summary": "신청자 추첨 테스트",
            "description": "추첨 기능 테스트",
            "heroAssetId": event_banner_id,
            "eventType": "announcement",
            "startsAt": (now - timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "applicationStartsAt": (now - timedelta(hours=1)).isoformat(),
            "applicationEndsAt": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200
    assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"), 201)

    applicants = assert_success(actors["admin"].get(f"/api/admin/events/{event_id}/applications"))
    assert len(applicants["items"]) == 1
    assert applicants["items"][0]["status"] == "submitted"
    drawn = assert_success(
        actors["admin"].post(f"/api/admin/events/{event_id}/draw", json={"winnerCount": 1})
    )
    assert drawn["winnerCount"] == 1
    after = assert_success(actors["admin"].get(f"/api/admin/events/{event_id}/applications"))
    assert after["items"][0]["status"] == "winner"


def test_event_check_in_pass_is_scoped_and_single_use(actors):
    now = datetime.now(UTC)
    event_banner_id = create_event_banner(actors)
    created = actors["admin"].post(
        "/api/admin/events",
        json={
            "title": "현장 체크인 이벤트",
            "summary": "QR 체크인 테스트",
            "heroAssetId": event_banner_id,
            "eventType": "announcement",
            "startsAt": (now - timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(days=1)).isoformat(),
            "applicationStartsAt": (now - timedelta(hours=1)).isoformat(),
            "applicationEndsAt": (now + timedelta(hours=1)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["data"]["id"]
    assert actors["admin"].post(f"/api/admin/events/{event_id}/submit").status_code == 200
    assert (
        actors["admin"]
        .post(f"/api/admin/events/{event_id}/review", json={"decision": "approve"})
        .status_code
        == 200
    )
    assert actors["admin"].post(f"/api/admin/events/{event_id}/publish").status_code == 200

    application = assert_success(actors["fan"].post(f"/api/events/{event_id}/applications"), 201)
    pass_data = assert_success(
        actors["fan"].get(f"/api/me/event-applications/{application['id']}/check-in-pass")
    )
    assert pass_data["eventId"] == event_id
    assert pass_data["token"]
    assert "email" not in pass_data["token"]

    checked_in = assert_success(
        actors["admin"].post(
            f"/api/admin/events/{event_id}/check-in", json={"token": pass_data["token"]}
        )
    )
    assert checked_in["checkedIn"] is True
    assert checked_in["alreadyCheckedIn"] is False

    repeated = assert_success(
        actors["admin"].post(
            f"/api/admin/events/{event_id}/check-in", json={"token": pass_data["token"]}
        )
    )
    assert repeated["checkedIn"] is True
    assert repeated["alreadyCheckedIn"] is True
    applicants = assert_success(actors["admin"].get(f"/api/admin/events/{event_id}/applications"))
    assert applicants["items"][0]["checkedInAt"]
