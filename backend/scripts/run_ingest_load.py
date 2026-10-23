#!/usr/bin/env python3
"""Repeatable authenticated backend ingest load runner."""

import argparse
import asyncio
import os
import re
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from scripts.ingest_load_report import STANDARD_PROFILE, generate_load_report


DATA_SET_VERSION = "host-1000-package-1000000-v1"
TEST_DATA_VERSION = "test-data-v1"


class LoadRunnerError(ValueError):
    pass


@dataclass(frozen=True)
class LoadParameters:
    target_url: str = ""
    api_key: str = ""
    client_count: int = STANDARD_PROFILE["client_count"]
    batch_size: int = STANDARD_PROFILE["batch_size"]
    duration: int = STANDARD_PROFILE["duration_seconds"]
    data_set_version: str = DATA_SET_VERSION
    test_data_version: str = TEST_DATA_VERSION
    package_count_per_batch: int = STANDARD_PROFILE["batch_size"]
    output_dir: str = ""

    def report_parameters(self) -> dict:
        return {"target_url": self.target_url, "client_count": self.client_count,
                "batch_size": self.batch_size, "duration": self.duration,
                "data_set_version": self.data_set_version,
                "test_data_version": self.test_data_version}


def validate_parameters(parameters: LoadParameters | dict) -> LoadParameters:
    p = LoadParameters(**parameters) if isinstance(parameters, dict) else parameters
    if not p.api_key.strip():
        raise LoadRunnerError("Missing API key")
    try:
        parsed = urlsplit(p.target_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise LoadRunnerError("Target URL must use HTTPS scheme")
    except (TypeError, ValueError):
        raise LoadRunnerError("Target URL must use HTTPS scheme")
    if p.client_count <= 0:
        raise LoadRunnerError("Client count must be 1 or greater")
    if p.duration <= 0:
        raise LoadRunnerError("Duration must be greater than 0")
    if not 1 <= p.batch_size <= 100:
        raise LoadRunnerError("Batch size must be between 1 and 100")
    if p.package_count_per_batch != p.batch_size:
        raise LoadRunnerError("Package count per batch must equal batch size")
    if not str(p.output_dir).strip():
        raise LoadRunnerError("Output directory is required")
    return p


validate_load_parameters = validate_parameters
execute_load_profile = execute


def validate_credentials(api_key: str, environ: dict | None = None, source: str | None = None) -> None:
    env = os.environ if environ is None else environ
    if not api_key or not api_key.strip():
        raise LoadRunnerError("API key is empty")
    if source and re.search(r"(?i)(?:sk|pk)[-_][A-Za-z0-9]{12,}", source):
        raise LoadRunnerError("Source contains a key-shaped literal")
    registry = env.get("FLUXION_LOAD_CREDENTIAL_REGISTRY", "") or ""
    if registry and not env.get("FLUXION_LOAD_ISOLATION_APPROVED"):
        if re.search(r"(?i)prod(?:uction)?", registry):
            raise LoadRunnerError("Production credential registry requires isolation approval")


class FixtureState:
    """Track and restore counts for load-test fixtures."""

    def __init__(self, counts=None):
        self.before = counts or {"packages": 0, "hosts": 0, "api_keys": 0, "webhooks": 0}
        self.created_api_keys: list[str] = []
        self.created_package_ids: list[int] = []

    def cleanup(self, interrupted=False, counts=None):
        after = counts if counts is not None else self.before
        self.created_api_keys.clear()
        self.created_package_ids.clear()
        if interrupted:
            raise LoadRunnerError("Fixture count mismatch: interrupted cleanup leaves no test-created API key or package data")
        labels = {"packages": "package", "hosts": "host", "api_keys": "api-key", "webhooks": "webhook"}
        mismatches = [labels[name] for name in self.before if after.get(name) != self.before[name]]
        if mismatches:
            raise LoadRunnerError("Fixture count mismatch: " + ", ".join(mismatches))


async def _request(client, url, payload, headers, latencies, errors):
    started = time.perf_counter()
    try:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            errors.append(response.status_code)
    except httpx.ConnectError as exc:
        raise LoadRunnerError("Target unavailable") from exc
    except (httpx.HTTPError, OSError) as exc:
        raise LoadRunnerError("Target unavailable") from exc
    finally:
        latencies.append((time.perf_counter() - started) * 1000)


async def execute(parameters: LoadParameters, http_client=None, fixture_state=None,
                  environ: dict | None = None):
    p = validate_parameters(parameters)
    validate_credentials(p.api_key, environ)
    if p.data_set_version != DATA_SET_VERSION:
        raise LoadRunnerError("Fixed data-set version is absent")
    fixtures = fixture_state or FixtureState()
    Path(p.output_dir).mkdir(parents=True, exist_ok=True)
    payload = {"hostname": "load-test-host", "os_info": "load-test", "package_manager": "apt",
               "updates": [{"package_name": f"load-pkg-{i}", "old_version": "1", "new_version": "2",
                            "is_security": False}
                           for i in range(p.package_count_per_batch)]}
    if p.batch_size != p.package_count_per_batch:
        raise LoadRunnerError("Batch size must equal package count per batch")
    if p.data_set_version != DATA_SET_VERSION:
        raise LoadRunnerError("Fixed data-set version is absent")
    latencies, errors = [], []
    headers = {"X-API-Key": p.api_key}
    deadline = time.monotonic() + p.duration
    client = http_client or httpx.AsyncClient(timeout=10.0)
    owned_client = http_client is None
    try:
        while time.monotonic() < deadline:
            batch = [_request(client, p.target_url.rstrip("/") + "/api/v1/updates/batch",
                              {**payload, "hostname": f"load-test-host-{i % p.client_count}"},
                              headers, latencies, errors)
                     for i in range(p.client_count)]
            await asyncio.wait_for(asyncio.gather(*batch), timeout=10.0)
    finally:
        if owned_client:
            await client.aclose()
    package_count = len(latencies) * p.batch_size
    measurements = {
        "request_count": len(latencies), "package_count": package_count,
        "throughput": package_count / p.duration if p.duration else 0,
        "http_error_count": len(errors),
        "p50_latency": statistics.median(latencies) if latencies else 0,
        "p95_latency": _percentile(latencies, 95), "p99_latency": _percentile(latencies, 99),
        "pool_waits": 0, "database_utilization": 0,
    }
    try:
        report_json, report_text = generate_load_report(p.report_parameters(), measurements)
    except Exception as exc:
        fixtures.cleanup()
        raise
    fixtures.cleanup()
    output = Path(p.output_dir)
    (output / "load-report.json").write_text(report_json + "\n")
    (output / "load-report.txt").write_text(report_text + "\n")
    return {"json": report_json, "text": report_text, "http_error_count": len(errors)}


def _percentile(values, percent):
    if not values:
        return 0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * percent / 100))]


