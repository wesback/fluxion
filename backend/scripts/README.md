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

## Load runner parameters and environment

`run_ingest_load(params, environ, client, fixtures)` accepts:

- `target_url`, `client_count` (default 50), `batch_size` (default 100), `duration` (default 600 seconds), `data_set_version`, `test_data_version`, and `output_dir`.
- Set `FLUXION_LOAD_API_KEY` to the required API key; the runner sends it only as the `X-API-Key` header.
- Set `FLUXION_LOAD_ISOLATION_APPROVED=true` for an explicitly approved production target. `FLUXION_LOAD_TARGET_ENV` and `FLUXION_LOAD_PRODUCTION_TARGET_URL` identify or classify the target environment.

The standard run uses 50 clients, batches of 100 package items, 10 minutes, 1,000 hosts, and 1,000,000 package rows.
