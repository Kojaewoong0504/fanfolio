from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models, services
from app.errors import AppError


def run(coro):
    return asyncio.run(coro)


async def make_session_factory():
    engine = create_async_engine("sqlite+aiosqlite://")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(models.Base.metadata.create_all)

    return engine, async_sessionmaker(engine, expire_on_commit=False)


def test_grant_user_card_is_idempotent_and_records_one_ledger_event() -> None:
    async def scenario() -> None:
        engine, session_factory = await make_session_factory()
        async with session_factory() as session:
            session.add_all(
                [
                    models.User(id="fan", email="fan@example.com", role=models.Role.FAN),
                    models.Card(id="card_1", name="Card 1", status="published"),
                ]
            )
            await session.commit()

            first = await services.grant_user_card(
                session,
                user_id="fan",
                card_id="card_1",
                source_type="redeem_code",
                source_id="CODE-001",
                acquisition_source="qr",
                metadata={"source": "qr"},
            )
            second = await services.grant_user_card(
                session,
                user_id="fan",
                card_id="card_1",
                source_type="redeem_code",
                source_id="CODE-001",
                acquisition_source="qr",
            )
            await session.commit()

            cards = list(await session.scalars(select(models.UserCard)))
            ledger = list(await session.scalars(select(models.CardOwnershipLedger)))
            assert second.id == first.id
            assert len(cards) == 1
            assert len(ledger) == 1
            assert ledger[0].source_id == "CODE-001"
            assert ledger[0].metadata_json == {"source": "qr"}

        await engine.dispose()

    run(scenario())


def test_grant_user_card_rejects_unpublished_card_without_writes() -> None:
    async def scenario() -> None:
        engine, session_factory = await make_session_factory()
        async with session_factory() as session:
            session.add_all(
                [
                    models.User(id="fan", email="fan@example.com", role=models.Role.FAN),
                    models.Card(id="card_draft", name="Draft Card", status="draft"),
                ]
            )
            await session.commit()

            with pytest.raises(AppError, match="공개되지 않은 카드입니다"):
                await services.grant_user_card(
                    session,
                    user_id="fan",
                    card_id="card_draft",
                    source_type="card_pack_opening",
                    source_id="opening-001",
                    acquisition_source="card_pack",
                )

            assert not list(await session.scalars(select(models.UserCard)))
            assert not list(await session.scalars(select(models.CardOwnershipLedger)))

        await engine.dispose()

    run(scenario())
