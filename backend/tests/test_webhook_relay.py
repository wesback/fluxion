"""Tests for bounded durable webhook relay behavior."""

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
import subprocess
import sys

import pytest

REAL_ASYNCIO_SLEEP = asyncio.sleep

from fluxion.models.webhook import WebhookConfig, WebhookOutbox
from fluxion.services import webhook_service
from fluxion.services.webhook_service import (
    INITIAL_BACKOFF,
    RELAY_CLAIM_LIMIT,
    RELAY_LEASE_SECONDS,
    RELAY_MAX_ATTEMPTS,
    WebhookService,
)


class ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class ExecuteResult:
    def __init__(self, rowcount=1):
        self.rowcount = rowcount


class RelaySession:
    def __init__(self, rows=None, config=None, mutate_owner=False):
        self.rows = list(rows or [])
        self.config = config
        self.mutate_owner = mutate_owner
        self.commits = 0
        self.claim_attempts = 0

    async def execute(self, statement, *args, **kwargs):
        text = str(statement)
        if text.lstrip().upper().startswith("SELECT"):
            self.claim_attempts += 1
            await REAL_ASYNCIO_SLEEP(0)
            now = datetime.now(UTC)
            recoverable = [
                row for row in self.rows
                if row.status == WebhookOutbox.STATUS_PENDING
                or (row.status == WebhookOutbox.STATUS_RETRYABLE
                    and row.next_attempt_at <= now)
                or (row.status == WebhookOutbox.STATUS_CLAIMED
                    and (row.lease_expires_at is None or row.lease_expires_at <= now))
            ]
            return ScalarResult(recoverable[:RELAY_CLAIM_LIMIT])

        params = statement.compile().params
        if self.mutate_owner and "lease_owner" in params:
            for row in self.rows:
                row.lease_owner = "other-owner"
            self.mutate_owner = False
            return ExecuteResult(0)

        row_id = params.get("id_1")
        row = next((item for item in self.rows if item.id == row_id), None) if row_id is not None else None
        if row is None:
            return ExecuteResult(0)

        expected_revision = params.get("updated_at_1")
        if expected_revision is not None and row.updated_at != expected_revision:
            return ExecuteResult(0)

        expected_statuses = params.get("status_1")
        if expected_statuses is not None and row.status not in expected_statuses:
            return ExecuteResult(0)

        expected_owner = params.get("lease_owner_1")
        if expected_owner is not None and row.lease_owner != expected_owner:
            return ExecuteResult(0)

        if params.get("status") == WebhookOutbox.STATUS_CLAIMED:
            if row.status not in (WebhookOutbox.STATUS_PENDING,
                                  WebhookOutbox.STATUS_RETRYABLE,
                                  WebhookOutbox.STATUS_CLAIMED):
                return ExecuteResult(0)

        for key in ("status", "attempt_count", "lease_owner", "lease_expires_at",
                    "updated_at", "next_attempt_at"):
            if key in params:
                setattr(row, key, params[key])
        return ExecuteResult(1)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        return None

    async def get(self, model, key):
        return self.config


class FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


