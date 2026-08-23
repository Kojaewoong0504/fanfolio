import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models, services
from app.errors import AppError


async def create_growth_test_session():
    engine = create_async_engine("sqlite+aiosqlite://")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(models.Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, session_factory


async def seed_growth_catalog(session):
    session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
    session.add(models.Artist(id="artist_nova3", name="NOVA-3"))
    session.add(models.Drop(id="drop_live", name="Live Drop", status="live"))
    session.add(models.Drop(id="drop_ended", name="Ended Drop", status="ended"))
    await session.flush()
    session.add_all(
        [
            models.Member(id="member_1", artist_id="artist_nova3", name="Member 1"),
            models.Member(id="member_2", artist_id="artist_nova3", name="Member 2"),
            models.Member(id="member_3", artist_id="artist_nova3", name="Member 3"),
        ]
    )
    await session.flush()
    for number in range(1, 5):
        session.add(
            models.Card(
                id=f"card_{number}",
                name=f"Card {number}",
                status="published",
                release_status="published",
                release_policy="partner_and_platform",
                artist_id="artist_nova3",
                member_id=f"member_{number if number < 4 else 1}",
                drop_id="drop_live",
            )
        )
    session.add_all(
        [
            models.Card(
                id="card_non_live",
                name="Non-live Card",
                status="published",
                release_status="published",
                release_policy="partner_and_platform",
                artist_id="artist_nova3",
                member_id="member_1",
                drop_id="drop_ended",
            ),
            models.Card(
                id="card_unpublished",
                name="Unpublished Card",
                status="draft",
                release_status="draft",
                release_policy="partner_and_platform",
                artist_id="artist_nova3",
                member_id="member_2",
                drop_id="drop_live",
            ),
            models.Card(
                id="card_unofficial",
                name="Unofficial Card",
                status="published",
                release_status="published",
                release_policy="partner_and_platform",
                is_official=False,
                artist_id="artist_nova3",
                member_id="member_3",
                drop_id="drop_live",
            ),
        ]
    )
    await session.commit()


async def make_published_achievement(
    session,
    *,
    condition_type: str,
    target: int = 1,
    artist_id: str | None = "artist_nova3",
    condition_payload: dict | None = None,
    reward_id: str | None = None,
) -> models.AchievementDefinition:
    if reward_id:
        session.add(
            models.RewardCatalog(
                id=reward_id,
                artist_id=artist_id,
                reward_type="title",
                name=f"Reward {reward_id}",
                status="published",
            )
        )
    achievement = models.AchievementDefinition(
        id=f"achievement_{condition_type}_{uuid4().hex[:8]}",
        artist_id=artist_id,
        title=f"{condition_type} achievement",
        condition_type=condition_type,
        target_value=target,
        condition_payload=condition_payload or {},
        reward_rule_key=reward_id,
        status="published",
    )
    session.add(achievement)
    await session.commit()
    return achievement


async def process_test_card_collected(
    session,
    session_factory,
    *,
    user_id: str = "fan",
    card_id: str,
    drop_id: str = "drop_live",
) -> models.EngagementEvent:
    card = await session.get(models.Card, card_id)
    user_card = models.UserCard(
        id=f"uc_{uuid4().hex[:12]}",
        user_id=user_id,
        card_id=card_id,
        drop_id=drop_id,
        serial_number=int(card_id.rsplit("_", 1)[-1])
        if card_id.rsplit("_", 1)[-1].isdigit()
        else 1,
        acquisition_source="test",
        acquired_at=services.now(),
    )
    session.add(user_card)
    await session.flush()
    event_row = await services.record_engagement_event(
        session,
        user_id=user_id,
        kind="card_collected",
        source_type="user_card",
        source_id=user_card.id,
        payload={
            "cardId": card_id,
            "artistId": card.artist_id,
            "memberId": card.member_id,
            "dropId": drop_id,
        },
    )
    await session.commit()
    original_session_local = services.SessionLocal
    services.SessionLocal = session_factory
    try:
        await services.process_engagement_event(event_row.id)
    finally:
        services.SessionLocal = original_session_local
    return event_row


async def get_progress(session, *, user_id: str, achievement_id: str):
    return await session.scalar(
        select(models.AchievementProgress)
        .where(
            models.AchievementProgress.user_id == user_id,
            models.AchievementProgress.achievement_id == achievement_id,
        )
        .execution_options(populate_existing=True)
    )


async def process_with_session_local(session_factory, event_id: str) -> None:
    original_session_local = services.SessionLocal
    services.SessionLocal = session_factory
    try:
        await services.process_engagement_event(event_id)
    finally:
        services.SessionLocal = original_session_local


def test_record_engagement_event_is_idempotent_for_one_source() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(models.Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            await session.commit()

            first = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="card_collected",
                source_type="user_card",
                source_id="uc_1",
                payload={"cardId": "card_1"},
            )
            second = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="card_collected",
                source_type="user_card",
                source_id="uc_1",
                payload={"cardId": "card_1"},
            )

            rows = list(await session.scalars(select(models.EngagementEvent)))
            assert first.id == second.id
            assert len(rows) == 1
            assert rows[0].payload == {"cardId": "card_1"}

        await engine.dispose()

    asyncio.run(scenario())


