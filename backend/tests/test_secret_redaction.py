"""Behavior tests for webhook destination and secret protection."""

import os
import socket
import httpx
import sqlite3
import logging
from contextlib import contextmanager
from unittest.mock import patch

from fastapi import FastAPI, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("WEBHOOK_SECRET_KEY", "fixture-webhook-secret-key")

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from fluxion.api.routes import webhooks as webhooks_routes
from fluxion.api.routes.webhooks import create_webhook, update_webhook
from fluxion.models import WebhookConfig, WebhookDeliveryHistory, WebhookOutbox
from fluxion.models.base import Base
from fluxion.schemas.webhook import WebhookConfigCreate, WebhookConfigUpdate
from fluxion.services import webhook_service
from fluxion.services.webhook_service import WebhookService

PROTECTED_PREFIX = "fluxion-protected:v1:"


def protect_headers_for_runtime(headers):
    return webhook_service.protect_webhook_headers(headers)


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

    app = FastAPI()
    app.include_router(webhooks_routes.router, prefix="/api/v1")
    async def route_session():
        async with Session() as session:
            yield session
    app.dependency_overrides[webhooks_routes.get_session] = route_session

    cases = [
        ("https://public.example/hook", ("8.8.8.8", 443), 201),
        ("https://ntfy.sh/alerts", ("8.8.4.4", 443), 201),
        ("ftp://public.example/hook", None, 422),
        ("https:///missing-host", None, 422),
        ("http://127.0.0.1/hook", None, 422),
        ("http://192.168.1.1/hook", None, 422),
        ("http://169.254.1.1/hook", None, 422),
        ("http://240.0.0.1/hook", None, 422),
        ("http://100.64.0.1/hook", None, 422),
        ("https://private.example/hook", ("127.0.0.1", 443), 422),
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for index, (url, answer, expected_status) in enumerate(cases):
            dns_answer = [] if answer is None else [(socket.AF_INET, socket.SOCK_STREAM, 6, "", answer)]
            with patch("fluxion.schemas.webhook.socket.getaddrinfo", return_value=dns_answer):
                create = await client.post("/api/v1/admin/webhooks", json={
                    "name": f"route-{index}", "url": url, "enabled": True,
                    "event_types": ["test"], "headers_json": {"X-Test": "value"},
                })
            assert create.status_code == expected_status
            if expected_status == 422:
                assert "Webhook URL" in str(create.json())
            else:
                update = await client.patch(f"/api/v1/admin/webhooks/{create.json()['id']}", json={"url": url})
                assert update.status_code == 200

        with patch("fluxion.schemas.webhook.socket.getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
        ]):
            private_create = await client.post("/api/v1/admin/webhooks", json={
                "name": "private-host-create", "url": "https://private.example/hook", "enabled": True,
                "event_types": ["test"], "headers_json": {"X-Test": "value"},
            })
        assert private_create.status_code == 422
        assert "Webhook URL must not point to private or reserved IP addresses" in str(private_create.json())

        if cases[0][2] == 201:
            public_create = await client.post("/api/v1/admin/webhooks", json={
                "name": "private-host-update", "url": "https://public.example/hook", "enabled": True,
                "event_types": ["test"], "headers_json": {"X-Test": "value"},
            })
            with patch("fluxion.schemas.webhook.socket.getaddrinfo", return_value=[
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
            ]):
                private_update = await client.patch(
                    f"/api/v1/admin/webhooks/{public_create.json()['id']}",
                    json={"url": "https://private.example/hook"},
                )
            assert private_update.status_code == 422

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

            relay_row = WebhookOutbox(delivery_id="secret-relay-delivery", webhook_config_id=updated.id,
                                      event_type="test", payload={"message": "relay"})
            session.add(relay_row)
            await session.commit()
            await WebhookService(session).relay_once()
            assert client.request_headers == {"Authorization": "updated-" + secret, "Content-Type": "application/json"}

            assert (await session.execute(select(WebhookDeliveryHistory))).scalars().all()
            assert len((await session.execute(select(WebhookDeliveryHistory))).scalars().all()) == 1

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

    class FailingRelayClient(RelayClient):
        async def post(self, url, **kwargs):
            raise httpx.ConnectError(f"connect failed Authorization: {secret}")

    relay_clients = [RelayClient()]
    relay_metrics = []
    monkeypatch.setattr(webhook_service, "create_relay_client", lambda url: relay_clients.pop(0) if relay_clients else FailingRelayClient())
    monkeypatch.setattr(webhook_service, "record_webhook_delivery", relay_metrics.append)

    trace_output = []

    class CapturingSpan:
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def set_attribute(self, name, value): trace_output.append(f"{name}={value}")
        def record_exception(self, exception): trace_output.append(repr(exception))

    class CapturingTracer:
        def start_as_current_span(self, name): return CapturingSpan()

    captured_exceptions = []
    monkeypatch.setattr(webhook_service, "get_tracer", lambda: CapturingTracer())
    with patch("fluxion.services.webhook_service.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    ]):
        async with Session() as session:
            webhook = WebhookConfig(name="relay-redaction", url="https://public.example/hook", enabled=True,
                                    event_types=["test"], headers_json=protect_headers_for_runtime({"Authorization": secret}))
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

            failing_row = WebhookOutbox(delivery_id="relay-redaction-failure", webhook_config_id=webhook.id,
                                        event_type="test", payload={"Authorization": secret, "message": secret})
            session.add(failing_row)
            await session.commit()
            try:
                with caplog.at_level("DEBUG"):
                    await WebhookService(session).relay_once()
            except Exception as exc:
                captured_exceptions.append(repr(exc))

            all_histories = (await session.execute(select(WebhookDeliveryHistory))).scalars().all()
            assert len(all_histories) > 1  # the success row plus every failed attempt
            failure_text = "".join(str(h.payload) + str(h.response_body) + str(h.error_message) for h in all_histories)
            assert secret not in failure_text
            assert "Authorization" not in failure_text
            assert any(h.status_code is None and h.error_message for h in all_histories), "the failing relay must record an error"
            await session.refresh(failing_row)
            assert failing_row.status in {WebhookOutbox.STATUS_RETRYABLE, WebhookOutbox.STATUS_DEAD}

    observability_text = caplog.text + repr(relay_metrics) + repr(trace_output) + repr(captured_exceptions)
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
                                headers_json=protect_headers_for_runtime({"Authorization": secret}))
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
