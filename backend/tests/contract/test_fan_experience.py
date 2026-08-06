from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_authenticated_fan_can_read_current_user_state(actors: dict[str, TestClient]) -> None:
    me = assert_success(actors["fan"].get("/api/me"))

    assert me["id"] == "fan"
    assert me["email"] == "fan@example.com"
    assert me["role"] == "fan"
    assert me["onboardingCompleted"] is False


def test_authenticated_fan_can_complete_onboarding(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    profile = assert_success(
        fan.patch(
            "/api/me/profile",
            json={
                "nickname": "별빛팬",
                "favoriteArtistIds": ["artist_nova3"],
                "favoriteMemberIds": ["member_yuna"],
            },
        )
    )

    assert profile["nickname"] == "별빛팬"
    assert profile["onboardingCompleted"] is True


def test_onboarding_rejects_an_unknown_member(
    actors: dict[str, TestClient],
) -> None:
    response = actors["fan"].patch(
        "/api/me/profile",
        json={
            "nickname": "별빛팬",
            "favoriteArtistIds": ["artist_nova3"],
            "favoriteMemberIds": ["member_unknown"],
        },
    )
    assert_error(response, 422, "INVALID_FAVORITE_MEMBER")


def test_fan_can_read_and_update_notification_email_preferences(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    current = assert_success(fan.get("/api/me/notification-preferences"))
    assert current == {"emailEnabled": False}

    updated = assert_success(
        fan.patch("/api/me/notification-preferences", json={"emailEnabled": True})
    )
    assert updated == {"emailEnabled": True}
    assert assert_success(fan.get("/api/me/notification-preferences")) == {"emailEnabled": True}

    other_fan = actors["otherFan"]
    assert assert_success(other_fan.get("/api/me/notification-preferences")) == {
        "emailEnabled": False
    }


def test_card_detail_is_available_only_to_its_owner(
    app: Any, actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    redeemed = assert_success(
        fan.post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}), 201
    )

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["isOfficial"] is True
    assert detail["card"]["imageUrl"] == "/src/assets/hero.png"
    assert detail["card"]["artistName"] == "드림스케이프"
    assert detail["card"]["memberName"] == "유나"
    assert detail["card"]["seasonName"] == "2026 SPRING"
    assert detail["card"]["rarity"] == "Special"
    assert detail["card"]["signatureText"] == "오늘 와줘서 고마워"
    assert detail["card"]["status"] == "published"
    assert detail["card"]["issueLimit"] == 500
    assert detail["acquiredAt"]
    assert detail["serialNumber"] == 1
    assert detail["acquisitionSource"] == "qr"
    assert detail["drop"] == {"name": "NOVA-3 Comeback Live Drop"}
    assert detail["redeemCode"] is None
    assert detail["futureBenefitPreview"]

    other_fan = TestClient(app)
    other_fan.cookies.set("fanfolio_session", seeded["sessions"]["otherFan"])
    assert_error(
        other_fan.get(f"/api/me/cards/{redeemed['userCardId']}"), 404, "USER_CARD_NOT_FOUND"
    )


def test_collection_benefit_unlocks_when_a_catalog_set_is_complete(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    before = assert_success(fan.get("/api/me/collection/benefits"))
    assert before["items"] == [
        {
            "artistId": "artist_nova3",
            "artistName": "드림스케이프",
            "seasonName": "2026 SPRING",
            "requiredCount": 1,
            "ownedCount": 0,
            "completionRate": 0,
            "status": "locked",
            "claimed": False,
            "claimedAt": None,
            "claimable": False,
            "downloadUrl": None,
            "benefit": {
                "type": "digital_bonus",
                "title": "드림스케이프 2026 SPRING 완성 특전",
                "description": "컬렉션을 완성하면 디지털 특전이 해금됩니다.",
            },
        }
    ]

    assert_success(
        fan.post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}),
        201,
    )
    after = assert_success(fan.get("/api/me/collection/benefits"))
    assert after["items"][0]["ownedCount"] == 1
    assert after["items"][0]["status"] == "unlocked"