def test_published_mission_progresses_matching_daily_scope_once_per_event() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            session.add(
                models.MissionDefinition(
                    id="mission_daily_comment",
                    title="Daily comment",
                    event_kind="event_commented",
                    target_value=2,
                    recurrence="daily",
                    condition_payload={"eventId": "event_1"},
                    status="published",
                )
            )
            await session.commit()
            matching_event = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="event_commented",
                source_type="comment",
                source_id="comment_1",
                payload={"eventId": "event_1", "commentId": "comment_1"},
            )
            non_matching_event = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="event_commented",
                source_type="comment",
                source_id="comment_2",
                payload={"eventId": "event_2", "commentId": "comment_2"},
            )
            await session.commit()

            await process_with_session_local(session_factory, matching_event.id)
            await process_with_session_local(session_factory, matching_event.id)
            await process_with_session_local(session_factory, non_matching_event.id)

            progress_rows = list(await session.scalars(select(models.MissionProgress)))
            assert len(progress_rows) == 1
            assert progress_rows[0].mission_id == "mission_daily_comment"
            assert progress_rows[0].period_key == services.mission_period_key(
                "daily", services.now(), None, None
            )
            assert progress_rows[0].current_value == 1
            assert progress_rows[0].completed_at is None

        await engine.dispose()

    asyncio.run(scenario())


def test_mission_period_key_supports_all_recurrence_modes() -> None:
    event_time = services.now().replace(year=2026, month=8, day=23)
    starts_at = event_time.replace(month=8, day=1)
    ends_at = event_time.replace(month=8, day=31)

    assert services.mission_period_key("once", event_time, None, None) == "once"
    assert services.mission_period_key("daily", event_time, None, None) == "2026-08-23"
    assert services.mission_period_key("weekly", event_time, None, None) == "2026-W34"
    assert (
        services.mission_period_key("season", event_time, starts_at, ends_at)
        == f"season:{services._datetime_data(starts_at)}:{services._datetime_data(ends_at)}"
    )


