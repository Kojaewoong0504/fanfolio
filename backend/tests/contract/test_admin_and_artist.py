import asyncio
from io import BytesIO
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.db.session import SessionLocal
from app.models import Artist, Asset, Card, Member, Role, Session, User
from app.routers import artist as artist_router
from app.spatial_scene import PhotoAnalysisBundle, SpatialSceneBundle
from app.storage import configured_asset_storage
from tests.conftest import assert_error, assert_success


def _upload_artist_asset(
    artist: TestClient,
    *,
    file_name: str,
    content_type: str,
    purpose: str,
    content: bytes,
) -> dict[str, Any]:
    asset = assert_success(
        artist.post(
            "/api/uploads/presign",
            json={
                "fileName": file_name,
                "contentType": content_type,
                "purpose": purpose,
            },
        ),
        201,
    )
    uploaded = artist.put(asset["uploadUrl"], content=content)
    assert uploaded.status_code == 204, uploaded.text
    return asset


def _presign_artist_asset(
    artist: TestClient,
    *,
    file_name: str,
    content_type: str,
    purpose: str,
) -> dict[str, Any]:
    return assert_success(
        artist.post(
            "/api/uploads/presign",
            json={
                "fileName": file_name,
                "contentType": content_type,
                "purpose": purpose,
            },
        ),
        201,
    )


def _force_card_lenticular_front(card_id: str, front: dict[str, Any]) -> None:
    async def update_card() -> None:
        async with SessionLocal() as session:
            card = await session.get(Card, card_id)
            assert card is not None
            card.design_config = {"version": 3, "front": front}
            await session.commit()

    asyncio.run(update_card())


def _clear_asset_storage_path(asset_id: str) -> None:
    async def clear_path() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            asset.storage_path = None
            asset.processed_storage_path = None
            await session.commit()

    asyncio.run(clear_path())


def _delete_asset_storage_object(asset_id: str) -> None:
    async def delete_object() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            path = asset.processed_storage_path or asset.storage_path
            assert path is not None
            configured_asset_storage().delete(path)

    asyncio.run(delete_object())


def _png_bytes(mode: str, size: tuple[int, int], color: int | tuple[int, ...]) -> bytes:
    image = Image.new(mode, size, color)
    image.save(buffer := BytesIO(), format="PNG")
    return buffer.getvalue()


def _set_asset_transform(asset_id: str, transform: dict[str, Any]) -> None:
    async def update_asset() -> None:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            asset.transform = transform
            await session.commit()

    asyncio.run(update_asset())


def _other_artist_client(app_client: TestClient) -> TestClient:
    async def create_artist() -> None:
        async with SessionLocal() as session:
            if await session.get(User, "artist_other_owner") is None:
                session.add(
                    User(
                        id="artist_other_owner",
                        email="artist-other-owner@example.test",
                        role=Role.ARTIST,
                    )
                )
            if await session.get(Session, "test-session-artist-other-owner") is None:
                session.add(
                    Session(
                        token="test-session-artist-other-owner",
                        user_id="artist_other_owner",
                    )
                )
            await session.commit()

    asyncio.run(create_artist())
    client = TestClient(app_client.app)
    client.cookies.set("fanfolio_session", "test-session-artist-other-owner")
    return client


def _create_artist_draft(
    artist: TestClient, seeded: dict[str, Any], *, name: str
) -> dict[str, Any]:
    return assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": name,
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )


def test_fan_cannot_access_admin_dashboard(actors: dict[str, TestClient]) -> None:
    assert_error(actors["fan"].get("/api/admin/dashboard"), 403, "FORBIDDEN")


def test_admin_can_create_a_one_time_redeem_code_batch(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    batch = assert_success(
        actors["admin"].post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": seeded["ids"]["liveDropId"],
                "cardId": seeded["ids"]["publishedCardId"],
                "quantity": 3,
                "maxUsesPerCode": 1,
                "expiresAt": "2026-12-31T23:59:59Z",
                "prefix": "NOVA-TEST",
            },
        ),
        201,
    )

    assert batch["quantity"] == 3
    assert batch["maxUsesPerCode"] == 1
    assert batch["csvExportUrl"].startswith("/api/admin/redeem-code-batches/")


