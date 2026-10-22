"""Database connection and session management with async support."""

from collections.abc import AsyncGenerator
from sqlalchemy import event

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from fluxion.config import settings
from fluxion.models.base import Base

# Global engine instance
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """
    Get or create the async database engine.

    Returns:
        AsyncEngine: The SQLAlchemy async engine instance.
    """
    global _engine
    settings.validate_pool_startup()
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.sql_echo,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            pool_recycle=settings.db_pool_recycle,
            pool_timeout=settings.db_pool_timeout,
        )
        event.listen(_engine.sync_engine, "checkout", lambda *args: get_pool_status())

        def record_checkin(dbapi_connection, connection_record):
            try:
                pool = _engine.sync_engine.pool
                record_pool_state(
                    max(0, pool.checkedout()),
                    max(0, pool.checkedin()),
                    max(0, pool.overflow()),
                )
            except Exception:
                pass

        event.listen(_engine.sync_engine, "checkin", record_checkin)

        pool = _engine.sync_engine.pool
        get_pool_status()
    return _engine


def get_pool_status() -> dict[str, int]:
    """Return bounded pool state without connection or credential details."""
    engine = get_engine()
    pool = engine.sync_engine.pool
    status = pool.status()
    checked_out = getattr(pool, "checkedout", lambda: 0)()
    checked_in = getattr(pool, "checkedin", lambda: 0)()
    overflow = getattr(pool, "overflow", lambda: 0)()
    status = {
        "active": checked_out,
        "idle": checked_in,
        "overflow": max(0, overflow),
        "waited": get_pool_status.wait_count,
    }
    try:
        from fluxion.telemetry import record_pool_observability
        record_pool_observability(status["active"], status["idle"], status["overflow"], status["waited"])
    except Exception:
        pass
    return status


get_pool_status.wait_count = 0


def record_pool_state(active: int, idle: int, overflow: int) -> dict[str, int]:
    status = {
        "active": active,
        "idle": idle,
        "overflow": overflow,
        "waited": get_pool_status.wait_count,
    }
    try:
        from fluxion.telemetry import record_pool_observability
        record_pool_observability(active, idle, overflow, status["waited"])
    except Exception:
        pass
    return status


def record_pool_checkout_wait() -> None:
    get_pool_status.wait_count += 1
    try:
        get_pool_status()
    except Exception:
        # Metrics must never replace or obscure the pool timeout response.
        pass


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """
    Get or create the async session maker.

    Returns:
        async_sessionmaker: The SQLAlchemy async session maker.
    """
    global _sessionmaker
    if _sessionmaker is None:
        engine = get_engine()
        _sessionmaker = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _sessionmaker


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Get an async database session (async generator for dependency injection).

    Usage:
        async with get_session() as session:
            # Use session here
            pass

    Or with FastAPI:
        @app.get("/")
        async def read_root(session: AsyncSession = Depends(get_session)):
            # Use session here
            pass

    Yields:
        AsyncSession: An async SQLAlchemy session.
    """
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize the database by creating all tables.

    Note: This should only be used for development/testing.
    For production, use Alembic migrations.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close the database connection and dispose of the engine."""
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
        get_pool_status.wait_count = 0
