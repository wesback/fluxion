"""Pydantic schemas for query and analytics endpoints."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class HostInfo(BaseModel):
    """Response schema for host information."""

    model_config = ConfigDict(from_attributes=True)

    hostname: str = Field(..., description="Hostname of the server")
    os_info: str = Field(..., description="Operating system information")
    last_seen: datetime = Field(..., description="Last time the host reported in")
    total_updates: int = Field(..., description="Total number of package updates")


class HostListResponse(BaseModel):
    """Response schema for list of hosts."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "os_info": "Ubuntu 22.04 LTS",
                        "last_seen": "2025-10-29T14:00:00Z",
                        "total_updates": 42,
                    }
                ],
                "total": 1,
            }
        }
    )

    items: list[HostInfo] = Field(..., description="List of hosts")
    total: int = Field(..., description="Total number of hosts")


class PackageUpdateInfo(BaseModel):
    """Response schema for package update information."""

    model_config = ConfigDict(from_attributes=True)

    package_name: str = Field(..., description="Name of the package")
    old_version: str | None = Field(None, description="Previous version")
    new_version: str = Field(..., description="New version")
    update_timestamp: datetime = Field(..., description="When the update occurred")


class HostUpdatesResponse(BaseModel):
    """Response schema for host update history."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "package_name": "nginx",
                        "old_version": "1.18.0",
                        "new_version": "1.22.0",
                        "update_timestamp": "2025-10-29T14:00:00Z",
                    }
                ],
                "total": 1,
                "limit": 50,
                "offset": 0,
            }
        }
    )

    items: list[PackageUpdateInfo] = Field(..., description="List of package updates")
    total: int = Field(..., description="Total number of updates")
    limit: int = Field(..., description="Limit parameter used")
    offset: int = Field(..., description="Offset parameter used")


class PackageHostInfo(BaseModel):
    """Response schema for package installation on a host."""

    model_config = ConfigDict(from_attributes=True)

    hostname: str = Field(..., description="Hostname of the server")
    current_version: str = Field(..., description="Current installed version")
    last_updated: datetime = Field(..., description="Last update timestamp")


class PackageHostsResponse(BaseModel):
    """Response schema for hosts having a package installed."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "current_version": "1.22.0",
                        "last_updated": "2025-10-29T14:00:00Z",
                    }
                ],
                "total": 1,
            }
        }
    )

    items: list[PackageHostInfo] = Field(..., description="List of hosts with package")
    total: int = Field(..., description="Total number of hosts")


class RecentUpdateInfo(BaseModel):
    """Response schema for recent update information."""

    model_config = ConfigDict(from_attributes=True)

    hostname: str = Field(..., description="Hostname of the server")
    package_name: str = Field(..., description="Name of the package")
    old_version: str | None = Field(None, description="Previous version")
    new_version: str = Field(..., description="New version")
    timestamp: datetime = Field(..., description="When the update occurred")


class RecentUpdatesResponse(BaseModel):
    """Response schema for recent updates across all hosts."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "hostname": "server01",
                        "package_name": "nginx",
                        "old_version": "1.18.0",
                        "new_version": "1.22.0",
                        "timestamp": "2025-10-29T14:00:00Z",
                    }
                ],
                "total": 1,
            }
        }
    )

    items: list[RecentUpdateInfo] = Field(..., description="List of recent updates")
    total: int = Field(..., description="Total number of updates")


class PackageCount(BaseModel):
    """Response schema for package count statistics."""

    package: str = Field(..., description="Package name")
    count: int = Field(..., description="Number of updates")


class HostCount(BaseModel):
    """Response schema for host count statistics."""

    hostname: str = Field(..., description="Hostname")
    count: int = Field(..., description="Number of updates")


class StatsResponse(BaseModel):
    """Response schema for dashboard statistics."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_hosts": 10,
                "total_updates": 500,
                "updates_last_24h": 25,
                "updates_last_7d": 150,
                "most_updated_packages": [{"package": "nginx", "count": 15}],
                "most_active_hosts": [{"hostname": "server01", "count": 45}],
            }
        }
    )

    total_hosts: int = Field(..., description="Total number of hosts")
    total_updates: int = Field(..., description="Total number of updates")
    updates_last_24h: int = Field(..., description="Updates in last 24 hours")
    updates_last_7d: int = Field(..., description="Updates in last 7 days")
    most_updated_packages: list[PackageCount] = Field(
        ..., description="Most frequently updated packages"
    )
    most_active_hosts: list[HostCount] = Field(..., description="Most active hosts by update count")
