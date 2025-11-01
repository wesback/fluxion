"""Pydantic schemas for webhook configuration endpoints."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WebhookConfigCreate(BaseModel):
    """Request schema for creating a webhook configuration."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "ntfy.sh kernel alerts",
                "url": "https://ntfy.sh/my-topic",
                "enabled": True,
                "event_types": ["kernel_update"],
                "headers_json": {
                    "Title": "Kernel Update Alert",
                    "Priority": "high",
                    "Tags": "warning"
                }
            }
        }
    )

    name: str = Field(
        ..., min_length=1, max_length=255, description="Human-readable name for the webhook"
    )
    url: str = Field(..., min_length=1, description="Webhook URL endpoint")
    enabled: bool = Field(default=True, description="Whether the webhook is enabled")
    event_types: list[str] = Field(
        ...,
        min_length=1,
        description="List of event types to trigger this webhook (e.g., ['kernel_update'])"
    )
    headers_json: dict[str, str] | None = Field(
        default=None,
        description="Optional custom headers to send with webhook (e.g., for auth tokens)"
    )


class WebhookConfigUpdate(BaseModel):
    """Request schema for updating a webhook configuration."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "ntfy.sh kernel alerts - updated",
                "url": "https://ntfy.sh/new-topic",
                "enabled": False,
                "event_types": ["kernel_update", "package_update"],
                "headers_json": {
                    "Title": "Package Update Alert",
                    "Priority": "default"
                }
            }
        }
    )

    name: str | None = Field(None, min_length=1, max_length=255)
    url: str | None = Field(None, min_length=1)
    enabled: bool | None = None
    event_types: list[str] | None = Field(None, min_length=1)
    headers_json: dict[str, str] | None = None


class WebhookConfigResponse(BaseModel):
    """Response schema for webhook configuration."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "name": "ntfy.sh kernel alerts",
                "url": "https://ntfy.sh/my-topic",
                "enabled": True,
                "event_types": ["kernel_update"],
                "headers_json": {
                    "Title": "Kernel Update Alert",
                    "Priority": "high"
                },
                "created_at": "2025-10-29T12:00:00Z",
                "updated_at": "2025-10-29T12:00:00Z"
            }
        }
    )

    id: int
    name: str
    url: str
    enabled: bool
    event_types: list[str]
    headers_json: dict[str, str] | None
    created_at: datetime
    updated_at: datetime


class WebhookDeliveryHistoryResponse(BaseModel):
    """Response schema for webhook delivery history."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "webhook_config_id": 1,
                "event_type": "kernel_update",
                "payload": {
                    "event": "kernel_update",
                    "hostname": "server01",
                    "package_name": "linux-image-5.15.0-91-generic"
                },
                "status_code": 200,
                "response_body": "OK",
                "error_message": None,
                "attempt_number": 1,
                "delivered_at": "2025-10-29T12:00:00Z",
                "created_at": "2025-10-29T12:00:00Z"
            }
        }
    )

    id: int
    webhook_config_id: int
    event_type: str
    payload: dict
    status_code: int | None
    response_body: str | None
    error_message: str | None
    attempt_number: int
    delivered_at: datetime
    created_at: datetime


class WebhookTestRequest(BaseModel):
    """Request schema for testing webhook delivery."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "test_payload": {
                    "event": "test",
                    "message": "This is a test webhook"
                }
            }
        }
    )

    test_payload: dict | None = Field(
        default=None,
        description=(
            "Optional test payload to send. "
            "If not provided, a default test payload will be used."
        ),
    )


class WebhookTestResponse(BaseModel):
    """Response schema for webhook test delivery."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "status_code": 200,
                "response_body": "OK",
                "error_message": None,
                "delivery_time_ms": 123
            }
        }
    )

    success: bool
    status_code: int | None
    response_body: str | None
    error_message: str | None
    delivery_time_ms: int


class ListWebhookConfigsResponse(BaseModel):
    """Response schema for listing webhook configurations."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "webhooks": [
                    {
                        "id": 1,
                        "name": "ntfy.sh kernel alerts",
                        "url": "https://ntfy.sh/my-topic",
                        "enabled": True,
                        "event_types": ["kernel_update"],
                        "headers_json": {"Title": "Kernel Update Alert"},
                        "created_at": "2025-10-29T12:00:00Z",
                        "updated_at": "2025-10-29T12:00:00Z"
                    }
                ],
                "total": 1
            }
        }
    )

    webhooks: list[WebhookConfigResponse]
    total: int


class DeleteWebhookResponse(BaseModel):
    """Response schema for webhook deletion."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "Webhook configuration deleted successfully"
            }
        }
    )

    message: str
