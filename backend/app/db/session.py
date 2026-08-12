from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

# The engine is process-wide because it owns the connection pool. Sessions are not.
settings = get_settings()
engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
if settings.database_connect_args:
    engine_kwargs["connect_args"] = settings.database_connect_args
engine = create_async_engine(settings.async_database_url, **engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """One AsyncSession per request; never share it across concurrent tasks."""
    async with SessionLocal() as session:
        yield session
