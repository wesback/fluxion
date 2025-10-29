"""Admin routes for API key management."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.auth import generate_api_key, hash_api_key
from fluxion.database import get_session
from fluxion.models import APIKey
from fluxion.schemas.api_key import (
    APIKeyMetadata,
    CreateAPIKeyRequest,
    CreateAPIKeyResponse,
    DeleteAPIKeyResponse,
    ListAPIKeysResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/admin/api-keys",
    response_model=CreateAPIKeyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key",
    description="Create a new API key. The key is only returned once and cannot be retrieved later.",
)
async def create_api_key(
    key_data: CreateAPIKeyRequest,
    session: AsyncSession = Depends(get_session),
) -> CreateAPIKeyResponse:
    """
    Create a new API key.

    Args:
        key_data: API key creation request
        session: Database session (injected)

    Returns:
        CreateAPIKeyResponse with the generated API key (only shown once)

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        # Validate role
        if key_data.role not in ["user", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be 'user' or 'admin'",
            )

        # Generate API key
        api_key = generate_api_key()
        key_hash = hash_api_key(api_key)

        # Create API key record
        api_key_obj = APIKey(
            name=key_data.name,
            key_hash=key_hash,
            role=key_data.role,
            is_active=True,
        )
        session.add(api_key_obj)
        await session.commit()
        await session.refresh(api_key_obj)

        logger.info(
            f"Created API key: id={api_key_obj.id}, name={api_key_obj.name}, role={api_key_obj.role}"
        )

        return CreateAPIKeyResponse(
            id=api_key_obj.id,
            name=api_key_obj.name,
            role=api_key_obj.role,
            api_key=api_key,
            message="API key created successfully. Save this key securely - it cannot be retrieved later.",
        )

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error creating API key: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create API key",
        ) from e


@router.get(
    "/admin/api-keys",
    response_model=ListAPIKeysResponse,
    summary="List all API keys",
    description="Get a list of all API keys with metadata (actual keys are not included)",
)
async def list_api_keys(
    session: AsyncSession = Depends(get_session),
) -> ListAPIKeysResponse:
    """
    List all API keys with metadata.

    Args:
        session: Database session (injected)

    Returns:
        ListAPIKeysResponse with list of API keys

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        # Get all API keys
        stmt = select(APIKey).order_by(APIKey.created_at.desc())
        result = await session.execute(stmt)
        api_keys = result.scalars().all()

        return ListAPIKeysResponse(
            items=[
                APIKeyMetadata(
                    id=key.id,
                    name=key.name,
                    role=key.role,
                    created_at=key.created_at,
                    last_used=key.last_used,
                    is_active=key.is_active,
                )
                for key in api_keys
            ],
            total=len(api_keys),
        )

    except Exception as e:
        logger.error(f"Error listing API keys: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list API keys",
        ) from e


@router.delete(
    "/admin/api-keys/{key_id}",
    response_model=DeleteAPIKeyResponse,
    summary="Delete/revoke an API key",
    description="Delete an API key by ID. This action cannot be undone.",
)
async def delete_api_key(
    key_id: int,
    session: AsyncSession = Depends(get_session),
) -> DeleteAPIKeyResponse:
    """
    Delete/revoke an API key.

    Args:
        key_id: The ID of the API key to delete
        session: Database session (injected)

    Returns:
        DeleteAPIKeyResponse with success message

    Raises:
        HTTPException: 404 if key not found, 500 if database error
    """
    try:
        # Get the API key
        stmt = select(APIKey).where(APIKey.id == key_id)
        result = await session.execute(stmt)
        api_key = result.scalar_one_or_none()

        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"API key with ID {key_id} not found",
            )

        # Delete the key
        await session.delete(api_key)
        await session.commit()

        logger.info(f"Deleted API key: id={key_id}, name={api_key.name}")

        return DeleteAPIKeyResponse(
            message=f"API key '{api_key.name}' (ID: {key_id}) has been deleted successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting API key {key_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete API key",
        ) from e
