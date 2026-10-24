"""Behavior tests for webhook destination and secret protection."""

import socket
import sqlite3
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from fluxion.api.routes.webhooks import create_webhook
from fluxion.models import WebhookConfig, WebhookDeliveryHistory
from fluxion.models.base import Base
from fluxion.schemas.webhook import WebhookConfigCreate
from fluxion.services import webhook_service
from fluxion.services.webhook_service import (
    PROTECTED_PREFIX,
    WebhookService,
    protect_webhook_headers,
    unprotect_webhook_headers,
)


@pytest.mark.asyncio
async def test_ssrf_destination_rejection(monkeypatch):
    requests = 0

    class CountingClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, *args, **kwargs):
            nonlocal requests
            requests += 1
            raise AssertionError("private destination received an HTTP request")

    monkeypatch.setattr(webhook_service, "create_relay_client", lambda url: CountingClient())
    dns_answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
    with patch("fluxion.services.webhook_service.socket.getaddrinfo", return_value=dns_answers):
        success, _, _, error, _ = await WebhookService(None).test_webhook(
            WebhookConfig(id=1, name="private", url="https://private.example/hook", enabled=True,
                          event_types=["test"]), {"event": "test"})
    assert success is False
    assert error == "Webhook URL must not point to private or reserved IP addresses"
    assert requests == 0


@pytest.mark.asyncio
async def test_webhook_secret_redaction_contract(tmp_path, monkeypatch):
    secret = "fixture-token-alpha-123"
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/secret.sqlite")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    class CountingClient:
        def __init__(self): self.request_headers = None
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            self.request_headers = dict(kwargs["headers"])
            class Response:
                status_code = 204
                text = "ok"
            return Response()

    client = CountingClient()
    monkeypatch.setattr(webhook_service, "create_relay_client", lambda url: client)
    with patch("fluxion.services.webhook_service.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    ]):
        async with Session() as session:
            response = await create_webhook(
                WebhookConfigCreate(name="secret", url="https://public.example/hook", enabled=True,
                                    event_types=["test"], headers_json={"Authorization": secret}), session)
            stored = await session.get(WebhookConfig, response.id)
            assert secret not in str(stored.headers_json)
            assert "Authorization" not in str(stored.headers_json)
            assert all(str(value).startswith(PROTECTED_PREFIX) for value in stored.headers_json.values())

            success, _, _, _, _ = await WebhookService(session).test_webhook(stored)
            assert success is True
            assert client.request_headers == {"Authorization": secret, "Content-Type": "application/json"}

            assert (await session.execute(select(WebhookDeliveryHistory))).scalars().all() == []

    persisted = sqlite3.connect(str(tmp_path / "secret.sqlite")).execute(
        "SELECT headers_json FROM webhook_configs").fetchone()[0]
    assert secret not in persisted
    assert "Authorization" not in persisted
    await engine.dispose()


@pytest.mark.asyncio
async def test_secret_fixture_never_in_history(tmp_path):
    secret = "fixture-token-alpha-123"
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/history.sqlite")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        webhook = WebhookConfig(name="secret", url="https://public.example/hook", enabled=True,
                                event_types=["test"],
                                headers_json=protect_webhook_headers({"Authorization": secret}))
        session.add(webhook)
        await session.commit()
        await session.refresh(webhook)
        await WebhookService(session)._log_delivery(
            webhook.id, "test", {"message": secret}, 204, secret, secret, 1)
        history = (await session.execute(select(WebhookDeliveryHistory))).scalars().one()
        serialized = str(history.payload) + str(history.response_body) + str(history.error_message)
        assert secret not in serialized
        assert "Authorization" not in serialized
        config = await session.get(WebhookConfig, webhook.id)
        assert secret not in str(config.headers_json)
        assert "Authorization" not in str(config.headers_json)
    await engine.dispose()
