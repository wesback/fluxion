"""Focused tests for the backend recommendation vertical slice."""

from datetime import UTC, datetime, timedelta

from fluxion.api.routes.query import (
    HOST_MISSING_AFTER_DAYS,
    HOST_STALE_AFTER_DAYS,
    HostStatus,
    get_host_status,
)
from fluxion.models.package_update import PackageUpdate
from fluxion.schemas.query import UpdateFilters
from fluxion.services.export import MAX_EXPORT_ROWS, export_rows


def test_package_updates_persist_security_flag() -> None:
    """The ORM model exposes a non-null boolean security flag."""
    column = PackageUpdate.__table__.c.is_security

    assert column.nullable is False
    assert column.default.arg is False


def test_host_status_uses_explicit_30_and_365_day_boundaries() -> None:
    """Hosts are healthy through 30d, stale through 365d, then missing."""
    now = datetime.now(UTC)

    assert get_host_status(now, now=now) is HostStatus.HEALTHY
    assert (
        get_host_status(now - timedelta(days=HOST_STALE_AFTER_DAYS), now=now)
        is HostStatus.HEALTHY
    )
    assert (
        get_host_status(now - timedelta(days=HOST_STALE_AFTER_DAYS, seconds=1), now=now)
        is HostStatus.STALE
    )
    assert (
        get_host_status(now - timedelta(days=HOST_MISSING_AFTER_DAYS), now=now)
        is HostStatus.STALE
    )
    assert (
        get_host_status(now - timedelta(days=HOST_MISSING_AFTER_DAYS, seconds=1), now=now)
        is HostStatus.MISSING
    )
    assert get_host_status(None, now=now) is HostStatus.MISSING


def test_update_filters_are_shared_and_bounded() -> None:
    """The canonical filter contract validates bounded export limits."""
    filters = UpdateFilters(
        hostname="web-1",
        package_name="openssl",
        is_security=True,
        limit=MAX_EXPORT_ROWS,
    )

    assert filters.hostname == "web-1"
    assert filters.package_name == "openssl"
    assert filters.is_security is True
    assert filters.limit == MAX_EXPORT_ROWS


def test_export_rows_caps_json_and_csv_to_ten_thousand_rows() -> None:
    """Exports never serialize more than the shared 10,000-row cap."""
    rows = [{"id": index, "is_security": index % 2 == 0} for index in range(MAX_EXPORT_ROWS + 1)]

    json_payload = export_rows(rows, "json")
    csv_payload = export_rows(rows, "csv")

    assert len(json_payload.rows) == MAX_EXPORT_ROWS
    assert json_payload.content_type == "application/json"
    assert csv_payload.content_type == "text/csv"
    assert "9999,False" in csv_payload.body
    assert "10000" not in csv_payload.body
