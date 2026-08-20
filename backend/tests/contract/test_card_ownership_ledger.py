from __future__ import annotations

import asyncio
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import CardOwnershipLedger
from tests.conftest import assert_success


def _pack_payload(card_id: str) -> dict[str, Any]:
    return {
        "artistId": "artist_nova3",
        "name": "Idempotency Pack",
        "seasonName": "2026 SPRING",
        "version": "v1.0",
        "imageUrl": "/assets/packs/idempotency.png",
        "description": "중복 개봉 방지 계약 테스트",
        "cards": [
            {
                "cardId": card_id,
                "position": 1,
                "probability": 100,
                "enabled": True,
            }
        ],
    }


def test_same_pack_open_idempotency_key_returns_one_owned_card(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["admin"].post(
            "/api/admin/card-packs",
            json=_pack_payload(seeded["ids"]["publishedCardId"]),
        ),
        201,
    )
    assert_success(actors["admin"].post(f"/api/admin/card-packs/{created['id']}/publish"))

    headers = {"Idempotency-Key": "pack-open-contract-001"}
    first = assert_success(
        actors["fan"].post(
            f"/api/me/card-packs/{created['id']}/open",
            headers=headers,
        ),
        201,
    )
    second = assert_success(
        actors["fan"].post(
            f"/api/me/card-packs/{created['id']}/open",
            headers=headers,
        ),
        201,
    )

    assert second["userCardId"] == first["userCardId"]
    collection = assert_success(actors["fan"].get("/api/me/collection"))
    assert collection["summary"]["ownedCount"] == 1

    async def read_ledger() -> list[CardOwnershipLedger]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(CardOwnershipLedger).where(CardOwnershipLedger.user_id == "fan")
                )
            )

    ledger = asyncio.run(read_ledger())
    assert len(ledger) == 1
    assert ledger[0].source_type == "card_pack_opening"
