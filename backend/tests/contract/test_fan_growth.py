import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
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
    PassProgress,
    PassSeason,
    PassTier,
    ProfileEquipment,
    RewardCatalog,
    RewardGrant,
    UserCard,
    XpLedger,
)
from app.routers import fan as fan_router
from app.services import claim_reward_grant, now, process_engagement_event, record_engagement_event
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


def seed_pass_reward() -> None:
    async def seed() -> None:
        async with SessionLocal() as session:
            session.add(
                RewardCatalog(
                    id="reward_pass_badge",
                    artist_id="artist_nova3",
                    reward_type="badge",
                    name="Pass Badge",
                    status="published",
                )
            )
            await session.commit()

    asyncio.run(seed())


def seed_pass_xp(
    user_id: str,
    amount: int = 30,
    *,
    created_at: datetime | None = None,
    suffix: str = "pass",
) -> None:
    async def seed() -> None:
        ledger_created_at = created_at or now()
        async with SessionLocal() as session:
            event = EngagementEvent(
                id=f"evt_{user_id}_{suffix}_xp",
                user_id=user_id,
                kind="card_collected",
                source_type="test",
                source_id=f"source_{user_id}_{suffix}_xp",
                payload={"artistId": "artist_nova3"},
                status="processed",
                processed_at=ledger_created_at,
            )
            session.add(event)
            session.add(
                XpLedger(
                    id=f"xp_{user_id}_{suffix}",
                    user_id=user_id,
                    event_id=event.id,
                    rule_key="card_collected",
                    amount=amount,
                    created_at=ledger_created_at,
                )
            )
            await session.commit()

    asyncio.run(seed())


def seed_pass_seasons() -> dict[str, str]:
    async def seed() -> dict[str, str]:
        async with SessionLocal() as session:
            session.add_all(
                [
                    PassSeason(
                        id="pass_active_free",
                        artist_id="artist_nova3",
                        title="NOVA Free Pass",
                        status="published",
                        starts_at=now() - timedelta(days=1),
                        ends_at=now() + timedelta(days=7),
                        is_paid=False,
                    ),
                    PassSeason(
                        id="pass_draft_free",
                        artist_id="artist_nova3",
                        title="Draft Free Pass",
                        status="draft",
                        starts_at=now() - timedelta(days=1),
                        ends_at=now() + timedelta(days=7),
                        is_paid=False,
                    ),
                    PassSeason(
                        id="pass_active_paid",
                        artist_id="artist_nova3",
                        title="Paid Pass",
                        status="published",
                        starts_at=now() - timedelta(days=1),
                        ends_at=now() + timedelta(days=7),
                        is_paid=True,
                    ),
                ]
            )
            session.add_all(
                [
                    PassTier(
                        id="pass_tier_1",
                        season_id="pass_active_free",
                        tier=1,
                        required_xp=20,
                        reward_id="reward_pass_badge",
                    ),
                    PassTier(
                        id="pass_tier_2",
                        season_id="pass_active_free",
                        tier=2,
                        required_xp=60,
                        reward_id=None,
                    ),
                    PassTier(
                        id="pass_tier_draft",
                        season_id="pass_draft_free",
                        tier=1,
                        required_xp=10,
                        reward_id=None,
                    ),
                    PassTier(
                        id="pass_tier_paid",
                        season_id="pass_active_paid",
                        tier=1,
                        required_xp=10,
                        reward_id=None,
                    ),
                ]
            )
            await session.commit()
            return {"seasonId": "pass_active_free", "tierId": "pass_tier_1"}

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


