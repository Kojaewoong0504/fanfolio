from collections.abc import AsyncIterator
from threading import Lock
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session as SyncSession

from app.core.config import get_settings

# The engine is process-wide because it owns the connection pool. Sessions are not.
settings = get_settings()
engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
if settings.database_connect_args:
    engine_kwargs["connect_args"] = settings.database_connect_args
engine = create_async_engine(settings.async_database_url, **engine_kwargs)

# SQLite does not implement PostgreSQL-style row locks.  A busy timeout lets
# short write collisions wait without turning every read transaction into a
# writer, which is important for inline background jobs in the local app.
if settings.database_backend == "sqlite+aiosqlite":

    @event.listens_for(engine.sync_engine, "connect")
    def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


_CONTENTion_LOCK_INFO = "fanfolio_contention_lock"
_CONTENTion_THREAD_LOCK = Lock()


def _release_contention_lock(sync_session: SyncSession) -> None:
    handle = sync_session.info.pop(_CONTENTion_LOCK_INFO, None)
    if handle is not None:
        _CONTENTion_THREAD_LOCK.release()


@event.listens_for(SyncSession, "after_transaction_end")
def _release_contention_lock_after_transaction(sync_session: SyncSession, transaction: Any) -> None:
    # Keep the lock through nested flush transactions, releasing it only
    # after the request's root transaction has committed or rolled back.
    if transaction.parent is None:
        _release_contention_lock(sync_session)


@event.listens_for(SyncSession, "after_soft_rollback")
def _release_contention_lock_after_soft_rollback(
    sync_session: SyncSession, previous_transaction: Any
) -> None:
    if not sync_session.in_transaction():
        _release_contention_lock(sync_session)


async def begin_contention_safe_transaction(session: AsyncSession) -> None:
    """Serialize small SQLite workflows whose uniqueness checks race."""
    if settings.database_backend == "sqlite+aiosqlite":
        sync_session = session.sync_session
        if _CONTENTion_LOCK_INFO not in sync_session.info:
            _CONTENTion_THREAD_LOCK.acquire()
            sync_session.info[_CONTENTion_LOCK_INFO] = True


async def get_session() -> AsyncIterator[AsyncSession]:
    """One AsyncSession per request; never share it across concurrent tasks."""
    async with SessionLocal() as session:
        yield session
