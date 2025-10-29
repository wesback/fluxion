"""Authentication utilities for API key management."""

import secrets
from datetime import UTC, datetime

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.models import APIKey


def generate_api_key() -> str:
    """
    Generate a secure random API key.

    Returns:
        A 64-character hexadecimal API key
    """
    return secrets.token_hex(32)


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key using bcrypt.

    Args:
        api_key: The plain text API key to hash

    Returns:
        The bcrypt hash of the API key
    """
    return bcrypt.hashpw(api_key.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_api_key(api_key: str, key_hash: str) -> bool:
    """
    Verify an API key against its hash.

    Args:
        api_key: The plain text API key to verify
        key_hash: The bcrypt hash to verify against

    Returns:
        True if the key matches the hash, False otherwise
    """
    try:
        return bcrypt.checkpw(api_key.encode('utf-8'), key_hash.encode('utf-8'))
    except Exception:
        return False


async def validate_api_key(
    api_key: str,
    session: AsyncSession,
    required_role: str | None = None
) -> APIKey | None:
    """
    Validate an API key and optionally check role.

    Args:
        api_key: The plain text API key to validate
        session: Database session
        required_role: Optional role required (e.g., "admin")

    Returns:
        The APIKey object if valid and active, None otherwise
    """
    # Get all active API keys
    stmt = select(APIKey).where(APIKey.is_active)
    result = await session.execute(stmt)
    api_keys = result.scalars().all()

    # Check each key hash
    for key_obj in api_keys:
        if verify_api_key(api_key, key_obj.key_hash):
            # Check role if required
            if required_role and key_obj.role != required_role:
                return None
            return key_obj

    return None


async def update_last_used(api_key_id: int, session: AsyncSession) -> None:
    """
    Update the last_used timestamp for an API key.

    This should be called asynchronously after authentication succeeds.

    Args:
        api_key_id: The ID of the API key to update
        session: Database session
    """
    stmt = select(APIKey).where(APIKey.id == api_key_id)
    result = await session.execute(stmt)
    key_obj = result.scalar_one_or_none()

    if key_obj:
        key_obj.last_used = datetime.now(UTC)
        await session.commit()
