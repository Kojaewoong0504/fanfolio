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
