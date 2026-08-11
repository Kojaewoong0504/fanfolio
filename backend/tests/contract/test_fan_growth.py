import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.background import BackgroundTasks

from app.db.session import SessionLocal
from app.models import (
    AchievementDefinition,
    AchievementProgress,
    EngagementEvent,
    FanLevel,
    Notification,
    RewardCatalog,
    RewardGrant,
    XpLedger,
)
from app.routers import fan as fan_router
from tests.conftest import assert_success


def load_fan_growth_events() -> list[EngagementEvent]:
    async def load_events() -> list[EngagementEvent]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(EngagementEvent).where(EngagementEvent.user_id == "fan")
                )
            )

    return asyncio.run(load_events())


def seed_first_card_achievement() -> str:
    async def seed() -> str:
        async with SessionLocal() as session:
            reward = RewardCatalog(
                id="reward_first_card_title",
                artist_id="artist_nova3",
                reward_type="title",
                name="First Card Fan",
                status="published",
            )
            achievement = AchievementDefinition(
                id="achievement_first_card_contract",
                artist_id="artist_nova3",
                title="First Card",
                condition_type="first_card",
                target_value=1,
                reward_rule_key=reward.id,
                status="published",
            )
            session.add_all([reward, achievement])
            await session.commit()
            return achievement.id

    return asyncio.run(seed())


def test_redeeming_a_live_card_records_one_pending_growth_event(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    events = load_fan_growth_events()

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
            "status": "processed",
        }
    ]


def test_redeeming_a_live_card_processes_xp_achievement_reward_and_notification(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    achievement_id = seed_first_card_achievement()

    assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    async def load() -> dict[str, Any]:
        async with SessionLocal() as session:
            event = await session.scalar(
                select(EngagementEvent).where(EngagementEvent.user_id == "fan")
            )
            progress = await session.scalar(
                select(AchievementProgress).where(
                    AchievementProgress.user_id == "fan",
                    AchievementProgress.achievement_id == achievement_id,
                )
            )
            grant = await session.scalar(select(RewardGrant).where(RewardGrant.user_id == "fan"))
            notification = await session.scalar(
                select(Notification).where(
                    Notification.user_id == "fan",
                    Notification.event_key == f"achievement:{achievement_id}:fan",
                )
            )
            xp_rows = list(await session.scalars(select(XpLedger).where(XpLedger.user_id == "fan")))
            level = await session.get(FanLevel, "fan")
            return {
                "event": event,
                "progress": progress,
                "grant": grant,
                "notification": notification,
                "xpRows": xp_rows,
                "level": level,
            }

    growth = asyncio.run(load())

    assert growth["event"].status == "processed"
    assert growth["progress"].current_value == 1
    assert growth["progress"].completed_at is not None
    assert growth["grant"].reward_id == "reward_first_card_title"
    assert growth["notification"].kind == "achievement_unlocked"
    assert [row.amount for row in growth["xpRows"]] == [30]
    assert growth["level"].total_xp == 30


def test_successful_redemption_enqueues_committed_growth_event(
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
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

    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    events = load_fan_growth_events()
    assert len(events) == 1
    assert enqueued_event_ids == [events[0].id]
    assert events[0].source_id == redeemed["userCardId"]


def test_successful_redemption_returns_created_when_enqueue_fails(
    actors: dict[str, TestClient], seeded: dict[str, Any], monkeypatch: Any
) -> None:
    def fail_enqueue(event_id: str, background_tasks: BackgroundTasks) -> None:
        raise RuntimeError(f"queue unavailable for {event_id}")

    monkeypatch.setattr(fan_router, "enqueue_engagement_event", fail_enqueue)

    redeemed = assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    events = load_fan_growth_events()
    assert len(events) == 1
    assert events[0].source_id == redeemed["userCardId"]
    assert events[0].status == "pending"