def test_mission_completion_grants_xp_and_points_once() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            session.add(
                models.MissionDefinition(
                    id="mission_weekly_share",
                    title="Weekly share",
                    event_kind="post_shared",
                    target_value=1,
                    recurrence="weekly",
                    reward_payload={"xp": 40, "points": 25},
                    status="published",
                )
            )
            await session.commit()
            event_row = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="post_shared",
                source_type="post",
                source_id="post_1",
                payload={"postId": "post_1"},
            )
            await session.commit()

            await process_with_session_local(session_factory, event_row.id)
            await process_with_session_local(session_factory, event_row.id)

            progress = await session.scalar(select(models.MissionProgress))
            xp_rows = list(await session.scalars(select(models.XpLedger)))
            point_rows = list(await session.scalars(select(models.PointLedger)))
            balance = await session.get(models.PointBalance, "fan")
            notifications = list(
                await session.scalars(
                    select(models.Notification).where(
                        models.Notification.event_key == "mission:mission_weekly_share:fan:"
                        f"{progress.period_key}"
                    )
                )
            )

            assert progress.current_value == 1
            assert progress.completed_at is not None
            assert [row.amount for row in xp_rows] == [40]
            assert [row.amount for row in point_rows] == [25]
            assert point_rows[0].transaction_type == "earn"
            assert point_rows[0].balance_after == 25
            assert balance.balance == 25
            assert len(notifications) == 1

        await engine.dispose()

    asyncio.run(scenario())


def test_ineligible_card_collected_event_does_not_progress_mission() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            session.add(
                models.MissionDefinition(
                    id="mission_card_collect",
                    title="Collect card",
                    event_kind="card_collected",
                    target_value=1,
                    status="published",
                )
            )
            await session.commit()

            await process_test_card_collected(
                session,
                session_factory,
                card_id="card_unofficial",
                drop_id="drop_live",
            )

            progress_rows = list(await session.scalars(select(models.MissionProgress)))
            assert progress_rows == []

        await engine.dispose()

    asyncio.run(scenario())


def test_grant_xp_uses_active_level_threshold_policy_when_available() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            await session.flush()
            session.add(
                models.EngagementEvent(
                    id="evt_level",
                    user_id="fan",
                    kind="manual",
                    source_type="test",
                    source_id="test",
                )
            )
            session.add(
                models.LevelPolicyVersion(
                    id="policy_active",
                    name="Active",
                    status="published",
                    is_active=True,
                )
            )
            await session.flush()
            session.add_all(
                [
                    models.LevelThreshold(
                        id="threshold_1",
                        policy_version_id="policy_active",
                        level=1,
                        required_xp=0,
                    ),
                    models.LevelThreshold(
                        id="threshold_2",
                        policy_version_id="policy_active",
                        level=2,
                        required_xp=50,
                    ),
                    models.LevelThreshold(
                        id="threshold_3",
                        policy_version_id="policy_active",
                        level=3,
                        required_xp=120,
                    ),
                ]
            )
            await session.commit()

            await services.grant_xp(
                session, user_id="fan", event_id="evt_level", rule_key="manual", amount=75
            )

            level = await session.get(models.FanLevel, "fan")
            assert level.total_xp == 75
            assert level.level == 2

        await engine.dispose()

    asyncio.run(scenario())


def test_process_engagement_event_records_failure_and_can_retry_idempotently() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            session.add(
                models.MissionDefinition(
                    id="mission_bad_reward",
                    title="Bad reward",
                    event_kind="event_commented",
                    target_value=1,
                    reward_payload={"points": -5},
                    status="published",
                )
            )
            await session.commit()
            event_row = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="event_commented",
                source_type="comment",
                source_id="comment_retry",
                payload={"eventId": "event_1"},
            )
            await session.commit()

            with pytest.raises(AppError) as exc_info:
                await process_with_session_local(session_factory, event_row.id)
            assert exc_info.value.code == "INVALID_POINT_AMOUNT"

            failed_event = await session.get(models.EngagementEvent, event_row.id)
            await session.refresh(failed_event)
            progress_rows_after_failure = list(
                await session.scalars(select(models.MissionProgress))
            )
            point_rows_after_failure = list(await session.scalars(select(models.PointLedger)))
            assert failed_event.status == "failed"
            assert failed_event.attempt_count == 1
            assert failed_event.error_code == "INVALID_POINT_AMOUNT"
            assert "positive" in failed_event.error_message
            assert progress_rows_after_failure == []
            assert point_rows_after_failure == []

            mission = await session.get(models.MissionDefinition, "mission_bad_reward")
            mission.reward_payload = {"points": 5}
            await session.commit()

            await process_with_session_local(session_factory, event_row.id)

            processed_event = await session.get(models.EngagementEvent, event_row.id)
            await session.refresh(processed_event)
            progress_rows = list(await session.scalars(select(models.MissionProgress)))
            point_rows = list(await session.scalars(select(models.PointLedger)))
            balance = await session.get(models.PointBalance, "fan")
            assert processed_event.status == "processed"
            assert processed_event.attempt_count == 2
            assert processed_event.error_code is None
            assert processed_event.error_message is None
            assert len(progress_rows) == 1
            assert progress_rows[0].current_value == 1
            assert [row.amount for row in point_rows] == [5]
            assert balance.balance == 5

        await engine.dispose()

    asyncio.run(scenario())


