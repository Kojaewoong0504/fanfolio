from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Card, CardPack, CardPackCard, UserCard
from tests.conftest import assert_error, assert_success


def seed_combination_catalog() -> list[str]:
    async def seed() -> list[str]:
        async with SessionLocal() as session:
            material = Card(
                id="combination_material_card",
                name="조합 재료 카드",
                status="published",
                release_status="published",
                artist_id="artist_nova3",
                rarity="N",
                image_url="/cards/material.png",
            )
            result = Card(
                id="combination_result_card",
                name="조합 결과 카드",
                status="published",
                release_status="published",
                artist_id="artist_nova3",
                rarity="SR",
                image_url="/cards/result.png",
            )
            pack = CardPack(
                id="pack_combination_v1",
                artist_id="artist_nova3",
                name="Nebula 조합팩",
                season_name="2026 SPRING",
                version="v1.0",
                status="published",
            )
            session.add_all(
                [
                    material,
                    result,
                    pack,
                    CardPackCard(
                        id="pack_combination_material",
                        pack_id=pack.id,
                        card_id=material.id,
                        position=1,
                        probability=90,
                    ),
                    CardPackCard(
                        id="pack_combination_result",
                        pack_id=pack.id,
                        card_id=result.id,
                        position=2,
                        probability=10,
                    ),
                ]
            )
            user_card_ids: list[str] = []
            for serial in range(1, 4):
                user_card_id = f"user_combination_material_{serial}"
                user_card_ids.append(user_card_id)
                session.add(
                    UserCard(
                        id=user_card_id,
                        user_id="fan",
                        card_id=material.id,
                        serial_number=serial,
                        acquisition_source="card_pack",
                        acquired_at=datetime.now(UTC),
                    )
                )
            await session.commit()
            return user_card_ids

    return asyncio.run(seed())


def test_fan_can_combine_duplicates_into_a_weighted_pack_result(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    material_ids = seed_combination_catalog()

    recipe = assert_success(
        actors["admin"].post(
            "/api/admin/card-combination-recipes",
            json={
                "scopeType": "card_pack",
                "scopeId": "pack_combination_v1",
                "inputQuantity": 3,
                "outputRarityPool": ["SR"],
                "probabilitySnapshot": {
                    "combination_result_card": 100,
                },
            },
        ),
        201,
    )
    assert recipe["publicOdds"][0]["cardId"] == "combination_result_card"

    preview = assert_success(
        actors["fan"].post(
            "/api/me/card-combinations/preview",
            json={"recipeId": recipe["id"], "materialUserCardIds": material_ids},
        )
    )
    assert preview["requiredQuantity"] == 3
    assert preview["publicOdds"][0]["probability"] == 100
    assert preview["consumableUserCardIds"] == material_ids

    combined = assert_success(
        actors["fan"].post(
            "/api/me/card-combinations",
            headers={"Idempotency-Key": "combination-test-1"},
            json={"recipeId": recipe["id"], "materialUserCardIds": material_ids},
        ),
        201,
    )
    assert combined["cardId"] == "combination_result_card"
    assert combined["consumedUserCardIds"] == material_ids

    collection = assert_success(actors["fan"].get("/api/me/collection"))
    assert [card["cardId"] for card in collection["cards"]] == ["combination_result_card"]
    assert collection["summary"]["ownedCount"] == 1

    public_collection = assert_success(actors["otherFan"].get("/api/fans/fan/collection"))
    assert [card["cardId"] for card in public_collection["cards"]] == ["combination_result_card"]
    assert public_collection["cards"][0]["tradable"] is False

    assert_error(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [material_ids[0]],
                "requestedUserCardIds": [],
            },
        ),
        422,
        "CARD_NOT_TRADABLE",
    )

    repeated = assert_success(
        actors["fan"].post(
            "/api/me/card-combinations",
            headers={"Idempotency-Key": "combination-test-1"},
            json={"recipeId": recipe["id"], "materialUserCardIds": material_ids},
        )
    )
    assert repeated["combinationId"] == combined["combinationId"]

    assert_error(
        actors["fan"].post(
            "/api/me/card-combinations",
            headers={"Idempotency-Key": "combination-test-2"},
            json={"recipeId": recipe["id"], "materialUserCardIds": material_ids},
        ),
        409,
        "CARD_COMBINATION_MATERIAL_UNAVAILABLE",
    )
