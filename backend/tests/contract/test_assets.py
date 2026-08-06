import base64
from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


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
    assert job["status"] == "failed"


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


def test_uploaded_handwriting_job_returns_a_transparent_result(
    actors: dict[str, TestClient],
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
    uploaded = actors["artist"].put(
        asset["uploadUrl"], content=PNG_1X1, headers={"Content-Type": "image/png"}
    )
    assert uploaded.status_code == 204

    created = assert_success(
        actors["artist"].post(f"/api/assets/{asset['assetId']}/background-removal"), 202
    )
    job = assert_success(actors["artist"].get(f"/api/background-removal-jobs/{created['jobId']}"))
    assert job["status"] == "completed"
    assert job["transparentImageUrl"] == f"/api/assets/{asset['assetId']}/transparent"


def test_preview_image_is_rendered_from_uploaded_card_layers(actors: dict[str, TestClient]) -> None:
    assets = []
    for purpose, file_name in (("card", "card.png"), ("handwriting", "handwriting.png")):
        asset = assert_success(
            actors["artist"].post(
                "/api/uploads/presign",
                json={
                    "fileName": file_name,
                    "contentType": "image/png",
                    "purpose": purpose,
                },
            ),
            201,
        )
        assert actors["artist"].put(asset["uploadUrl"], content=PNG_1X1).status_code == 204
        assets.append(asset["assetId"])

    draft = assert_success(
        actors["artist"].post(
            "/api/artist/cards",
            json={
                "templateId": "template_signature_v1",
                "name": "렌더링 테스트 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": assets[0],
                "issueLimit": 100,
            },
        ),
        201,
    )
    assert_success(
        actors["artist"].patch(
            f"/api/artist/cards/{draft['id']}",
            json={"handwritingAssetId": assets[1], "handwritingTransform": {"x": 0, "y": 0}},
        )
    )
    preview = assert_success(actors["artist"].post(f"/api/artist/cards/{draft['id']}/preview"))
    assert preview["previewImageUrl"].endswith(f"/api/artist/cards/{draft['id']}/preview/image")

    image = actors["artist"].get(preview["previewImageUrl"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
