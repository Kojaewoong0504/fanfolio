from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

# The engine is process-wide because it owns the connection pool. Sessions are not.
engine = create_async_engine(get_settings().async_database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """One AsyncSession per request; never share it across concurrent tasks."""
    async with SessionLocal() as session:
        yield session