def test_collection_benefits_use_active_admin_campaign_rules(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["admin"].post(
            "/api/admin/collection-campaigns",
            json={
                "name": "운영자 지정 캠페인",
                "artistId": "artist_nova3",
                "requiredCardIds": ["card_published"],
                "benefitTitle": "운영자 지정 특전",
                "benefitDescription": "운영자가 지정한 특전입니다.",
            },
        ),
        201,
    )
    benefits = assert_success(actors["fan"].get("/api/me/collection/benefits"))
    assert benefits["items"] == [
        {
            "campaignId": created["id"],
            "artistId": "artist_nova3",
            "artistName": "드림스케이프",
            "seasonName": "기본 컬렉션",
            "requiredCount": 1,
            "ownedCount": 0,
            "completionRate": 0,
            "status": "locked",
            "claimed": False,
            "claimedAt": None,
            "claimable": False,
            "downloadUrl": None,
            "benefit": {
                "type": "digital_bonus",
                "title": "운영자 지정 특전",
                "description": "운영자가 지정한 특전입니다.",
            },
        }
    ]


def test_fan_can_claim_a_completed_collection_benefit_once(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "special-bonus.pdf",
                "contentType": "application/pdf",
                "purpose": "collection_benefit",
            },
        ),
        201,
    )
    uploaded = actors["admin"].put(asset["uploadUrl"], content=b"fanfolio bonus")
    assert uploaded.status_code == 204, uploaded.text
    campaign = assert_success(
        actors["admin"].post(
            "/api/admin/collection-campaigns",
            json={
                "name": "완성 특전 지급 캠페인",
                "artistId": "artist_nova3",
                "requiredCardIds": ["card_published"],
                "benefitTitle": "디지털 사인 포토",
                "benefitDescription": "아티스트의 특별 메시지입니다.",
                "benefitAssetId": asset["assetId"],
            },
        ),
        201,
    )
    path = f"/api/me/collection/benefits/{campaign['id']}/claim"
    assert_error(actors["fan"].post(path), 409, "BENEFIT_NOT_UNLOCKED")
    assert_error(
        actors["fan"].get(f"/api/me/collection/benefits/{campaign['id']}/download"),
        403,
        "BENEFIT_NOT_CLAIMED",
    )

    assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )
    claim = assert_success(actors["fan"].post(path), 201)
    assert claim["campaignId"] == campaign["id"]
    assert claim["claimId"].startswith("claim_")
    assert claim["benefit"]["title"] == "디지털 사인 포토"
    assert claim["claimedAt"]
    assert claim["downloadUrl"] == f"/api/me/collection/benefits/{campaign['id']}/download"
    download = actors["fan"].get(claim["downloadUrl"])
    assert download.status_code == 200
    assert download.content == b"fanfolio bonus"
    assert_error(actors["fan"].post(path), 409, "BENEFIT_ALREADY_CLAIMED")

    item = assert_success(actors["fan"].get("/api/me/collection/benefits"))["items"][0]
    assert item["claimed"] is True
    assert item["claimable"] is False
    assert item["claimedAt"] == claim["claimedAt"]