def test_same_event_and_rule_can_only_grant_xp_once() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(models.Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            await session.commit()
            event_row = await services.record_engagement_event(
                session,
                user_id="fan",
                kind="card_collected",
                source_type="user_card",
                source_id="uc_1",
                payload={},
            )

            first = await services.grant_xp(
                session,
                user_id="fan",
                event_id=event_row.id,
                rule_key="card_collected",
                amount=30,
            )
            second = await services.grant_xp(
                session,
                user_id="fan",
                event_id=event_row.id,
                rule_key="card_collected",
                amount=30,
            )

            rows = list(await session.scalars(select(models.XpLedger)))
            assert first.id == second.id
            assert len(rows) == 1
            assert rows[0].amount == 30

        await engine.dispose()

    asyncio.run(scenario())


def test_process_engagement_event_reports_missing_event() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(models.Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        original_session_local = services.SessionLocal
        services.SessionLocal = session_factory
        try:
            with pytest.raises(AppError) as exc_info:
                await services.process_engagement_event("evt_missing")
            assert exc_info.value.status_code == 404
            assert exc_info.value.code == "ENGAGEMENT_EVENT_NOT_FOUND"
        finally:
            services.SessionLocal = original_session_local
            await engine.dispose()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("condition_type", "target", "cards"),
    [
        ("first_card", 1, ["card_1"]),
        ("card_count", 3, ["card_1", "card_2", "card_3"]),
        ("member_count", 2, ["card_1", "card_2"]),
    ],
)
def test_card_collection_updates_scoped_achievement(
    condition_type: str, target: int, cards: list[str]
) -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            achievement = await make_published_achievement(
                session,
                condition_type=condition_type,
                target=target,
            )

            for card_id in cards:
                await process_test_card_collected(session, session_factory, card_id=card_id)

            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is not None
            assert progress.current_value == target
            assert progress.completed_at is not None

        await engine.dispose()

    asyncio.run(scenario())


def test_specific_card_achievement_completes_for_matching_card() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            achievement = await make_published_achievement(
                session,
                condition_type="specific_card",
                condition_payload={"cardId": "card_2"},
            )

            await process_test_card_collected(session, session_factory, card_id="card_1")
            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is None or progress.completed_at is None

            await process_test_card_collected(session, session_factory, card_id="card_2")
            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is not None
            assert progress.current_value == 1
            assert progress.completed_at is not None

        await engine.dispose()

    asyncio.run(scenario())


def test_set_complete_achievement_uses_collection_campaign_required_cards() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            session.add(
                models.CollectionCampaign(
                    id="campaign_set",
                    name="Set",
                    artist_id="artist_nova3",
                    required_card_ids=["card_1", "card_2", "card_3"],
                    benefit_title="Set Benefit",
                    benefit_description="Collect the set",
                    status="active",
                )
            )
            achievement = await make_published_achievement(
                session,
                condition_type="set_complete",
                target=3,
                condition_payload={"campaignId": "campaign_set"},
            )

            await process_test_card_collected(session, session_factory, card_id="card_1")
            await process_test_card_collected(session, session_factory, card_id="card_2")
            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is not None
            assert progress.current_value == 2
            assert progress.completed_at is None

            await process_test_card_collected(session, session_factory, card_id="card_3")
            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is not None
            assert progress.current_value == 3
            assert progress.completed_at is not None

        await engine.dispose()

    asyncio.run(scenario())


def test_drop_participation_achievement_completes_for_matching_drop() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            achievement = await make_published_achievement(
                session,
                condition_type="drop_participation",
                condition_payload={"dropId": "drop_live"},
            )

            await process_test_card_collected(session, session_factory, card_id="card_1")
            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            assert progress is not None
            assert progress.current_value == 1
            assert progress.completed_at is not None

        await engine.dispose()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("condition_type", "condition_payload"),
    [
        ("first_card", {}),
        ("card_count", {}),
        ("member_count", {}),
        ("specific_card", {"cardId": "card_non_live"}),
        ("set_complete", {"cardIds": ["card_non_live"]}),
        ("drop_participation", {"dropId": "drop_ended"}),
    ],
)
@pytest.mark.parametrize(
    ("card_id", "drop_id"),
    [
        ("card_non_live", "drop_ended"),
        ("card_non_live", "drop_live"),
        ("card_unpublished", "drop_live"),
        ("card_unofficial", "drop_live"),
        ("card_1", "drop_ended"),
    ],
)
def test_ineligible_source_cards_do_not_advance_achievements(
    condition_type: str,
    condition_payload: dict,
    card_id: str,
    drop_id: str,
) -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            payload = dict(condition_payload)
            if condition_type in {"specific_card", "set_complete"}:
                payload = (
                    {"cardId": card_id}
                    if condition_type == "specific_card"
                    else {"cardIds": [card_id]}
                )
            if condition_type == "drop_participation":
                payload = {"dropId": drop_id}
            achievement = await make_published_achievement(
                session,
                condition_type=condition_type,
                target=1,
                condition_payload=payload,
            )

            await process_test_card_collected(
                session, session_factory, card_id=card_id, drop_id=drop_id
            )

            progress = await get_progress(session, user_id="fan", achievement_id=achievement.id)
            xp_rows = list(await session.scalars(select(models.XpLedger)))
            level = await session.get(models.FanLevel, "fan")
            assert progress is not None
            assert progress.current_value == 0
            assert progress.completed_at is None
            assert xp_rows == []
            assert level is None

        await engine.dispose()

    asyncio.run(scenario())


