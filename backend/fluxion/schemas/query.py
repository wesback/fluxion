"""Pydantic schemas for query endpoints."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class HostListItem(BaseModel):
    """Single host item in list response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "os_info": "Ubuntu 22.04 LTS",
                "last_seen": "2025-10-29T14:30:00Z",
                "total_updates": 42,
            }
        }
    )

    hostname: str = Field(..., description="Hostname of the server")
    os_info: str = Field(..., description="Operating system information")
    last_seen: datetime = Field(..., description="Last time host reported in (ISO8601 UTC)")
    total_updates: int = Field(..., description="Total number of updates for this host")


class HostListResponse(BaseModel):
    """Response schema for hosts list endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "os_info": "Ubuntu 22.04 LTS",
                        "last_seen": "2025-10-29T14:30:00Z",
                        "total_updates": 42,
                    }
                ]
            }
        }
    )

    items: list[HostListItem] = Field(..., description="List of hosts")


class UpdateItem(BaseModel):
    """Single update item in update history."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "package_name": "nginx",
                "old_version": "1.18.0",
                "new_version": "1.22.0",
                "update_timestamp": "2025-10-29T14:30:00Z",
            }
        }
    )

    package_name: str = Field(..., description="Name of the package")
    old_version: str | None = Field(None, description="Previous version (null for new installs)")
    new_version: str = Field(..., description="New version installed")
    update_timestamp: datetime = Field(..., description="When the update occurred (ISO8601 UTC)")


class HostUpdatesResponse(BaseModel):
    """Response schema for host updates endpoint with pagination."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "package_name": "nginx",
                        "old_version": "1.18.0",
                        "new_version": "1.22.0",
                        "update_timestamp": "2025-10-29T14:30:00Z",
                    }
                ],
                "total": 100,
                "limit": 50,
                "offset": 0,
            }
        }
    )

    items: list[UpdateItem] = Field(..., description="List of package updates")
    total: int = Field(..., description="Total number of updates for this host")
    limit: int = Field(..., description="Limit used for pagination")
    offset: int = Field(..., description="Offset used for pagination")


class PackageHostItem(BaseModel):
    """Single host item for package hosts endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "current_version": "1.22.0",
                "last_updated": "2025-10-29T14:30:00Z",
            }
        }
    )

    hostname: str = Field(..., description="Hostname of the server")
    current_version: str = Field(..., description="Current version of the package on this host")
    last_updated: datetime = Field(
        ..., description="When this package was last updated on this host (ISO8601 UTC)"
    )


class PackageHostsResponse(BaseModel):
    """Response schema for package hosts endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "current_version": "1.22.0",
                        "last_updated": "2025-10-29T14:30:00Z",
                    }
                ]
            }
        }
    )

    items: list[PackageHostItem] = Field(..., description="List of hosts with this package")


class RecentUpdateItem(BaseModel):
    """Single recent update item."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hostname": "server01",
                "package_name": "nginx",
                "old_version": "1.18.0",
                "new_version": "1.22.0",
                "timestamp": "2025-10-29T14:30:00Z",
            }
        }
    )

    hostname: str = Field(..., description="Hostname of the server")
    package_name: str = Field(..., description="Name of the package")
    old_version: str | None = Field(None, description="Previous version (null for new installs)")
    new_version: str = Field(..., description="New version installed")
    timestamp: datetime = Field(..., description="When the update occurred (ISO8601 UTC)")


class RecentUpdatesResponse(BaseModel):
    """Response schema for recent updates endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "package_name": "nginx",
                        "old_version": "1.18.0",
                        "new_version": "1.22.0",
                        "timestamp": "2025-10-29T14:30:00Z",
                    }
                ]
            }
        }
    )

    items: list[RecentUpdateItem] = Field(..., description="List of recent updates")


class TopPackageItem(BaseModel):
    """Single top package item."""

    model_config = ConfigDict(json_schema_extra={"example": {"package": "nginx", "count": 42}})

    package: str = Field(..., description="Package name")
    count: int = Field(..., description="Number of updates for this package")


class TopHostItem(BaseModel):
    """Single top host item."""

    model_config = ConfigDict(json_schema_extra={"example": {"hostname": "server01", "count": 42}})

    hostname: str = Field(..., description="Hostname of the server")
    count: int = Field(..., description="Number of updates for this host")


class StatsResponse(BaseModel):
    """Response schema for dashboard statistics endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_hosts": 10,
                "total_updates": 1000,
                "updates_last_24h": 50,
                "updates_last_7d": 300,
                "most_updated_packages": [{"package": "nginx", "count": 42}],
                "most_active_hosts": [{"hostname": "server01", "count": 100}],
            }
        }
    )

    total_hosts: int = Field(..., description="Total number of hosts")
    total_updates: int = Field(..., description="Total number of updates across all hosts")
    updates_last_24h: int = Field(..., description="Number of updates in the last 24 hours")
    updates_last_7d: int = Field(..., description="Number of updates in the last 7 days")
    most_updated_packages: list[TopPackageItem] = Field(
        ..., description="Top 10 most updated packages"
    )
    most_active_hosts: list[TopHostItem] = Field(..., description="Top 10 most active hosts")