def test_fan_pass_lists_only_published_free_seasons_and_refreshes_progress(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_pass_reward()
    seed_pass_xp("fan", amount=30)
    seeded_pass = seed_pass_seasons()

    fan_pass = assert_success(actors["fan"].get("/api/me/pass"))

    assert [season["id"] for season in fan_pass["seasons"]] == [seeded_pass["seasonId"]]
    season = fan_pass["seasons"][0]
    assert season["isPaid"] is False
    assert season["status"] == "published"
    assert season["progress"]["currentXp"] == 30
    assert season["tiers"] == [
        {
            "id": "pass_tier_1",
            "tier": 1,
            "requiredXp": 20,
            "rewardId": "reward_pass_badge",
            "reward": {
                "id": "reward_pass_badge",
                "type": "badge",
                "name": "Pass Badge",
                "metadata": {},
            },
            "claimed": False,
            "claimable": True,
        },
        {
            "id": "pass_tier_2",
            "tier": 2,
            "requiredXp": 60,
            "rewardId": None,
            "reward": None,
            "claimed": False,
            "claimable": False,
        },
    ]

    async def load_progress() -> PassProgress | None:
        async with SessionLocal() as session:
            return await session.get(PassProgress, "pass_progress_fan_pass_active_free")

    progress = asyncio.run(load_progress())
    assert progress is not None
    assert progress.current_xp == 30


def test_fan_pass_progress_ignores_xp_before_season_start(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_pass_reward()
    seed_pass_xp(
        "fan",
        amount=100,
        created_at=now() - timedelta(days=30),
        suffix="prior_season",
    )
    seeded_pass = seed_pass_seasons()

    fan_pass = assert_success(actors["fan"].get("/api/me/pass"))

    season = fan_pass["seasons"][0]
    assert season["id"] == seeded_pass["seasonId"]
    assert season["progress"]["currentXp"] == 0
    assert season["tiers"][0]["claimable"] is False
    assert_error(
        actors["fan"].post(f"/api/me/pass-tiers/{seeded_pass['tierId']}/claim"),
        409,
        "PASS_TIER_LOCKED",
    )


def test_fan_can_claim_unlocked_pass_tier_once(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_pass_reward()
    seed_pass_xp("fan", amount=30)
    seeded_pass = seed_pass_seasons()

    claimed = assert_success(
        actors["fan"].post(f"/api/me/pass-tiers/{seeded_pass['tierId']}/claim")
    )

    assert claimed["tierId"] == seeded_pass["tierId"]
    assert claimed["seasonId"] == seeded_pass["seasonId"]
    assert claimed["rewardGrant"]["rewardId"] == "reward_pass_badge"
    assert claimed["claimedAt"] is not None

    assert_error(
        actors["fan"].post(f"/api/me/pass-tiers/{seeded_pass['tierId']}/claim"),
        409,
        "PASS_TIER_ALREADY_CLAIMED",
    )

    fan_pass = assert_success(actors["fan"].get("/api/me/pass"))
    assert fan_pass["seasons"][0]["tiers"][0]["claimed"] is True
    assert fan_pass["seasons"][0]["tiers"][0]["claimable"] is False


def test_pass_tier_claim_requires_owner_progress_and_required_xp(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_pass_reward()
    seed_pass_xp("fan", amount=30)
    seeded_pass = seed_pass_seasons()

    assert_error(
        actors["otherFan"].post(f"/api/me/pass-tiers/{seeded_pass['tierId']}/claim"),
        409,
        "PASS_TIER_LOCKED",
    )


def test_pass_tier_claim_allows_fourteen_day_post_season_grace(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_pass_reward()
    seed_pass_xp(
        "fan",
        amount=30,
        created_at=now() - timedelta(days=14),
        suffix="grace_season",
    )

    async def seed_ended_passes() -> dict[str, str]:
        async with SessionLocal() as session:
            session.add_all(
                [
                    PassSeason(
                        id="pass_grace",
                        artist_id="artist_nova3",
                        title="Grace Pass",
                        status="published",
                        starts_at=now() - timedelta(days=40),
                        ends_at=now() - timedelta(days=13),
                        is_paid=False,
                    ),
                    PassSeason(
                        id="pass_expired",
                        artist_id="artist_nova3",
                        title="Expired Pass",
                        status="published",
                        starts_at=now() - timedelta(days=40),
                        ends_at=now() - timedelta(days=15),
                        is_paid=False,
                    ),
                ]
            )
            session.add_all(
                [
                    PassTier(
                        id="pass_tier_grace",
                        season_id="pass_grace",
                        tier=1,
                        required_xp=20,
                        reward_id=None,
                    ),
                    PassTier(
                        id="pass_tier_expired",
                        season_id="pass_expired",
                        tier=1,
                        required_xp=20,
                        reward_id=None,
                    ),
                ]
            )
            await session.commit()
            return {"graceTierId": "pass_tier_grace", "expiredTierId": "pass_tier_expired"}

    tier_ids = asyncio.run(seed_ended_passes())

    assert_success(actors["fan"].post(f"/api/me/pass-tiers/{tier_ids['graceTierId']}/claim"))
    assert_error(
        actors["fan"].post(f"/api/me/pass-tiers/{tier_ids['expiredTierId']}/claim"),
        409,
        "PASS_SEASON_CLAIM_CLOSED",
    )


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
    seed_pass_reward()
    seed_pass_seasons()

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
    assert progression["pass"]["seasons"][0]["id"] == "pass_active_free"
    assert progression["pass"]["seasons"][0]["progress"]["currentXp"] == 30
    assert progression["pass"]["seasons"][0]["tiers"][0]["claimable"] is True
    assert progression["equipment"] == {
        "titleRewardId": None,
        "badgeRewardIds": [],
        "frameRewardId": None,
        "themeRewardId": None,
        "publicProfileEnabled": False,
    }


def test_progression_returns_server_owned_claimed_reward_inventory(
    actors: dict[str, TestClient],
) -> None:
    title_grant_id = seed_reward_grants("fan", ["title"])[0]
    badge_grant_ids = seed_reward_grants("fan", ["badge", "badge", "badge"])
    other_grant_id = seed_reward_grants("otherFan", ["badge"])[0]

    assert_success(actors["fan"].post(f"/api/me/rewards/{title_grant_id}/claim"))
    for grant_id in badge_grant_ids:
        assert_success(actors["fan"].post(f"/api/me/rewards/{grant_id}/claim"))

    progression = assert_success(actors["fan"].get("/api/me/progression"))

    claimed = progression["claimedRewards"]
    claimed_ids = {item["id"] for item in claimed}
    assert claimed_ids == {title_grant_id, *badge_grant_ids}
    assert other_grant_id not in claimed_ids
    assert progression["claimableRewards"] == []
    assert [item["type"] for item in claimed].count("badge") == 3
    assert all(item["claimedAt"] is not None for item in claimed)
    assert {item["rewardId"] for item in claimed} == {
        "reward_fan_title_1",
        "reward_fan_badge_1",
        "reward_fan_badge_2",
        "reward_fan_badge_3",
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


def test_claim_reward_locks_only_the_owner_grant_row() -> None:
    class SpySession:
        def __init__(self) -> None:
            self.lock_sql: str | None = None

        async def scalar(self, statement: Any) -> RewardGrant:
            self.lock_sql = str(
                statement.compile(
                    dialect=postgresql.dialect(),
                    compile_kwargs={"literal_binds": True},
                )
            )
            return RewardGrant(
                id="reward_grant_fan_title",
                user_id="fan",
                reward_id="reward_title",
                source_event_id="evt_1",
                rule_key="test:title",
            )

        async def get(self, model: Any, key: str) -> RewardCatalog:
            assert model is RewardCatalog
            assert key == "reward_title"
            return RewardCatalog(
                id="reward_title",
                reward_type="title",
                name="Title Reward",
                status="published",
            )

        async def commit(self) -> None:
            return None

    session = SpySession()

    data = asyncio.run(
        claim_reward_grant(session, user_id="fan", grant_id="reward_grant_fan_title")
    )

    assert data["claimedAt"] is not None
    assert session.lock_sql is not None
    assert "FROM reward_grants" in session.lock_sql
    assert "reward_catalog" not in session.lock_sql
    assert "FOR UPDATE" in session.lock_sql


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


def test_profile_equipment_rejects_blank_reward_ids(
    actors: dict[str, TestClient],
) -> None:
    payloads = [
        {"titleRewardId": ""},
        {"badgeRewardIds": [""]},
        {"frameRewardId": ""},
        {"themeRewardId": ""},
    ]

    for payload in payloads:
        assert_error(
            actors["fan"].put("/api/me/profile/equipment", json=payload),
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


def test_progression_can_be_read_for_one_artist_without_mixing_other_artist_xp(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    seed_first_card_achievement()

    async def seed_other_artist_xp() -> None:
        async with SessionLocal() as session:
            event = EngagementEvent(
                id="evt_fan_luminous_growth",
                user_id="fan",
                kind="card_collected",
                source_type="test",
                source_id="source_luminous_growth",
                payload={"artistId": "artist_luminous"},
                status="processed",
                processed_at=now(),
            )
            session.add(event)
            session.add(
                XpLedger(
                    id="xp_fan_luminous_growth",
                    user_id="fan",
                    event_id=event.id,
                    rule_key="card_collected",
                    amount=70,
                )
            )
            await session.commit()

    asyncio.run(seed_other_artist_xp())
    all_progression = assert_success(actors["fan"].get("/api/me/progression"))
    nova_progression = assert_success(
        actors["fan"].get("/api/me/progression?artistId=artist_nova3")
    )
    luminous_progression = assert_success(
        actors["fan"].get("/api/me/progression?artistId=artist_luminous")
    )

    assert all_progression["level"]["totalXp"] == 70
    assert nova_progression["level"]["totalXp"] == 0
    assert luminous_progression["level"]["totalXp"] == 70
