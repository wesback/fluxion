# Backend ingest load-profile evidence

The standard repeatable profile is `50` clients, `100` package items per batch, and `600` seconds. It targets fixed data-set version `ingest-standard-v1` with `1,000` hosts and `1,000,000` package rows (`hosts-1000-packages-1000000-v1`).

## Required report

`ingest-load-report.json` contains request count, package count, throughput, HTTP error count, p50/p95/p99 latency, pool waits, database utilization, target URL, client and batch sizes, duration, data-set and test-data versions. `ingest-load-summary.txt` is the human-readable view.

## Evidence status

A live execution is recorded only when the HTTPS target is available, the fixed data set is present, and 50 clients are reached. Evidence must not contain the API key or response bodies.

## Latency verdict

A success verdict requires post-change p95 latency to be at or below 70 percent of the recorded baseline. Otherwise the report must contain `risk waiver required`, exact baseline and post-change values, and a named owner plus reason.