def test_artist_can_submit_special_card_for_review_but_not_publish_it(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    voice_asset = _upload_artist_asset(
        artist,
        file_name="review-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "컴백 기념 사인 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "signatureText": "우리 팬들 사랑해요.",
                "voiceAssetId": voice_asset["assetId"],
                "hasVoice": True,
                "issueLimit": 3000,
            },
        ),
        201,
    )
    assert draft["status"] == "draft"
    assert draft["signatureText"] == "우리 팬들 사랑해요."
    assert draft["hasVoice"] is True
    assert draft["artistId"] is None

    catalog_draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "카탈로그 연결 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "artistId": "artist_nova3",
                "memberId": "member_yuna",
                "issueLimit": 1,
            },
        ),
        201,
    )
    assert catalog_draft["artistId"] == "artist_nova3"

    cards = assert_success(artist.get("/api/artist/cards"))
    assert any(card["id"] == draft["id"] for card in cards["items"])

    submitted = assert_success(artist.post(f"/api/artist/cards/{draft['id']}/submit-review"))
    assert submitted["status"] == "pending_review"

    assert_error(artist.post(f"/api/admin/cards/{draft['id']}/publish"), 403, "FORBIDDEN")


def test_artist_card_rejects_creative_layers_owned_by_another_account(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    admin_asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "foreign-sticker.png",
                "contentType": "image/png",
                "purpose": "handwriting",
            },
        ),
        201,
    )

    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "레이어 소유권 확인 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "designConfig": {
                "creativeLayers": [
                    {
                        "id": "foreign-layer",
                        "type": "sticker",
                        "side": "front",
                        "assetId": admin_asset["assetId"],
                    }
                ]
            },
            "issueLimit": 100,
        },
    )

    assert_error(response, 404, "ASSET_NOT_FOUND")


def test_artist_cannot_attach_another_accounts_lenticular_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    admin_asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "admin-lenticular.png",
                "contentType": "image/png",
                "purpose": "card",
            },
        ),
        201,
    )
    uploaded = actors["admin"].put(admin_asset["uploadUrl"], content=b"admin-card-image")
    assert uploaded.status_code == 204, uploaded.text

    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "렌티큘러 소유권 확인 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": admin_asset["assetId"],
                },
            },
            "issueLimit": 100,
        },
    )

    assert_error(response, 404, "ASSET_NOT_FOUND")


@pytest.mark.parametrize("lenticular_asset_id", ["", 123])
def test_artist_card_rejects_malformed_lenticular_asset_id(
    actors: dict[str, TestClient], seeded: dict[str, Any], lenticular_asset_id: Any
) -> None:
    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "렌티큘러 형식 확인 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": lenticular_asset_id,
                },
            },
            "issueLimit": 100,
        },
    )

    assert_error(response, 422, "INVALID_LENTICULAR_ASSET")


def test_artist_card_rejects_owned_voice_asset_as_lenticular_image(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    voice_asset = _upload_artist_asset(
        actors["artist"],
        file_name="lenticular-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )

    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "렌티큘러 음성 차단 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": voice_asset["assetId"],
                },
            },
            "issueLimit": 100,
        },
    )

    assert_error(response, 422, "INVALID_LENTICULAR_ASSET")


@pytest.mark.parametrize("lenticular_asset_id", ["", 123])
def test_artist_card_update_rejects_malformed_lenticular_asset_id(
    actors: dict[str, TestClient], seeded: dict[str, Any], lenticular_asset_id: Any
) -> None:
    artist = actors["artist"]
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "렌티큘러 수정 확인 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )

    response = artist.patch(
        f"/api/artist/cards/{draft['id']}",
        json={
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": lenticular_asset_id,
                },
            },
        },
    )

    assert_error(response, 422, "INVALID_LENTICULAR_ASSET")


def test_artist_card_update_rejects_owned_voice_asset_as_lenticular_image(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    voice_asset = _upload_artist_asset(
        artist,
        file_name="update-lenticular-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "렌티큘러 수정 음성 차단 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )

    response = artist.patch(
        f"/api/artist/cards/{draft['id']}",
        json={
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": voice_asset["assetId"],
                },
            },
        },
    )

    assert_error(response, 422, "INVALID_LENTICULAR_ASSET")


