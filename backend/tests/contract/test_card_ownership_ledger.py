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
        200,
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
    assert ledger[0].record_hash


def test_redeem_code_registration_records_one_ownership_event(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions",
            json={"code": seeded["codes"]["valid"], "source": "qr"},
        ),
        201,
    )

    async def read_ledger() -> list[CardOwnershipLedger]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(CardOwnershipLedger).where(
                        CardOwnershipLedger.user_card_id == redeemed["userCardId"]
                    )
                )
            )

    ledger = asyncio.run(read_ledger())
    assert len(ledger) == 1
    assert ledger[0].action == "grant"
    assert ledger[0].source_type == "redeem_code"
    assert ledger[0].source_id == seeded["codes"]["valid"]
    assert ledger[0].record_hash
    assert ledger[0].previous_hash is None
    history = assert_success(actors["fan"].get(f"/api/me/cards/{redeemed['userCardId']}/history"))
    assert history["items"][0]["recordHash"] == ledger[0].record_hash


def test_root_admin_can_verify_ownership_hash_chain(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    assert_success(
        actors["fan"].post(
            "/api/redemptions",
            json={"code": seeded["codes"]["valid"], "source": "manual"},
        ),
        201,
    )
    result = assert_success(actors["admin"].get("/api/admin/integrity/ownership"))
    assert result["valid"] is True
    assert result["verified"] >= 1
    assert result["violations"] == []


def test_root_admin_can_verify_point_balance_reconciliation(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    charge = actors["fan"].post(
        "/api/me/point-charges",
        json={"packageId": "points_500", "paymentMethod": "sandbox_card"},
        headers={"Idempotency-Key": "integrity-point-charge"},
    )
    assert charge.status_code == 201, charge.text
    result = assert_success(actors["admin"].get("/api/admin/integrity/points"))
    assert result["valid"] is True
    assert result["checkedUsers"] >= 1
    assert result["drifts"] == []
