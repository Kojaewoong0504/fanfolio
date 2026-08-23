import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.background import BackgroundTasks

from app.db.session import SessionLocal
from app.models import EngagementEvent
from app.routers import fan as fan_router
from tests.conftest import assert_error, assert_success


def _pack_payload(seeded: dict[str, Any]) -> dict[str, Any]:
    return {
        "artistId": "artist_nova3",
        "name": "Nebula Ver.",
        "seasonName": "정규 1집 · DREAMSCAPE",
        "version": "v1.0",
        "imageUrl": "/assets/packs/nebula.png",
        "description": "공개 확률이 고정된 테스트 카드팩",
        "cards": [
            {
                "cardId": seeded["ids"]["publishedCardId"],
                "position": 1,
                "probability": 100,
                "enabled": True,
            }
        ],
    }


def test_admin_can_create_publish_and_fan_can_open_card_pack(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["admin"].post("/api/admin/card-packs", json=_pack_payload(seeded)), 201
    )
    assert created["status"] == "draft"
    assert created["cards"][0]["probability"] == 100

    detail = assert_success(actors["admin"].get(f"/api/admin/card-packs/{created['id']}"))
    assert detail["cards"][0]["cardId"] == seeded["ids"]["publishedCardId"]

    published = assert_success(
        actors["admin"].post(f"/api/admin/card-packs/{created['id']}/publish")
    )
    assert published["status"] == "published"

    catalog = assert_success(actors["fan"].get("/api/catalog/card-packs"))
    pack = next(item for item in catalog["items"] if item["id"] == created["id"])
    assert pack["cards"][0]["probability"] == 100

    odds = assert_success(actors["fan"].get(f"/api/catalog/card-packs/{created['id']}/odds"))
    assert odds["totalProbability"] == 100

    opened = assert_success(actors["fan"].post(f"/api/me/card-packs/{created['id']}/open"), 201)
    assert opened["cardId"] == seeded["ids"]["publishedCardId"]
    assert opened["issuanceCode"].startswith("PF-")

    collection = assert_success(actors["fan"].get("/api/me/collection"))
    assert any(card["userCardId"] == opened["userCardId"] for card in collection["cards"])


def test_open_card_pack_enqueues_committed_growth_event_once_for_idempotent_replay(
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
    created = assert_success(
        actors["admin"].post("/api/admin/card-packs", json=_pack_payload(seeded)), 201
    )
    assert_success(actors["admin"].post(f"/api/admin/card-packs/{created['id']}/publish"))

    enqueued_event_ids: list[str] = []

    def assert_event_is_committed(event_id: str) -> None:
        async def load() -> EngagementEvent | None:
            async with SessionLocal() as session:
                return await session.get(EngagementEvent, event_id)

        with ThreadPoolExecutor(max_workers=1) as executor:
            event = executor.submit(lambda: asyncio.run(load())).result()

        assert isinstance(event, EngagementEvent)
        assert event.id == event_id
        assert event.kind == "card_collected"
        assert event.status == "pending"

    def spy_enqueue(event_id: str, background_tasks: BackgroundTasks) -> None:
        assert isinstance(background_tasks, BackgroundTasks)
        assert_event_is_committed(event_id)
        enqueued_event_ids.append(event_id)

    monkeypatch.setattr(fan_router, "enqueue_engagement_event", spy_enqueue)

    headers = {"Idempotency-Key": "pack-open-contract-enqueue-001"}
    first = assert_success(
        actors["fan"].post(f"/api/me/card-packs/{created['id']}/open", headers=headers),
        201,
    )
    second = assert_success(
        actors["fan"].post(f"/api/me/card-packs/{created['id']}/open", headers=headers),
        201,
    )

    assert second == first

    async def load_events() -> list[EngagementEvent]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(EngagementEvent).where(EngagementEvent.user_id == "fan")
                )
            )

    events = asyncio.run(load_events())
    assert len(events) == 1
    assert events[0].source_id == first["userCardId"]
    assert enqueued_event_ids == [events[0].id]


def test_card_pack_requires_transparent_probability_total(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    payload = _pack_payload(seeded)
    payload["cards"][0]["probability"] = 99
    response = actors["admin"].post("/api/admin/card-packs", json=payload)
    assert_error(response, 422, "INVALID_PACK_ODDS")


def test_admin_can_update_draft_card_pack_composition(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    created = assert_success(
        actors["admin"].post("/api/admin/card-packs", json=_pack_payload(seeded)), 201
    )
    payload = _pack_payload(seeded)
    payload["name"] = "Nebula Ver. updated"
    updated = assert_success(
        actors["admin"].patch(f"/api/admin/card-packs/{created['id']}", json=payload)
    )
    assert updated["name"] == "Nebula Ver. updated"
    assert updated["cards"][0]["probability"] == 100
