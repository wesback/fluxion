import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.run_ingest_load import (
    STANDARD_DATA_SET_VERSION,
    LoadProfile,
    build_report,
    cleanup_fixtures,
    publish_report,
    validate_parameters,
    validate_report,
)


def test_load_runner_parameter_contract(tmp_path, monkeypatch):
    from scripts import run_ingest_load

    calls = []
    monkeypatch.setattr(run_ingest_load.httpx, "post", lambda *a, **k: calls.append((a, k)))
    invalid = [
        {"target_url": "https://load.example", "api_key": "", "output_dir": tmp_path},
        {"target_url": "http://load.example", "api_key": "key", "output_dir": tmp_path},
        {"target_url": "https://load.example", "api_key": "key", "client_count": 0, "output_dir": tmp_path},
        {"target_url": "https://load.example", "api_key": "key", "duration": 0, "output_dir": tmp_path},
        {"target_url": "https://load.example", "api_key": "key", "batch_size": 101, "output_dir": tmp_path},
        {"target_url": "https://load.example", "api_key": "key", "output_dir": None},
    ]
    for values in invalid:
        with pytest.raises(ValueError):
            validate_parameters(**values)
    profile = validate_parameters(target_url="https://load.example", api_key="key", output_dir=tmp_path)
    assert profile.client_count == 50
    assert profile.batch_size == 100
    assert profile.duration == 600
    assert profile.package_count_per_batch == 100
    assert profile.host_count == 1000
    assert profile.package_rows == 1_000_000
    assert calls == []


def test_load_report_contract(tmp_path):
    profile = validate_parameters(target_url="https://load.example", api_key="key", output_dir=tmp_path)
    report = build_report(profile, 4, [10, 20, 30, 40], 1, pool_waits=2, database_utilization=.35)
    assert report["request_count"] == 4
    assert report["package_count"] == 400
    assert report["data_set_version"] == STANDARD_DATA_SET_VERSION
    json_path, summary_path = publish_report(profile, report)
    assert json.loads(json_path.read_text())["target_url"] == "https://load.example"
    assert "http_error_count: 1" in summary_path.read_text()
    with pytest.raises(ValueError, match="Load report contract incomplete"):
        validate_report({"request_count": 1})
    with pytest.raises(ValueError, match="Load report contract incomplete"):
        validate_report(dict(report, client_count=2), profile)
    assert profile.api_key not in json_path.read_text()


def test_load_repeatability_and_cleanup(tmp_path):
    a = validate_parameters(target_url="https://load.example", api_key="key-a", data_set_version="v1", output_dir=tmp_path)
    b = validate_parameters(target_url="https://load.example", api_key="key-b", data_set_version="v1", output_dir=tmp_path)
    ra = build_report(a, 2, [20, 30], 0)
    rb = build_report(b, 2, [20, 30], 0)
    assert ra["client_count"] == rb["client_count"]
    assert ra["batch_size"] == rb["batch_size"]
    assert ra["duration"] == rb["duration"]
    assert ra["data_set_version"] == rb["data_set_version"]
    assert ra["test_data_version"] == rb["test_data_version"]
    before = {"package_count": 7, "host_count": 3, "api_key_count": 1, "webhook_count": 2}
    assert cleanup_fixtures(a, before) == before
    with pytest.raises(RuntimeError, match="Fixture count mismatch: cleanup interrupted"):
        cleanup_fixtures(a, before, "cleanup interrupted")
    with pytest.raises(RuntimeError, match="Fixture count mismatch"):
        cleanup_fixtures(a, before, after=dict(before, package_count=8))


def test_latency_improvement_or_waiver_contract(tmp_path):
    profile = validate_parameters(target_url="https://load.example", api_key="key", output_dir=tmp_path)
    improved = build_report(profile, 1, [69], 0, baseline_p95=100)
    assert improved["latency_verdict"] == "30 percent reduction achieved"
    for values in ({"baseline_p95": None}, {"baseline_p95": 100}, {"baseline_p95": 100, "waiver_owner": "owner"}):
        missing = build_report(profile, 1, [80], 0, waiver_owner=values.get("waiver_owner"), waiver_reason=values.get("waiver_reason"), baseline_p95=values.get("baseline_p95"))
        assert missing["latency_verdict"] == "risk waiver required"
        assert missing["baseline_p95_latency"] == values.get("baseline_p95")
        assert missing["post_change_p95_latency"] == 80
        assert "latency_verdict" in missing


def test_load_credentials_and_secret_contract(tmp_path, monkeypatch):
    monkeypatch.delenv("LOAD_TEST_API_KEY", raising=False)
    monkeypatch.delenv("LOAD_TEST_CREDENTIAL_REGISTRY", raising=False)
    with pytest.raises(ValueError, match="Secret validation error: Missing required API key"):
        validate_parameters(target_url="https://load.example", api_key="", output_dir=tmp_path)
    with pytest.raises(ValueError, match="Secret validation error"):
        validate_parameters(target_url="https://load.example", api_key="key", output_dir=tmp_path, credential_registry="production")
    monkeypatch.setenv("LOAD_TEST_CREDENTIAL_REGISTRY", "production-only credentials")
    with pytest.raises(ValueError, match="Secret validation error"):
        validate_parameters(target_url="https://load.example", api_key="key", output_dir=tmp_path)


def test_existing_load_profile_suite():
    backend = Path(__file__).resolve().parent.parent
    import subprocess
    completed = subprocess.run([sys.executable, "-m", "pytest", "-q", "-s", "-k", "not test_existing_load_profile_suite"], cwd=str(backend), capture_output=True, text=True)
    assert completed.returncode == 0, completed.stdout + completed.stderr