def test_artist_review_rejects_enabled_voice_without_an_uploaded_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "보이스 누락 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "hasVoice": True,
                "issueLimit": 3000,
            },
        ),
        201,
    )

    response = artist.post(
        f"/api/artist/cards/{draft['id']}/submit-review",
        json={"reviewNote": "컴백 주간에 맞춰 공개해 주세요."},
    )

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_lenticular_without_asset_id(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 자산 누락 카드")
    _force_card_lenticular_front(draft["id"], {"interaction": "lenticular"})

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_lenticular_asset_without_storage_path(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    lenticular_asset = _presign_artist_asset(
        artist,
        file_name="not-uploaded-lenticular.webp",
        content_type="image/webp",
        purpose="card",
    )
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 업로드 누락 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": lenticular_asset["assetId"]},
    )

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_lenticular_asset_after_storage_path_is_cleared(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    lenticular_asset = _upload_artist_asset(
        artist,
        file_name="cleared-lenticular.webp",
        content_type="image/webp",
        purpose="card",
        content=b"lenticular-card-image",
    )
    _clear_asset_storage_path(lenticular_asset["assetId"])
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 경로 삭제 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": lenticular_asset["assetId"]},
    )

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_lenticular_asset_when_storage_object_is_missing(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    lenticular_asset = _upload_artist_asset(
        artist,
        file_name="deleted-lenticular.webp",
        content_type="image/webp",
        purpose="card",
        content=b"lenticular-card-image",
    )
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 객체 삭제 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": lenticular_asset["assetId"]},
    )
    _delete_asset_storage_object(lenticular_asset["assetId"])

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_foreign_lenticular_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    admin_asset = _upload_artist_asset(
        actors["admin"],
        file_name="foreign-review-lenticular.webp",
        content_type="image/webp",
        purpose="card",
        content=b"admin-lenticular-card-image",
    )
    artist = actors["artist"]
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 소유권 제출 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": admin_asset["assetId"]},
    )

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_rejects_lenticular_asset_with_unsupported_mime_type(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    voice_asset = _upload_artist_asset(
        artist,
        file_name="review-lenticular-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 타입 제출 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": voice_asset["assetId"]},
    )

    response = artist.post(f"/api/artist/cards/{draft['id']}/submit-review")

    assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")


def test_artist_review_accepts_ready_lenticular_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    lenticular_asset = _upload_artist_asset(
        artist,
        file_name="ready-lenticular.webp",
        content_type="image/webp",
        purpose="card",
        content=b"lenticular-card-image",
    )
    draft = _create_artist_draft(artist, seeded, name="렌티큘러 정상 제출 카드")
    _force_card_lenticular_front(
        draft["id"],
        {"interaction": "lenticular", "lenticularAssetId": lenticular_asset["assetId"]},
    )

    submitted = assert_success(artist.post(f"/api/artist/cards/{draft['id']}/submit-review"))

    assert submitted["status"] == "pending_review"


def test_artist_review_persists_note_for_complete_voice_and_motion_assets(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    voice_asset = _upload_artist_asset(
        artist,
        file_name="special-voice.mp3",
        content_type="audio/mpeg",
        purpose="voice",
        content=b"voice",
    )
    video_asset = _upload_artist_asset(
        artist,
        file_name="special-motion.mp4",
        content_type="video/mp4",
        purpose="video",
        content=b"video",
    )
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "보이스 모션 카드",
                "seasonName": "2026 SUMMER",
                "rarity": "UR",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "voiceAssetId": voice_asset["assetId"],
                "videoAssetId": video_asset["assetId"],
                "hasVoice": True,
                "designConfig": {"video": {"enabled": True, "loop": True}},
                "issueLimit": 100,
            },
        ),
        201,
    )

    submitted = assert_success(
        artist.post(
            f"/api/artist/cards/{draft['id']}/submit-review",
            json={"reviewNote": "모션과 보이스 타이밍을 함께 확인해 주세요."},
        )
    )

    assert submitted["reviewNote"] == "모션과 보이스 타이밍을 함께 확인해 주세요."
    detail = assert_success(artist.get(f"/api/artist/cards/{draft['id']}"))
    assert detail["reviewNote"] == "모션과 보이스 타이밍을 함께 확인해 주세요."


