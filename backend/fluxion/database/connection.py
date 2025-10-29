"""Database connection and session management with async support."""

from collections.abc import AsyncGenerator

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
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.sql_echo,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,  # Verify connections before using them
            pool_recycle=3600,  # Recycle connections after 1 hour
        )
    return _engine


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
