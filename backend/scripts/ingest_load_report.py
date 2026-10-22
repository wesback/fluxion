"""Contracts for machine-readable and human-readable ingestion load reports."""

import json
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

STANDARD_PROFILE = {
    "client_count": 50,
    "batch_size": 100,
    "duration_seconds": 600,
    "host_count": 1000,
    "package_row_count": 1_000_000,
}

REPORT_FIELDS = (
    "request_count", "package_count", "throughput", "http_error_count",
    "p50_latency", "p95_latency", "p99_latency", "pool_waits",
    "database_utilization", "target_url", "client_count", "batch_size",
    "duration", "data_set_version", "test_data_version",
)
PARAMETER_FIELDS = (
    "target_url", "client_count", "batch_size", "duration",
    "data_set_version", "test_data_version",
)


class LoadReportContractError(ValueError):
    """Raised when evidence is incomplete or inconsistent."""

    def __init__(self):
        super().__init__("Load report contract incomplete")


def _metadata(parameters: Mapping[str, Any]) -> dict[str, Any]:
    values = {}
    aliases = {"duration_seconds": "duration"}
    for key in PARAMETER_FIELDS:
        source = "duration_seconds" if key == "duration" and key not in parameters else key
        source_aliases = (source, aliases.get(source, source))
        found = next((parameters[name] for name in source_aliases if name in parameters), None)
        values[key] = found
    return values


def _target_url_is_safe(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme in ("http", "https")
            and parsed.netloc
            and parsed.username is None
            and parsed.password is None
            and not parsed.query
            and not parsed.fragment
            and "?" not in value
            and "#" not in value
        )
    except (TypeError, ValueError):
        return False


def validate_load_report(report: Mapping[str, Any], parameters: Mapping[str, Any]) -> dict[str, Any]:
    """Validate all required evidence and exact runner metadata; never publish on error."""
    if not isinstance(report, Mapping):
        raise LoadReportContractError()
    if any(field not in report or report.get(field) is None for field in REPORT_FIELDS):
        raise LoadReportContractError()
    undeclared_fields = set(report) - set(REPORT_FIELDS)
    if undeclared_fields:
        raise LoadReportContractError()
    for field in ("data_set_version", "test_data_version"):
        if not isinstance(report.get(field), str) or not report[field].strip():
            raise LoadReportContractError()
    target_url = report.get("target_url")
    if not isinstance(target_url, str) or not target_url.strip() or not _target_url_is_safe(target_url):
        raise LoadReportContractError()

    expected = _metadata(parameters)
    for field, expected_value in expected.items():
        if expected_value is None or report.get(field) != expected_value:
            raise LoadReportContractError()
    return dict(report)


def render_human_report(report: Mapping[str, Any]) -> str:
    if not isinstance(report, Mapping):
        raise LoadReportContractError()
    if any(field not in report or report.get(field) is None for field in REPORT_FIELDS):
        raise LoadReportContractError()
    if set(report) - set(REPORT_FIELDS) - {"latency_comparison"}:
        raise LoadReportContractError()
    for field in ("data_set_version", "test_data_version"):
        if not isinstance(report.get(field), str) or not report[field].strip():
            raise LoadReportContractError()
    target_url = report.get("target_url")
    if not isinstance(target_url, str) or not target_url.strip() or not _target_url_is_safe(target_url):
        raise LoadReportContractError()
    lines = [f"{field}: {report[field]}" for field in REPORT_FIELDS]
    comparison = report.get("latency_comparison")
    if isinstance(comparison, Mapping):
        lines.extend(f"{field}: {comparison[field]}" for field in (
            "before_p95_latency", "post_p95_latency", "risk_status", "waiver_owner", "waiver_reason"
        ) if comparison.get(field) is not None)
    return "\n".join(lines)


