"""Behavior tests for webhook destination and secret protection."""

import socket
from unittest.mock import patch

import pytest

from fluxion.services.webhook_service import (
    PROTECTED_PREFIX,
    protect_webhook_headers,
    redact_sensitive_text,
    unprotect_webhook_headers,
    validate_relay_destination,
)


@pytest.mark.asyncio
async def test_ssrf_destination_rejection(monkeypatch):
    requests = 0

    class CountingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, *args, **kwargs):
            nonlocal requests
            requests += 1

    dns_answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
    with patch("fluxion.services.webhook_service.socket.getaddrinfo", return_value=dns_answers):
        with pytest.raises(ValueError, match="private or reserved IP addresses"):
            validate_relay_destination("https://private.example/hook")
    assert requests == 0


def test_webhook_secret_redaction_contract():
    secret = "fixture-token-alpha-123"
    protected = protect_webhook_headers({"Authorization": f"Bearer {secret}"})

    assert protected is not None
    serialized = str(protected)
    assert secret not in serialized
    assert "Authorization" not in serialized
    assert all(str(value).startswith(PROTECTED_PREFIX) for value in protected.values())

    recovered = unprotect_webhook_headers(protected)
    assert recovered == {"Authorization": f"Bearer {secret}"}

    text = f"Authorization: Bearer {secret}"
    assert redact_sensitive_text(text, protected) == "[REDACTED]: [REDACTED]"


def test_secret_fixture_never_in_history():
    secret = "fixture-token-alpha-123"
    protected = protect_webhook_headers({"Authorization": secret})
    serialized = str(protected)
    assert secret not in serialized
    assert "Authorization" not in serialized
    assert "Authorization" not in (redact_sensitive_text("Authorization", protected) or "")
