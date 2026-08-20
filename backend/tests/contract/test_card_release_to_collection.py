from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_success
from tests.contract.test_card_release_workflow import submit_studio_card


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

    created_pack = assert_success(
        partner.post("/api/admin/card-packs", json=_pack_payload(submitted["id"])),
        201,
    )
    assert created_pack["status"] == "draft"
    assert created_pack["cards"][0]["cardId"] == submitted["id"]

    published_card = assert_success(
        seeded_roles["root"].post(f"/api/admin/cards/{submitted['id']}/publish")
    )
    assert published_card["status"] == "published"

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