def test_artist_can_preview_an_owned_voice_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    voice_asset = _upload_artist_asset(
        artist,
        file_name="recorded-voice.webm",
        content_type="audio/webm",
        purpose="voice",
        content=b"recorded-voice",
    )
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "녹음 보이스 카드",
                "seasonName": "2026 SUMMER",
                "rarity": "SR",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "voiceAssetId": voice_asset["assetId"],
                "hasVoice": True,
                "issueLimit": 300,
            },
        ),
        201,
    )

    assert draft["voiceUrl"] == f"/api/artist/cards/{draft['id']}/voice?client=artist"
    preview = artist.get(draft["voiceUrl"])
    assert preview.status_code == 200
    assert preview.content == b"recorded-voice"


def test_artist_card_rejects_an_unknown_member(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "그룹 불일치 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "artistId": "artist_nova3",
            "memberId": "member_unknown",
            "issueLimit": 1,
        },
    )
    assert_error(response, 404, "MEMBER_NOT_FOUND")


def test_artist_studio_loads_templates_and_catalog_from_api(
    actors: dict[str, TestClient],
) -> None:
    data = assert_success(actors["artist"].get("/api/artist/templates"))

    assert {template["id"] for template in data["items"]} == {
        "template_signature_v1",
        "template_basic_v1",
    }
    assert data["artists"][0]["id"] == "artist_nova3"
    assert {member["id"] for member in data["members"]} == {
        "member_yuna",
        "member_minho",
        "member_jei",
        "member_rina",
    }


def test_artist_profile_exposes_affiliated_catalog_and_verification_status(
    actors: dict[str, TestClient],
) -> None:
    data = assert_success(actors["artist"].get("/api/artist/profile"))

    assert data["artistId"] == "artist_nova3"
    assert data["verificationStatus"] == "verified"


def test_artist_cannot_create_card_for_an_unaffiliated_catalog_group(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def add_unaffiliated_catalog() -> None:
        async with SessionLocal() as session:
            session.add(Artist(id="artist_other", name="다른 그룹"))
            session.add(Member(id="member_other", artist_id="artist_other", name="다른 멤버"))
            await session.commit()

    asyncio.run(add_unaffiliated_catalog())

    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "소속 외 그룹 카드",
            "seasonName": "2026 SPRING",
            "rarity": "Special",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "artistId": "artist_other",
            "memberId": "member_other",
            "issueLimit": 1,
        },
    )
    assert_error(response, 403, "ARTIST_CATALOG_FORBIDDEN")


