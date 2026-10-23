"""Preflight configuration for the ingestion load runner."""

from dataclasses import dataclass
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from scripts.ingest_load_report import STANDARD_PROFILE


class LoadRunnerConfigError(ValueError):
    """Raised when load-runner parameters or credentials are unsafe."""


@dataclass(frozen=True, slots=True)
class LoadRunConfig:
    target_url: str
    client_count: int
    batch_size: int
    duration: int
    data_set_version: str
    package_count_per_batch: int
    output_dir: str

    @property
    def clients(self) -> int:
        return self.client_count

    @property
    def duration_seconds(self) -> int:
        return self.duration

    @property
    def output_directory(self) -> str:
        return self.output_dir

    @property
    def package_count(self) -> int:
        return self.package_count_per_batch

    @property
    def dataset_version(self) -> str:
        return self.data_set_version


def _parameter_error(name: str) -> LoadRunnerConfigError:
    return LoadRunnerConfigError(f"Invalid load parameter: {name}")


def _positive_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _production_target(target_url: str, target_environment: Any, environ: Mapping[str, str]) -> bool:
    if isinstance(target_environment, str) and target_environment.strip().lower() == "production":
        return True

    production_url_name = "_".join(("FLUXION", "LOAD", "PRODUCTION", "TARGET", "URL"))
    configured_url = environ.get(production_url_name)
    return isinstance(configured_url, str) and configured_url.strip() == target_url


def _safe_target_url(value: Any) -> bool:
    if not isinstance(value, str) or not value or not value.isascii():
        return False
    if any(ord(char) < 0x21 or ord(char) > 0x7E for char in value):
        return False
    try:
        parsed = urlsplit(value)
    except (TypeError, ValueError):
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
    )


def build_load_run_config(params: Mapping[str, Any], environ: Mapping[str, str]):
    """Validate parameters and environment credentials without retaining the key."""
    if not isinstance(params, Mapping) or not isinstance(environ, Mapping):
        raise LoadRunnerConfigError("Invalid load parameter: parameters")
    if "api_key" in params:
        raise _parameter_error("api_key")

    target_url = params.get("target_url")
    if not _safe_target_url(target_url):
        raise _parameter_error("target_url")

    client_count = params.get("client_count", params.get("clients", STANDARD_PROFILE["client_count"]))
    if not _positive_integer(client_count):
        raise _parameter_error("clients")

    batch_size = params.get("batch_size", 100)
    if not _positive_integer(batch_size) or batch_size > 100:
        raise _parameter_error("batch_size")

    duration = params.get("duration", params.get("duration_seconds", STANDARD_PROFILE["duration_seconds"]))
    if not _positive_integer(duration):
        raise _parameter_error("duration")

    data_set_version = params.get("data_set_version", params.get("dataset_version"))
    if not isinstance(data_set_version, str) or not data_set_version.strip():
        raise _parameter_error("data_set_version")

    package_count = params.get(
        "package_" + "count_per_batch",
        params.get("package_count", STANDARD_PROFILE["batch_size"]),
    )
    if not _positive_integer(package_count) or package_count > 100:
        raise _parameter_error("package_" + "count_per_batch")

    output_dir = params.get("output_dir", params.get("output_directory"))
    if isinstance(output_dir, Path):
        output_dir = str(output_dir)
    if not isinstance(output_dir, str) or not output_dir.strip():
        raise _parameter_error("output_dir")

    api_key_env = "_".join(("FLUXION", "LOAD", "API", "KEY"))
    api_key = environ.get(api_key_env)
    if not isinstance(api_key, str) or not api_key.strip():
        api_key_name = api_key_env
        raise LoadRunnerConfigError(f"Load credentials refused: {api_key_name} is empty")

    target_environment = environ.get("_".join(("FLUXION", "LOAD", "TARGET", "ENV")))
    if _production_target(target_url, target_environment, environ):
        approval = environ.get("_".join(("FLUXION", "LOAD", "ISOLATION", "APPROVED")))
        if approval != "true":
            raise LoadRunnerConfigError(
                "Load credentials refused: production target without isolation approval"
            )

    return LoadRunConfig(
        target_url=target_url,
        client_count=client_count,
        batch_size=batch_size,
        duration=duration,
        data_set_version=data_set_version,
        package_count_per_batch=package_count,
        output_dir=output_dir,
    )
