"""Admin routes for webhook management."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import WebhookConfig, WebhookDeliveryHistory
from fluxion.schemas.webhook import (
    DeleteWebhookResponse,
    ListWebhookConfigsResponse,
    WebhookConfigCreate,
    WebhookConfigResponse,
    WebhookConfigUpdate,
    WebhookDeliveryHistoryResponse,
    WebhookTestRequest,
    WebhookTestResponse,
)
from fluxion.services import WebhookService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/admin/webhooks",
    response_model=WebhookConfigResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new webhook configuration",
    description="Create a new webhook configuration for receiving notifications on package updates",
)
async def create_webhook(
    webhook_data: WebhookConfigCreate,
    session: AsyncSession = Depends(get_session),
) -> WebhookConfigResponse:
    """
    Create a new webhook configuration.

    Args:
        webhook_data: Webhook configuration data
        session: Database session (injected)

    Returns:
        WebhookConfigResponse with the created webhook configuration

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        webhook = WebhookConfig(
            name=webhook_data.name,
            url=webhook_data.url,
            enabled=webhook_data.enabled,
            event_types=webhook_data.event_types,
            headers_json=webhook_data.headers_json,
        )
        session.add(webhook)
        await session.commit()
        await session.refresh(webhook)

        logger.info(f"Created webhook configuration: id={webhook.id}, name={webhook.name}")

        return WebhookConfigResponse(
            id=webhook.id,
            name=webhook.name,
            url=webhook.url,
            enabled=webhook.enabled,
            event_types=webhook.event_types,
            headers_json=webhook.headers_json,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at,
        )

    except Exception as e:
        await session.rollback()
        logger.error(f"Error creating webhook configuration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create webhook configuration",
        ) from e


