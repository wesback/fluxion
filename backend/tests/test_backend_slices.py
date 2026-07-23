from datetime import UTC, datetime, timedelta

import pytest

from fluxion.models.host import Host
from fluxion.models.package_update import PackageUpdate
from fluxion.services.ingest_adapters import (
    ApkIngestAdapter,
    DnfIngestAdapter,
    ZypperIngestAdapter,
    normalize_ingest_payload,
)
from fluxion.services.package_classifier import (
    PackageClass,
    classify_package,
    is_kernel_package,
)
from fluxion.services.retention import retention_cutoff


def test_kernel_classifier_covers_image_headers_and_modules_only() -> None:
    assert classify_package("linux-image-6.8.0").classification is PackageClass.KERNEL
    assert classify_package("linux-headers-6.8.0").classification is PackageClass.KERNEL
    assert classify_package("linux-modules-6.8.0").classification is PackageClass.KERNEL
    assert is_kernel_package("linux-image-extra-6.8.0")
    assert not is_kernel_package("linux")
    assert not is_kernel_package("linux-firmware")


def test_ingest_adapters_normalize_supported_distro_payloads() -> None:
    assert normalize_ingest_payload(
        {"hostname": "fedora-1", "updates": [{"name": "openssl", "version": "3"}]},
        DnfIngestAdapter(),
    ).package_manager == "dnf"
    assert normalize_ingest_payload(
        {"hostname": "alpine-1", "packages": [{"package": "busybox", "new": "1"}]},
        ApkIngestAdapter(),
    ).package_manager == "apk"
    assert normalize_ingest_payload(
        {"hostname": "suse-1", "updates": [{"name": "curl", "new_version": "8"}]},
        ZypperIngestAdapter(),
    ).updates[0].new_version == "8"


def test_retention_cutoff_is_utc_and_configurable() -> None:
    now = datetime(2026, 7, 23, 12, tzinfo=UTC)
    assert retention_cutoff(30, now=now) == now - timedelta(days=30)


def test_hosts_can_represent_archived_identity_and_package_manager() -> None:
    assert "archived_at" in Host.__table__.c
    assert "package_manager" in PackageUpdate.__table__.c


@pytest.mark.asyncio
async def test_analytics_routes_are_registered() -> None:
    from fluxion.main import app

    paths = app.openapi()["paths"]
    assert "/api/v1/activity/analytics" in paths
    assert any(route.path == "/api/v1/activity" for route in app.routes)
    assert any(route.path == "/api/v1/kernels" for route in app.routes)
    assert any(route.path == "/api/v1/admin/ingest/diagnostics" for route in app.routes)
    assert "/api/v1/kernel/fleet" in paths
    assert "/api/v1/admin/diagnostics/ingest" in paths
    assert "/api/v1/admin/maintenance/retention" in paths
    assert "/api/v1/updates/ingest/{package_manager}" in paths
