import asyncio
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Asset, Card, Drop
from app.storage import configured_asset_storage
from tests.conftest import assert_error, assert_success
from tests.contract.test_card_release_workflow import create_partner_client, create_platform_client


def _redeem_card_via_batch(
    admin: TestClient, fan: TestClient, *, card_id: str, prefix: str
) -> dict[str, Any]:
    batch = assert_success(
        admin.post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": "drop_live",
                "cardId": card_id,
                "quantity": 1,
                "maxUsesPerCode": 1,
                "expiresAt": "2030-12-31T23:59:59Z",
                "prefix": prefix,
            },
        ),
        201,
    )
    exported = admin.get(batch["csvExportUrl"])
    assert exported.status_code == 200, exported.text
    code = exported.text.splitlines()[1].split(",")[0].strip('"')
    return assert_success(fan.post("/api/redemptions", json={"code": code, "source": "qr"}), 201)


def _upload_asset(
    actor: TestClient,
    *,
    file_name: str,
    content_type: str,
    purpose: str,
    content: bytes,
) -> dict[str, Any]:
    asset = assert_success(
        actor.post(
            "/api/uploads/presign",
            json={"fileName": file_name, "contentType": content_type, "purpose": purpose},
        ),
        201,
    )
    uploaded = actor.put(asset["uploadUrl"], content=content)
    assert uploaded.status_code == 204, uploaded.text
    return asset


def _force_card_lenticular_asset(card_id: str, asset_id: str) -> None:
    async def update_card() -> None:
        async with SessionLocal() as session:
            card = await session.get(Card, card_id)
            assert card is not None
            card.design_config = {
                "version": 3,
                "front": {"interaction": "lenticular", "lenticularAssetId": asset_id},
            }
            await session.commit()

    asyncio.run(update_card())


