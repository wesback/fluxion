"""Schemas for API key management endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateAPIKeyRequest(BaseModel):
    """Request schema for creating a new API key."""

    name: str = Field(..., min_length=1, max_length=255, description="Name/description for the API key")
    role: str = Field(default="user", description="Role for the API key (user or admin)")


class CreateAPIKeyResponse(BaseModel):
    """Response schema for creating a new API key."""

    id: int = Field(..., description="ID of the created API key")
    name: str = Field(..., description="Name of the API key")
    role: str = Field(..., description="Role of the API key")
    api_key: str = Field(..., description="The generated API key (only shown once)")
    message: str = Field(..., description="Success message")


class APIKeyMetadata(BaseModel):
    """Metadata for an API key (without the actual key)."""

    id: int = Field(..., description="ID of the API key")
    name: str = Field(..., description="Name/description of the API key")
    role: str = Field(..., description="Role of the API key")
    created_at: datetime = Field(..., description="When the key was created")
    last_used: Optional[datetime] = Field(None, description="When the key was last used")
    is_active: bool = Field(..., description="Whether the key is active")


class ListAPIKeysResponse(BaseModel):
    """Response schema for listing API keys."""

    items: list[APIKeyMetadata] = Field(..., description="List of API keys")
    total: int = Field(..., description="Total number of API keys")


class DeleteAPIKeyResponse(BaseModel):
    """Response schema for deleting an API key."""

    message: str = Field(..., description="Success message")
