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
    CardPack,
    CardPackCard,
    Drop,
    EngagementEvent,
    FanLevel,
    MissionDefinition,
    MissionProgress,
    Notification,
    PassEntitlement,
    PassProgress,
    PassSeason,
    PassTier,
    PointBalance,
    PointLedger,
    ProfileEquipment,
    RewardCatalog,
    RewardGrant,
    RewardGrantCardPackEntitlement,
    ShopOrder,
    UserCard,
    XpLedger,
)
from app.routers import fan as fan_router
from app.services import (
    claim_reward_grant,
    mission_period_key,
    now,
    process_engagement_event,
    record_engagement_event,
)
from tests.conftest import assert_error, assert_success


def test_completed_unclaimed_mission_stays_claimable_until_reward_is_claimed(
    actors: dict[str, TestClient],
) -> None:
    async def seed_claimable_mission() -> None:
        async with SessionLocal() as session:
            reward = RewardCatalog(
                id="reward_mission_claimable",
                artist_id="artist_nova3",
                reward_type="badge",
                name="Mission Badge",
                status="published",
            )
            mission = MissionDefinition(
                id="mission_claimable",
                title="Claimable mission",
                event_kind="event_viewed",
                target_value=1,
                recurrence="once",
                reward_payload={"rewardId": reward.id},
                status="published",
            )
            session.add_all([reward, mission])
            await session.flush()
            event_row = EngagementEvent(
                id="evt_mission_claimable",
                user_id="fan",
                kind="event_viewed",
                source_type="event",
                source_id="event_claimable",
                status="processed",
                processed_at=now(),
            )
            session.add(event_row)
            await session.flush()
            session.add_all(
                [
                    MissionProgress(
                        id="mission_progress_claimable",
                        user_id="fan",
                        mission_id=mission.id,
                        period_key="once",
                        current_value=1,
                        completed_at=now(),
                    ),
                    RewardGrant(
                        id="reward_grant_mission_claimable",
                        user_id="fan",
                        reward_id=reward.id,
                        source_event_id=event_row.id,
                        rule_key="mission:mission_claimable:once",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_claimable_mission())

    active_before = assert_success(actors["fan"].get("/api/me/missions?status=active"))
    claimable = next(item for item in active_before["items"] if item["id"] == "mission_claimable")
    assert claimable["completed"] is True
    assert claimable["claimable"] is True
    assert claimable["claimedAt"] is None

    claimed = assert_success(actors["fan"].post("/api/me/missions/mission_claimable/claim"))
    assert claimed["missionId"] == "mission_claimable"
    assert [grant["id"] for grant in claimed["grants"]] == ["reward_grant_mission_claimable"]

    active_after = assert_success(actors["fan"].get("/api/me/missions?status=active"))
    assert "mission_claimable" not in {item["id"] for item in active_after["items"]}
    completed = assert_success(actors["fan"].get("/api/me/missions?status=completed"))
    completed_mission = next(
        item for item in completed["items"] if item["id"] == "mission_claimable"
    )
    assert completed_mission["claimable"] is False
    assert completed_mission["claimedAt"] is not None


def test_historical_unclaimed_repeatable_missions_remain_claimable_after_rollover(
    actors: dict[str, TestClient],
) -> None:
    event_time = now()
    current_daily_key = mission_period_key("daily", event_time, None, None)
    current_weekly_key = mission_period_key("weekly", event_time, None, None)
    season_starts_at = event_time - timedelta(days=1)
    season_ends_at = event_time + timedelta(days=30)
    current_season_key = mission_period_key("season", event_time, season_starts_at, season_ends_at)
    historical_periods = {
        "daily": (event_time - timedelta(days=1)).date().isoformat(),
        "weekly": mission_period_key("weekly", event_time - timedelta(days=7), None, None),
        "season": "season:previous-start:previous-end",
    }

    assert historical_periods["daily"] != current_daily_key
    assert historical_periods["weekly"] != current_weekly_key
    assert historical_periods["season"] != current_season_key

    async def seed_historical_claimable_missions() -> None:
        async with SessionLocal() as session:
            for recurrence, period_key in historical_periods.items():
                reward = RewardCatalog(
                    id=f"reward_historical_{recurrence}",
                    artist_id="artist_nova3",
                    reward_type="badge",
                    name=f"Historical {recurrence} Badge",
                    status="published",
                )
                mission = MissionDefinition(
                    id=f"mission_historical_{recurrence}",
                    title=f"Historical {recurrence} mission",
                    event_kind="event_viewed",
                    target_value=1,
                    recurrence=recurrence,
                    starts_at=season_starts_at if recurrence == "season" else None,
                    ends_at=season_ends_at if recurrence == "season" else None,
                    reward_payload={"rewardId": reward.id},
                    status="published",
                )
                event_row = EngagementEvent(
                    id=f"evt_historical_{recurrence}",
                    user_id="fan",
                    kind="event_viewed",
                    source_type="event",
                    source_id=f"event_historical_{recurrence}",
                    status="processed",
                    processed_at=event_time - timedelta(days=1),
                )
                session.add_all([reward, mission, event_row])
                await session.flush()
                session.add_all(
                    [
                        MissionProgress(
                            id=f"mission_progress_historical_{recurrence}",
                            user_id="fan",
                            mission_id=mission.id,
                            period_key=period_key,
                            current_value=1,
                            completed_at=event_time - timedelta(days=1),
                        ),
                        RewardGrant(
                            id=f"reward_grant_historical_{recurrence}",
                            user_id="fan",
                            reward_id=reward.id,
                            source_event_id=event_row.id,
                            rule_key=f"mission:{mission.id}:{period_key}",
                        ),
                    ]
                )
            await session.commit()

    asyncio.run(seed_historical_claimable_missions())

    active = assert_success(actors["fan"].get("/api/me/missions?status=active"))
    active_by_id = {item["id"]: item for item in active["items"]}
    for recurrence, period_key in historical_periods.items():
        item = active_by_id[f"mission_historical_{recurrence}"]
        assert item["periodKey"] == period_key
        assert item["currentValue"] == 1
        assert item["completed"] is True
        assert item["claimable"] is True
        assert item["claimedAt"] is None

    completed = assert_success(actors["fan"].get("/api/me/missions?status=completed"))
    completed_ids = {item["id"] for item in completed["items"]}
    assert {
        "mission_historical_daily",
        "mission_historical_weekly",
        "mission_historical_season",
    } <= completed_ids

    claimed = assert_success(actors["fan"].post("/api/me/missions/mission_historical_daily/claim"))
    assert [grant["id"] for grant in claimed["grants"]] == ["reward_grant_historical_daily"]
    assert_error(
        actors["fan"].post("/api/me/missions/mission_historical_daily/claim"),
        409,
        "MISSION_REWARD_NOT_READY",
    )


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
    assert claimed["rewardGrant"]["claimedAt"] is not None
    assert claimed["claimedAt"] is not None

    async def load_reward_notifications() -> list[Notification]:
        async with SessionLocal() as session:
            return list(
                await session.scalars(
                    select(Notification).where(
                        Notification.user_id == "fan",
                        Notification.event_key == f"reward:{claimed['rewardGrant']['id']}:claimed",
                    )
                )
            )

    notifications = asyncio.run(load_reward_notifications())
    assert len(notifications) == 1
    assert notifications[0].kind == "reward_claimed"

    assert_error(
        actors["fan"].post(f"/api/me/pass-tiers/{seeded_pass['tierId']}/claim"),
        409,
        "PASS_TIER_ALREADY_CLAIMED",
    )

    fan_pass = assert_success(actors["fan"].get("/api/me/pass"))
    assert fan_pass["seasons"][0]["tiers"][0]["claimed"] is True
    assert fan_pass["seasons"][0]["tiers"][0]["claimable"] is False


def test_claiming_card_pack_pass_reward_creates_openable_entitlement(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_card_pack_pass() -> None:
        async with SessionLocal() as session:
            pack = CardPack(
                id="pack_pass_claim",
                artist_id="artist_nova3",
                name="Pass Claim Pack",
                version="v1.0",
                status="published",
            )
            reward = RewardCatalog(
                id="reward_pass_card_pack",
                artist_id="artist_nova3",
                reward_type="card_pack",
                name="Pass Claim Pack Reward",
                metadata_={"cardPackId": pack.id},
                status="published",
            )
            season = PassSeason(
                id="pass_card_pack_season",
                artist_id="artist_nova3",
                title="Card Pack Pass",
                starts_at=now() - timedelta(days=1),
                ends_at=now() + timedelta(days=1),
                status="published",
            )
            tier = PassTier(
                id="pass_card_pack_tier",
                season_id=season.id,
                tier=1,
                required_xp=1,
                reward_id=reward.id,
            )
            event = EngagementEvent(
                id="evt_pass_card_pack_xp",
                user_id="fan",
                kind="card_collected",
                source_type="user_card",
                source_id="seeded_pass_card",
                payload={"artistId": "artist_nova3"},
                status="processed",
                processed_at=now(),
            )
            session.add_all(
                [
                    pack,
                    CardPackCard(
                        id="pack_pass_claim_card",
                        pack_id=pack.id,
                        card_id=seeded["ids"]["publishedCardId"],
                        position=1,
                        probability=100,
                    ),
                    reward,
                    season,
                    tier,
                    event,
                    XpLedger(
                        id="xp_pass_card_pack",
                        user_id="fan",
                        event_id=event.id,
                        rule_key="card_collected",
                        amount=1,
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_card_pack_pass())
    claimed = assert_success(actors["fan"].post("/api/me/pass-tiers/pass_card_pack_tier/claim"))
    assert claimed["rewardGrant"]["type"] == "card_pack"
    assert claimed["cardPackEntitlement"]["packId"] == "pack_pass_claim"

    async def load_entitlement() -> RewardGrantCardPackEntitlement | None:
        async with SessionLocal() as session:
            return await session.scalar(
                select(RewardGrantCardPackEntitlement).where(
                    RewardGrantCardPackEntitlement.reward_grant_id == claimed["rewardGrant"]["id"]
                )
            )

    entitlement = asyncio.run(load_entitlement())
    assert entitlement is not None
    assert entitlement.status == "available"

    opened = assert_success(actors["fan"].post("/api/me/card-packs/pack_pass_claim/open"), 201)
    assert opened["packId"] == "pack_pass_claim"
    entitlement = asyncio.run(load_entitlement())
    assert entitlement is not None
    assert entitlement.status == "opened"


def test_global_progression_includes_grants_from_global_pass_events(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_global_pass_grant() -> None:
        async with SessionLocal() as session:
            session.add(
                RewardCatalog(
                    id="reward_global_pass_artist_tagged",
                    artist_id="artist_nova3",
                    reward_type="badge",
                    name="Global Pass Badge",
                    status="published",
                )
            )
            session.add(
                PassSeason(
                    id="pass_global_scope",
                    artist_id=None,
                    title="Global Pass",
                    status="published",
                    starts_at=now() - timedelta(days=1),
                    ends_at=now() + timedelta(days=7),
                    is_paid=False,
                )
            )
            session.add(
                PassTier(
                    id="pass_global_scope_tier",
                    season_id="pass_global_scope",
                    tier=1,
                    required_xp=0,
                    reward_id="reward_global_pass_artist_tagged",
                )
            )
            session.add(
                EngagementEvent(
                    id="evt_global_pass_scope",
                    user_id="fan",
                    kind="pass_tier_claimed",
                    source_type="pass_tier",
                    source_id="pass_global_scope_tier",
                    payload={},
                    status="processed",
                    processed_at=now(),
                )
            )
            session.add(
                RewardGrant(
                    id="reward_grant_global_pass_scope",
                    user_id="fan",
                    reward_id="reward_global_pass_artist_tagged",
                    source_event_id="evt_global_pass_scope",
                    rule_key="pass_tier:pass_global_scope_tier",
                    claimed_at=now(),
                )
            )
            await session.commit()

    asyncio.run(seed_global_pass_grant())
    progression = assert_success(actors["fan"].get("/api/me/progression?scope=global"))
    assert [item["id"] for item in progression["claimedRewards"]] == [
        "reward_grant_global_pass_scope"
    ]


def test_reconcile_pass_rewards_restores_missing_grant_for_authenticated_fan(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_missing_grant() -> None:
        async with SessionLocal() as session:
            session.add_all(
                [
                    RewardCatalog(
                        id="reward_global_pass_missing_grant",
                        artist_id="artist_nova3",
                        reward_type="badge",
                        name="Recovered Global Pass Badge",
                        status="published",
                    ),
                    PassSeason(
                        id="pass_global_missing_grant",
                        artist_id=None,
                        title="Global Pass With Missing Grant",
                        status="published",
                        starts_at=now() - timedelta(days=1),
                        ends_at=now() + timedelta(days=7),
                        is_paid=False,
                    ),
                    PassTier(
                        id="pass_global_missing_grant_tier",
                        season_id="pass_global_missing_grant",
                        tier=1,
                        required_xp=0,
                        reward_id="reward_global_pass_missing_grant",
                    ),
                    PassProgress(
                        id="pass_progress_fan_global_missing_grant",
                        user_id="fan",
                        season_id="pass_global_missing_grant",
                        current_xp=0,
                        claimed_tier_ids=["pass_global_missing_grant_tier"],
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_missing_grant())

    repaired = assert_success(actors["fan"].post("/api/me/rewards/reconcile-pass"))
    assert repaired == {"repairedCount": 1}
    assert assert_success(actors["fan"].post("/api/me/rewards/reconcile-pass")) == {
        "repairedCount": 0
    }

    progression = assert_success(actors["fan"].get("/api/me/progression?scope=global"))
    assert [item["rewardId"] for item in progression["claimedRewards"]] == [
        "reward_global_pass_missing_grant"
    ]


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


def test_paid_season_exposes_two_lanes_and_unlocks_premium_after_purchase(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_paid_season() -> None:
        async with SessionLocal() as session:
            free = RewardCatalog(
                id="reward_paid_free",
                artist_id="artist_nova3",
                reward_type="badge",
                name="Free season badge",
                status="published",
            )
            premium = RewardCatalog(
                id="reward_paid_premium",
                artist_id="artist_nova3",
                reward_type="profile_frame",
                name="Premium season frame",
                status="published",
            )
            season = PassSeason(
                id="pass_paid_contract",
                artist_id="artist_nova3",
                title="Paid Contract Season",
                status="published",
                is_paid=True,
                premium_enabled=True,
                premium_price_points=1200,
                starts_at=now() - timedelta(days=1),
                ends_at=now() + timedelta(days=7),
            )
            tier = PassTier(
                id="pass_paid_contract_tier",
                season_id=season.id,
                tier=1,
                required_xp=0,
                reward_id=free.id,
                premium_reward_id=premium.id,
            )
            session.add_all([free, premium, season, tier])
            await session.commit()

    asyncio.run(seed_paid_season())
    before = assert_success(actors["fan"].get("/api/me/pass"))
    season = next(item for item in before["seasons"] if item["id"] == "pass_paid_contract")
    assert season["isPaid"] is True
    assert season["premiumEnabled"] is True
    assert season["isPurchased"] is False
    assert season["tiers"][0]["freeReward"]["name"] == "Free season badge"
    assert season["tiers"][0]["premiumReward"]["name"] == "Premium season frame"
    assert season["tiers"][0]["premiumClaimable"] is False

    assert_error(
        actors["fan"].post("/api/me/pass-seasons/pass_paid_contract/purchase"),
        409,
        "INSUFFICIENT_POINTS",
    )

    async def fund_fan() -> None:
        async with SessionLocal() as session:
            session.add(PointBalance(user_id="fan", balance=1500))
            await session.commit()

    asyncio.run(fund_fan())
    purchased = assert_success(
        actors["fan"].post("/api/me/pass-seasons/pass_paid_contract/purchase")
    )
    assert purchased["pricePoints"] == 1200

    async def load_pass_order() -> tuple[ShopOrder | None, PassEntitlement | None]:
        async with SessionLocal() as session:
            order = await session.scalar(
                select(ShopOrder).where(
                    ShopOrder.user_id == "fan",
                    ShopOrder.product_id == "pass_product_pass_paid_contract",
                )
            )
            entitlement = await session.scalar(
                select(PassEntitlement).where(
                    PassEntitlement.user_id == "fan",
                    PassEntitlement.season_id == "pass_paid_contract",
                )
            )
            return order, entitlement

    pass_order, pass_entitlement = asyncio.run(load_pass_order())
    assert pass_order is not None
    assert pass_order.product_name == "Paid Contract Season"
    assert pass_order.price_points == 1200
    assert pass_order.status == "completed"
    assert pass_entitlement is not None
    assert pass_entitlement.order_id == pass_order.id
    after_purchase = assert_success(actors["fan"].get("/api/me/pass"))
    purchased_season = next(
        item for item in after_purchase["seasons"] if item["id"] == "pass_paid_contract"
    )
    assert purchased_season["isPurchased"] is True
    assert purchased_season["tiers"][0]["premiumClaimable"] is True
    claimed = assert_success(
        actors["fan"].post("/api/me/pass-tiers/pass_paid_contract_tier/claim?track=premium")
    )
    assert claimed["track"] == "premium"


def test_global_paid_season_creates_a_global_order_product_and_unlocks_premium(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_global_paid_season() -> None:
        async with SessionLocal() as session:
            reward = RewardCatalog(
                id="reward_global_paid_premium",
                artist_id=None,
                reward_type="badge",
                name="Global premium badge",
                status="published",
            )
            season = PassSeason(
                id="pass_global_paid_contract",
                artist_id=None,
                title="Global paid season",
                description="A cross-artist premium season.",
                status="published",
                is_paid=True,
                premium_enabled=True,
                premium_price_points=300,
                starts_at=now() - timedelta(days=1),
                ends_at=now() + timedelta(days=30),
            )
            tier = PassTier(
                id="pass_global_paid_contract_tier",
                season_id=season.id,
                tier=1,
                required_xp=0,
                reward_id=reward.id,
                premium_reward_id=reward.id,
            )
            session.add_all([reward, season, tier, PointBalance(user_id="fan", balance=500)])
            await session.commit()

    asyncio.run(seed_global_paid_season())
    purchased = assert_success(
        actors["fan"].post("/api/me/pass-seasons/pass_global_paid_contract/purchase")
    )
    assert purchased["pricePoints"] == 300

    async def load_global_order() -> tuple[ShopOrder | None, PassEntitlement | None]:
        async with SessionLocal() as session:
            order = await session.scalar(
                select(ShopOrder).where(
                    ShopOrder.user_id == "fan",
                    ShopOrder.product_id == "pass_product_pass_global_paid_contract",
                )
            )
            entitlement = await session.scalar(
                select(PassEntitlement).where(
                    PassEntitlement.user_id == "fan",
                    PassEntitlement.season_id == "pass_global_paid_contract",
                )
            )
            return order, entitlement

    order, entitlement = asyncio.run(load_global_order())
    assert order is not None
    assert entitlement is not None
    assert entitlement.order_id == order.id


def test_point_charge_packages_credit_balance_idempotently_and_refund_to_ledger(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    starting_balance = assert_success(actors["fan"].get("/api/me/points"))["balance"]
    packages = assert_success(actors["fan"].get("/api/catalog/point-charges"))
    package = next(item for item in packages["items"] if item["id"] == "points_1000")
    assert package["points"] == 1000

    first = assert_success(
        actors["fan"].post(
            "/api/me/point-charges",
            json={"packageId": package["id"], "paymentMethod": "sandbox_card"},
            headers={"Idempotency-Key": "point-charge-contract-1"},
        ),
        201,
    )
    replay = assert_success(
        actors["fan"].post(
            "/api/me/point-charges",
            json={"packageId": package["id"], "paymentMethod": "sandbox_card"},
            headers={"Idempotency-Key": "point-charge-contract-1"},
        ),
        201,
    )
    assert first["chargeId"] == replay["chargeId"]
    assert replay["replayed"] is True
    assert assert_success(actors["fan"].get("/api/me/points"))["balance"] == starting_balance + 1000

    refunded = assert_success(
        actors["fan"].post(f"/api/me/point-charges/{first['chargeId']}/refund"),
        201,
    )
    assert refunded["status"] == "refunded"
    assert assert_success(actors["fan"].get("/api/me/points"))["balance"] == starting_balance

    charges = assert_success(actors["fan"].get("/api/me/point-charges"))
    assert charges["items"][0]["status"] == "refunded"


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

        def add(self, entity: Any) -> None:
            assert isinstance(entity, Notification)

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
    assert redeemed["growthEventId"] == events[0].id
    assert redeemed["growthStatus"] == "pending"
    assert redeemed["awardedXp"] == 30


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


def test_fan_points_and_exchange_are_backed_by_balance_ledger_and_idempotent_grant(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    async def seed_point_reward() -> None:
        async with SessionLocal() as session:
            session.add(
                RewardCatalog(
                    id="reward_point_exchange_card",
                    artist_id="artist_nova3",
                    reward_type="digital_bonus",
                    name="Point Exchange Ticket",
                    metadata_={"pointCost": 10},
                    status="published",
                )
            )
            session.add(PointBalance(user_id="fan", balance=20))
            await session.commit()

    asyncio.run(seed_point_reward())

    profile = assert_success(actors["fan"].get("/api/me"))
    assert profile["points"] == 20
    points = assert_success(actors["fan"].get("/api/me/points"))
    assert points["balance"] == 20
    assert points["items"] == []

    first = assert_success(
        actors["fan"].post(
            "/api/me/points/exchange",
            json={"rewardId": "reward_point_exchange_card"},
            headers={"Idempotency-Key": "fan-point-exchange-1"},
        ),
        201,
    )
    replay = assert_success(
        actors["fan"].post(
            "/api/me/points/exchange",
            json={"rewardId": "reward_point_exchange_card"},
            headers={"Idempotency-Key": "fan-point-exchange-1"},
        ),
        201,
    )

    assert first["points"] == 10
    assert replay["replayed"] is True
    assert replay["grantId"] == first["grantId"]

    async def load_spend_rows() -> tuple[list[PointLedger], list[RewardGrant]]:
        async with SessionLocal() as session:
            ledgers = list(
                await session.scalars(
                    select(PointLedger).where(
                        PointLedger.user_id == "fan",
                        PointLedger.transaction_type == "spend",
                    )
                )
            )
            grants = list(
                await session.scalars(select(RewardGrant).where(RewardGrant.user_id == "fan"))
            )
            return ledgers, grants

    spend_rows, grants = asyncio.run(load_spend_rows())
    assert len(spend_rows) == 1
    assert spend_rows[0].amount == -10
    assert spend_rows[0].balance_after == 10
    assert len(grants) == 1