@router.get(
    "/admin/webhooks",
    response_model=ListWebhookConfigsResponse,
    summary="List all webhook configurations",
    description="Get a list of all webhook configurations",
)
async def list_webhooks(
    session: AsyncSession = Depends(get_session),
) -> ListWebhookConfigsResponse:
    """
    List all webhook configurations.

    Args:
        session: Database session (injected)

    Returns:
        ListWebhookConfigsResponse with all webhook configurations

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        result = await session.execute(select(WebhookConfig))
        webhooks = result.scalars().all()

        return ListWebhookConfigsResponse(
            webhooks=[
                WebhookConfigResponse(
                    id=w.id,
                    name=w.name,
                    url=w.url,
                    enabled=w.enabled,
                    event_types=w.event_types,
                    headers_json=w.headers_json,
                    created_at=w.created_at,
                    updated_at=w.updated_at,
                )
                for w in webhooks
            ],
            total=len(webhooks),
        )

    except Exception as e:
        logger.error(f"Error listing webhook configurations: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list webhook configurations",
        ) from e


@router.get(
    "/admin/webhooks/{webhook_id}",
    response_model=WebhookConfigResponse,
    summary="Get a webhook configuration by ID",
    description="Get details of a specific webhook configuration",
)
async def get_webhook(
    webhook_id: int,
    session: AsyncSession = Depends(get_session),
) -> WebhookConfigResponse:
    """
    Get a webhook configuration by ID.

    Args:
        webhook_id: Webhook configuration ID
        session: Database session (injected)

    Returns:
        WebhookConfigResponse with the webhook configuration

    Raises:
        HTTPException: 404 if webhook not found, 500 if there's a database error
    """
    try:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook = result.scalar_one_or_none()

        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook configuration with ID {webhook_id} not found",
            )

        return WebhookConfigResponse(
            id=webhook.id,
            name=webhook.name,
            url=webhook.url,
            enabled=webhook.enabled,
            event_types=webhook.event_types,
            headers_json=webhook.headers_json,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting webhook configuration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get webhook configuration",
        ) from e


@router.patch(
    "/admin/webhooks/{webhook_id}",
    response_model=WebhookConfigResponse,
    summary="Update a webhook configuration",
    description="Update an existing webhook configuration",
)
async def update_webhook(
    webhook_id: int,
    webhook_data: WebhookConfigUpdate,
    session: AsyncSession = Depends(get_session),
) -> WebhookConfigResponse:
    """
    Update a webhook configuration.

    Args:
        webhook_id: Webhook configuration ID
        webhook_data: Updated webhook configuration data
        session: Database session (injected)

    Returns:
        WebhookConfigResponse with the updated webhook configuration

    Raises:
        HTTPException: 404 if webhook not found, 500 if there's a database error
    """
    try:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook = result.scalar_one_or_none()

        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook configuration with ID {webhook_id} not found",
            )

        # Update fields if provided
        if webhook_data.name is not None:
            webhook.name = webhook_data.name
        if webhook_data.url is not None:
            webhook.url = webhook_data.url
        if webhook_data.enabled is not None:
            webhook.enabled = webhook_data.enabled
        if webhook_data.event_types is not None:
            webhook.event_types = webhook_data.event_types
        if webhook_data.headers_json is not None:
            webhook.headers_json = webhook_data.headers_json

        webhook.updated_at = datetime.now(UTC)

        await session.commit()
        await session.refresh(webhook)

        logger.info(f"Updated webhook configuration: id={webhook.id}, name={webhook.name}")

        return WebhookConfigResponse(
            id=webhook.id,
            name=webhook.name,
            url=webhook.url,
            enabled=webhook.enabled,
            event_types=webhook.event_types,
            headers_json=webhook.headers_json,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error updating webhook configuration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update webhook configuration",
        ) from e


@router.delete(
    "/admin/webhooks/{webhook_id}",
    response_model=DeleteWebhookResponse,
    summary="Delete a webhook configuration",
    description="Delete a webhook configuration and its delivery history",
)
async def delete_webhook(
    webhook_id: int,
    session: AsyncSession = Depends(get_session),
) -> DeleteWebhookResponse:
    """
    Delete a webhook configuration.

    Args:
        webhook_id: Webhook configuration ID
        session: Database session (injected)

    Returns:
        DeleteWebhookResponse with success message

    Raises:
        HTTPException: 404 if webhook not found, 500 if there's a database error
    """
    try:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook = result.scalar_one_or_none()

        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook configuration with ID {webhook_id} not found",
            )

        await session.delete(webhook)
        await session.commit()

        logger.info(f"Deleted webhook configuration: id={webhook_id}")

        return DeleteWebhookResponse(message="Webhook configuration deleted successfully")

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting webhook configuration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete webhook configuration",
        ) from e


@router.post(
    "/admin/webhooks/{webhook_id}/test",
    response_model=WebhookTestResponse,
    summary="Test a webhook configuration",
    description="Send a test payload to a webhook to verify it's working correctly",
)
async def test_webhook(
    webhook_id: int,
    test_request: WebhookTestRequest = WebhookTestRequest(),
    session: AsyncSession = Depends(get_session),
) -> WebhookTestResponse:
    """
    Test a webhook configuration.

    Args:
        webhook_id: Webhook configuration ID
        test_request: Optional test payload
        session: Database session (injected)

    Returns:
        WebhookTestResponse with test results

    Raises:
        HTTPException: 404 if webhook not found, 500 if there's a database error
    """
    try:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook = result.scalar_one_or_none()

        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook configuration with ID {webhook_id} not found",
            )

        webhook_service = WebhookService(session)
        success, status_code, response_body, error_message, delivery_time_ms = (
            await webhook_service.test_webhook(webhook, test_request.test_payload)
        )

        logger.info(
            f"Tested webhook: id={webhook_id}, success={success}, "
            f"status_code={status_code}, time={delivery_time_ms}ms"
        )

        return WebhookTestResponse(
            success=success,
            status_code=status_code,
            response_body=response_body,
            error_message=error_message,
            delivery_time_ms=delivery_time_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing webhook: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to test webhook",
        ) from e


@router.get(
    "/admin/webhooks/{webhook_id}/history",
    response_model=list[WebhookDeliveryHistoryResponse],
    summary="Get webhook delivery history",
    description="Get the delivery history for a webhook configuration",
)
async def get_webhook_history(
    webhook_id: int,
    limit: int = 100,
    session: AsyncSession = Depends(get_session),
) -> list[WebhookDeliveryHistoryResponse]:
    """
    Get webhook delivery history.

    Args:
        webhook_id: Webhook configuration ID
        limit: Maximum number of history entries to return
        session: Database session (injected)

    Returns:
        List of WebhookDeliveryHistoryResponse

    Raises:
        HTTPException: 404 if webhook not found, 500 if there's a database error
    """
    try:
        # Check if webhook exists
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook = result.scalar_one_or_none()

        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook configuration with ID {webhook_id} not found",
            )

        # Get delivery history
        result = await session.execute(
            select(WebhookDeliveryHistory)
            .where(WebhookDeliveryHistory.webhook_config_id == webhook_id)
            .order_by(WebhookDeliveryHistory.created_at.desc())
            .limit(limit)
        )
        history = result.scalars().all()

        return [
            WebhookDeliveryHistoryResponse(
                id=h.id,
                webhook_config_id=h.webhook_config_id,
                event_type=h.event_type,
                payload=h.payload,
                status_code=h.status_code,
                response_body=h.response_body,
                error_message=h.error_message,
                attempt_number=h.attempt_number,
                delivered_at=h.delivered_at,
                created_at=h.created_at,
            )
            for h in history
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting webhook history: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get webhook history",
        ) from e