def test_artist_can_read_card_collection_insights(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "인사이트 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )

    insights = assert_success(artist.get("/api/artist/insights"))

    assert insights["summary"] == {
        "totalCards": 1,
        "draftCards": 1,
        "pendingReviewCards": 0,
        "publishedCards": 0,
        "redeemedCount": 0,
    }
    assert insights["items"] == [
        {
            "cardId": draft["id"],
            "name": "인사이트 카드",
            "status": "draft",
            "issueLimit": 100,
            "redeemedCount": 0,
        }
    ]


def test_artist_can_read_and_update_studio_profile(
    actors: dict[str, TestClient],
) -> None:
    artist = actors["artist"]

    profile = assert_success(artist.get("/api/artist/profile"))
    assert profile == {
        "id": "artist",
        "username": "seed-dreamscape-studio",
        "email": "artist@example.com",
        "nickname": None,
        "role": "artist",
        "emailEnabled": False,
        "artistId": "artist_nova3",
        "verificationStatus": "verified",
    }

    updated = assert_success(
        artist.patch(
            "/api/artist/profile",
            json={"nickname": "드림스케이프 공식", "emailEnabled": True},
        )
    )
    assert updated == {
        "id": "artist",
        "username": "seed-dreamscape-studio",
        "email": "artist@example.com",
        "nickname": "드림스케이프 공식",
        "role": "artist",
        "emailEnabled": True,
        "artistId": "artist_nova3",
        "verificationStatus": "verified",
    }
    assert assert_success(artist.get("/api/artist/profile"))["nickname"] == "드림스케이프 공식"


def test_fan_cannot_update_artist_studio_profile(
    actors: dict[str, TestClient],
) -> None:
    assert_error(
        actors["fan"].get("/api/artist/profile"),
        403,
        "FORBIDDEN",
    )


def test_fan_cannot_load_artist_studio_templates(actors: dict[str, TestClient]) -> None:
    assert_error(actors["fan"].get("/api/artist/templates"), 403, "FORBIDDEN")


def test_artist_handwriting_background_removal_returns_a_trackable_job(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    job = assert_success(
        actors["artist"].post(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/background-removal"
        ),
        202,
    )

    assert job["jobId"]
    assert job["status"] in {"queued", "processing", "completed"}


def test_artist_can_update_card_assets_and_read_a_preview(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "손글씨 특별 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 3000,
            },
        ),
        201,
    )

    updated = assert_success(
        artist.patch(
            f"/api/artist/cards/{draft['id']}",
            json={
                "signatureText": "오래 기다려 줘서 고마워요.",
                "handwritingAssetId": seeded["ids"]["handwritingAssetId"],
                "handwritingTransform": {"x": 68, "y": 724, "width": 402, "rotation": -3},
                "hasVoice": True,
            },
        )
    )
    assert updated["handwritingAssetId"] == seeded["ids"]["handwritingAssetId"]
    assert updated["handwritingTransform"]["width"] == 402
    assert updated["hasVoice"] is True

    preview = assert_success(artist.post(f"/api/artist/cards/{draft['id']}/preview"))
    assert preview["cardId"] == draft["id"]
    assert preview["previewUrl"] == f"/api/artist/cards/{draft['id']}/preview"
    assert preview["layers"]["handwriting"]["assetId"] == seeded["ids"]["handwritingAssetId"]


def test_artist_card_persists_finish_design_and_video_layer(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    design = {
        "version": 2,
        "front": {
            "effect": "holographic",
            "effectIntensity": 0.82,
            "effectAngle": 135,
            "image": {"assetId": seeded["ids"]["imageAssetId"], "filter": "clean"},
        },
        "back": {"effect": "sparkle", "background": "#f5efff"},
    }
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "홀로그램 영상 카드",
                "seasonName": "2026 SUMMER",
                "rarity": "UR",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "videoAssetId": seeded["ids"]["imageAssetId"],
                "designConfig": design,
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert draft["videoAssetId"] == seeded["ids"]["imageAssetId"]
    assert draft["designConfig"]["front"]["effect"] == "holographic"

    preview = assert_success(artist.post(f"/api/artist/cards/{draft['id']}/preview"))
    assert preview["layers"]["video"]["assetId"] == seeded["ids"]["imageAssetId"]
    assert preview["layers"]["effects"]["front"]["style"] == "holographic"


def test_artist_can_reload_owned_media_for_card_editing(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    artist = actors["artist"]
    asset_id = seeded["ids"]["imageAssetId"]
    artist.put(f"/api/uploads/{asset_id}/content", content=b"media").raise_for_status()
    draft = assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "재편집 가능한 모션 카드",
                "seasonName": "2026 SUMMER",
                "rarity": "UR",
                "imageAssetId": asset_id,
                "videoAssetId": asset_id,
                "handwritingAssetId": asset_id,
                "issueLimit": 10,
            },
        ),
        201,
    )

    assert draft["imageUrl"].endswith(f"/artist/cards/{draft['id']}/image?client=artist")
    assert draft["videoUrl"].endswith(f"/artist/cards/{draft['id']}/video?client=artist")
    assert draft["handwritingUrl"].endswith(
        f"/artist/cards/{draft['id']}/handwriting?client=artist"
    )
    assert artist.get(draft["imageUrl"]).content == b"media"
    assert artist.get(draft["videoUrl"]).content == b"media"
    assert artist.get(draft["handwritingUrl"]).content == b"media"