@pytest.mark.asyncio
async def test_bounded_claim_and_single_inflight_delivery(monkeypatch):
    now = datetime.now(UTC)
    row = WebhookOutbox(id=1, delivery_id="same", webhook_config_id=1, event_type="test",
                        payload={}, status="pending", attempt_count=0, next_attempt_at=now,
                        updated_at=now)
    config = WebhookConfig(id=1, name="test", url="https://example.com/hook", enabled=True,
                           event_types=["test"])
    session = RelaySession([row], config)
    first_service = WebhookService(session)
    second_service = WebhookService(session)
    attempted = []

    async def send(*args, **kwargs):
        attempted.append(row.delivery_id)
        return True, 204, "", None

    async def log_delivery(*args, **kwargs):
        return None

    monkeypatch.setattr(webhook_service.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(first_service, "_send_request", send)
    monkeypatch.setattr(second_service, "_send_request", send)
    monkeypatch.setattr(first_service, "_log_delivery", log_delivery)
    monkeypatch.setattr(second_service, "_log_delivery", log_delivery)

    first, second = await asyncio.gather(
        first_service.relay_once(limit=100, lease_seconds=30),
        second_service.relay_once(limit=100, lease_seconds=30),
    )

    assert RELAY_CLAIM_LIMIT == 100
    assert RELAY_LEASE_SECONDS == 30
    assert len(first) == 1
    assert first[0].lease_owner is None
    assert second == []
    assert attempted == ["same"]
    assert row.status == WebhookOutbox.STATUS_DELIVERED


@pytest.mark.asyncio
async def test_retry_sequence_stops_on_success(monkeypatch):
    now = datetime.now(UTC)
    row = WebhookOutbox(id=1, delivery_id="success", webhook_config_id=1, event_type="test",
                        payload={}, status="pending", attempt_count=0, next_attempt_at=now,
                        updated_at=now)
    config = WebhookConfig(id=1, name="test", url="https://example.com/hook", enabled=True,
                           event_types=["test"])
    session = RelaySession([row], config)
    service = WebhookService(session)
    statuses = iter([500, 500, 204])
    attempted = []

    async def send(*args, **kwargs):
        status = next(statuses)
        attempted.append(status)
        return status < 300, status, "", None

    monkeypatch.setattr(webhook_service.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(service, "_send_request", send)
    async def log_delivery(*args, **kwargs):
        return None

    monkeypatch.setattr(service, "_log_delivery", log_delivery)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(webhook_service.asyncio, "sleep", no_sleep)
    claimed = await service.relay_once(limit=RELAY_CLAIM_LIMIT)

    assert len(claimed) == 1
    assert attempted == [500, 500, 204]
    assert len(attempted) == 3
    assert row.status == WebhookOutbox.STATUS_DELIVERED
    assert row.attempt_count == 3


@pytest.mark.asyncio
async def test_restart_claims_only_recoverable_intents(monkeypatch):
    now = datetime.now(UTC)
    rows = []
    for i in range(1000):
        rows.append(WebhookOutbox(id=i + 1, delivery_id=f"pending-{i}", webhook_config_id=1,
                                  event_type="test", payload={}, status="pending", attempt_count=0,
                                  next_attempt_at=now, updated_at=now))
    for i in range(1000):
        status = "retryable" if i < 100 else ("delivered" if i < 600 else "dead")
        rows.append(WebhookOutbox(id=1001 + i, delivery_id=f"state-{i}", webhook_config_id=1,
                                  event_type="test", payload={}, status=status, attempt_count=1,
                                  next_attempt_at=now - timedelta(seconds=1), updated_at=now))

    config = WebhookConfig(id=1, name="test", url="https://example.com/hook", enabled=True,
                           event_types=["test"])
    session = RelaySession(rows, config)
    service = WebhookService(session)
    attempted = []

    async def send(*args, **kwargs):
        attempted.append(True)
        return True, 204, "", None

    async def log_delivery(*args, **kwargs):
        return None

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(webhook_service.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(service, "_send_request", send)
    monkeypatch.setattr(service, "_log_delivery", log_delivery)
    monkeypatch.setattr(webhook_service.asyncio, "sleep", no_sleep)
    terminal_ids = {row.delivery_id for row in rows if row.status in WebhookOutbox.TERMINAL_STATUSES}
    claimed = await service.relay_once(limit=RELAY_CLAIM_LIMIT)

    assert len(claimed) == RELAY_CLAIM_LIMIT
    assert len(attempted) == RELAY_CLAIM_LIMIT
    assert all(row.status in (WebhookOutbox.STATUS_DELIVERED, WebhookOutbox.STATUS_DEAD)
               for row in claimed)
    assert not terminal_ids.intersection({row.delivery_id for row in claimed})


@pytest.mark.asyncio
async def test_relay_state_transitions_are_atomic():
    now = datetime.now(UTC)
    original_revision = now
    row = WebhookOutbox(id=1, delivery_id="atomic", webhook_config_id=1, event_type="test",
                        payload={}, status="pending", attempt_count=0, next_attempt_at=now,
                        updated_at=original_revision, lease_owner=None, lease_expires_at=None)
    session = RelaySession([row], mutate_owner=True)
    service = WebhookService(session)

    claimed = await service.claim_pending(limit=1)

    assert claimed == []
    assert row.updated_at == original_revision
    assert row.lease_owner == "other-owner"
    assert row.status == WebhookOutbox.STATUS_PENDING


@pytest.mark.asyncio
async def test_retry_bound_and_terminal_dead_letter(monkeypatch):
    now = datetime.now(UTC)
    row = WebhookOutbox(id=1, delivery_id="dead", webhook_config_id=1, event_type="test",
                        payload={}, status="pending", attempt_count=0, next_attempt_at=now,
                        updated_at=now)
    config = WebhookConfig(id=1, name="test", url="https://example.com/hook", enabled=True,
                           event_types=["test"])
    session = RelaySession([row], config)
    service = WebhookService(session)
    attempted = []
    sleeps = []

    async def send(*args, **kwargs):
        attempted.append(args[4])
        return False, 500, "", "server error"

    async def no_sleep(seconds):
        sleeps.append(seconds)

    async def log_delivery(*args, **kwargs):
        return None

    monkeypatch.setattr(webhook_service.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(service, "_send_request", send)
    monkeypatch.setattr(service, "_log_delivery", log_delivery)
    monkeypatch.setattr(webhook_service.asyncio, "sleep", no_sleep)

    claimed = await service.relay_once(limit=1)

    assert attempted == [1, 2, 3]
    assert sleeps == [INITIAL_BACKOFF, INITIAL_BACKOFF * 2]
    assert len(claimed) == 1
    assert row.status == WebhookOutbox.STATUS_DEAD
    assert row.attempt_count == 3
    assert row.lease_owner is None


@pytest.mark.asyncio
async def test_existing_webhook_delivery_suite_passes():
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "tests/test_webhooks.py"],
        cwd=backend,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