def _delete_asset_storage_object(asset_id: str) -> None:
    async def delete_object() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            path = asset.processed_storage_path or asset.storage_path
            assert path is not None
            configured_asset_storage().delete(path)

    asyncio.run(delete_object())


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
    app: Any, actors: dict[str, TestClient], seeded: dict[str, Any]
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
    assert claim["downloadUrl"].startswith(
        f"/api/me/collection/benefits/{campaign['id']}/download?token="
    )
    download = actors["fan"].get(claim["downloadUrl"])
    assert download.status_code == 200
    assert download.content == b"fanfolio bonus"
    signed_link_client = TestClient(app)
    anonymous_download = signed_link_client.get(claim["downloadUrl"])
    assert anonymous_download.status_code == 200
    assert anonymous_download.content == b"fanfolio bonus"
    assert_error(
        signed_link_client.get(claim["downloadUrl"] + "-tampered"),
        401,
        "SIGNED_URL_INVALID",
    )
    logs = assert_success(actors["admin"].get("/api/admin/audit-logs"))
    download_log = next(
        item for item in logs["items"] if item["action"] == "collection_benefit.downloaded"
    )
    assert download_log["entityId"] == campaign["id"]
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
    lenticular_asset = assert_success(
        artist.post(
            "/api/uploads/presign",
            json={
                "fileName": "alternate-card.png",
                "contentType": "image/webp",
                "purpose": "card",
            },
        ),
        201,
    )
    lenticular = artist.put(lenticular_asset["uploadUrl"], content=b"alternate-card-image")
    assert lenticular.status_code == 204, lenticular.text

    card = assert_success(
        admin.post(
            "/api/admin/cards",
            json={
                "name": "손글씨 보이스 카드",
                "memberId": "member_yuna",
                "handwritingAssetId": seeded["ids"]["handwritingAssetId"],
                "voiceAssetId": voice_asset["assetId"],
                "designConfig": {
                    "version": 3,
                    "front": {
                        "effect": "holographic",
                        "effectIntensity": 0.82,
                        "interaction": "lenticular",
                        "lenticularAssetId": lenticular_asset["assetId"],
                    },
                },
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
    assert detail["card"]["designConfig"]["front"]["effect"] == "holographic"
    handwriting_url = detail["card"]["handwritingImageUrl"]
    assert handwriting_url == f"/api/me/cards/{redeemed['userCardId']}/handwriting?client=fan"
    image = fan.get(handwriting_url)
    assert image.status_code == 200
    assert image.content == b"handwriting"
    voice_url = detail["card"]["voiceAudioUrl"]
    assert voice_url == f"/api/me/cards/{redeemed['userCardId']}/voice?client=fan"
    audio = fan.get(voice_url)
    assert audio.status_code == 200
    assert audio.content == b"voice"
    lenticular_url = detail["card"]["lenticularImageUrl"]
    assert lenticular_url == f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"
    alternate = fan.get(lenticular_url)
    assert alternate.status_code == 200
    assert alternate.content == b"alternate-card-image"
    assert_error(actors["otherFan"].get(lenticular_url), 404, "LENTICULAR_NOT_FOUND")


def test_owned_card_lenticular_route_returns_not_found_without_design_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    detail = assert_success(actors["fan"].get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["lenticularImageUrl"] is None
    assert_error(
        actors["fan"].get(f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"),
        404,
        "LENTICULAR_NOT_FOUND",
    )


def test_owned_card_lenticular_route_returns_not_ready_until_asset_upload_finishes(
    actors: dict[str, TestClient],
) -> None:
    artist = actors["artist"]
    admin = actors["admin"]
    fan = actors["fan"]
    lenticular_asset = assert_success(
        artist.post(
            "/api/uploads/presign",
            json={
                "fileName": "pending-alternate-card.png",
                "contentType": "image/webp",
                "purpose": "card",
            },
        ),
        201,
    )
    card = assert_success(
        admin.post(
            "/api/admin/cards",
            json={"name": "준비 중인 렌티큘러 카드", "memberId": "member_yuna"},
        ),
        201,
    )
    _force_card_lenticular_asset(card["id"], lenticular_asset["assetId"])
    assert_success(admin.post(f"/api/admin/cards/{card['id']}/publish"))
    redeemed = _redeem_card_via_batch(admin, fan, card_id=card["id"], prefix="PENDING")

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["lenticularImageUrl"] is None
    assert_error(
        fan.get(f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"),
        404,
        "LENTICULAR_NOT_READY",
    )


def test_owned_card_lenticular_route_ignores_legacy_non_card_image_asset(
    actors: dict[str, TestClient],
) -> None:
    artist = actors["artist"]
    admin = actors["admin"]
    fan = actors["fan"]
    voice_asset = _upload_asset(
        artist,
        file_name="legacy-lenticular-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )
    card = assert_success(admin.post("/api/admin/cards", json={"name": "레거시 음성 카드"}), 201)
    _force_card_lenticular_asset(card["id"], voice_asset["assetId"])
    assert_success(admin.post(f"/api/admin/cards/{card['id']}/publish"))
    redeemed = _redeem_card_via_batch(admin, fan, card_id=card["id"], prefix="LEGACYVOICE")

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["lenticularImageUrl"] is None
    assert_error(
        fan.get(f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"),
        404,
        "LENTICULAR_NOT_FOUND",
    )


def test_owned_card_lenticular_route_returns_not_ready_when_storage_object_is_missing(
    actors: dict[str, TestClient],
) -> None:
    artist = actors["artist"]
    admin = actors["admin"]
    fan = actors["fan"]
    lenticular_asset = _upload_asset(
        artist,
        file_name="deleted-lenticular.webp",
        content_type="image/webp",
        purpose="card",
        content=b"alternate-card-image",
    )
    card = assert_success(admin.post("/api/admin/cards", json={"name": "삭제된 이미지 카드"}), 201)
    _force_card_lenticular_asset(card["id"], lenticular_asset["assetId"])
    assert_success(admin.post(f"/api/admin/cards/{card['id']}/publish"))
    redeemed = _redeem_card_via_batch(admin, fan, card_id=card["id"], prefix="MISSINGIMG")
    _delete_asset_storage_object(lenticular_asset["assetId"])

    detail = assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))
    assert detail["card"]["lenticularImageUrl"] is None
    assert_error(
        fan.get(f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"),
        404,
        "LENTICULAR_NOT_READY",
    )


def test_catalog_returns_only_published_cards_to_fans(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(
        actors["fan"].get("/api/catalog/cards", params={"artistId": "artist_nova3"})
    )

    assert all(card["status"] == "published" for card in catalog["items"])
    assert all(card["isOfficial"] is True for card in catalog["items"])
    assert catalog["items"][0]["imageUrl"] == "/src/assets/hero.png"


def test_catalog_hides_new_studio_cards_until_their_linked_drop_is_live(
    actors: dict[str, TestClient],
) -> None:
    async def seed_release_states() -> None:
        async with SessionLocal() as session:
            session.add_all(
                [
                    Drop(id="drop_release_draft", name="대기 드롭", status="draft"),
                    Drop(id="drop_release_live", name="공개 드롭", status="live"),
                    Card(
                        id="card_release_hidden",
                        name="비공개 스튜디오 카드",
                        status="published",
                        release_status="published",
                        review_version=1,
                        owner_artist_id="artist",
                        drop_id="drop_release_draft",
                    ),
                    Card(
                        id="card_release_live",
                        name="공개 스튜디오 카드",
                        status="published",
                        release_status="published",
                        review_version=1,
                        owner_artist_id="artist",
                        drop_id="drop_release_live",
                    ),
                    Card(
                        id="card_release_legacy",
                        name="기존 공개 카드",
                        status="published",
                        review_version=0,
                        owner_artist_id="artist",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_release_states())
    items = assert_success(actors["fan"].get("/api/catalog/cards"))["items"]
    ids = {item["id"] for item in items}
    assert "card_release_hidden" not in ids
    assert {"card_release_live", "card_release_legacy"} <= ids


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
    app: FastAPI, actors: dict[str, TestClient], seeded: dict[str, Any]
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
                "artistId": "artist_nova3",
                "memberId": "member_yuna",
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(artist.post(f"/api/artist/cards/{draft['id']}/submit-review"))
    partner = create_partner_client(app)
    platform = create_platform_client(app)
    assert_success(
        partner.post(
            f"/api/admin/cards/{draft['id']}/review/partner", json={"decision": "approved"}
        )
    )
    assert_success(
        platform.post(
            f"/api/admin/cards/{draft['id']}/review/platform", json={"decision": "approved"}
        )
    )
    drop = assert_success(
        partner.post(
            "/api/admin/drops", json={"name": "이미지 공개 드롭", "artistId": "artist_nova3"}
        ),
        201,
    )
    assert_success(
        partner.post(f"/api/admin/drops/{drop['id']}/cards", json={"cardId": draft["id"]})
    )
    # Partner-owned drops are published by the partner administrator. The
    # root administrator reviews the card, but does not publish the partner's
    # release on their behalf.
    assert_success(partner.patch(f"/api/admin/drops/{drop['id']}/status", json={"status": "live"}))

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
    redeemed = fan.post("/api/redemptions", json={"code": "NOVA-VALID-01", "source": "manual"})
    assert redeemed.status_code == 201, redeemed.text
    notifications = assert_success(fan.get("/api/notifications"))
    assert notifications["items"][0]["kind"] == "card_redeemed"
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
