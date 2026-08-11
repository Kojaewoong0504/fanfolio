import asyncio

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models, services


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