def test_owned_card_detail_exposes_handwriting_and_voice_entitlements(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    admin = actors["admin"]
    fan = actors["fan"]
    handwriting = artist.put(
        f"/api/uploads/{seeded['ids']['handwritingAssetId']}/content", content=b"handwriting"
    )
    assert handwriting.status_code == 204, handwriting.text
    voice_asset = assert_success(
        artist.post(
            "/api/uploads/presign",
            json={"fileName": "voice.mp3", "contentType": "audio/mpeg", "purpose": "voice"},
        ),
        201,
    )
    voice = artist.put(voice_asset["uploadUrl"], content=b"voice")
    assert voice.status_code == 204, voice.text

    card = assert_success(
        admin.post(
            "/api/admin/cards",
            json={
                "name": "손글씨 보이스 카드",
                "memberId": "member_yuna",
                "ownerArtistId": "artist",
                "handwritingAssetId": seeded["ids"]["handwritingAssetId"],
                "voiceAssetId": voice_asset["assetId"],
                "hasVoice": True,
            },
        ),
        201,
    )
    assert_success(admin.post(f"/api/admin/cards/{card['id']}/publish"))
    batch = assert_success(
        admin.post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": "drop_live",
                "cardId": card["id"],
                "quantity": 1,
                "maxUsesPerCode": 1,
                "expiresAt": "2030-12-31T23:59:59Z",
                "prefix": "DETAIL",
            },
        ),
        201,
    )
    exported = admin.get(batch["csvExportUrl"])
    assert exported.status_code == 200, exported.text
    code = exported.text.splitlines()[1].split(",")[0].strip('"')

    redeemed = assert_success(
        fan.post("/api/redemptions", json={"code": code, "source": "qr"}), 201
    )
    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))

    assert detail["card"]["hasVoice"] is True
    handwriting_url = detail["card"]["handwritingImageUrl"]
    assert handwriting_url == f"/api/me/cards/{redeemed['userCardId']}/handwriting"
    image = fan.get(handwriting_url)
    assert image.status_code == 200
    assert image.content == b"handwriting"
    voice_url = detail["card"]["voiceAudioUrl"]
    assert voice_url == f"/api/me/cards/{redeemed['userCardId']}/voice"
    audio = fan.get(voice_url)
    assert audio.status_code == 200
    assert audio.content == b"voice"


def test_catalog_returns_only_published_cards_to_fans(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"artistId": "artist_nova3"})
    )

    assert all(card["status"] == "published" for card in catalog["items"])
    assert all(card["isOfficial"] is True for card in catalog["items"])
    assert catalog["items"][0]["imageUrl"] == "/src/assets/hero.png"


@pytest.mark.parametrize("query", ["드림스케이프", "유나"])
def test_catalog_search_matches_artist_and_member_names(
    actors: dict[str, TestClient], query: str
) -> None:
    catalog = assert_success(actors["fan"].get("/api/catalog/cards", params={"q": query}))

    assert catalog["items"]
    assert catalog["items"][0]["artistName"] == "드림스케이프"
    assert catalog["items"][0]["memberName"] == "유나"


def test_collection_returns_live_summary_and_card_metadata(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    collection = assert_success(actors["fan"].get("/api/me/collection"))
    assert collection["summary"] == {
        "ownedCount": 1,
        "totalSlots": 9,
        "completionRate": 11,
    }
    assert collection["cards"] == [
        {
            "userCardId": redeemed["userCardId"],
            "cardId": "card_published",
            "name": "컴백 기념 사인 카드",
            "imageUrl": "/src/assets/hero.png",
            "isOfficial": True,
            "artistId": "artist_nova3",
            "artistName": "드림스케이프",
            "memberId": "member_yuna",
            "memberName": "유나",
            "serialNumber": 1,
            "acquiredAt": collection["cards"][0]["acquiredAt"],
        }
    ]


def test_fan_can_load_an_artist_uploaded_image_for_a_published_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    uploaded_bytes = b"test-card-image"
    upload = assert_success(
        artist.post(
            "/api/uploads/presign",
            json={"fileName": "card.png", "contentType": "image/png", "purpose": "card"},
        ),
        201,
    )
    uploaded = artist.put(upload["uploadUrl"], content=uploaded_bytes)
    assert uploaded.status_code == 204, uploaded.text

    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "이미지 경로 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": upload["assetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(actors["admin"].post(f"/api/admin/cards/{draft['id']}/publish"))

    image = actors["fan"].get(f"/api/cards/{draft['id']}/image")
    assert image.status_code == 200, image.text
    assert image.headers["content-type"].startswith("image/png")
    assert image.content == uploaded_bytes


def test_catalog_supports_search_and_pagination(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"q": "사인", "page": 1, "pageSize": 1})
    )

    assert len(catalog["items"]) == 1
    assert catalog["items"][0]["name"] == "컴백 기념 사인 카드"
    assert catalog["meta"]["pagination"] == {"page": 1, "pageSize": 1, "total": 1}


