"""Behavior tests for webhook destination and secret protection."""

import os
import socket
import sqlite3
from unittest.mock import patch

os.environ.setdefault("WEBHOOK_SECRET_KEY", "fixture-webhook-secret-key")

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from fluxion.api.routes.webhooks import create_webhook, update_webhook
from fluxion.models import WebhookConfig, WebhookDeliveryHistory, WebhookOutbox
from fluxion.models.base import Base
from fluxion.schemas.webhook import WebhookConfigCreate, WebhookConfigUpdate
from fluxion.services import webhook_service
from fluxion.services.webhook_service import (
    PROTECTED_PREFIX,
    WebhookService,
    protect_webhook_headers,
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
async def test_webhook_routes_and_relay_reject_non_global_destinations(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/route-relay.sqlite")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    with patch("fluxion.schemas.webhook.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
    ]):
        with pytest.raises(ValueError, match="Webhook URL must not point to private or reserved IP addresses"):
            WebhookConfigCreate(name="private-create", url="https://private.example/hook", event_types=["test"])
        with pytest.raises(ValueError, match="Webhook URL must not point to private or reserved IP addresses"):
            WebhookConfigUpdate(url="https://private.example/hook")

    public_answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
    class CountingClient:
        def __init__(self): self.requests = 0
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, *args, **kwargs):
            self.requests += 1
            raise AssertionError("non-global destination received an HTTP request")
    client = CountingClient()
    dns_answers = iter([[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]])

    with patch("fluxion.services.webhook_service.socket.getaddrinfo", side_effect=lambda *args, **kwargs: next(dns_answers)):
        monkeypatch.setattr(webhook_service, "create_relay_client", lambda url: client)
        async with Session() as session:
            webhook = WebhookConfig(name="dns-change", url="https://public.example/hook", enabled=True,
                                    event_types=["test"])
            session.add(webhook)
            await session.commit()
            await session.refresh(webhook)
            row = WebhookOutbox(delivery_id="dns-change-delivery", webhook_config_id=webhook.id,
                                event_type="test", payload={"message": "test"}, status="pending")
            session.add(row)
            await session.commit()
            await WebhookService(session).relay_once()
            await session.refresh(row)
            assert row.status == WebhookOutbox.STATUS_DEAD
            assert client.requests == 0
    await engine.dispose()


@pytest.mark.asyncio
async def test_webhook_secret_redaction_contract(tmp_path, monkeypatch):
    secret = "fixture-token-alpha-123"
    missing_key_engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/missing-key.sqlite")
    async with missing_key_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    MissingSession = sessionmaker(missing_key_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.delenv("WEBHOOK_SECRET_KEY", raising=False)
    async with MissingSession() as session:
        with pytest.raises(RuntimeError, match="WEBHOOK_SECRET_KEY is required to protect webhook headers"):
            await create_webhook(
                WebhookConfigCreate(name="missing-key", url="https://public.example/hook", enabled=True,
                                    event_types=["test"], headers_json={"Authorization": secret}), session)
        stored_missing = (await session.execute(select(WebhookConfig))).scalars().all()
        assert stored_missing == []
    await missing_key_engine.dispose()

    monkeypatch.setenv("WEBHOOK_SECRET_KEY", "fixture-webhook-secret-key")
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

            update_response = await update_webhook(
                response.id,
                WebhookConfigUpdate(headers_json={"Authorization": "updated-" + secret}),
                session,
            )
            updated = await session.get(WebhookConfig, update_response.id)
            assert secret not in str(updated.headers_json)
            assert "Authorization" not in str(updated.headers_json)
            assert all(str(value).startswith(PROTECTED_PREFIX) for value in updated.headers_json.values())

            assert (await session.execute(select(WebhookDeliveryHistory))).scalars().all() == []

    persisted = sqlite3.connect(str(tmp_path / "secret.sqlite")).execute(
        "SELECT headers_json FROM webhook_configs").fetchone()[0]
    assert secret not in persisted
    assert "Authorization" not in persisted
    await engine.dispose()


@pytest.mark.asyncio
async def test_relay_history_and_observability_redact_secret_material(tmp_path, monkeypatch, caplog):
    secret = "fixture-token-alpha-123"
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/relay-history.sqlite")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    class RelayClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            assert kwargs["headers"] == {"Authorization": secret, "Content-Type": "application/json"}
            class Response:
                status_code = 204
                text = secret + " Authorization " + secret
            return Response()

    monkeypatch.setattr(webhook_service, "create_relay_client", lambda url: RelayClient())
    with patch("fluxion.services.webhook_service.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    ]):
        async with Session() as session:
            webhook = WebhookConfig(name="relay-redaction", url="https://public.example/hook", enabled=True,
                                    event_types=["test"], headers_json=protect_webhook_headers({"Authorization": secret}))
            session.add(webhook)
            await session.commit()
            await session.refresh(webhook)
            row = WebhookOutbox(delivery_id="relay-redaction-delivery", webhook_config_id=webhook.id,
                                event_type="test", payload={"Authorization": secret, "message": secret})
            session.add(row)
            await session.commit()

            with caplog.at_level("DEBUG"):
                await WebhookService(session).relay_once()

            histories = (await session.execute(select(WebhookDeliveryHistory))).scalars().all()
            assert len(histories) == 1
            history_text = str(histories[0].payload) + str(histories[0].response_body) + str(histories[0].error_message)
            assert secret not in history_text
            assert "Authorization" not in history_text

    observability_text = caplog.text
    assert secret not in observability_text
    assert "Authorization" not in observability_text
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
