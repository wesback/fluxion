from pathlib import Path
from types import SimpleNamespace

import pytest_asyncio
import sqlalchemy as sa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

import fluxion.api.routes.updates as updates_module
import fluxion.models as models
import fluxion.telemetry as telemetry
from fluxion.models.base import Base
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader


class AsyncOverSync:
    def __init__(self, session): self._session = session
    @property
    def new(self): return self._session.new
    def add(self, value): self._session.add(value)
    async def execute(self, *args, **kwargs): return self._session.execute(*args, **kwargs)
    async def flush(self): self._session.flush()
    async def commit(self): self._session.commit()
    async def rollback(self): self._session.rollback()


@pytest_asyncio.fixture
async def telemetry_ingest(tmp_path: Path, monkeypatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path}/telemetry.sqlite", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    async def no_delivery(*_args, **_kwargs): return None
    monkeypatch.setattr(updates_module, "_trigger_package_change_webhooks", no_delivery)

    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    meter = provider.get_meter("bulk-ingest-observability")
    telemetry._package_batch_rows = meter.create_counter("package_batch_rows_total")
    telemetry._package_batch_transaction = meter.create_histogram("package_batch_transaction_seconds")
    telemetry._http_request_duration = meter.create_histogram("http_request_duration")
    telemetry._package_updates_counter = meter.create_counter("package_updates_total")

    app = FastAPI()
    app.include_router(updates_module.router, prefix="/api/v1")
    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)
    app.dependency_overrides[updates_module.get_session] = get_test_session
    app.dependency_overrides[updates_module.authorize_batch_hostname] = lambda: {"role": "admin", "allowed_hosts": []}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, engine=engine, reader=reader)
    engine.dispose()


def metric_data(reader, name):
    resource_metrics = reader.get_metrics_data()
    for resource in resource_metrics.resource_metrics:
        for scope in resource.scope_metrics:
            for metric in scope.metrics:
                if metric.name == name:
                    return metric.data.data_points
    return []


async def test_bulk_ingest_observability_contract(telemetry_ingest):
    payload = {"hostname": "secret-host", "package_manager": "apt", "updates": [
        {"package_name": "pkg-a", "new_version": "2", "is_security": False},
        {"package_name": "pkg-b", "new_version": "2", "is_security": False},
        {"package_name": "pkg-c", "new_version": "2", "is_security": False},
    ]}
    response = await telemetry_ingest.client.post("/api/v1/updates/batch", json=payload, headers={"X-API-Key": "api-secret", "X-Delivery-ID": "telemetry-1"})
    assert response.status_code == 201

    rows = metric_data(telemetry_ingest.reader, "package_batch_rows_total")
    assert sum(point.value for point in rows if point.attributes.get("result") == "accepted") == 3
    assert sum(point.value for point in rows if point.attributes.get("result") == "rejected") == 0
    transactions = metric_data(telemetry_ingest.reader, "package_batch_transaction_seconds")
    assert len(translations := transactions) == 1
    assert translations[0].attributes == {"outcome": "committed"}
    requests = metric_data(telemetry_ingest.reader, "http_request_duration")
    assert len(requests) == 1
    assert requests[0].attributes == {"endpoint": "/api/v1/updates/batch", "method": "POST"}

    serialized = repr(telemetry_ingest.reader.get_metrics_data())
    assert "secret-host" not in serialized
    assert "pkg-a" not in serialized
    assert "api-secret" not in serialized

    with telemetry_ingest.engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TRIGGER fail_batch_insert BEFORE INSERT ON package_updates "
            "WHEN NEW.package_name = 'pkg-c' "
            "BEGIN SELECT RAISE(ABORT, 'trigger secret failure'); END"
        ))
    payload["updates"][2]["package_name"] = "pkg-c"
    payload["hostname"] = "rolled-back-host"
    payload["updates"][0]["package_name"] = "rollback-a"
    payload["updates"][1]["package_name"] = "rollback-b"
    payload["updates"][2]["package_name"] = "pkg-c"
    response = await telemetry_ingest.client.post(
        "/api/v1/updates/batch", json=payload,
        headers={"X-API-Key": "api-secret", "X-Delivery-ID": "telemetry-2"},
    )
    assert response.status_code == 500

    rows = metric_data(telemetry_ingest.reader, "package_batch_rows_total")
    accepted = sum(point.value for point in rows if point.attributes.get("result") == "accepted")
    rejected = sum(point.value for point in rows if point.attributes.get("result") == "rejected")
    assert accepted == 3
    assert rejected == 3
    transactions = metric_data(telemetry_ingest.reader, "package_batch_transaction_seconds")
    outcomes = [point.attributes for point in transactions]
    assert {point.attributes.get("outcome") for point in transactions} == {"committed", "rolled_back"}
    assert len(transactions) == 2
    requests = metric_data(telemetry_ingest.reader, "http_request_duration")
    assert len(requests) == 1
    assert requests[0].attributes == {"endpoint": "/api/v1/updates/batch", "method": "POST"}
    assert requests[0].count == 2
    serialized = repr(telemetry_ingest.reader.get_metrics_data())
    assert "rolled-back-host" not in serialized
    assert "rollback-a" not in serialized
    assert "pkg-c" not in serialized
    assert "api-secret" not in serialized

    ingest_payload = {
        "hostname": "ingest-host",
        "packages": [
            {"name": "ingest-a", "version": "2", "security": False},
            {"name": "ingest-b", "version": "2", "security": False},
            {"name": "ingest-c", "version": "2", "security": False},
        ],
    }
    response = await telemetry_ingest.client.post(
        "/api/v1/updates/ingest/apk", json=ingest_payload,
        headers={"X-API-Key": "api-secret", "X-Delivery-ID": "telemetry-ingest"},
    )
    assert response.status_code == 201

    rows = metric_data(telemetry_ingest.reader, "package_batch_rows_total")
    assert sum(point.value for point in rows if point.attributes.get("result") == "accepted") == 6
    assert sum(point.value for point in rows if point.attributes.get("result") == "rejected") == 3
    requests = metric_data(telemetry_ingest.reader, "http_request_duration")
    request_attributes = {tuple(sorted(point.attributes.items())) for point in requests}
    assert request_attributes == {
        (("endpoint", "/api/v1/updates/batch"), ("method", "POST")),
        (("endpoint", "/api/v1/updates/ingest/{package_manager}"), ("method", "POST")),
    }
    serialized = repr(telemetry_ingest.reader.get_metrics_data())
    assert "ingest-host" not in serialized
    assert "ingest-a" not in serialized
    assert "api-secret" not in serialized
