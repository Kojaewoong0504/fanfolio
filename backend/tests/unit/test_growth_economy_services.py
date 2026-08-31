import asyncio
from pathlib import Path

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import models, services


def test_growth_economy_models_define_storage_contracts() -> None:
    assert models.MissionDefinition.__tablename__ == "mission_definitions"
    assert models.MissionProgress.__table__.c.period_key.nullable is False
    assert "uq_mission_progress_user_period" in {
        constraint.name for constraint in models.MissionProgress.__table__.constraints
    }

    assert models.PointLedger.__table__.c.amount.nullable is False
    assert models.PointLedger.__table__.c.balance_after.nullable is False
    assert "uq_point_ledger_event_rule" in {
        constraint.name for constraint in models.PointLedger.__table__.constraints
    }

    assert models.PointBalance.__table__.primary_key.columns.keys() == ["user_id"]
    assert models.LevelThreshold.__table__.c.required_xp.nullable is False
    assert "uq_level_threshold_policy_level" in {
        constraint.name for constraint in models.LevelThreshold.__table__.constraints
    }

    assert models.EngagementEvent.__table__.c.error_code.nullable is True
    assert models.EngagementEvent.__table__.c.error_message.nullable is True
    assert models.EngagementEvent.__table__.c.attempt_count.nullable is False


def test_point_ledger_command_boundary_rejects_unknown_operation() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            with pytest.raises(Exception, match="지원하지 않는 포인트 원장 작업"):
                await services.execute_point_ledger_command(
                    session,
                    operation="invalid",  # type: ignore[arg-type]
                )
        await engine.dispose()

    asyncio.run(scenario())


def test_growth_economy_model_defaults_persist_on_insert() -> None:
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
            await session.flush()
            mission = models.MissionDefinition(
                id="mission_defaults",
                title="Default mission",
                event_kind="event_commented",
                target_value=1,
            )
            event_row = models.EngagementEvent(
                id="evt_failed",
                user_id="fan",
                kind="event_commented",
                source_type="comment",
                source_id="comment_1",
            )
            balance = models.PointBalance(user_id="fan")
            policy = models.LevelPolicyVersion(id="policy_test", name="Policy")
            threshold = models.LevelThreshold(
                id="threshold_test",
                policy_version_id="policy_test",
                level=1,
                required_xp=0,
            )
            session.add_all([mission, event_row, balance, policy, threshold])
            await session.commit()
            await session.refresh(mission)
            await session.refresh(event_row)
            await session.refresh(balance)
            await session.refresh(policy)

            assert mission.recurrence == "once"
            assert mission.condition_payload == {}
            assert mission.reward_payload == {}
            assert mission.status == "draft"
            assert event_row.payload == {}
            assert event_row.attempt_count == 0
            assert balance.balance == 0
            assert policy.status == "draft"
            assert policy.is_active is False

        await engine.dispose()

    asyncio.run(scenario())


def test_point_balance_rejects_negative_cached_balance() -> None:
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
            session.add(models.PointBalance(user_id="fan", balance=-1))
            with pytest.raises(IntegrityError):
                await session.commit()

        await engine.dispose()

    asyncio.run(scenario())


