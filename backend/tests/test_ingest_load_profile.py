from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def params(tmp_path, **changes):
    value = {"target_url": "https://ingest.example/api/v1", "client_count": 2,
             "batch_size": 3, "duration": 10,
             "data_set_version": "host-1000-package-1000000-v1",
             "test_data_version": "test-data-v1", "output_dir": str(tmp_path)}
    value.update(changes)
    return value


class FakeResponse:
    def __init__(self, status=200, body=""):
        self.status_code = status
        self.body = body
        self.text = body
        self.pool_waits = 0
        self.database_utilization = 0.0


class FakeClient:
    def __init__(self, status=200, body=""):
        self.calls = []
        self.status = status
        self.body = body
    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.status, self.body)


class FakeFixtures:
    def __init__(self, fail_table=None):
        self.creations = 0
        self.fail_table = fail_table
        self.counts = {"package_updates": 4, "hosts": 2, "api_keys": 1, "webhook_configs": 1}
    def snapshot_counts(self):
        return dict(self.counts)
    def create_fixtures(self, config):
        self.creations += 1
        self.counts["package_updates"] += config.batch_size
        self.counts["api_keys"] += 1
    def cleanup(self):
        if self.fail_table:
            self.counts[self.fail_table] += 1
            return
        self.counts["package_updates"] -= 3
        self.counts["api_keys"] -= 1
        if self.counts["package_updates"] < 4:
            self.counts["package_updates"] = 4
        if self.counts["api_keys"] < 1:
            self.counts["api_keys"] = 1


def test_load_runner_refuses_before_any_request(tmp_path):
    from scripts.run_ingest_load import run_ingest_load
    client, fixtures = FakeClient(), FakeFixtures()
    with pytest.raises(ValueError, match="FLUXION_LOAD_API_KEY is empty"):
        run_ingest_load(params(tmp_path), {}, client, fixtures)
    assert client.calls == [] and fixtures.creations == 0

    client, fixtures = FakeClient(), FakeFixtures()
    run_ingest_load(params(tmp_path, client_count=2, batch_size=3, batches_per_client=1), {"FLUXION_LOAD_API_KEY": "header-key"}, client, fixtures)
    assert len(client.calls) == 2
    for url, kwargs in client.calls:
        assert url == "https://ingest.example/api/v1/updates/batch"
        assert kwargs["headers"] == {"X-API-Key": "header-key"}
        assert len(kwargs["json"]["updates"]) == 3

    with pytest.raises(ValueError, match="Invalid load parameter: batch_size"):
        run_ingest_load(params(tmp_path, batch_size=101), {"FLUXION_LOAD_API_KEY": "key"}, client, fixtures)


def test_load_repeatability_and_cleanup(tmp_path):
    from scripts.run_ingest_load import run_ingest_load
    environment = {"FLUXION_LOAD_API_KEY": "repeat-key"}
    client = FakeClient()
    fixtures = FakeFixtures()
    first = run_ingest_load(params(tmp_path), environment, client, fixtures)
    import json
    first_report = json.loads((tmp_path / "ingest-load-report.json").read_text())
    first_config = {field: first_report[field] for field in ("target_url", "client_count", "batch_size", "duration", "data_set_version", "test_data_version")}
    second = run_ingest_load(params(tmp_path), environment, client, fixtures)
    second_report = json.loads((tmp_path / "ingest-load-report.json").read_text())
    second_config = {field: second_report[field] for field in ("target_url", "client_count", "batch_size", "duration", "data_set_version", "test_data_version")}
    assert first_config == second_config
    assert (first["data_set_version"], first["test_data_version"]) == (second["data_set_version"], second["test_data_version"])
    assert fixtures.snapshot_counts() == {"package_updates": 4, "hosts": 2, "api_keys": 1, "webhook_configs": 1}

    failed = FakeFixtures(fail_table="package_updates")
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: package_updates 4 != 8"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), failed)


def test_load_results_hold_no_secret(tmp_path):
    from scripts.run_ingest_load import run_ingest_load
    key = "very-secret-load-key"
    client = FakeClient(status=500, body=f"secret={key}")
    result = run_ingest_load(params(tmp_path, client_count=1), {"FLUXION_LOAD_API_KEY": key}, client, FakeFixtures())
    assert result["http_errors"] == 1 and "body" not in result and "text" not in result
    for path in tmp_path.iterdir():
        assert key not in path.read_text()
