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
    Card,
    Drop,
    EngagementEvent,
    FanLevel,
    Notification,
    ProfileEquipment,
    RewardCatalog,
    RewardGrant,
    UserCard,
    XpLedger,
)
from app.routers import fan as fan_router
from app.services import now, process_engagement_event, record_engagement_event
from tests.conftest import assert_error, assert_success


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


def seed_reward_grants(user_id: str, reward_types: list[str]) -> list[str]:
    async def seed() -> list[str]:
        async with SessionLocal() as session:
            grant_ids: list[str] = []
            for index, reward_type in enumerate(reward_types, start=1):
                reward = RewardCatalog(
                    id=f"reward_{user_id}_{reward_type}_{index}",
                    artist_id="artist_nova3",
                    reward_type=reward_type,
                    name=f"{reward_type.title()} Reward {index}",
                    status="published",
                )
                event = EngagementEvent(
                    id=f"evt_{user_id}_{reward_type}_{index}",
                    user_id=user_id,
                    kind="card_collected",
                    source_type="test",
                    source_id=f"source_{reward_type}_{index}",
                    payload={},
                    status="processed",
                    processed_at=now(),
                )
                grant = RewardGrant(
                    id=f"reward_grant_{user_id}_{reward_type}_{index}",
                    user_id=user_id,
                    reward_id=reward.id,
                    source_event_id=event.id,
                    rule_key=f"test:{reward_type}:{index}",
                )
                session.add_all([reward, event, grant])
                grant_ids.append(grant.id)
            await session.commit()
            return grant_ids

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