def compare_latency(p95_before: Any = None, report: Mapping[str, Any] | None = None,
                    waiver: Mapping[str, Any] | None = None, baseline: Any = None,
                    before_p95: Any = None, post_p95: Any = None,
                    **kwargs: Any) -> dict[str, Any]:
    """Attach a 30-percent latency verdict or a complete risk waiver."""
    if isinstance(report, Mapping):
        p95_post = report.get("p95_latency", report.get("post_p95_latency", report.get("p95_post")))
    elif isinstance(report, (int, float)):
        p95_post = report
    else:
        p95_post = post_p95 if post_p95 is not None else kwargs.get("p95_post")
    if isinstance(baseline, Mapping):
        before = baseline.get("p95_latency", baseline.get("before_p95_latency"))
    else:
        before = baseline if baseline is not None else (
            before_p95 if before_p95 is not None else p95_before
        )
    waiver = waiver or {}
    waiver_owner = waiver.get("owner") or waiver.get("waiver_owner") or kwargs.get("waiver_owner")
    waiver_reason = waiver.get("reason") or waiver.get("waiver_reason") or kwargs.get("waiver_reason")
    result = {
        "before_p95_latency": before,
        "post_p95_latency": p95_post,
        "baseline_p95_latency": before,
        "post_change_p95_latency": p95_post,
        "before_p95_latency_ms": before,
        "post_p95_latency_ms": p95_post,
        "success_verdict": None,
        "success": False,
    }
    before = before if before is not None else kwargs.get("before_p95_ms")
    p95_post = p95_post if p95_post is not None else kwargs.get("post_p95_ms")
    try:
        improved = before is not None and p95_post is not None and p95_post <= before * 0.70
    except TypeError:
        improved = False
    if improved:
        result["success_verdict"] = "p95 latency at least 30 percent lower"
        result["success"] = True
        result["risk_status"] = None
        return result

    result["risk_status"] = "risk waiver required"
    result["waiver_owner"] = waiver_owner
    result["waiver_reason"] = waiver_reason
    if not waiver_owner or not waiver_reason:
        result["success_verdict"] = None
        return result
    result["success_verdict"] = None
    return result


def build_load_report(parameters: Mapping[str, Any], report: Mapping[str, Any],
                      baseline: Any = None, waiver: Mapping[str, Any] | None = None):
    """Return JSON and human text only when the report and waiver contracts are complete."""
    report = validate_load_report(report, parameters)
    latency = compare_latency(report=report, baseline=baseline, waiver=waiver)
    if latency["risk_status"] == "risk waiver required":
        owner = latency.get("waiver_owner")
        reason = latency.get("waiver_reason")
        if not isinstance(owner, str) or not owner.strip() or not isinstance(reason, str) or not reason.strip():
            raise LoadReportContractError()
    report["latency_comparison"] = latency
    return json.dumps(report, sort_keys=True), render_human_report(report)


def publish_load_report(parameters: Mapping[str, Any], report: Mapping[str, Any],
                        baseline: Any = None, waiver: Mapping[str, Any] | None = None):
    """Publish by returning evidence; callers publish only after receiving it."""
    return build_load_report(parameters, report, baseline=baseline, waiver=waiver)


def generate_load_report(parameters: Mapping[str, Any], measurements: Mapping[str, Any],
                         baseline: Any = None, waiver: Mapping[str, Any] | None = None):
    report = {**dict(measurements), **_metadata(parameters)}
    return build_load_report(parameters, report, baseline=baseline, waiver=waiver)


# Descriptive aliases make the contract usable by runner integrations with either name.
validate_report = validate_load_report
build_report = build_load_report
make_report = generate_load_report


def render_json_report(report: Mapping[str, Any], parameters: Mapping[str, Any] | None = None) -> str:
    """Serialize only validated, declared report fields."""
    if parameters is not None:
        validated = validate_load_report(report, parameters)
    else:
        if not isinstance(report, Mapping) or set(report) - set(REPORT_FIELDS):
            raise LoadReportContractError()
        if any(field not in report or report.get(field) is None for field in REPORT_FIELDS):
            raise LoadReportContractError()
        for field in ("data_set_version", "test_data_version"):
            if not isinstance(report.get(field), str) or not report[field].strip():
                raise LoadReportContractError()
        target_url = report.get("target_url")
        if not isinstance(target_url, str) or not target_url.strip() or not _target_url_is_safe(target_url):
            raise LoadReportContractError()
        validated = dict(report)
    return json.dumps(validated, sort_keys=True)
