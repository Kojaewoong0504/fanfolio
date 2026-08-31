"""Opt-in checks against a real PostgreSQL database.

The normal suite intentionally stays isolated on SQLite. Set
FANFOLIO_POSTGRES_TEST_URL only in a disposable integration environment.
"""

import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine


def test_postgres_point_ledger_is_append_only_when_opted_in() -> None:
    url = os.getenv("FANFOLIO_POSTGRES_TEST_URL")
    if not url:
        pytest.skip("FANFOLIO_POSTGRES_TEST_URL is not configured")

    async def scenario() -> None:
        engine = create_async_engine(url, pool_pre_ping=True)
        try:
            async with engine.begin() as connection:
                trigger = await connection.scalar(
                    text(
                        """
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'point_ledger_append_only'
                          AND NOT tgisinternal
                        """
                    )
                )
                assert trigger == 1
                ledger_id = await connection.scalar(text("SELECT id FROM point_ledger LIMIT 1"))
                if ledger_id is None:
                    pytest.skip("point_ledger has no row to exercise the trigger")
                with pytest.raises(DBAPIError):
                    await connection.execute(
                        text("UPDATE point_ledger SET description = description WHERE id = :id"),
                        {"id": ledger_id},
                    )
        finally:
            await engine.dispose()

    asyncio.run(scenario())
