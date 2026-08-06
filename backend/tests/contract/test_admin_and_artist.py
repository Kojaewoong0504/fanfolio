from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


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
                "hasVoice": True,
                "issueLimit": 3000,
            },
        ),
        201,
    )
    assert draft["status"] == "draft"
    assert draft["signatureText"] == "우리 팬들 사랑해요."
    assert draft["hasVoice"] is True

    cards = assert_success(artist.get("/api/artist/cards"))
    assert any(card["id"] == draft["id"] for card in cards["items"])

    submitted = assert_success(artist.post(f"/api/artist/cards/{draft['id']}/submit-review"))
    assert submitted["status"] == "pending_review"

    assert_error(artist.post(f"/api/admin/cards/{draft['id']}/publish"), 403, "FORBIDDEN")


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


def test_fan_cannot_read_artist_card_preview(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    assert_error(actors["fan"].get("/api/artist/cards/card_unknown"), 403, "FORBIDDEN")
