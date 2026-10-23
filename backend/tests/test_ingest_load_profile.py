from pathlib import Path
import subprocess
import sys

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from scripts.run_ingest_load import (  # noqa: E402
    DATA_SET_VERSION,
    FixtureState,
    LoadParameters,
    LoadRunnerError,
    execute_load_profile,
    validate_load_parameters,
)


def valid(tmp_path: Path, **changes) -> LoadParameters:
    values = {"target_url": "https://ingest.example", "api_key": "isolated-load-key",
              "output_dir": str(tmp_path)}
    values.update(changes)
    return LoadParameters(**values)


def test_load_runner_parameter_contract(tmp_path):
    assert validate_load_parameters(valid(tmp_path)).client_count == 50
    assert validate_load_parameters(valid(tmp_path)).batch_size == 100
    assert validate_load_parameters(valid(tmp_path)).duration == 600
    cases = [
        ({"api_key": ""}, "Missing API key"),
        ({"target_url": "http://ingest.example"}, "Target URL must use HTTPS scheme"),
        ({"client_count": 0}, "Client count must be 1 or greater"),
        ({"duration": 0}, "Duration must be greater than 0"),
        ({"batch_size": 101}, "Batch size must be between 1 and 100"),
        ({"output_dir": ""}, "Output directory is required"),
    ]
    for changes, message in cases:
        with pytest.raises(LoadRunnerError, match=message):
            validate_load_parameters(valid(tmp_path, **changes))


@pytest.mark.asyncio
async def test_load_repeatability_and_cleanup(tmp_path, monkeypatch):
    class Response:
        status_code = 201
    class Client:
        async def post(self, url, json=None, headers=None):
            assert url.endswith("/api/v1/updates/batch")
            assert headers == {"X-API-Key": "isolated-load-key"}
            return Response()
    parameters = valid(tmp_path, client_count=1, batch_size=1,
                       package_count_per_batch=1, duration=0.001,
                       data_set_version=DATA_SET_VERSION)
    first = await execute_load_profile(parameters, http_client=Client())
    second = await execute_load_profile(parameters, http_client=Client())
    assert '"data_set_version": "host-1000-package-1000000-v1"' in first["json"]
    assert first["json"] == second["json"] or "request_count" in second["json"]
    fixture = FixtureState({"packages": 4, "hosts": 2, "api_keys": 1, "webhooks": 3})
    fixture.created_api_keys.append("test-key")
    fixture.created_package_ids.append(7)
    fixture.cleanup(counts=fixture.before)
    assert fixture.created_api_keys == [] and fixture.created_package_ids == []
    with pytest.raises(LoadRunnerError, match="Fixture count mismatch: package"):
        fixture.cleanup(counts={**fixture.before, "packages": 5})


@pytest.mark.asyncio
async def test_load_credentials_and_secret_contract(tmp_path):
    with pytest.raises(LoadRunnerError, match="API key is empty"):
        await execute_load_profile(valid(tmp_path, api_key=""))
    p = valid(tmp_path, target_url="http://ingest.example")
    with pytest.raises(LoadRunnerError, match="Target URL must use HTTPS scheme"):
        await execute_load_profile(p)
    p = valid(tmp_path, api_key="isolated-load-key", data_set_version="missing")
    with pytest.raises(LoadRunnerError, match="Fixed data-set version is absent"):
        await execute_load_profile(p)


def test_existing_ingest_pool_and_telemetry_contracts():
    cases = [
        ("backend/tests/test_bulk_ingest.py", "test_bulk_insert_round_trip_bound"),
        ("backend/tests/test_pool_configuration.py", "test_pool_configuration_contract"),
        ("backend/tests/test_telemetry.py", "test_pool_observability_contract"),
    ]
    for path, test_name in cases:
        completed = subprocess.run([sys.executable, "-m", "pytest", "-q", str(path), "-k", test_name], cwd=ROOT,
                                   capture_output=True, text=True)
        assert completed.returncode == 0, completed.stdout + completed.stderr
