from pathlib import Path
import ast
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def valid_parameters():
    return {
        "target_url": "https://ingest.example/api/v1",
        "data_set_version": "v1",
        "output_dir": "/tmp/fluxion-load",
    }


def test_load_runner_parameter_contract():
    try:
        from scripts.ingest_load_config import LoadRunnerConfigError, build_load_run_config
    except ModuleNotFoundError:
        pytest.fail("ingestion load config module is unavailable")

    config = build_load_run_config(valid_parameters(), {"FLUXION_LOAD_API_KEY": "test-key"})
    assert config.target_url == valid_parameters()["target_url"]
    assert config.client_count == 50
    assert config.batch_size == 100
    assert config.duration == 600
    assert config.package_count_per_batch == 100
    assert config.data_set_version == "v1"
    assert config.output_directory == "/tmp/fluxion-load"

    custom = build_load_run_config({
        **valid_parameters(),
        "client_count": 25,
        "batch_size": 80,
        "duration": 120,
        "data_set_version": "v2",
        "package_count_per_batch": 75,
        "output_dir": "/tmp/custom-load",
    }, {"FLUXION_LOAD_API_KEY": "test-key"})
    assert custom.client_count == 25
    assert custom.batch_size == 80
    assert custom.duration_seconds == 120
    assert custom.data_set_version == "v2"
    assert custom.package_count_per_batch == 75
    assert custom.output_directory == "/tmp/custom-load"

    cases = (
        ({"client_count": 0}, "clients"),
        ({"duration": 0}, "duration"),
        ({"batch_size": 101}, "batch_size"),
        ({"target_url": "http://ingest.example/api/v1"}, "target_url"),
        ({"output_dir": None}, "output_dir"),
    )
    for changed, field in cases:
        params = valid_parameters()
        params.update(changed)
        with pytest.raises(LoadRunnerConfigError, match=f"Invalid load parameter: {field}$"):
            build_load_run_config(params, {"FLUXION_LOAD_API_KEY": "test-key"})

    missing_output = valid_parameters()
    missing_output.pop("output_dir")
    with pytest.raises(LoadRunnerConfigError, match="Invalid load parameter: output_dir$"):
        build_load_run_config(missing_output, {"FLUXION_LOAD_API_KEY": "test-key"})

    with pytest.raises(LoadRunnerConfigError, match="Invalid load parameter: batch_size$"):
        build_load_run_config({**valid_parameters(), "batch_size": 101}, {})


def test_load_credentials_and_secret_contract():
    from scripts.ingest_load_config import LoadRunnerConfigError, build_load_run_config

    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: FLUXION_LOAD_API_KEY is empty$"):
        build_load_run_config(valid_parameters(), {})
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: FLUXION_LOAD_API_KEY is empty$"):
        build_load_run_config(valid_parameters(), {"FLUXION_LOAD_API_KEY": ""})

    environment = {"FLUXION_LOAD_API_KEY": "test-key", "FLUXION_LOAD_TARGET_ENV": "production"}
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: production target without isolation approval$"):
        build_load_run_config(valid_parameters(), environment)

    approved = {
        **environment,
        "FLUXION_LOAD_ISOLATION_APPROVED": "true",
    }
    assert build_load_run_config(valid_parameters(), approved)

    production_url = {
        **valid_parameters(),
        "target_url": "https://api.production.example/api/v1",
    }
    production_environment = {
        "FLUXION_LOAD_API_KEY": "test-key",
        "_".join(("FLUXION", "LOAD", "PRODUCTION", "TARGET", "URL")): production_url["target_url"],
    }
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: production target without isolation approval$"):
        build_load_run_config(production_url, production_environment)
    assert build_load_run_config(production_url, {
        **production_environment,
        "FLUXION_LOAD_TARGET_ENV": "test",
        "FLUXION_LOAD_ISOLATION_APPROVED": "true",
    })

    equivalent_production_url = {
        **valid_parameters(),
        "target_url": "https://api.production.example:443/api/v1/./",
    }
    equivalent_environment = {
        "FLUXION_LOAD_API_KEY": "test-key",
        "FLUXION_LOAD_PRODUCTION_TARGET_URL": "https://API.PRODUCTION.EXAMPLE/api/v1",
    }
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: production target without isolation approval$"):
        build_load_run_config(equivalent_production_url, equivalent_environment)

    unconfigured_production_url = {
        **valid_parameters(),
        "target_url": "https://api.company-internal.example/api/v1",
    }
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: production target without isolation approval$"):
        build_load_run_config(unconfigured_production_url, {"FLUXION_LOAD_API_KEY": "test-key"})

    neutral_production_url = {
        **valid_parameters(),
        "target_url": "https://service.example/api/v1",
    }
    production_url_environment = {
        "FLUXION_LOAD_API_KEY": "test-key",
        "_".join(("FLUXION", "LOAD", "PRODUCTION", "TARGET", "URL")): neutral_production_url["target_url"],
    }
    with pytest.raises(LoadRunnerConfigError, match="Load credentials refused: production target without isolation approval$"):
        build_load_run_config(neutral_production_url, production_url_environment)

    secret_config = build_load_run_config(valid_parameters(), {"FLUXION_LOAD_API_KEY": "k-123"})
    assert "k-123" not in repr(secret_config)
    assert "k-123" not in str(secret_config)

    with pytest.raises(LoadRunnerConfigError, match="Invalid load parameter: api_key$"):
        build_load_run_config({**valid_parameters(), "api_key": "k-123"}, {"FLUXION_LOAD_API_KEY": "test-key"})


def test_load_config_source_holds_no_key_literal():
    source = (ROOT / "backend/scripts/ingest_load_config.py").read_text()
    tree = ast.parse(source)
    literals = [node.value for node in ast.walk(tree) if isinstance(node, ast.Constant) and isinstance(node.value, str)]
    key_likeness = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    for literal in literals:
        assert not any(
            len(candidate) >= 20
            for candidate in __import__("re").findall(r"[A-Za-z0-9_-]{20,}", literal)
        )

    assert "k-123" not in literals
