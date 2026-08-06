from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_artist_can_presign_and_upload_an_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    asset = assert_success(
        actors["artist"].post(
            "/api/uploads/presign",
            json={
                "fileName": "handwriting.png",
                "contentType": "image/png",
                "purpose": "handwriting",
            },
        ),
        201,
    )

    assert asset["assetId"].startswith("asset_")
    assert asset["uploadUrl"] == f"/api/uploads/{asset['assetId']}/content"
    assert asset["expiresAt"]

    uploaded = actors["artist"].put(
        asset["uploadUrl"], content=b"fake-png", headers={"Content-Type": "image/png"}
    )
    assert uploaded.status_code == 204, uploaded.text


def test_fan_cannot_presign_an_asset(actors: dict[str, TestClient]) -> None:
    assert_error(
        actors["fan"].post(
            "/api/uploads/presign",
            json={"fileName": "card.png", "contentType": "image/png", "purpose": "card"},
        ),
        403,
        "FORBIDDEN",
    )


def test_artist_can_read_own_background_removal_job(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["artist"].post(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/background-removal"
        ),
        202,
    )
    job = assert_success(actors["artist"].get(f"/api/background-removal-jobs/{created['jobId']}"))

    assert job["jobId"] == created["jobId"]
    assert job["status"] == "queued"


def test_artist_cannot_read_another_artists_background_removal_job(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["artist"].post(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/background-removal"
        ),
        202,
    )

    assert_error(
        actors["fan"].get(f"/api/background-removal-jobs/{created['jobId']}"),
        403,
        "FORBIDDEN",
    )