def test_fan_cannot_read_artist_card_preview(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    assert_error(actors["fan"].get("/api/artist/cards/card_unknown"), 403, "FORBIDDEN")


def test_artist_spatial_scene_persists_private_aligned_bundle(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    image = Image.new("RGB", (16, 24), (30, 40, 80))
    image.save(buffer := BytesIO(), format="PNG")
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="spatial-source.png",
        content_type="image/png",
        purpose="card",
        content=buffer.getvalue(),
    )
    asset_id = uploaded["assetId"]

    scene = assert_success(actors["artist"].post(f"/api/artist/assets/{asset_id}/spatial-scene"))

    assert scene["version"] == 2
    assert scene["provider"] == "local_fallback"
    assert scene["depthAssetId"] == f"{asset_id}-spatial-depth"
    assert scene["maskAssetId"] == f"{asset_id}-spatial-mask"
    assert scene["backgroundAssetId"] == f"{asset_id}-spatial-background"
    assert not any(key.endswith("StoragePath") for key in scene)
    for derivative in ("spatial-depth", "spatial-mask", "spatial-background"):
        response = actors["artist"].get(f"/api/artist/assets/{asset_id}/{derivative}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/png")
        assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
        assert actors["fan"].get(f"/api/artist/assets/{asset_id}/{derivative}").status_code == 403


def test_artist_photo_analysis_reuses_revision_matched_spatial_mask(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="photo-analysis-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]
    storage = configured_asset_storage()
    mask_bytes = _png_bytes("L", (16, 24), 180)
    mask_path = storage.save_derived_bytes(
        asset_id, "-existing-spatial-mask.png", mask_bytes, content_type="image/png"
    )

    async def read_revision() -> str:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            assert asset.upload_completed_at is not None
            return f"{asset.id}:{asset.upload_completed_at.isoformat()}"

    source_revision = asyncio.run(read_revision())
    _set_asset_transform(
        asset_id,
        {
            "spatialScene": {
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": source_revision,
                "provider": "isnet+depth",
                "modelVersion": "shared-v1",
                "confidence": 0.77,
                "maskStoragePath": mask_path,
            }
        },
    )

    analysis = assert_success(
        actors["artist"].post(f"/api/artist/assets/{asset_id}/photo-analysis")
    )

    assert analysis == {
        "version": 1,
        "status": "completed",
        "sourceAssetId": asset_id,
        "sourceRevision": source_revision,
        "provider": "isnet+depth",
        "modelVersion": "shared-v1",
        "confidence": 0.77,
        "maskUrl": f"/api/artist/assets/{asset_id}/photo-analysis-mask",
        "capabilities": {"subjectMask": True, "faceProtection": False},
    }
    response = actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis-mask")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content == mask_bytes
    assert (
        actors["fan"].get(f"/api/artist/assets/{asset_id}/photo-analysis-mask").status_code == 403
    )


def test_artist_photo_analysis_post_persists_provider_mask_and_reuses_cache(
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="provider-photo-analysis-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]
    mask_bytes = _png_bytes("L", (16, 24), 180)
    provider_calls: list[bytes] = []

    class FakePhotoAnalysisProvider:
        async def analyze(self, content: bytes) -> PhotoAnalysisBundle:
            provider_calls.append(content)
            return PhotoAnalysisBundle(
                mask=mask_bytes,
                provider="isnet",
                model_version="isnet-general-use",
                confidence=0.86,
            )

    monkeypatch.setattr(
        artist_router,
        "configured_photo_analysis_provider",
        lambda settings: FakePhotoAnalysisProvider(),
    )
    other_artist = _other_artist_client(actors["artist"])

    created = assert_success(actors["artist"].post(f"/api/artist/assets/{asset_id}/photo-analysis"))
    mask = actors["artist"].get(created["maskUrl"])
    repeated = assert_success(
        actors["artist"].post(f"/api/artist/assets/{asset_id}/photo-analysis")
    )
    cached = assert_success(actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis"))

    assert len(provider_calls) == 1
    assert created == repeated == cached
    assert created["sourceAssetId"] == asset_id
    assert created["provider"] == "isnet"
    assert created["modelVersion"] == "isnet-general-use"
    assert created["confidence"] == 0.86
    assert created["maskUrl"] == f"/api/artist/assets/{asset_id}/photo-analysis-mask"
    assert created["capabilities"] == {"subjectMask": True, "faceProtection": False}
    assert "maskStoragePath" not in created
    assert mask.status_code == 200
    assert mask.headers["content-type"].startswith("image/png")
    assert mask.content == mask_bytes
    assert_error(
        other_artist.get(f"/api/artist/assets/{asset_id}/photo-analysis"),
        404,
        "ASSET_NOT_FOUND",
    )
    assert_error(
        other_artist.get(f"/api/artist/assets/{asset_id}/photo-analysis-mask"),
        404,
        "ASSET_NOT_FOUND",
    )
    assert len(provider_calls) == 1


def test_artist_can_read_cached_photo_analysis_without_inference(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="cached-photo-analysis-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]
    storage = configured_asset_storage()
    mask_path = storage.save_derived_bytes(
        asset_id,
        "-photo-analysis-mask.png",
        _png_bytes("L", (16, 24), 180),
        content_type="image/png",
    )

    async def read_revision() -> str:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            assert asset.upload_completed_at is not None
            return f"{asset.id}:{asset.upload_completed_at.isoformat()}"

    source_revision = asyncio.run(read_revision())
    _set_asset_transform(
        asset_id,
        {
            "photoAnalysis": {
                "version": 1,
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": source_revision,
                "provider": "isnet",
                "modelVersion": "isnet-general-use",
                "confidence": 0.81,
                "maskUrl": f"/api/artist/assets/{asset_id}/photo-analysis-mask",
                "capabilities": {"subjectMask": True, "faceProtection": False},
                "maskStoragePath": mask_path,
            }
        },
    )

    analysis = assert_success(actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis"))

    assert analysis["sourceAssetId"] == asset_id
    assert analysis["sourceRevision"] == source_revision
    assert analysis["capabilities"] == {"subjectMask": True, "faceProtection": False}
    assert "maskStoragePath" not in analysis


def test_artist_photo_analysis_get_404_for_missing_or_stale_cache(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="stale-photo-analysis-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]

    missing = actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis")
    assert_error(missing, 404, "PHOTO_ANALYSIS_NOT_FOUND")

    _set_asset_transform(
        asset_id,
        {
            "photoAnalysis": {
                "version": 1,
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": "stale-revision",
                "provider": "isnet",
                "modelVersion": "isnet-general-use",
                "confidence": 0.81,
                "maskUrl": f"/api/artist/assets/{asset_id}/photo-analysis-mask",
                "capabilities": {"subjectMask": True, "faceProtection": False},
                "maskStoragePath": "s3://private/stale-mask.png",
            },
            "spatialScene": {
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": "stale-revision",
                "provider": "isnet+depth",
                "modelVersion": "shared-v1",
                "confidence": 0.77,
                "maskStoragePath": "s3://private/stale-spatial-mask.png",
            },
        },
    )

    stale = actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis")
    mask = actors["artist"].get(f"/api/artist/assets/{asset_id}/photo-analysis-mask")

    assert_error(stale, 404, "PHOTO_ANALYSIS_NOT_FOUND")
    assert_error(mask, 404, "PHOTO_ANALYSIS_MASK_NOT_FOUND")


def test_artist_photo_analysis_rejects_local_fallback_spatial_mask(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="photo-analysis-fallback-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]
    storage = configured_asset_storage()
    mask_path = storage.save_derived_bytes(
        asset_id,
        "-fallback-spatial-mask.png",
        _png_bytes("L", (16, 24), 255),
        content_type="image/png",
    )

    async def read_revision() -> str:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            assert asset.upload_completed_at is not None
            return f"{asset.id}:{asset.upload_completed_at.isoformat()}"

    source_revision = asyncio.run(read_revision())
    _set_asset_transform(
        asset_id,
        {
            "spatialScene": {
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": source_revision,
                "provider": "local_fallback",
                "modelVersion": "luminance-v1",
                "confidence": 0.0,
                "maskStoragePath": mask_path,
            }
        },
    )

    response = actors["artist"].post(f"/api/artist/assets/{asset_id}/photo-analysis")

    assert_error(response, 502, "PHOTO_ANALYSIS_FAILED")


def test_artist_spatial_scene_reuses_cached_photo_analysis_mask(
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="spatial-reuse-source.png",
        content_type="image/png",
        purpose="card",
        content=_png_bytes("RGB", (16, 24), (30, 40, 80)),
    )
    asset_id = uploaded["assetId"]
    storage = configured_asset_storage()
    mask_bytes = _png_bytes("L", (16, 24), 180)
    mask_path = storage.save_derived_bytes(
        asset_id,
        "-photo-analysis-mask.png",
        mask_bytes,
        content_type="image/png",
    )

    async def read_revision() -> str:
        async with SessionLocal() as session:
            asset = await session.get(Asset, asset_id)
            assert asset is not None
            assert asset.upload_completed_at is not None
            return f"{asset.id}:{asset.upload_completed_at.isoformat()}"

    source_revision = asyncio.run(read_revision())
    _set_asset_transform(
        asset_id,
        {
            "photoAnalysis": {
                "version": 1,
                "status": "completed",
                "sourceAssetId": asset_id,
                "sourceRevision": source_revision,
                "provider": "isnet",
                "modelVersion": "isnet-general-use",
                "confidence": 0.81,
                "maskUrl": f"/api/artist/assets/{asset_id}/photo-analysis-mask",
                "capabilities": {"subjectMask": True, "faceProtection": False},
                "maskStoragePath": mask_path,
            }
        },
    )
    seen_masks: list[bytes | None] = []

    class FakeProvider:
        async def generate(
            self, content: bytes, *, mask: bytes | None = None
        ) -> SpatialSceneBundle:
            seen_masks.append(mask)
            return SpatialSceneBundle(
                depth=_png_bytes("L", (16, 24), 100),
                mask=mask or _png_bytes("L", (16, 24), 90),
                background=_png_bytes("RGB", (16, 24), (1, 2, 3)),
                provider="depth-anything-v2+cached-mask+telea",
                model_version="test-v1",
                confidence=0.8,
            )

    monkeypatch.setattr(
        artist_router,
        "configured_spatial_scene_provider",
        lambda settings: FakeProvider(),
    )

    scene = assert_success(actors["artist"].post(f"/api/artist/assets/{asset_id}/spatial-scene"))

    assert seen_masks == [mask_bytes]
    assert scene["provider"] == "depth-anything-v2+cached-mask+telea"


def test_artist_spatial_scene_job_is_idempotent_and_persists_asset_manifest(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    image = Image.new("RGB", (16, 24), (30, 40, 80))
    image.save(buffer := BytesIO(), format="PNG")
    uploaded = _upload_artist_asset(
        actors["artist"],
        file_name="spatial-job-source.png",
        content_type="image/png",
        purpose="card",
        content=buffer.getvalue(),
    )
    asset_id = uploaded["assetId"]
    headers = {"Idempotency-Key": "spatial-test-retry-1"}

    first = actors["artist"].post(
        f"/api/artist/assets/{asset_id}/spatial-scene-jobs",
        headers=headers,
        json={"motionPreset": "portrait-parallax", "pipelineVersion": "v1"},
    )
    assert first.status_code == 202, first.text
    assert first.json()["ok"] is True
    first_data = first.json()["data"]
    assert first_data["reused"] is False

    replay = actors["artist"].post(
        f"/api/artist/assets/{asset_id}/spatial-scene-jobs",
        headers=headers,
        json={"motionPreset": "portrait-parallax", "pipelineVersion": "v1"},
    )
    assert replay.status_code == 202, replay.text
    assert replay.json()["ok"] is True
    replay_data = replay.json()["data"]
    assert replay_data["reused"] is True
    assert replay_data["jobId"] == first_data["jobId"]

    status = assert_success(
        actors["artist"].get(f"/api/artist/spatial-scene-jobs/{first_data['jobId']}")
    )
    assert status["status"] == "ready"
    assert status["scene"]["provider"] == "local_fallback"
    assert actors["artist"].get(f"/api/artist/assets/{asset_id}/spatial-depth").status_code == 200
