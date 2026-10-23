"""Repeatable authenticated ingestion load runner."""
import inspect
import copy
import time
from concurrent.futures import ThreadPoolExecutor
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

def _snapshot_state(store: Any) -> Any:
    method = (getattr(store, "snapshot_fixture_state", None)
              or getattr(store, "snapshot_rows", None)
              or getattr(store, "snapshot_state", None)
              or getattr(store, "snapshot_ids", None)
              or getattr(store, "fixture_state", None)
              or getattr(store, "snapshot", None))
    if method is not None:
        value = method()
        if inspect.isawaitable(value):
            raise LoadExecutionError("Load target unavailable")
        if value is not None:
            return copy.deepcopy(value)
    return _snapshot(store)


def _cleanup(store: Any) -> None:
    method = getattr(store, "cleanup", None) or getattr(store, "delete_fixtures", None)
    if method:
        try:
            value = method()
        except Exception as exc:
            raise LoadCleanupError("Load cleanup incomplete: fixture deletion failed") from exc
        if inspect.isawaitable(value):
            raise LoadExecutionError("Load target unavailable")


def _verify_cleanup(store: Any, before_counts: dict[str, int], before_state: Any) -> None:
    _snapshot(store)
    after = _snapshot(store)
    for table in TABLES:
        if after[table] != before_counts[table]:
            raise LoadCleanupError(f"Load cleanup incomplete: {table} {before_counts[table]} != {after[table]}")

    state_method = (getattr(store, "snapshot_fixture_state", None)
                    or getattr(store, "snapshot_rows", None)
                    or getattr(store, "snapshot_state", None)
                    or getattr(store, "snapshot_ids", None))
    if state_method is not None:
        after_state = state_method()
        if inspect.isawaitable(after_state):
            raise LoadExecutionError("Load target unavailable")
        if after_state != before_state:
            raise LoadCleanupError("Load cleanup incomplete: fixture state != pre-run state")

    method = getattr(store, "verify_cleanup", None)
    if method:
        try:
            value = method(before_state)
        except TypeError:
            value = method(before_counts)
        if inspect.isawaitable(value):
            raise LoadExecutionError("Load target unavailable")
        if value is False:
            raise LoadCleanupError("Load cleanup incomplete: test fixtures != 0")

def _percentile(values: list[float], pct: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * pct / 100))]

def run_ingest_load(params: Mapping[str, Any], environ: Mapping[str, str], client: Any, fixtures: Any):
    config = build_load_run_config(params, environ)
    key = environ["FLUXION_LOAD_API_KEY"]
    before = _snapshot(fixtures)
    before_state = _snapshot_state(fixtures)

    try:
        _create(fixtures, config)
    except Exception as exc:
        try:
            _cleanup(fixtures)
            _verify_cleanup(fixtures, before, before_state)
        except LoadCleanupError:
            raise
        except Exception as cleanup_exc:
            raise LoadCleanupError("Load cleanup incomplete: fixture cleanup failed") from cleanup_exc
        raise

    request_count = 0
    http_errors = 0
    reached = 0
    reached_clients: set[int] = set()
    latencies: list[float] = []
    url = config.target_url.rstrip("/") + "/updates/batch"
    execution_error: Exception | None = None

    batches = params.get("batches_per_client", params.get("batches"))
    if batches is not None and (not isinstance(batches, int) or isinstance(batches, bool) or batches < 1):
        execution_error = LoadExecutionError("Invalid load parameter: batches_per_client")
    else:
        batches_per_client = batches if isinstance(batches, int) else 1
        duration_workload = config.client_count >= 50 and config.batch_size == 100 and batches is None

        def send_one(index: int) -> tuple[int, int, float | None, str | None, int]:
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
                    return 0, 0, None, "Load target unavailable", 0
            except Exception as exc:
                return 0, 0, (time.perf_counter() - started) * 1000, f"Load target unavailable: {exc}", 0
            latency = (time.perf_counter() - started) * 1000
            status = getattr(response, "status_code", getattr(response, "status", 200))
            good = 1 if int(status) < 400 else 0
            bad = 1 if int(status) >= 400 else 0
            return good, bad, latency, None, 1

        def send_client(index: int) -> list[tuple[int, int, float | None, str | None, int]]:
            results = []
            deadline = time.monotonic() + config.duration_seconds if duration_workload else None
            repeat_count = batches_per_client if not duration_workload else 1
            while True:
                for _ in range(repeat_count):
                    results.append(send_one(index))
                if deadline is None or time.monotonic() >= deadline:
                    break
                time.sleep(min(0.01, max(0.0, deadline - time.monotonic())))
            return results

        try:
            with ThreadPoolExecutor(max_workers=config.client_count) as pool:
                futures = [pool.submit(send_client, index) for index in range(config.client_count)]
                for client_index, future in enumerate(futures):
                    for good, bad, latency, target_error, count in future.result():
                        if target_error:
                            execution_error = LoadExecutionError(target_error)
                            break
                        if good:
                            reached_clients.add(client_index)
                            reached = len(reached_clients)
                        request_count += count
                        http_errors += bad
                        if latency is not None:
                            latencies.append(latency)
                    if execution_error is not None:
                        break
        except Exception as exc:
            execution_error = LoadExecutionError(f"Load target unavailable: {exc}")

    if execution_error is not None:
        _cleanup(fixtures)
        _verify_cleanup(fixtures, before, before_state)
        raise execution_error

    if reached < config.client_count and config.client_count >= 50:
        execution_error = LoadExecutionError(f"fewer than 50 clients reached: reached {reached}")

    _cleanup(fixtures)
    _verify_cleanup(fixtures, before, before_state)

    if execution_error is not None:
        raise execution_error

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
