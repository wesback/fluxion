"""Pydantic schemas for package update endpoints."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PackageUpdateItem(BaseModel):
    """Single package update item (without hostname)."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "package_name": "nginx",
                "old_version": "1.18.0",
                "new_version": "1.22.0",
            }
        }
    )

    package_name: str = Field(..., min_length=1, max_length=255, description="Name of the package")
    old_version: str | None = Field(
        None, max_length=255, description="Previous version (null or '-' for new installs)"
    )
    new_version: str = Field(..., min_length=1, max_length=255, description="New version installed")


class PackageUpdateRequest(BaseModel):
    """Request schema for package update webhook."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "package_name": "nginx",
                "old_version": "1.18.0",
                "new_version": "1.22.0",
            }
        }
    )

    hostname: str = Field(..., min_length=1, max_length=255, description="Hostname of the server")
    package_name: str = Field(..., min_length=1, max_length=255, description="Name of the package")
    old_version: str | None = Field(
        None, max_length=255, description="Previous version (null or '-' for new installs)"
    )
    new_version: str = Field(..., min_length=1, max_length=255, description="New version installed")


class PackageUpdateResponse(BaseModel):
    """Response schema for successful package update."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"id": 123, "message": "Package update recorded successfully"}
        }
    )

    id: int = Field(..., description="ID of the created package update record")
    message: str = Field(..., description="Success message")


class HealthResponse(BaseModel):
    """Response schema for health check endpoint."""

    model_config = ConfigDict(json_schema_extra={"example": {"status": "healthy"}})

    status: str = Field(..., description="Health status")


class ReadinessResponse(BaseModel):
    """Response schema for readiness check endpoint."""

    model_config = ConfigDict(
        json_schema_extra={"example": {"status": "ready", "database": "connected"}}
    )

    status: str = Field(..., description="Readiness status")
    database: str = Field(..., description="Database connection status")


class BatchPackageUpdateRequest(BaseModel):
    """Request schema for batch package updates."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "updates": [
                    {"package_name": "nginx", "old_version": "1.18.0", "new_version": "1.22.0"},
                    {"package_name": "curl", "old_version": "7.68.0", "new_version": "7.81.0"},
                    {"package_name": "vim", "old_version": None, "new_version": "8.2.0"},
                ],
            }
        }
    )

    hostname: str = Field(..., min_length=1, max_length=255, description="Hostname of the server")
    updates: list[PackageUpdateItem] = Field(
        ..., min_length=1, description="List of package updates"
    )

    @field_validator("updates")
    @classmethod
    def validate_updates_not_empty(cls, v: list[PackageUpdateItem]) -> list[PackageUpdateItem]:
        """Ensure updates list is not empty."""
        if not v:
            raise ValueError("updates list cannot be empty")
        return v


class BatchPackageUpdateResponse(BaseModel):
    """Response schema for batch package update."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "count": 3,
                "ids": [123, 124, 125],
                "message": "3 package updates recorded successfully",
            }
        }
    )

    hostname: str = Field(..., description="Hostname of the server")
    count: int = Field(..., description="Number of package updates recorded")
    ids: list[int] = Field(..., description="IDs of the created package update records")
    message: str = Field(..., description="Success message")
