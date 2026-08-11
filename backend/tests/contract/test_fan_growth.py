import asyncio
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import EngagementEvent
from tests.conftest import assert_success


def test_redeeming_a_live_card_records_one_pending_growth_event(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    async def load_events() -> list[EngagementEvent]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(EngagementEvent).where(EngagementEvent.user_id == "fan")
                )
            )

    events = asyncio.run(load_events())

    assert [
        {
            "kind": event.kind,
            "sourceUserCardId": event.source_id,
            "status": event.status,
        }
        for event in events
    ] == [
        {
            "kind": "card_collected",
            "sourceUserCardId": redeemed["userCardId"],
            "status": "pending",
        }
    ]