def test_duplicate_point_grant_race_increments_balance_once(tmp_path: Path) -> None:
    async def scenario() -> None:
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'points.db'}")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(models.Base.metadata.create_all)

        first_check_finished = asyncio.Event()
        winning_grant_committed = asyncio.Event()

        class PausingSession(AsyncSession):
            paused = False

            async def scalar(self, statement, *args, **kwargs):  # type: ignore[no-untyped-def]
                result = await super().scalar(statement, *args, **kwargs)
                if not self.paused:
                    self.paused = True
                    first_check_finished.set()
                    await winning_grant_committed.wait()
                return result

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        pausing_session_factory = async_sessionmaker(
            engine,
            class_=PausingSession,
            expire_on_commit=False,
        )
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            await session.commit()
            session.add(
                models.EngagementEvent(
                    id="event_points",
                    user_id="fan",
                    kind="mission_completed",
                    source_type="mission",
                    source_id="mission_daily",
                )
            )
            await session.commit()

        async with pausing_session_factory() as delayed, session_factory() as winner:
            delayed_task = asyncio.create_task(
                services.grant_points(
                    delayed,
                    user_id="fan",
                    source_event_id="event_points",
                    rule_key="mission:daily",
                    amount=25,
                )
            )
            await first_check_finished.wait()
            winning_ledger = await services.grant_points(
                winner,
                user_id="fan",
                source_event_id="event_points",
                rule_key="mission:daily",
                amount=25,
            )
            await winner.commit()
            winning_grant_committed.set()
            delayed_ledger = await delayed_task
            await delayed.commit()

        async with session_factory() as session:
            balance = await session.get(models.PointBalance, "fan")
            ledgers = list(await session.scalars(select(models.PointLedger)))
            assert delayed_ledger.id == winning_ledger.id
            assert len(ledgers) == 1
            assert ledgers[0].balance_after == 25
            assert balance is not None
            assert balance.balance == 25

        await engine.dispose()

    asyncio.run(scenario())


def test_concurrent_first_time_point_grants_share_created_balance(tmp_path: Path) -> None:
    async def scenario() -> None:
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'points.db'}")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(models.Base.metadata.create_all)

        delayed_grant_started = asyncio.Event()
        winning_grant_committed = asyncio.Event()

        class StaleFirstBalanceSession(AsyncSession):
            waited_before_writes = False
            returned_stale_balance = False

            async def scalar(self, statement, *args, **kwargs):  # type: ignore[no-untyped-def]
                if not self.waited_before_writes:
                    self.waited_before_writes = True
                    delayed_grant_started.set()
                    await winning_grant_committed.wait()
                result = await super().scalar(statement, *args, **kwargs)
                if isinstance(result, models.PointBalance) and not self.returned_stale_balance:
                    self.returned_stale_balance = True
                    return None
                return result

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        stale_session_factory = async_sessionmaker(
            engine,
            class_=StaleFirstBalanceSession,
            expire_on_commit=False,
        )
        async with session_factory() as session:
            session.add(models.User(id="fan", email="fan@example.com", role=models.Role.FAN))
            await session.commit()
            session.add_all(
                [
                    models.EngagementEvent(
                        id="event_points_a",
                        user_id="fan",
                        kind="mission_completed",
                        source_type="mission",
                        source_id="mission_a",
                    ),
                    models.EngagementEvent(
                        id="event_points_b",
                        user_id="fan",
                        kind="mission_completed",
                        source_type="mission",
                        source_id="mission_b",
                    ),
                ]
            )
            await session.commit()

        async with stale_session_factory() as delayed, session_factory() as winner:
            delayed_task = asyncio.create_task(
                services.grant_points(
                    delayed,
                    user_id="fan",
                    source_event_id="event_points_a",
                    rule_key="mission:a",
                    amount=25,
                )
            )
            await delayed_grant_started.wait()
            winning_ledger = await services.grant_points(
                winner,
                user_id="fan",
                source_event_id="event_points_b",
                rule_key="mission:b",
                amount=30,
            )
            await winner.commit()
            winning_grant_committed.set()
            delayed_ledger = await delayed_task
            await delayed.commit()

        async with session_factory() as session:
            balance = await session.get(models.PointBalance, "fan")
            ledgers = list(
                await session.scalars(
                    select(models.PointLedger).order_by(models.PointLedger.source_event_id)
                )
            )
            assert len(ledgers) == 2
            assert {delayed_ledger.id, winning_ledger.id} == {ledger.id for ledger in ledgers}
            assert [ledger.balance_after for ledger in ledgers] == [55, 30]
            assert balance is not None
            assert balance.balance == 55

        await engine.dispose()

    asyncio.run(scenario())
