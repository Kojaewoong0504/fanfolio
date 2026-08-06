from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_admin_can_create_update_and_read_a_card(actors: dict[str, TestClient]) -> None:
    created = assert_success(
        actors["admin"].post(
            "/api/admin/cards",
            json={
                "name": "운영 등록 카드",
                "seasonName": "2026 SUMMER",
                "rarity": "SR",
                "artistId": "artist_nova3",
                "memberId": "member_yuna",
                "issueLimit": 500,
            },
        ),
        201,
    )
    assert created["status"] == "draft"
    assert created["artistId"] == "artist_nova3"
    assert created["memberId"] == "member_yuna"

    updated = assert_success(
        actors["admin"].patch(
            f"/api/admin/cards/{created['id']}",
            json={"name": "운영 등록 카드 수정", "issueLimit": 450},
        )
    )
    assert updated["name"] == "운영 등록 카드 수정"
    assert updated["issueLimit"] == 450

    detail = assert_success(actors["admin"].get(f"/api/admin/cards/{created['id']}"))
    assert detail["name"] == "운영 등록 카드 수정"


def test_admin_can_load_catalog_for_card_registration(actors: dict[str, TestClient]) -> None:
    catalog = assert_success(actors["admin"].get("/api/admin/catalog"))
    assert catalog["artists"][0]["id"] == "artist_nova3"
    assert {member["id"] for member in catalog["members"]} >= {
        "member_yuna",
        "member_minho",
        "member_jei",
    }


def test_admin_can_read_and_update_drop_metadata(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["admin"].post("/api/admin/drops", json={"name": "초기 드롭"}),
        201,
    )
    detail = assert_success(actors["admin"].get(f"/api/admin/drops/{created['id']}"))
    assert detail["name"] == "초기 드롭"

    updated = assert_success(
        actors["admin"].patch(
            f"/api/admin/drops/{created['id']}",
            json={"name": "수정 드롭", "startsAt": "2026-09-01T00:00:00Z"},
        )
    )
    assert updated["name"] == "수정 드롭"
    assert updated["startsAt"] == "2026-09-01T00:00:00+00:00"


def test_admin_approve_alias_accepts_a_pending_artist_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    card = assert_success(
        actors["artist"].post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "승인 alias 카드",
                "seasonName": "2026 FALL",
                "rarity": "R",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 10,
            },
        ),
        201,
    )
    assert_success(actors["artist"].post(f"/api/artist/cards/{card['id']}/submit-review"))
    approved = assert_success(actors["admin"].post(f"/api/admin/cards/{card['id']}/approve"))
    assert approved == {"id": card["id"], "status": "approved"}


def test_admin_can_list_batches_and_disable_a_code(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    batch = assert_success(
        actors["admin"].post(
            "/api/admin/redeem-code-batches",
            json={
                "dropId": seeded["ids"]["liveDropId"],
                "cardId": seeded["ids"]["publishedCardId"],
                "quantity": 1,
                "maxUsesPerCode": 1,
                "expiresAt": "2026-12-31T23:59:59Z",
                "prefix": "GAP",
            },
        ),
        201,
    )
    listed = assert_success(actors["admin"].get("/api/admin/redeem-code-batches"))
    assert any(item["id"] == batch["id"] for item in listed["items"])

    export = actors["admin"].get(batch["csvExportUrl"])
    assert export.status_code == 200
    code_value = export.text.splitlines()[1].split(",", 1)[0]
    qr = actors["admin"].get(f"/api/admin/redeem-codes/{code_value}/qr")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/png")
    assert qr.content.startswith(b"\x89PNG\r\n\x1a\n")
    qr_zip = actors["admin"].get(f"/api/admin/redeem-code-batches/{batch['id']}/qr.zip")
    assert qr_zip.status_code == 200
    assert qr_zip.headers["content-type"].startswith("application/zip")
    assert qr_zip.content.startswith(b"PK\x03\x04")
    disabled = assert_success(
        actors["admin"].patch(
            f"/api/admin/redeem-codes/{code_value}",
            json={"status": "disabled"},
        )
    )
    assert disabled["status"] == "disabled"
    assert_error(
        actors["fan"].post("/api/redemptions", json={"code": code_value, "source": "manual"}),
        409,
        "REDEEM_CODE_DISABLED",
    )


def test_artist_can_save_asset_transform(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    result = assert_success(
        actors["artist"].patch(
            f"/api/assets/{seeded['ids']['handwritingAssetId']}/transform",
            json={"transform": {"x": 12, "y": 20, "width": 300, "rotation": -2}},
        )
    )
    assert result["assetId"] == seeded["ids"]["handwritingAssetId"]
    assert result["transform"]["width"] == 300
