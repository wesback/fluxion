# Backend ingest load-profile evidence contract

## Standard profile

The standard load profile is:

- 50 clients
- 100 package items per batch
- 10 minutes duration
- 1,000 hosts
- 1,000,000 package-update rows

The test database data set and package rows are cleaned after the run. Repeated runs with identical parameters must report the same data-set version and test data version and leave no test-only package data behind.

## Report contract

Every report contains request count, package count, throughput, HTTP error count, p50 latency, p95 latency, p99 latency, pool waits, database utilization, target URL, client count, batch size, duration, data-set version, and test data version. A report is published only when every field is present and its runner metadata matches the supplied parameters exactly.

## Latency comparison

Post-change p95 latency must be at least 30 percent lower than the recorded pre-change baseline. Both exact before and post latency fields are retained in the comparison. If baseline evidence is missing or the target is unmet, the report status is `risk waiver required` and a complete waiver owner and reason are required. No success verdict is emitted unless the comparison is satisfied.

Load-test credentials are supplied through environment variables or secrets and are not committed to the repository.
