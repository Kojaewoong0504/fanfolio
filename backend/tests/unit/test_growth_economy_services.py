import asyncio

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models


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
