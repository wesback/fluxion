"""Tests for bounded durable webhook relay behavior."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
import subprocess
import sys

import pytest

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
            recoverable = [
                row for row in self.rows
                if row.status in WebhookOutbox.RECOVERABLE_STATUSES
                and row.status != WebhookOutbox.STATUS_CLAIMED
            ]
            return ScalarResult(recoverable[:RELAY_CLAIM_LIMIT])

        params = statement.compile().params
        if self.mutate_owner:
            for row in self.rows:
                row.lease_owner = "other-owner"
            self.mutate_owner = False
            return ExecuteResult(0)

        for row in self.rows:
            if "status" in params:
                row.status = params["status"]
            if "attempt_count" in params:
                row.attempt_count = params["attempt_count"]
            if "lease_owner" in params:
                row.lease_owner = params["lease_owner"]
            if "lease_expires_at" in params:
                row.lease_expires_at = params["lease_expires_at"]
            if "updated_at" in params:
                row.updated_at = params["updated_at"]
            if "next_attempt_at" in params:
                row.next_attempt_at = params["next_attempt_at"]
        return ExecuteResult(1 if self.rows else 0)

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
    session = RelaySession([row])
    service = WebhookService(session)

    first = await service.claim_pending(limit=100, lease_seconds=30)
    second = await service.claim_pending(limit=100, lease_seconds=30)

    assert RELAY_CLAIM_LIMIT == 100
    assert RELAY_LEASE_SECONDS == 30
    assert len(first) == 1
    assert first[0].lease_owner is not None
    assert second == []


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

    for _ in range(RELAY_MAX_ATTEMPTS):
        await service._relay_claimed_row(row)
        if row.status in WebhookOutbox.TERMINAL_STATUSES:
            break
        row.status = WebhookOutbox.STATUS_CLAIMED

    assert attempted == [500, 500, 204]
    assert len(attempted) == 3
    assert row.status == WebhookOutbox.STATUS_DELIVERED
    assert row.attempt_count == 3


@pytest.mark.asyncio
async def test_restart_claims_only_recoverable_intents():
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

    session = RelaySession(rows)
    service = WebhookService(session)
    claimed = await service.claim_pending(limit=RELAY_CLAIM_LIMIT)

    assert len(claimed) <= RELAY_CLAIM_LIMIT
    assert all(row.status == WebhookOutbox.STATUS_CLAIMED for row in claimed)
    assert all(row.status not in WebhookOutbox.TERMINAL_STATUSES for row in rows)


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
                        payload={}, status="claimed", attempt_count=0, next_attempt_at=now,
                        updated_at=now, lease_owner="owner")
    session = RelaySession([row])
    service = WebhookService(session)
    attempted = []

    for attempt in range(1, RELAY_MAX_ATTEMPTS + 1):
        row.status = WebhookOutbox.STATUS_CLAIMED
        row.lease_owner = "owner"
        row.updated_at = now + timedelta(microseconds=attempt)
        await service._finish_claim(row, success=False, status_code=500,
                                   response_body="", error_message="timeout", exhausted=attempt == 3,
                                   attempt_count=attempt)
        attempted.append(attempt)
        if row.status == WebhookOutbox.STATUS_DEAD:
            break

    assert attempted == [1, 2, 3]
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
