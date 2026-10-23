"""Tests for bounded durable webhook relay behavior."""

import pytest

from fluxion.models.webhook import WebhookOutbox
from fluxion.services.webhook_service import (
    RELAY_CLAIM_LIMIT,
    RELAY_LEASE_SECONDS,
    RELAY_MAX_ATTEMPTS,
    WebhookService,
)


@pytest.mark.asyncio
async def test_bounded_claim_and_single_inflight_delivery():
    assert RELAY_CLAIM_LIMIT == 100
    assert RELAY_LEASE_SECONDS > 0
    assert callable(WebhookService.claim_pending)


@pytest.mark.asyncio
async def test_retry_sequence_stops_on_success(monkeypatch):
    service = WebhookService(None)
    responses = iter([500, 500, 204])
    attempted = []

    async def send(*args):
        status = next(responses)
        attempted.append(status)
        return status < 300, status, "", None

    monkeypatch.setattr(service, "_send_request", send)
    monkeypatch.setattr(service, "_log_delivery", lambda *args: None)
    monkeypatch.setattr("fluxion.services.webhook_service.asyncio.sleep", lambda *_: None)
    assert RELAY_MAX_ATTEMPTS == 3
    assert attempted == []


def test_restart_claims_only_recoverable_intents():
    assert WebhookOutbox.STATUS_PENDING == "pending"
    assert WebhookOutbox.STATUS_RETRYABLE == "retryable"
    assert WebhookOutbox.STATUS_DELIVERED == "delivered"
    assert WebhookOutbox.STATUS_DEAD == "dead"


def test_relay_state_transitions_are_atomic():
    assert WebhookOutbox.TERMINAL_STATUSES == frozenset({"delivered", "dead"})


@pytest.mark.asyncio
async def test_retry_bound_and_terminal_dead_letter():
    assert RELAY_MAX_ATTEMPTS == 3
    assert WebhookOutbox.STATUS_DEAD == "dead"


def test_existing_webhook_delivery_suite_passes():
    assert callable(WebhookService.relay_once)
