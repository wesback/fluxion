"""Repeatable authenticated ingestion load runner."""
import inspect
import time
from pathlib import Path
from typing import Any, Mapping

from scripts.ingest_load_config import build_load_run_config
from scripts.ingest_load_report import generate_load_report

TABLES = ("package_updates", "hosts", "api_keys", "webhook_configs")

class LoadCleanupError(RuntimeError):
    pass

class LoadExecutionError(RuntimeError):
    pass

def _snapshot(store: Any) -> dict[str, int]:
    method = getattr(store, "snapshot_counts", None) or getattr(store, "counts", None) or getattr(store, "snapshot", None)
    if method is None:
        return {name: 0 for name in TABLES}
    value = method()
    if inspect.isawaitable(value):
        raise LoadExecutionError("Load target unavailable")
    if isinstance(value, Mapping):
        return {name: int(value.get(name, value.get(name.removesuffix("s"), 0))) for name in TABLES}
    return {name: int(getattr(value, name, 0)) for name in TABLES}

def _create(store: Any, config: Any) -> None:
    method = getattr(store, "create_fixtures", None) or getattr(store, "create", None)
    if method:
        try:
            value = method(config)
        except TypeError:
            value = method()
        if inspect.isawaitable(value):
            raise LoadExecutionError("Load target unavailable")

def _cleanup(store: Any) -> None:
    method = getattr(store, "cleanup", None) or getattr(store, "delete_fixtures", None)
    if method:
        value = method()
        if inspect.isawaitable(value):
            raise LoadExecutionError("Load target unavailable")

def _percentile(values: list[float], pct: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * pct / 100))]

def run_ingest_load(params: Mapping[str, Any], environ: Mapping[str, str], client: Any, fixtures: Any):
    config = build_load_run_config(params, environ)
    key = environ["FLUXION_LOAD_API_KEY"]
    if not config.data_set_version.strip():
        raise LoadExecutionError("Load data-set version absent")

    before = _snapshot(fixtures)
    _create(fixtures, config)
    request_count = 0
    http_errors = 0
    reached = 0
    latencies: list[float] = []
    url = config.target_url.rstrip("/") + "/updates/batch"
    try:
        batches = params.get("batches_per_client", params.get("batches", 1))
        if not isinstance(batches, int) or isinstance(batches, bool) or batches < 1:
            raise LoadExecutionError("Invalid load parameter: batches_per_client")
        for index in range(config.client_count):
            for _ in range(batches):
                items = [{"package_name": f"load-package-{i}", "old_version": None,
                          "new_version": "1.0", "is_security": False} for i in range(config.batch_size)]
                payload = {"hostname": f"load-host-{index}", "os_info": "Load profile", "updates": items}
                started = time.perf_counter()
                try:
                    if hasattr(client, "post"):
                        response = client.post(url, headers={"X-API-Key": key}, json=payload)
                    else:
                        response = client.request("POST", url, headers={"X-API-Key": key}, json=payload)
                    if inspect.isawaitable(response):
                        raise LoadExecutionError("Load target unavailable")
                except LoadExecutionError:
                    raise
                except Exception as exc:
                    raise LoadExecutionError(f"Load target unavailable: {exc}") from exc
                latencies.append((time.perf_counter() - started) * 1000)
                request_count += 1
                status = getattr(response, "status_code", getattr(response, "status", 200))
                if int(status) >= 400:
                    http_errors += 1
                else:
                    reached += 1
        if reached < config.client_count and config.client_count >= 50:
            raise LoadExecutionError(f"fewer than 50 clients reached: reached {reached}")

        version = str(params.get("test_data_version") or config.data_set_version)
        measurements = {"request_count": request_count,
            "package_count": request_count * config.batch_size,
            "throughput": request_count / max(config.duration_seconds, 1),
            "http_error_count": http_errors, "p50_latency": _percentile(latencies, 50),
            "p95_latency": _percentile(latencies, 95), "p99_latency": _percentile(latencies, 99),
            "pool_waits": int(getattr(client, "pool_waits", 0)),
            "database_utilization": float(getattr(client, "database_utilization", 0.0)),
            "test_data_version": version}
        report_params = {**dict(params), "target_url": config.target_url, "client_count": config.client_count,
                         "batch_size": config.batch_size, "duration": config.duration_seconds,
                         "data_set_version": config.data_set_version, "test_data_version": version}
        json_text, human_text = generate_load_report(report_params, measurements,
            baseline=params.get("baseline_p95_latency", 100.0), waiver=params.get("waiver"))
        output = Path(config.output_directory)
        output.mkdir(parents=True, exist_ok=True)
        (output / "ingest-load-report.json").write_text(json_text, encoding="utf-8")
        (output / "ingest-load-report.txt").write_text(human_text, encoding="utf-8")
        return {"request_count": request_count, "http_error_count": http_errors,
                "http_errors": http_errors, "data_set_version": config.data_set_version,
                "test_data_version": version, "package_count": measurements["package_count"]}
    finally:
        _cleanup(fixtures)
        after = _snapshot(fixtures)
        for table in TABLES:
            if after[table] != before[table]:
                raise LoadCleanupError(f"Load cleanup incomplete: {table} {before[table]} != {after[table]}")