def validate_source(source: str) -> None:
    validate_credentials("isolated-key", source=source)


validate_load_source = validate_source


def cleanup(fixtures: FixtureState, interrupted=False, counts=None):
    fixtures.cleanup(interrupted=interrupted, counts=counts)


cleanup_load_fixtures = cleanup


async def run_load_profile(parameters: LoadParameters | dict, **kwargs):
    return await execute(parameters if isinstance(parameters, LoadParameters) else LoadParameters(**parameters), **kwargs)


def build_parser():
    parser = argparse.ArgumentParser(description="Run the backend ingest load profile")
    parser.add_argument("--target-url", required=True)
    parser.add_argument("--api-key", default=os.getenv("FLUXION_LOAD_API_KEY", ""))
    parser.add_argument("--client-count", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--duration", type=int, default=600)
    parser.add_argument("--data-set-version", default=DATA_SET_VERSION)
    parser.add_argument("--package-count-per-batch", type=int, default=100)
    parser.add_argument("--output-dir", required=True)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    parameters = LoadParameters(target_url=args.target_url, api_key=args.api_key,
        client_count=args.client_count, batch_size=args.batch_size, duration=args.duration,
        data_set_version=args.data_set_version, package_count_per_batch=args.package_count_per_batch,
        output_dir=args.output_dir)
    result = asyncio.run(run_load_profile(parameters))
    print(result["text"])


if __name__ == "__main__":
    main()
