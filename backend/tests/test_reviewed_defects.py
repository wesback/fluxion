from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from fluxion.api.routes.admin_maintenance import retention_maintenance
from fluxion.api.routes.query import (
    _get_host_updates_impl,
    _get_recent_updates_impl,
)
from fluxion.api.routes.security import host_health
from fluxion.api.routes.updates import _upsert_host
from fluxion.config import settings
from fluxion.main import app
from fluxion.schemas.analytics import RetentionMaintenanceRequest
from fluxion.services.retention import retention_cutoff, run_retention


class RecordingSession:
    def __init__(self, result):
        self.statements = []
        self.result = result
        self.added = []
        self.committed = False

    async def execute(self, statement):
        self.statements.append(statement)
        return self.result

    async def flush(self):
        return None

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.committed = True


def _sql(statement) -> str:
    return str(statement.compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
async def test_recent_updates_select_includes_security_flag():
    row = SimpleNamespace(
        hostname="host-1",
        package_name="openssl",
        old_version="1",
        new_version="2",
        update_timestamp=datetime.now(UTC),
        is_security=True,
    )
    session = RecordingSession(SimpleNamespace(all=lambda: [row]))

    response = await _get_recent_updates_impl(20, 24, session)

    assert response.items[0].is_security is True
    assert "is_security" in session.statements[0].selected_columns.keys()


@pytest.mark.asyncio
async def test_host_update_lookup_excludes_archived_identity():
    result = SimpleNamespace(scalar_one_or_none=lambda: None)
    session = RecordingSession(result)

    with pytest.raises(HTTPException):
        await _get_host_updates_impl("host-1", 20, 0, None, None, session)

    assert "archived_at IS NULL" in _sql(session.statements[0])


@pytest.mark.asyncio
async def test_reingest_lookup_uses_only_active_host_identity():
    result = SimpleNamespace(scalar_one_or_none=lambda: None)
    session = RecordingSession(result)

    host, _ = await _upsert_host("host-1", session)

    assert host.archived_at is None
    assert "archived_at IS NULL" in _sql(session.statements[0])


@pytest.mark.asyncio
async def test_fleet_health_excludes_archived_hosts():
    session = RecordingSession(SimpleNamespace(all=lambda: []))

    response = await host_health(session)

    assert response.total_hosts == 0
    assert "archived_at IS NULL" in _sql(session.statements[0])


def test_retention_policy_is_365_days_for_both_histories():
    assert settings.package_update_retention_days == 365
    assert settings.webhook_history_retention_days == 365
    assert retention_cutoff(365)


@pytest.mark.asyncio
async def test_retention_execution_rejects_shorter_policy():
    with pytest.raises(ValueError):
        await run_retention(
            None,
            package_update_retention_days=364,
            webhook_history_retention_days=365,
        )


def test_retention_request_rejects_shorter_override():
    with pytest.raises(ValidationError):
        RetentionMaintenanceRequest(retention_days=364)


def test_retention_endpoint_matches_helm_contract():
    openapi = app.openapi()
    retention_path = openapi["paths"]["/api/v1/maintenance/retention"]
    assert "post" in retention_path
    request_body = retention_path["post"]["requestBody"]["content"]["application/json"]
    schema = openapi["components"]["schemas"][request_body["schema"]["$ref"].rsplit("/", 1)[-1]]
    assert "retention_days" in schema["properties"]


@pytest.mark.asyncio
async def test_retention_maintenance_applies_one_policy_to_both_histories(monkeypatch):
    calls = {}

    async def fake_run_retention(session, **kwargs):
        calls.update(kwargs)
        return {"package_updates_deleted": 1, "webhook_history_deleted": 2}

    monkeypatch.setattr(
        "fluxion.api.routes.admin_maintenance.run_retention",
        fake_run_retention,
    )
    session = RecordingSession(None)

    response = await retention_maintenance(
        RetentionMaintenanceRequest(retention_days=365),
        session,
    )

    assert response.package_update_retention_days == 365
    assert response.webhook_history_retention_days == 365
    assert calls["package_update_retention_days"] == 365
    assert calls["webhook_history_retention_days"] == 365
