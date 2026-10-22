# Scripts

Utility scripts for deployment, database management, and operations.

## Examples

- Database initialization scripts
- Data migration scripts
- Deployment automation
- Monitoring and health check scripts

## Standard ingest load profile

```sh
LOAD_TEST_API_KEY=... python scripts/run_ingest_load.py \
  --target-url https://load.example.test \
  --api-key "$LOAD_TEST_API_KEY" \
  --client-count 50 --batch-size 100 --duration 600 \
  --data-set-version ingest-standard-v1 --package-count-per-batch 100 \
  --output-dir load-results
```

The runner validates HTTPS, secret isolation, the 100-item batch limit, fixed hosts/rows metadata, and report completeness. It writes `ingest-load-report.json` and `ingest-load-summary.txt` and performs no credential logging.
