from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def valid_parameters():
    return {
        "target_url": "https://ingest.example/api/v1/updates",
        "client_count": 50,
        "batch_size": 100,
        "duration": 600,
        "data_set_version": "host-1000-package-1000000-v1",
        "test_data_version": "test-data-v1",
    }


def valid_report():
    report = {
        "request_count": 1200,
        "package_count": 120000,
        "throughput": 200.0,
        "http_error_count": 0,
        "p50_latency": 40.0,
        "p95_latency": 70.0,
        "p99_latency": 90.0,
        "pool_waits": 2,
        "database_utilization": 0.65,
        **valid_parameters(),
    }
    return report


def test_load_report_contract():
    try:
        from scripts.ingest_load_report import (
            LoadReportContractError,
            build_load_report,
            publish_load_report,
            render_human_report,
            render_json_report,
        )
    except ModuleNotFoundError as exc:
        pytest.fail(f"ingestion load report helper is unavailable: {exc}")

    json_output, text_output = publish_load_report(valid_parameters(), valid_report(), baseline=100.0)
    assert '"request_count": 1200' in json_output
    assert "request_count: 1200" in text_output
    assert "test_data_version: test-data-v1" in text_output

    missing = valid_report()
    missing.pop("p95_latency")
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), missing)

    mismatched = valid_report()
    mismatched["client_count"] = 49
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), mismatched)

    url_cases = (
        ("https://ingest.example/api/v1/updates", True),
        ("https://user:secret@ingest.example/api/v1/updates", False),
        ("https://ingest.example/api/v1/updates?authKey=secret", False),
        ("https://ingest.example/api/v1/updates?jwt=secret", False),
        ("https://ingest.example/api/v1/updates?authorization=secret", False),
        ("https://ingest.example/api/v1/updates?key=secret", False),
        ("https://ingest.example/api/v1/updates?sig=secret", False),
        ("https://ingest.example/api/v1/updates#secret", False),
        ("https://ingest.example/api/v1/updates" + chr(10) + "request_count: 0", False),
        ("https://ingest.example/api/v1/updates" + chr(13) + "request_count: 0", False),
    )
    for target_url, accepted in url_cases:
        report = {**valid_report(), "target_url": target_url}
        parameters = {**valid_parameters(), "target_url": target_url}
        if accepted:
            assert target_url in render_json_report(report, parameters)
            assert build_load_report(parameters, report, baseline=100.0)[0]
            assert publish_load_report(parameters, report, baseline=100.0)[0]
            assert target_url in render_human_report(report)
        else:
            for output in (
                lambda: render_json_report(report, parameters),
                lambda: render_human_report(report),
                lambda: build_load_report(parameters, report, baseline=100.0),
                lambda: publish_load_report(parameters, report, baseline=100.0),
            ):
                with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
                    output()


def test_latency_improvement_or_waiver_contract():
    try:
        from scripts.ingest_load_report import (
            LoadReportContractError,
            compare_latency,
            publish_load_report,
        )
    except ModuleNotFoundError as exc:
        pytest.fail(f"ingestion load report helper is unavailable: {exc}")
    improved = compare_latency(baseline=100.0, report={"p95_latency": 69.0})
    assert improved["success_verdict"] == "p95 latency at least 30 percent lower"
    assert improved["before_p95_latency"] == 100.0
    assert improved["post_p95_latency"] == 69.0

    unmet = compare_latency(baseline=100.0, report={"p95_latency": 80.0})
    assert unmet["risk_status"] == "risk waiver required"
    assert unmet["success_verdict"] is None

    missing = compare_latency(baseline=None, report={"p95_latency": 80.0})
    assert missing["risk_status"] == "risk waiver required"
    assert missing["before_p95_latency"] is None
    assert missing["success_verdict"] is None

    incomplete_waiver = compare_latency(
        baseline=100.0,
        report={"p95_latency": 80.0},
        waiver={"owner": "", "reason": "Traffic anomaly"},
    )
    assert incomplete_waiver["risk_status"] == "risk waiver required"
    assert incomplete_waiver["success_verdict"] is None

    unmet = valid_report()
    unmet["p95_latency"] = 80.0
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(
            valid_parameters(), unmet, baseline=100.0,
            waiver={"owner": "", "reason": "Traffic anomaly"},
        )

    unmet["p95_latency"] = 80.0
    complete_waiver = publish_load_report(
        valid_parameters(), unmet, baseline=100.0,
        waiver={"owner": "performance-owner", "reason": "Traffic anomaly"},
    )
    assert complete_waiver[0].find('risk waiver required') >= 0

    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), valid_report(), baseline=None)


def test_documented_standard_profile_and_report_fields():
    try:
        from scripts.ingest_load_report import (
            LoadReportContractError,
            publish_load_report,
            render_json_report,
        )
    except ModuleNotFoundError as exc:
        pytest.fail(f"ingestion load report helper is unavailable: {exc}")

    readme = (ROOT / "backend/scripts/README.md").read_text()
    evidence = (ROOT / "docs/evidence/backend-ingest-load-profile.md").read_text()
    script = (ROOT / "backend/scripts/ingest_load_report.py").read_text()

    for text in (readme, evidence):
        assert "50 clients" in text or "50 clients" in text.replace("**", "")
        assert "100 package items" in text
        assert "100 package items per batch" in evidence
        assert "batches of 100 package items" in readme
        assert "10 minutes" in text
        assert "1,000 hosts" in text
        assert "1,000,000 package" in text or "1,000,000 package-update" in text

    extra = dict(valid_report())
    extra["runner_credential"] = "secret"
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), extra)
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        render_json_report(extra)

    credential_url = valid_report()
    credential_url["target_url"] = "https://user:secret@ingest.example/api/v1/updates"
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), credential_url)
    with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
        publish_load_report(valid_parameters(), {
            **credential_url,
            "target_url": "https://ingest.example/api/v1/updates?api_key=secret",
        })

    for credential_query in (
        "authorization=Bearer-secret",
        "key=credential-value",
        "sig=signed-value",
    ):
        blocked_url_report = valid_report()
        blocked_url_report["target_url"] = (
            "https://ingest.example/api/v1/updates?" + credential_query
        )
        with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
            publish_load_report(valid_parameters(), blocked_url_report)
        with pytest.raises(LoadReportContractError, match="Load report contract incomplete"):
            render_json_report(blocked_url_report)

    for field in (
        "request_count", "package_count", "throughput", "http_error_count",
        "p50_latency", "p95_latency", "p99_latency", "pool_waits",
        "database_utilization", "target_url", "client_count", "batch_size",
        "duration", "data_set_version", "test_data_version",
    ):
        assert field in script
        assert field in readme or field in evidence
