from pathlib import Path
import copy
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
        self.rows = {
            "package_updates": {row: {"stable_id": row, "content": row} for row in ("pre-package-a", "pre-package-b", "pre-package-c", "pre-package-d")},
            "hosts": {row: {"stable_id": row, "content": row} for row in ("pre-host-a", "pre-host-b")},
            "api_keys": {"pre-key-a": {"stable_id": "pre-key-a", "content": "pre-key-a"}},
            "webhook_configs": {"pre-webhook-a": {"stable_id": "pre-webhook-a", "content": "pre-webhook-a"}},
        }
    def snapshot_counts(self):
        return dict(self.counts)
    def snapshot_fixture_state(self):
        return {table: copy.deepcopy(rows) for table, rows in self.rows.items()}
    def create_fixtures(self, config):
        self.creations += 1
        self.counts["package_updates"] += config.batch_size
        self.counts["api_keys"] += 1
        self.rows["package_updates"][f"test-package-{self.creations}"] = {"stable_id": f"test-package-{self.creations}", "content": "test"}
        self.rows["api_keys"][f"test-key-{self.creations}"] = {"stable_id": f"test-key-{self.creations}", "content": "test"}
        self.rows["hosts"][f"test-host-{self.creations}"] = {"stable_id": f"test-host-{self.creations}", "content": "test"}
        self.rows["webhook_configs"][f"test-webhook-{self.creations}"] = {"stable_id": f"test-webhook-{self.creations}", "content": "test"}
    def cleanup(self):
        if self.fail_table:
            self.counts[self.fail_table] += 1
            return
        for table in self.rows:
            self.rows[table] = {identity: content for identity, content in self.rows[table].items() if not identity.startswith("test-")}
        self.counts["package_updates"] = 4
        self.counts["hosts"] = 2
        self.counts["api_keys"] = 1
        self.counts["webhook_configs"] = 1
    def verify_cleanup(self, before_state):
        canonical = {}
        for table, rows in self.snapshot_fixture_state().items():
            canonical[table] = sorted([[identity, copy.deepcopy(content)] for identity, content in rows.items()], key=lambda row: repr(row))
        return canonical == before_state


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

    swapped = FakeFixtures()
    original_cleanup = swapped.cleanup
    def swap_cleanup():
        swapped.counts["package_updates"] = 4
        swapped.counts["api_keys"] = 1
        swapped.rows["package_updates"] = {
            "pre-package-a": {"stable_id": "pre-package-a", "content": "pre-package-a"},
            "pre-package-b": {"stable_id": "pre-package-b", "content": "pre-package-b"},
            "pre-package-c": {"stable_id": "pre-package-c", "content": "pre-package-c"},
            "test-package-leak": {"stable_id": "test-package-leak", "content": "leak"},
        }
    swapped.cleanup = swap_cleanup
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: fixture state != pre-run state"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), swapped)

    snapshot_store = FakeFixtures()
    snapshot_store_snapshot = snapshot_store.snapshot_fixture_state
    snapshot_store.snapshot_fixture_state = None
    snapshot_store.snapshot = snapshot_store_snapshot
    def snapshot_swap_cleanup():
        snapshot_store.counts["package_updates"] = 4
        snapshot_store.counts["api_keys"] = 1
        snapshot_store.counts["hosts"] = 2
        snapshot_store.counts["webhook_configs"] = 1
        snapshot_store.rows["package_updates"] = {
            row: {"stable_id": row, "content": row}
            for row in ("pre-package-a", "pre-package-b", "pre-package-c")
        }
        snapshot_store.rows["package_updates"]["test-package-leak"] = {"stable_id": "test-package-leak", "content": "leak"}
        snapshot_store.rows["api_keys"] = {"pre-key-a": {"stable_id": "pre-key-a", "content": "pre-key-a"}}
        snapshot_store.rows["hosts"] = {row: {"stable_id": row, "content": row} for row in ("pre-host-a", "pre-host-b")}
        snapshot_store.rows["webhook_configs"] = {"pre-webhook-a": {"stable_id": "pre-webhook-a", "content": "pre-webhook-a"}}
    snapshot_store.cleanup = snapshot_swap_cleanup
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: fixture state != pre-run state"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), snapshot_store)

    content_changed = FakeFixtures()
    def content_changed_cleanup():
        content_changed.counts = {"package_updates": 4, "hosts": 2, "api_keys": 1, "webhook_configs": 1}
        content_changed.rows["package_updates"]["pre-package-a"] = {"stable_id": "pre-package-a", "content": "changed-content"}
    content_changed.cleanup = content_changed_cleanup
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: fixture state != pre-run state"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), content_changed)

    id_only_store = FakeFixtures()
    id_only_store_snapshot = id_only_store.snapshot_fixture_state
    id_only_store.snapshot_fixture_state = None
    id_only_store.snapshot_ids = lambda: {table: sorted(rows) for table, rows in id_only_store.rows.items()}
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: exact fixture state unavailable"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), id_only_store)
    assert id_only_store.creations == 0

    id_only_list_store = FakeFixtures()
    id_only_list_store.snapshot_fixture_state = lambda: {
        table: [{"stable_id": identity} for identity in rows]
        for table, rows in id_only_list_store.rows.items()
    }
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: exact fixture state unavailable"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), id_only_list_store)
    assert id_only_list_store.creations == 0

    fixture_state_store = FakeFixtures()
    fixture_state_store_snapshot = fixture_state_store.snapshot_fixture_state
    fixture_state_store.snapshot_fixture_state = None
    fixture_state_store.fixture_state = fixture_state_store_snapshot
    def fixture_state_snapshot_swap():
        fixture_state_store.counts["package_updates"] = 4
        fixture_state_store.counts["hosts"] = 2
        fixture_state_store.counts["api_keys"] = 1
        fixture_state_store.counts["webhook_configs"] = 1
        fixture_state_store.rows["package_updates"] = {
            row: {"stable_id": row, "content": row}
            for row in ("pre-package-a", "pre-package-b", "pre-package-c")
        }
        fixture_state_store.rows["package_updates"]["test-package-leak"] = {"stable_id": "test-package-leak", "content": "leak"}
    fixture_state_store.fixture_state = fixture_state_store_snapshot
    fixture_state_store.cleanup = fixture_state_snapshot_swap
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: fixture state != pre-run state"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), fixture_state_store)

    failed = FakeFixtures(fail_table="package_updates")
    with pytest.raises(RuntimeError, match=r"Load cleanup incomplete: package_updates 4 != 8"):
        run_ingest_load(params(tmp_path), environment, FakeClient(), failed)


