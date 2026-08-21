from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success
from tests.contract.test_card_release_workflow import create_partner_client, submit_studio_card


def _pack_payload(card_id: str) -> dict[str, Any]:
    return {
        "artistId": "artist_nova3",
        "name": "2026 SPRING Ver.",
        "seasonName": "2026 SPRING",
        "version": "v1.0",
        "imageUrl": "/assets/packs/spring.png",
        "description": "아티스트 카드 출시 기준 시나리오용 카드팩",
        "cards": [
            {
                "cardId": card_id,
                "position": 1,
                "probability": 100,
                "enabled": True,
            }
        ],
    }


def test_artist_card_reaches_fan_collection_after_review_and_pack_release(
    app: FastAPI, seeded_roles: dict[str, TestClient]
) -> None:
    """아티스트 제작 카드의 정식 출시 경로를 하나의 계약으로 고정한다."""
    partner = seeded_roles["partner_manager"]

    submitted = submit_studio_card(seeded_roles["artist_studio"], rarity="R")
    assert submitted["releaseStatus"] == "pending_partner_review"

    approved = assert_success(
        partner.post(
            f"/api/admin/cards/{submitted['id']}/review/partner",
            json={"decision": "approved"},
        )
    )
    assert approved["releaseStatus"] == "approved"

    drop = assert_success(
        partner.post(
            "/api/admin/drops",
            json={"name": "카드팩 출시 드롭", "artistId": "artist_nova3"},
        ),
        201,
    )
    linked = assert_success(
        partner.post(f"/api/admin/drops/{drop['id']}/cards", json={"cardId": submitted["id"]})
    )
    assert linked["releaseStatus"] == "drop_ready"
    assert_success(partner.patch(f"/api/admin/drops/{drop['id']}/status", json={"status": "live"}))

    created_pack = assert_success(
        partner.post("/api/admin/card-packs", json=_pack_payload(submitted["id"])),
        201,
    )
    assert created_pack["status"] == "draft"
    assert created_pack["cards"][0]["cardId"] == submitted["id"]

    published_pack = assert_success(
        partner.post(f"/api/admin/card-packs/{created_pack['id']}/publish")
    )
    assert published_pack["status"] == "published"

    opened = assert_success(
        seeded_roles["fan"].post(f"/api/me/card-packs/{created_pack['id']}/open"),
        201,
    )
    assert opened["cardId"] == submitted["id"]

    collection = assert_success(seeded_roles["fan"].get("/api/me/collection"))
    assert opened["userCardId"] in {item["userCardId"] for item in collection["cards"]}


def test_unreleased_studio_card_is_hidden_from_fan_catalog_and_image(
    actors: dict[str, TestClient],
) -> None:
    card = submit_studio_card(actors["artist"], rarity="R")

    catalog = assert_success(actors["fan"].get("/api/catalog/cards?artistId=artist_nova3"))
    assert card["id"] not in {item["id"] for item in catalog["items"]}
    assert_error(
        actors["fan"].get(f"/api/cards/{card['id']}/image"),
        404,
        "CARD_IMAGE_NOT_FOUND",
    )


def test_card_pack_rejects_card_before_publication(
    actors: dict[str, TestClient],
) -> None:
    card = submit_studio_card(actors["artist"], rarity="R")

    assert_error(
        actors["admin"].post("/api/admin/card-packs", json=_pack_payload(card["id"])),
        422,
        "PACK_CARDS_NOT_PUBLISHED",
    )


def test_approved_studio_card_is_not_published_by_legacy_root_action(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    partner = create_partner_client(app)
    card = submit_studio_card(actors["artist"], rarity="R")
    approved = assert_success(
        partner.post(f"/api/admin/cards/{card['id']}/review/partner", json={"decision": "approved"})
    )
    assert approved["releaseStatus"] == "approved"

    assert_error(
        actors["admin"].post(f"/api/admin/cards/{card['id']}/publish"),
        409,
        "CARD_RELEASE_DROP_REQUIRED",
    )
