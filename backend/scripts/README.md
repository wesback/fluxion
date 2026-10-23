# Scripts

Utility scripts for deployment, database management, and operations.

## Ingestion load reports

Run the standard ingestion load profile with 50 clients, batches of 100 package items, and 10 minutes of sustained traffic. The fixed evidence data set contains 1,000 hosts and 1,000,000 package rows.

`backend/scripts/ingest_load_report.py` accepts runner parameter metadata and measurements, validates them, and publishes JSON plus human-readable text only after validation succeeds. The contract always reports:

- request count, package count, throughput, and HTTP error count
- p50, p95, and p99 latency
- pool waits and database utilization
- target URL, client count, batch size, duration, data-set version, and test data version

Machine-readable field names: `request_count`, `package_count`, `throughput`, `http_error_count`, `p50_latency`, `p95_latency`, `p99_latency`, `pool_waits`, `database_utilization`, `target_url`, `client_count`, `batch_size`, `duration`, `data_set_version`, and `test_data_version`.

Before a report is emitted, the runner metadata must match `target_url`, `client_count`, `batch_size`, `duration`, `data_set_version`, and `test_data_version` exactly. The helper compares post-change p95 latency against baseline evidence; a reduction of at least 30 percent emits a success verdict, while missing evidence or an unmet target records `risk waiver required` and requires a waiver owner and reason.

Load-test credentials must be injected through environment variables or secrets and must never be committed.

Run the authenticated profile with `python3 backend/scripts/run_ingest_load.py --target-url https://isolated.example --api-key "$FLUXION_LOAD_API_KEY" --client-count 50 --batch-size 100 --duration 600 --data-set-version host-1000-package-1000000-v1 --package-count-per-batch 100 --output-dir ./evidence`. The runner sends the existing `X-API-Key` header to `/api/v1/updates/batch`, defaults to 50 clients, 100 package items, and 10 minutes, and writes only validated JSON and human-readable reports. Cleanup removes test-created packages and API keys and restores fixture counts before returning.
