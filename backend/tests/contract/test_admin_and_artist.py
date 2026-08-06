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
                "issueLimit": 3000,
            },
        ),
        201,
    )
    assert draft["status"] == "draft"

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

    assert job["id"]
    assert job["status"] in {"queued", "processing", "completed"}