def test_standard_profile_failure_does_not_publish_report(tmp_path):
    from scripts.run_ingest_load import run_ingest_load

    unavailable = FakeClient()
    unavailable.post = lambda url, **kwargs: (_ for _ in ()).throw(ConnectionError("target offline"))
    with pytest.raises(RuntimeError, match="Load target unavailable: target offline"):
        run_ingest_load(params(tmp_path, client_count=50, batch_size=100, duration=10),
                        {"FLUXION_LOAD_API_KEY": "secret", "FLUXION_LOAD_ISOLATION_APPROVED": "true"},
                        unavailable, FakeFixtures())
    assert not (tmp_path / "ingest-load-report.json").exists()
    assert not (tmp_path / "ingest-load-report.txt").exists()

    with pytest.raises(ValueError, match="Invalid load parameter: data_set_version"):
        run_ingest_load(params(tmp_path, client_count=50, batch_size=100, duration=10,
                           data_set_version=""),
                        {"FLUXION_LOAD_API_KEY": "secret"}, FakeClient(), FakeFixtures())
    assert not (tmp_path / "ingest-load-report.json").exists()

    class ReachedClient(FakeClient):
        def post(self, url, **kwargs):
            self.calls.append((url, kwargs))
            return FakeResponse(status=500, body="offline")

    with pytest.raises(RuntimeError, match=r"fewer than 50 clients reached"):
        run_ingest_load(params(tmp_path, client_count=50, batch_size=100, duration=10,
                           batches_per_client=1),
                        {"FLUXION_LOAD_API_KEY": "secret"}, ReachedClient(), FakeFixtures())
    assert not (tmp_path / "ingest-load-report.json").exists()


def test_load_results_hold_no_secret(tmp_path):
    from scripts.run_ingest_load import run_ingest_load
    key = "very-secret-load-key"
    client = FakeClient(status=500, body=f"secret={key}")
    result = run_ingest_load(params(tmp_path, client_count=1), {"FLUXION_LOAD_API_KEY": key}, client, FakeFixtures())
    assert result["http_errors"] == 1 and "body" not in result and "text" not in result
    for path in tmp_path.iterdir():
        assert key not in path.read_text()