def test_achievement_completion_grants_reward_and_notification_once() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            achievement = await make_published_achievement(
                session,
                condition_type="first_card",
                reward_id="reward_first_title",
            )
            event_row = await process_test_card_collected(
                session, session_factory, card_id="card_1"
            )

            original_session_local = services.SessionLocal
            services.SessionLocal = session_factory
            try:
                await services.process_engagement_event(event_row.id)
            finally:
                services.SessionLocal = original_session_local

            grants = list(await session.scalars(select(models.RewardGrant)))
            notifications = list(
                await session.scalars(
                    select(models.Notification).where(
                        models.Notification.event_key == f"achievement:{achievement.id}:fan"
                    )
                )
            )
            xp_rows = list(await session.scalars(select(models.XpLedger)))

            assert len(grants) == 1
            assert grants[0].reward_id == "reward_first_title"
            assert len(notifications) == 1
            assert len(xp_rows) == 1
            assert xp_rows[0].amount == 30

        await engine.dispose()

    asyncio.run(scenario())


def test_same_artist_collection_only_grants_matching_organization_reward() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            session.add(models.Artist(id="artist_nova3", name="NOVA-3"))
            session.add_all(
                [
                    models.Organization(
                        id="org_source",
                        name="Source Entertainment",
                        slug="source-entertainment",
                    ),
                    models.Organization(
                        id="org_other",
                        name="Other Entertainment",
                        slug="other-entertainment",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    models.Drop(
                        id="drop_source",
                        name="Source Drop",
                        status="live",
                        organization_id="org_source",
                        artist_id="artist_nova3",
                    ),
                    models.Drop(
                        id="drop_other",
                        name="Other Drop",
                        status="live",
                        organization_id="org_other",
                        artist_id="artist_nova3",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    models.Card(
                        id="card_source",
                        name="Source Card",
                        status="published",
                        release_status="published",
                        release_policy="partner_and_platform",
                        artist_id="artist_nova3",
                        drop_id="drop_source",
                    ),
                    models.Card(
                        id="card_other",
                        name="Other Card",
                        status="published",
                        release_status="published",
                        release_policy="partner_and_platform",
                        artist_id="artist_nova3",
                        drop_id="drop_other",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    models.RewardCatalog(
                        id="reward_source",
                        organization_id="org_source",
                        artist_id="artist_nova3",
                        reward_type="title",
                        name="Source Reward",
                        status="published",
                    ),
                    models.RewardCatalog(
                        id="reward_other",
                        organization_id="org_other",
                        artist_id="artist_nova3",
                        reward_type="title",
                        name="Other Reward",
                        status="published",
                    ),
                    models.RewardCatalog(
                        id="reward_global",
                        organization_id=None,
                        artist_id=None,
                        reward_type="title",
                        name="Global Reward",
                        status="published",
                    ),
                    models.AchievementDefinition(
                        id="achievement_source",
                        organization_id="org_source",
                        artist_id="artist_nova3",
                        title="Source Achievement",
                        condition_type="first_card",
                        target_value=1,
                        reward_rule_key="reward_source",
                        status="published",
                    ),
                    models.AchievementDefinition(
                        id="achievement_other",
                        organization_id="org_other",
                        artist_id="artist_nova3",
                        title="Other Achievement",
                        condition_type="first_card",
                        target_value=1,
                        reward_rule_key="reward_other",
                        status="published",
                    ),
                    models.AchievementDefinition(
                        id="achievement_global",
                        organization_id=None,
                        artist_id=None,
                        title="Global Achievement",
                        condition_type="first_card",
                        target_value=1,
                        reward_rule_key="reward_global",
                        status="published",
                    ),
                ]
            )
            await session.commit()

            await process_test_card_collected(
                session,
                session_factory,
                card_id="card_source",
                drop_id="drop_source",
            )

            grants = list(
                await session.scalars(select(models.RewardGrant).order_by(models.RewardGrant.id))
            )
            progress = {
                item.achievement_id
                for item in await session.scalars(select(models.AchievementProgress))
            }

            assert {grant.reward_id for grant in grants} == {"reward_source", "reward_global"}
            assert progress == {"achievement_source", "achievement_global"}

        await engine.dispose()

    asyncio.run(scenario())


def test_org_scoped_card_count_ignores_same_artist_cards_from_other_organizations() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            session.add(models.Artist(id="artist_nova3", name="NOVA-3"))
            session.add_all(
                [
                    models.Organization(
                        id="org_source_count",
                        name="Source Count Entertainment",
                        slug="source-count-entertainment",
                    ),
                    models.Organization(
                        id="org_other_count",
                        name="Other Count Entertainment",
                        slug="other-count-entertainment",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    models.Drop(
                        id="drop_source_count",
                        name="Source Count Drop",
                        status="live",
                        organization_id="org_source_count",
                        artist_id="artist_nova3",
                    ),
                    models.Drop(
                        id="drop_other_count",
                        name="Other Count Drop",
                        status="live",
                        organization_id="org_other_count",
                        artist_id="artist_nova3",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    models.Card(
                        id="card_source_count",
                        name="Source Count Card",
                        status="published",
                        release_status="published",
                        release_policy="partner_and_platform",
                        artist_id="artist_nova3",
                        drop_id="drop_source_count",
                    ),
                    models.Card(
                        id="card_other_count",
                        name="Other Count Card",
                        status="published",
                        release_status="published",
                        release_policy="partner_and_platform",
                        artist_id="artist_nova3",
                        drop_id="drop_other_count",
                    ),
                    models.RewardCatalog(
                        id="reward_source_count",
                        organization_id="org_source_count",
                        artist_id="artist_nova3",
                        reward_type="title",
                        name="Source Count Reward",
                        status="published",
                    ),
                    models.RewardCatalog(
                        id="reward_global_count",
                        organization_id=None,
                        artist_id=None,
                        reward_type="title",
                        name="Global Count Reward",
                        status="published",
                    ),
                    models.AchievementDefinition(
                        id="achievement_source_count",
                        organization_id="org_source_count",
                        artist_id="artist_nova3",
                        title="Source Count Achievement",
                        condition_type="card_count",
                        target_value=2,
                        reward_rule_key="reward_source_count",
                        status="published",
                    ),
                    models.AchievementDefinition(
                        id="achievement_global_count",
                        organization_id=None,
                        artist_id=None,
                        title="Global Count Achievement",
                        condition_type="card_count",
                        target_value=2,
                        reward_rule_key="reward_global_count",
                        status="published",
                    ),
                ]
            )
            await session.commit()
            session.add(
                models.UserCard(
                    id="uc_other_count",
                    user_id="fan",
                    card_id="card_other_count",
                    drop_id="drop_other_count",
                    serial_number=1,
                    acquisition_source="test",
                    acquired_at=services.now(),
                )
            )
            await session.commit()

            await process_test_card_collected(
                session,
                session_factory,
                card_id="card_source_count",
                drop_id="drop_source_count",
            )

            grants = list(await session.scalars(select(models.RewardGrant)))
            source_progress = await get_progress(
                session,
                user_id="fan",
                achievement_id="achievement_source_count",
            )
            global_progress = await get_progress(
                session,
                user_id="fan",
                achievement_id="achievement_global_count",
            )

            assert {grant.reward_id for grant in grants} == {"reward_global_count"}
            assert source_progress.current_value == 1
            assert source_progress.completed_at is None
            assert global_progress.current_value == 2
            assert global_progress.completed_at is not None

        await engine.dispose()

    asyncio.run(scenario())


def test_card_revoked_records_negative_xp_without_deleting_reward_grants() -> None:
    async def scenario() -> None:
        engine, session_factory = await create_growth_test_session()
        async with session_factory() as session:
            await seed_growth_catalog(session)
            await make_published_achievement(
                session,
                condition_type="first_card",
                reward_id="reward_first_title",
            )
            collected_event = await process_test_card_collected(
                session, session_factory, card_id="card_1"
            )
            user_card = await session.scalar(
                select(models.UserCard).where(models.UserCard.id == collected_event.source_id)
            )
            revoked_event = await services.revoke_card_growth(
                session, user_card=user_card, reason="operator_adjustment"
            )
            await session.commit()

            original_session_local = services.SessionLocal
            services.SessionLocal = session_factory
            try:
                await services.process_engagement_event(revoked_event.id)
                await services.process_engagement_event(revoked_event.id)
            finally:
                services.SessionLocal = original_session_local

            xp_rows = list(
                await session.scalars(
                    select(models.XpLedger).order_by(models.XpLedger.amount.desc())
                )
            )
            grants = list(await session.scalars(select(models.RewardGrant)))
            level = await session.get(models.FanLevel, "fan")

            assert [row.amount for row in xp_rows] == [30, -30]
            assert len(grants) == 1
            assert level.total_xp == 0

        await engine.dispose()

    asyncio.run(scenario())