def test_catalog_exposes_published_artists_and_members(
    actors: dict[str, TestClient],
) -> None:
    artists = assert_success(actors["fan"].get("/api/catalog/artists"))
    assert artists["items"] == [
        {"id": "artist_nova3", "name": "드림스케이프", "imageUrl": "/src/assets/hero.png"}
    ]

    members = assert_success(
        actors["fan"].get("/api/catalog/members", params={"artistId": "artist_nova3"})
    )
    assert {member["id"] for member in members["items"]} == {
        "member_jei",
        "member_minho",
        "member_yuna",
    }


def test_catalog_can_filter_cards_by_artist_and_member(
    actors: dict[str, TestClient],
) -> None:
    filtered = assert_success(
        actors["fan"].get(
            "/api/catalog/cards",
            params={"artistId": "artist_nova3", "memberId": "member_yuna"},
        )
    )
    assert filtered["meta"]["pagination"]["total"] == 1
    assert filtered["items"][0]["memberId"] == "member_yuna"
    assert filtered["items"][0]["memberName"] == "유나"


def test_catalog_recommends_favorite_members_and_supports_explicit_sorting(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["admin"].post(
            "/api/admin/cards",
            json={
                "name": "민호 정렬 테스트 카드",
                "artistId": "artist_nova3",
                "memberId": "member_minho",
                "rarity": "N",
            },
        ),
        201,
    )
    assert_success(actors["admin"].post(f"/api/admin/cards/{created['id']}/publish"))
    assert_success(
        actors["fan"].patch(
            "/api/me/profile",
            json={
                "nickname": "추천 테스트 팬",
                "favoriteArtistIds": ["artist_nova3"],
                "favoriteMemberIds": ["member_yuna"],
            },
        )
    )

    recommended = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"sort": "recommended"})
    )
    assert recommended["meta"]["sort"] == "recommended"
    assert recommended["items"][0]["memberId"] == "member_yuna"

    name_sorted = assert_success(actors["fan"].get("/api/catalog/cards", params={"sort": "name"}))
    assert name_sorted["meta"]["sort"] == "name"
    assert [item["name"] for item in name_sorted["items"]] == sorted(
        item["name"] for item in name_sorted["items"]
    )


def test_notifications_can_be_marked_as_read(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    notifications = assert_success(fan.get("/api/notifications"))
    notification_id = notifications["items"][0]["id"]

    updated = assert_success(
        fan.patch(f"/api/notifications/{notification_id}", json={"read": True})
    )
    assert updated["readAt"] is not None


def test_fan_can_read_unread_count_and_mark_all_notifications_as_read(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    count = assert_success(fan.get("/api/notifications/unread-count"))
    assert count["unreadCount"] == 1

    cleared = assert_success(fan.post("/api/notifications/read-all"))
    assert cleared["updatedCount"] == 1

    count = assert_success(fan.get("/api/notifications/unread-count"))
    assert count["unreadCount"] == 0


def test_legacy_patch_read_all_notifications_remains_compatible(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]

    response = fan.patch("/api/notifications/read-all")

    assert response.status_code == 200


@pytest.mark.anyio
async def test_fan_can_receive_notifications_over_an_sse_stream(
    seeded: dict[str, Any],
) -> None:
    from app.db.session import SessionLocal
    from app.models import User
    from app.routers.fan import notification_stream

    async with SessionLocal() as session:
        user = await session.get(User, "fan")
        assert user is not None
        response = await notification_stream(user, session)
        first_event = await response.body_iterator.__anext__()
        await response.body_iterator.aclose()

    assert "event: notification" in first_event
    assert '"id": "notification_1"' in first_event