def test_fan_can_read_progression_with_only_their_reward_grants(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_first_card_achievement()
    other_grant_id = seed_reward_grants("otherFan", ["title"])[0]

    assert_success(
        actors["fan"].post(
            "/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}
        ),
        201,
    )

    progression = assert_success(actors["fan"].get("/api/me/progression"))

    assert progression["level"] == {"level": 1, "totalXp": 30}
    assert progression["achievements"][0]["completedAt"] is not None
    assert progression["claimableRewards"][0]["type"] == "title"
    assert progression["claimableRewards"][0]["claimedAt"] is None
    assert progression["claimableRewards"][0]["id"] != other_grant_id
    assert all(item["id"] != other_grant_id for item in progression["claimableRewards"])
    assert progression["equipment"] == {
        "titleRewardId": None,
        "badgeRewardIds": [],
        "frameRewardId": None,
        "themeRewardId": None,
        "publicProfileEnabled": False,
    }


def test_fan_cannot_claim_another_fans_reward(actors: dict[str, TestClient]) -> None:
    other_grant_id = seed_reward_grants("otherFan", ["title"])[0]

    assert_error(
        actors["fan"].post(f"/api/me/rewards/{other_grant_id}/claim"),
        404,
        "REWARD_GRANT_NOT_FOUND",
    )


def test_claiming_a_reward_is_idempotent_for_the_owner(actors: dict[str, TestClient]) -> None:
    grant_id = seed_reward_grants("fan", ["title"])[0]

    first = assert_success(actors["fan"].post(f"/api/me/rewards/{grant_id}/claim"))
    second = assert_success(actors["fan"].post(f"/api/me/rewards/{grant_id}/claim"))

    assert first == second
    assert first["id"] == grant_id
    assert first["type"] == "title"
    assert first["claimedAt"] is not None
    assert assert_success(actors["fan"].get("/api/me/progression"))["claimableRewards"] == []


def test_fan_can_equip_claimed_rewards_by_type(actors: dict[str, TestClient]) -> None:
    title_grant_id = seed_reward_grants("fan", ["title"])[0]
    badge_grant_ids = seed_reward_grants("fan", ["badge", "badge", "badge"])
    frame_grant_id = seed_reward_grants("fan", ["profile_frame"])[0]
    theme_grant_id = seed_reward_grants("fan", ["collection_theme"])[0]

    assert_success(actors["fan"].post(f"/api/me/rewards/{title_grant_id}/claim"))
    for grant_id in [*badge_grant_ids, frame_grant_id, theme_grant_id]:
        assert_success(actors["fan"].post(f"/api/me/rewards/{grant_id}/claim"))

    equipped = assert_success(
        actors["fan"].put(
            "/api/me/profile/equipment",
            json={
                "titleRewardId": title_grant_id,
                "badgeRewardIds": badge_grant_ids,
                "frameRewardId": frame_grant_id,
                "themeRewardId": theme_grant_id,
                "publicProfileEnabled": False,
            },
        )
    )

    assert equipped == {
        "titleRewardId": title_grant_id,
        "badgeRewardIds": badge_grant_ids,
        "frameRewardId": frame_grant_id,
        "themeRewardId": theme_grant_id,
        "publicProfileEnabled": False,
    }

    async def load_equipment() -> ProfileEquipment | None:
        async with SessionLocal() as session:
            return await session.get(ProfileEquipment, "fan")

    equipment = asyncio.run(load_equipment())
    assert equipment is not None
    assert equipment.equipped_reward_ids == [
        title_grant_id,
        *badge_grant_ids,
        frame_grant_id,
        theme_grant_id,
    ]
    assert equipment.is_public is False


def test_profile_equipment_rejects_more_than_three_badges(
    actors: dict[str, TestClient],
) -> None:
    badge_grant_ids = seed_reward_grants("fan", ["badge", "badge", "badge", "badge"])

    assert_error(
        actors["fan"].put(
            "/api/me/profile/equipment",
            json={"badgeRewardIds": badge_grant_ids},
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_profile_equipment_requires_owner_grant_and_matching_reward_type(
    actors: dict[str, TestClient],
) -> None:
    title_grant_id = seed_reward_grants("fan", ["title"])[0]
    badge_grant_id = seed_reward_grants("fan", ["badge"])[0]
    other_badge_grant_id = seed_reward_grants("otherFan", ["badge"])[0]

    assert_success(actors["fan"].post(f"/api/me/rewards/{title_grant_id}/claim"))

    assert_error(
        actors["fan"].put(
            "/api/me/profile/equipment",
            json={"badgeRewardIds": [badge_grant_id]},
        ),
        409,
        "REWARD_GRANT_UNCLAIMED",
    )
    assert_error(
        actors["fan"].put(
            "/api/me/profile/equipment",
            json={"badgeRewardIds": [other_badge_grant_id]},
        ),
        404,
        "REWARD_GRANT_NOT_FOUND",
    )
    assert_error(
        actors["fan"].put(
            "/api/me/profile/equipment",
            json={"badgeRewardIds": [title_grant_id]},
        ),
        422,
        "INVALID_EQUIPMENT_REWARD_TYPE",
    )


def test_non_live_source_card_does_not_advance_achievement(seeded: dict[str, Any]) -> None:
    achievement_id = seed_first_card_achievement()

    async def create_and_process_non_live_event() -> None:
        async with SessionLocal() as session:
            card = await session.get(Card, seeded["ids"]["publishedCardId"])
            drop = await session.get(Drop, "drop_ended")
            assert card is not None
            assert drop is not None
            user_card = UserCard(
                id="uc_growth_ended_drop",
                user_id="fan",
                card_id=card.id,
                drop_id=drop.id,
                serial_number=991,
                acquisition_source="test",
                acquired_at=now(),
            )
            session.add(user_card)
            await session.flush()
            event = await record_engagement_event(
                session,
                user_id="fan",
                kind="card_collected",
                source_type="user_card",
                source_id=user_card.id,
                payload={
                    "cardId": card.id,
                    "artistId": card.artist_id,
                    "memberId": card.member_id,
                    "dropId": drop.id,
                },
            )
            await session.commit()

        await process_engagement_event(event.id)

    asyncio.run(create_and_process_non_live_event())

    async def load() -> dict[str, Any]:
        async with SessionLocal() as session:
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
            event = await session.scalar(
                select(EngagementEvent).where(EngagementEvent.source_id == "uc_growth_ended_drop")
            )
            xp_rows = list(await session.scalars(select(XpLedger).where(XpLedger.user_id == "fan")))
            level = await session.get(FanLevel, "fan")
            return {
                "progress": progress,
                "grant": grant,
                "notification": notification,
                "event": event,
                "xpRows": xp_rows,
                "level": level,
            }

    growth = asyncio.run(load())

    assert growth["event"].status == "processed"
    assert growth["progress"].current_value == 0
    assert growth["progress"].completed_at is None
    assert growth["grant"] is None
    assert growth["notification"] is None
    assert growth["xpRows"] == []
    assert growth["level"] is None


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
