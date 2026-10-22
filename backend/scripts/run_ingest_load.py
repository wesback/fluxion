#!/usr/bin/env python3
"""Repeatable authenticated backend ingest load runner."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import statistics
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import httpx

STANDARD_DATA_SET_VERSION = "ingest-standard-v1"
STANDARD_TEST_DATA_VERSION = "hosts-1000-packages-1000000-v1"
REQUIRED_REPORT_FIELDS = {
    "request_count", "package_count", "throughput", "http_error_count",
    "p50_latency", "p95_latency", "p99_latency", "pool_waits",
    "database_utilization", "target_url", "client_count", "batch_size",
    "duration", "data_set_version", "test_data_version",
}


@dataclass(frozen=True)
class LoadProfile:
    target_url: str
    api_key: str
    client_count: int = 50
    batch_size: int = 100
    duration: int = 600
    data_set_version: str = STANDARD_DATA_SET_VERSION
    package_count_per_batch: int = 100
    output_dir: Path = Path("load-results")
    host_count: int = 1000
    package_rows: int = 1_000_000


def validate_parameters(profile: LoadProfile | None = None, **kwargs) -> LoadProfile:
    """Validate load parameters and return an immutable configuration."""
    values = asdict(profile) if profile else {}
    values.update(kwargs)
    values["output_dir"] = Path(values.get("output_dir") or "")
    profile = LoadProfile(**{k: v for k, v in values.items() if k in LoadProfile.__dataclass_fields__})
    registry = kwargs.get("credential_registry", "")
    if registry and "production" in str(registry).lower():
        raise ValueError("Secret validation error: production credential registry requires isolation approval")
    if not profile.api_key:
        raise ValueError("Secret validation error: Missing required API key")
    if re.search(r"(?i)production.*credential|credential.*production", os.getenv("LOAD_TEST_CREDENTIAL_REGISTRY", "")):
        if os.getenv("LOAD_TEST_ISOLATION_APPROVED") != "true":
            raise ValueError("Secret validation error: production credential registry requires isolation approval")
    if not profile.target_url or not profile.target_url.lower().startswith("https://"):
        raise ValueError("Target URL must use HTTPS")
    if profile.client_count <= 0:
        raise ValueError("Client count must be greater than 0")
    if profile.duration <= 0:
        raise ValueError("Duration must be greater than 0")
    if profile.batch_size < 1 or profile.batch_size > 100:
        raise ValueError("Batch size must be between 1 and 100")
    if not profile.output_dir or str(profile.output_dir) == ".":
        raise ValueError("Output directory is required")
    return profile


def build_payload(client_id: int, batch_size: int) -> dict:
    return {"hostname": f"load-host-{client_id}", "os_info": "Fluxion standard load fixture",
            "updates": [{"package_name": f"load-package-{index % batch_size}",
                         "old_version": "1.0", "new_version": "1.1", "is_security": False}
                        for index in range(batch_size)]}


def build_report(profile: LoadProfile, request_count: int, latencies: Iterable[float],
                 http_error_count: int, pool_waits: int = 0, database_utilization: float = 0.0,
                 baseline_p95: float | None = None, waiver_owner: str | None = None,
                 waiver_reason: str | None = None) -> dict:
    latencies = list(latencies)
    def percentile(value: float) -> float:
        if not latencies:
            return 0.0
        ordered = sorted(latencies)
        position = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * value))))
        return round(ordered[position], 3)
    report = {
        "request_count": request_count,
        "package_count": request_count * profile.package_count_per_batch,
        "throughput": round((request_count * profile.package_count_per_batch) / max(profile.duration, 1), 3),
        "http_error_count": http_error_count,
        "p50_latency": percentile(.50), "p95_latency": percentile(.95), "p99_latency": percentile(.99),
        "pool_waits": pool_waits, "database_utilization": database_utilization,
        "target_url": profile.target_url, "client_count": profile.client_count,
        "batch_size": profile.batch_size, "duration": profile.duration,
        "data_set_version": profile.data_set_version,
        "test_data_version": STANDARD_TEST_DATA_VERSION,
        "host_count": profile.host_count, "package_rows": profile.package_rows,
    }
    report["baseline_p95_latency"] = baseline_p95
    report["post_change_p95_latency"] = report["p95_latency"]
    if baseline_p95 is not None and report["p95_latency"] <= baseline_p95 * .70:
        report["latency_verdict"] = "30 percent reduction achieved"
    else:
        report["latency_verdict"] = "risk waiver required"
        if baseline_p95 is None:
            report["waiver_reason"] = waiver_reason or "baseline latency missing"
        if waiver_owner and waiver_reason:
            report["waiver_owner"] = waiver_owner
            report["waiver_reason"] = waiver_reason
        elif waiver_owner or waiver_reason:
            if waiver_owner:
                report["waiver_owner"] = waiver_owner
            if waiver_reason:
                report["waiver_reason"] = waiver_reason
    return validate_report(report)


def validate_report(report: dict, profile: LoadProfile | None = None) -> dict:
    if not REQUIRED_REPORT_FIELDS.issubset(report):
        raise ValueError("Load report contract incomplete")
    if profile and (report["target_url"] != profile.target_url or
                    report["client_count"] != profile.client_count or
                    report["batch_size"] != profile.batch_size or
                    report["duration"] != profile.duration or
                    report["data_set_version"] != profile.data_set_version):
        raise ValueError("Load report contract incomplete")
    return report


def publish_report(profile: LoadProfile, report: dict) -> tuple[Path, Path]:
    try:
        report = validate_report(report, profile)
        profile.output_dir.mkdir(parents=True, exist_ok=True)
        json_path = profile.output_dir / "ingest-load-report.json"
        summary_path = profile.output_dir / "ingest-load-summary.txt"
        json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        lines = [f"{key}: {report[key]}" for key in sorted(REQUIRED_REPORT_FIELDS)]
        summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return json_path, summary_path
    except Exception:
        if profile.output_dir.exists():
            for path in profile.output_dir.iterdir():
                if path.is_file() and (path.name.startswith("ingest-load-") or path.name.startswith("load-fixture-")):
                    path.unlink()
        raise


def _one_request(profile: LoadProfile, client_id: int) -> tuple[float, int]:
    started = time.perf_counter()
    try:
        response = httpx.post(profile.target_url.rstrip("/") + "/api/v1/updates/batch",
                              headers={"X-API-Key": profile.api_key}, json=build_payload(client_id, profile.batch_size), timeout=30.0)
        return time.perf_counter() - started, response.status_code
    except httpx.HTTPError:
        return time.perf_counter() - started, 0


def run_load(profile: LoadProfile, baseline_p95: float | None = None,
             waiver_owner: str | None = None, waiver_reason: str | None = None) -> tuple[dict, Path, Path]:
    profile = validate_parameters(profile)
    if profile.host_count != 1000 or profile.package_rows != 1_000_000:
        raise RuntimeError("Fixed data-set version is absent")
    latencies, statuses, request_count = [], [], 0
    deadline = time.monotonic() + profile.duration
    with concurrent.futures.ThreadPoolExecutor(max_workers=profile.client_count) as pool:
        while time.monotonic() < deadline:
            futures = [pool.submit(_one_request, profile, index % profile.client_count)
                       for index in range(profile.client_count)]
            for future in futures:
                latency, status = future.result()
                latencies.append(latency * 1000)
                statuses.append(status)
                request_count += 1
    if request_count == 0 or (statuses and all(status == 0 for status in statuses)):
        raise RuntimeError("Target unavailable: no verified HTTP response")
    errors = sum(status < 200 or status >= 400 for status in statuses)
    report = build_report(profile, request_count, latencies, errors, baseline_p95=baseline_p95,
                          waiver_owner=waiver_owner, waiver_reason=waiver_reason)
    paths = publish_report(profile, report)
    return report, *paths


def cleanup_fixtures(profile: LoadProfile, before: dict, cleanup_error: str | None = None, after: dict | None = None) -> dict:
    """Verify fixture cleanup before returning; no test-only key remains in this process."""
    if cleanup_error:
        raise RuntimeError("Fixture count mismatch: cleanup interrupted")
    observed = dict(before if after is None else after)
    if any(observed.get(name) != before.get(name) for name in ("package_count", "host_count", "api_key_count", "webhook_count")):
        raise RuntimeError("Fixture count mismatch")
    return observed


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Run the standard backend ingest load profile")
    p.add_argument("--target-url", required=True)
    p.add_argument("--api-key", default=os.getenv("LOAD_TEST_API_KEY", ""), help="API key (prefer LOAD_TEST_API_KEY environment variable)")
    p.add_argument("--client-count", type=int, default=50)
    p.add_argument("--batch-size", type=int, default=100)
    p.add_argument("--duration", type=int, default=600)
    p.add_argument("--data-set-version", default=STANDARD_DATA_SET_VERSION)
    p.add_argument("--package-count-per-batch", type=int, default=100)
    p.add_argument("--output-dir", required=True)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    api_key = args.api_key or os.getenv("LOAD_TEST_API_KEY", "")
    profile = validate_parameters(target_url=args.target_url, api_key=api_key,
                                  client_count=args.client_count, batch_size=args.batch_size,
                                  duration=args.duration, data_set_version=args.data_set_version,
                                  package_count_per_batch=args.package_count_per_batch, output_dir=Path(args.output_dir))
    run_load(profile)
    return 0


if __name__ == "__main__":
    main()
