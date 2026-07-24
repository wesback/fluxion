# Dapr Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Agent:** Neo — Lead / Architect  
**Goal:** Adopt five Dapr building blocks (pub/sub, state, service invocation, secrets, observability integration) on the Ubuntu VM via Docker Compose first, then preserve a clean migration path to AKS/Helm/ArgoCD. Primary objective is learning-platform evaluation; the backend monolith is not rewritten.

**Architecture:** Deploy Dapr via the Dapr CLI on the Ubuntu VM using a Docker Compose override (`docker-compose.dapr.yml`). Redis is added as the first broker and state store. A new notification worker service is extracted from the monolith: it subscribes to package-update events over Dapr pub/sub and drives the existing `WebhookService` and delivery-history logic unchanged. A PostgreSQL transactional outbox bridges the commit/publish gap: the API writes outbox rows inside the same DB transaction, and a relay loop publishes them to Dapr pub/sub. Dapr service invocation is added only for the API-to-worker control boundary; the frontend-to-API ingress path is not touched. Secret access is migrated from Azure Key Vault CSI to a Dapr Azure Key Vault secret store component with a dual-run validation step and an explicit rollback path. All relational state, the APT hook, the OpenTelemetry SDK, and the ingress path remain outside Dapr.

**Tech stack:** Python / FastAPI, SQLAlchemy async, Alembic, Dapr Python SDK, Docker Compose, Dapr CLI, Redis 7, PostgreSQL 18-alpine, Azure Key Vault, OpenTelemetry OTLP, Helm, ArgoCD, Kubernetes (AKS — later phase).

---

## File structure

### Create

- `docker-compose.dapr.yml` — Compose override adding Redis, the Dapr placement service, and per-service Dapr sidecar containers; wired to the existing `fluxion-network`.
- `dapr/config.yaml` — Dapr configuration: tracing sampler pointing to the existing OTLP endpoint, middleware chain.
- `dapr/components/pubsub.yaml` — Redis Streams pub/sub component (`fluxion-pubsub`).
- `dapr/components/statestore.yaml` — Redis state store component (`fluxion-statestore`).
- `dapr/components/secretstore.yaml` — Azure Key Vault secret store component (`fluxion-secrets`); scoped to API and worker.
- `backend/fluxion/worker/` — new Python package for the notification worker.
- `backend/fluxion/worker/__init__.py`
- `backend/fluxion/worker/main.py` — lightweight FastAPI app exposing the Dapr push-subscription endpoint and a `/health` probe.
- `backend/fluxion/worker/subscriber.py` — Dapr push handler: deserialises event, enforces idempotency via state store, delegates to `WebhookService`.
- `backend/fluxion/worker/checkpoint.py` — Dapr state store helpers for idempotency keys and per-webhook delivery checkpoints.
- `backend/fluxion/database/outbox.py` — `OutboxEvent` SQLAlchemy model and synchronous relay loop; publishes pending rows to Dapr pub/sub and marks them delivered.
- `backend/alembic/versions/xxxx_add_outbox_events.py` — migration adding the `outbox_events` table.
- `backend/Dockerfile.worker` — worker image built from the same base as the API image.
- `scripts/dapr-up.sh` — helper script: initialises Dapr on the VM, starts Compose with the Dapr override, and tails logs.
- `scripts/dapr-down.sh` — helper script: stops Compose, removes sidecar containers, preserves volumes.

### Modify

- `docker-compose.yml` — add `redis` service (Redis 7, named volume `redis_data`, `fluxion-network`); add `worker` service skeleton (disabled by default via profile `dapr`).
- `backend/requirements.txt` — add `dapr>=1.13.0,<2.0.0` and `dapr-ext-fastapi>=1.13.0,<2.0.0`.
- `backend/fluxion/api/routes/updates.py` — replace `BackgroundTasks.add_task(_trigger_package_change_webhooks, ...)` with `_enqueue_package_update_event(...)` that writes to `outbox_events` inside the existing DB transaction (single-record and batch paths).
- `backend/fluxion/config.py` — add `dapr_enabled: bool`, `dapr_http_port: int`, `dapr_pubsub_name: str`, `dapr_statestore_name: str`, `dapr_secretstore_name: str`, `outbox_relay_interval_seconds: float`.
- `backend/fluxion/main.py` — in the `lifespan` context manager, start the outbox relay background task when `dapr_enabled` is true; stop it on shutdown.
- `deploy/helm/fluxion/templates/api-deployment.yaml` — (AKS phase) add conditional Dapr pod annotations block controlled by a new `dapr.enabled` values key.
- `deploy/helm/fluxion/templates/` — (AKS phase) add `dapr-components.yaml` template rendering Dapr `Component` CRDs from a `dapr.components` values block.
- `deploy/helm/fluxion/values.yaml` — (AKS phase) add `dapr.enabled: false` flag, `dapr.appId`, `dapr.components` map, and `dapr.syncWave` for ArgoCD ordering.
- `deploy/argocd/apps/` — (AKS phase) add Dapr operator `Application` manifest with wave `-1` and a Redis `Application` manifest with wave `0`.

### Deliberately unchanged

- `apt-hooks/99fluxion` — bash/curl external agent; outside the service mesh and always will be.
- `backend/fluxion/services/webhook_service.py` — `WebhookService` (httpx, retries, ntfy logic, delivery-history DB writes) is called by the worker subscriber unchanged.
- `backend/fluxion/services/ingest_adapters.py` — pure normalisation logic; no infrastructure concern.
- `backend/fluxion/middleware/auth.py` — `APIKeyAuthMiddleware` is custom business logic, not an infrastructure surface.
- `backend/fluxion/telemetry.py` — the OTel SDK, FastAPI/SQLAlchemy instrumentors, and OTLP exporters are reused as-is; the Dapr `config.yaml` tracing block points to the same exporter endpoint.
- `backend/fluxion/database/` — all existing models; only `outbox.py` is added alongside them.
- `frontend/` — no frontend files are modified.
- All existing ingress paths (nginx ingress → API, frontend → API) — frontend-to-backend HTTP is unchanged.

---

## Task 0: Prerequisites — Dapr CLI, version pinning, VM resource budget, rollback criteria

**Files:**
- Read-only: `docker-compose.yml`, `backend/requirements.txt`, `backend/fluxion/config.py`

- [ ] **Step 1: Verify Dapr CLI and Docker Compose versions**

  Run:

  ```bash
  dapr --version
  docker compose version
  docker version
  ```

  Expected: Dapr CLI ≥ 1.13, Docker Compose ≥ 2.24, Docker Engine ≥ 24. Record exact versions in a comment block at the top of `docker-compose.dapr.yml` (created in Task 1).

- [ ] **Step 2: Measure current VM memory and CPU headroom**

  Run:

  ```bash
  free -h
  nproc
  docker stats --no-stream
  ```

  Acceptable minimum for adding Dapr + Redis: 1.5 GB free RAM, 2 free vCPUs. If the VM is below this threshold, document the gap and pause — do not proceed with sidecar injection until headroom is confirmed.

- [ ] **Step 3: Confirm PostgreSQL and Redis volume persistence paths**

  Run:

  ```bash
  docker volume ls
  docker volume inspect fluxion_postgres_data 2>/dev/null || echo "not yet created"
  ```

  Document the backing host path. Any `dapr-down.sh` invocation must leave `postgres_data` and `redis_data` volumes intact.

- [ ] **Step 4: Record rollback criteria**

  Rollback is triggered if any of the following occur during Compose-pilot validation:
  - Dapr sidecar admission failure causes the API container to fail its readiness probe.
  - Outbox relay consumes > 5 % CPU sustained over 5 minutes at idle.
  - Redis persistence misconfiguration causes data loss on container restart.
  - Secret migration produces a different secret value than the CSI path in dual-run validation.

  Document these criteria in a comment at the top of `scripts/dapr-up.sh`.

---

## Task 1: Compose-first Dapr runtime — Redis, placement service, sidecar wiring, OTel

**Files:**
- Create: `docker-compose.dapr.yml`, `dapr/config.yaml`, `dapr/components/pubsub.yaml`, `dapr/components/statestore.yaml`, `scripts/dapr-up.sh`, `scripts/dapr-down.sh`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Redis service to `docker-compose.yml`**

  Add under `services:`:

  ```yaml
  redis:
    image: redis:7-alpine
    container_name: fluxion-redis
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - fluxion-network
  ```

  Add `redis_data:` under `volumes:`. Do not change any existing service definition.

- [ ] **Step 2: Create `dapr/config.yaml`**

  ```yaml
  apiVersion: dapr.io/v1alpha1
  kind: Configuration
  metadata:
    name: fluxion-dapr-config
  spec:
    tracing:
      samplingRate: "1"
      otel:
        endpointAddress: "http://jaeger:4318"
        isSecure: false
        protocol: http
  ```

  The `endpointAddress` reuses the existing Jaeger OTLP HTTP port from `docker-compose.yml:34`. If the OTel Collector is enabled instead of Jaeger, swap the address without changing the protocol.

- [ ] **Step 3: Create `dapr/components/pubsub.yaml`**

  ```yaml
  apiVersion: dapr.io/v1alpha1
  kind: Component
  metadata:
    name: fluxion-pubsub
  spec:
    type: pubsub.redis
    version: v1
    metadata:
      - name: redisHost
        value: "redis:6379"
      - name: redisPassword
        value: ""
      - name: enableTLS
        value: "false"
      - name: consumerID
        value: "fluxion-worker"
  ```

- [ ] **Step 4: Create `dapr/components/statestore.yaml`**

  ```yaml
  apiVersion: dapr.io/v1alpha1
  kind: Component
  metadata:
    name: fluxion-statestore
  spec:
    type: state.redis
    version: v1
    metadata:
      - name: redisHost
        value: "redis:6379"
      - name: redisPassword
        value: ""
      - name: enableTLS
        value: "false"
      - name: keyPrefix
        value: "fluxion"
  ```

- [ ] **Step 5: Create `docker-compose.dapr.yml`**

  This override adds the Dapr placement service and sidecars for the API and worker.  
  The sidecar for the API runs on port 3500; the worker sidecar on 3501.  
  Components directory is mounted read-only from `./dapr/components`.

  ```yaml
  # Dapr Compose override. Requires Dapr CLI ≥ 1.13 and Docker Compose ≥ 2.24.
  # Usage: docker compose -f docker-compose.yml -f docker-compose.dapr.yml up
  version: '3.8'

  services:
    dapr-placement:
      image: "daprio/dapr:1.13"
      command: ["./placement", "-port", "50006"]
      container_name: fluxion-dapr-placement
      ports:
        - "50006:50006"
      networks:
        - fluxion-network

    api-dapr:
      image: "daprio/daprd:1.13"
      container_name: fluxion-api-dapr
      command:
        - "./daprd"
        - "--app-id"
        - "fluxion-api"
        - "--app-port"
        - "8000"
        - "--dapr-http-port"
        - "3500"
        - "--placement-host-address"
        - "dapr-placement:50006"
        - "--components-path"
        - "/dapr/components"
        - "--config"
        - "/dapr/config.yaml"
        - "--log-level"
        - "info"
      volumes:
        - ./dapr/components:/dapr/components:ro
        - ./dapr/config.yaml:/dapr/config.yaml:ro
      network_mode: "service:api"
      depends_on:
        api:
          condition: service_healthy
        redis:
          condition: service_healthy
        dapr-placement:
          condition: service_started

    worker-dapr:
      image: "daprio/daprd:1.13"
      container_name: fluxion-worker-dapr
      command:
        - "./daprd"
        - "--app-id"
        - "fluxion-worker"
        - "--app-port"
        - "8001"
        - "--dapr-http-port"
        - "3501"
        - "--placement-host-address"
        - "dapr-placement:50006"
        - "--components-path"
        - "/dapr/components"
        - "--config"
        - "/dapr/config.yaml"
        - "--log-level"
        - "info"
      volumes:
        - ./dapr/components:/dapr/components:ro
        - ./dapr/config.yaml:/dapr/config.yaml:ro
      network_mode: "service:worker"
      depends_on:
        worker:
          condition: service_healthy
        redis:
          condition: service_healthy
        dapr-placement:
          condition: service_started
  ```

- [ ] **Step 6: Create `scripts/dapr-up.sh` and `scripts/dapr-down.sh`**

  `dapr-up.sh`:
  ```bash
  #!/usr/bin/env bash
  # Rollback criteria: see Task 0, Step 4
  set -euo pipefail
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml up -d
  echo "Tailing API logs (Ctrl+C to exit, services continue running):"
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml logs -f api worker
  ```

  `dapr-down.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml down
  echo "Volumes preserved: $(docker volume ls --filter name=fluxion --quiet | tr '\n' ' ')"
  ```

  Make both executable: `chmod +x scripts/dapr-up.sh scripts/dapr-down.sh`.

- [ ] **Step 7: Validate Compose config renders without errors**

  Run:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml config > /dev/null
  echo "Compose config OK"
  ```

  Expected: exits 0. Fix any YAML or network reference errors before proceeding.

- [ ] **Step 8: Smoke-test Dapr sidecar starts alongside the API**

  Run:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml up -d postgres jaeger redis dapr-placement api api-dapr
  sleep 10
  curl -sf http://localhost:3500/v1.0/healthz && echo "API sidecar healthy"
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml down
  ```

  Expected: `api-dapr` sidecar returns HTTP 204 on the healthz endpoint. If it returns a non-2xx status, check placement-service connectivity and component-path volume mount before proceeding.

---

## Task 2: Notification worker — extract, package, health probe

**Files:**
- Create: `backend/fluxion/worker/__init__.py`, `backend/fluxion/worker/main.py`, `backend/fluxion/worker/subscriber.py`, `backend/fluxion/worker/checkpoint.py`, `backend/Dockerfile.worker`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create the worker FastAPI application skeleton**

  `backend/fluxion/worker/main.py` must expose:
  - `GET /health` — returns `{"status": "ok"}` with HTTP 200.
  - `GET /dapr/subscribe` — returns the pub/sub subscription manifest required by Dapr:
    ```json
    [{"pubsubname": "fluxion-pubsub", "topic": "package.updated", "route": "/events/package-updated"}]
    ```
  - `POST /events/package-updated` — CloudEvent push endpoint; calls `subscriber.handle_package_updated`.

  Use `uvicorn` as the runner; bind to `0.0.0.0:8001`. The app may share `fluxion.database`, `fluxion.services.webhook_service`, and `fluxion.config` but must not import from `fluxion.api` (no route reuse).

- [ ] **Step 2: Implement `subscriber.py` — idempotency-gated webhook dispatch**

  `handle_package_updated(event: dict, session: AsyncSession)`:
  1. Extract `event_id` from the CloudEvent envelope.
  2. Call `checkpoint.is_already_processed(event_id)` via Dapr state store; if true, return immediately (idempotent skip).
  3. Deserialise payload fields: `hostname`, `package_name`, `old_version`, `new_version`, `is_security`.
  4. Instantiate `WebhookService(session)` and call `trigger_package_change_webhooks(...)` — no changes to `WebhookService`.
  5. Call `checkpoint.mark_processed(event_id)`.

  The state store key format is `processed-event:{event_id}` with a 24-hour TTL.

- [ ] **Step 3: Implement `checkpoint.py` — Dapr state store helpers**

  Use `dapr.clients.DaprClient` (sync) or `dapr.aio.clients.DaprClient` (async) to:
  - `is_already_processed(event_id: str) -> bool`: `get_state("fluxion-statestore", f"processed-event:{event_id}")`.
  - `mark_processed(event_id: str) -> None`: `save_state(...)` with `metadata={"ttlInSeconds": "86400"}`.

  Import `settings.dapr_http_port` for the client port.

- [ ] **Step 4: Create `backend/Dockerfile.worker`**

  Extend the API image pattern (same base, same `requirements.txt`) but set:
  ```dockerfile
  CMD ["uvicorn", "fluxion.worker.main:app", "--host", "0.0.0.0", "--port", "8001"]
  ```

- [ ] **Step 5: Add the worker service to `docker-compose.yml`**

  Add under `services:` (guarded under `profiles: [dapr]` so default Compose stacks are unaffected):

  ```yaml
  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    container_name: fluxion-worker
    profiles: ["dapr"]
    environment:
      DATABASE_URL: "postgresql+asyncpg://fluxion:fluxion@postgres:5432/fluxion"
      DAPR_ENABLED: "true"
      DAPR_HTTP_PORT: "3501"
      DAPR_PUBSUB_NAME: "fluxion-pubsub"
      DAPR_STATESTORE_NAME: "fluxion-statestore"
      LOG_LEVEL: info
      OTEL_ENABLED: "true"
      OTEL_EXPORTER_TYPE: otlp
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
      OTEL_SERVICE_NAME: fluxion-worker
      OTEL_ENVIRONMENT: development
    ports:
      - "8001:8001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c",
             "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    networks:
      - fluxion-network
  ```

- [ ] **Step 6: Validate worker starts and subscription is registered**

  Run:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml \
    --profile dapr up -d postgres redis dapr-placement worker worker-dapr
  sleep 15
  curl -sf http://localhost:8001/health && echo "worker healthy"
  curl -sf http://localhost:8001/dapr/subscribe | python3 -m json.tool
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml --profile dapr down
  ```

  Expected: `/health` returns `{"status": "ok"}` and `/dapr/subscribe` returns a non-empty array with `fluxion-pubsub` / `package.updated`.

---

## Task 3: PostgreSQL transactional outbox — model, migration, relay

**Files:**
- Create: `backend/fluxion/database/outbox.py`, `backend/alembic/versions/xxxx_add_outbox_events.py`
- Modify: `backend/fluxion/main.py`, `backend/fluxion/config.py`

- [ ] **Step 1: Add outbox config fields to `config.py`**

  Add to `Settings`:
  ```python
  dapr_enabled: bool = False
  dapr_http_port: int = 3500
  dapr_pubsub_name: str = "fluxion-pubsub"
  dapr_statestore_name: str = "fluxion-statestore"
  dapr_secretstore_name: str = "fluxion-secrets"
  outbox_relay_interval_seconds: float = 2.0
  ```

- [ ] **Step 2: Define `OutboxEvent` model in `backend/fluxion/database/outbox.py`**

  ```python
  class OutboxEvent(Base):
      __tablename__ = "outbox_events"

      id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID4
      topic: Mapped[str] = mapped_column(String(128), nullable=False)
      pubsub_name: Mapped[str] = mapped_column(String(128), nullable=False)
      payload: Mapped[dict] = mapped_column(JSON, nullable=False)
      created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
      published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
      attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
      last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

      __table_args__ = (
          Index("ix_outbox_events_published_at", "published_at"),
      )
  ```

  The relay query is `WHERE published_at IS NULL ORDER BY created_at LIMIT 50`.

  Also define `enqueue(session, topic, pubsub_name, payload)` as a module-level helper that creates and adds an `OutboxEvent` to the session without committing — the caller owns the transaction.

- [ ] **Step 3: Generate and verify the Alembic migration**

  Run:

  ```bash
  cd backend
  alembic revision --autogenerate -m "add outbox_events"
  alembic upgrade head --sql | grep -i "outbox"
  ```

  Expected: migration SQL contains `CREATE TABLE outbox_events` with `id`, `topic`, `pubsub_name`, `payload`, `created_at`, `published_at`, `attempts`, `last_error` columns and the `ix_outbox_events_published_at` index.

- [ ] **Step 4: Implement the relay loop in `outbox.py`**

  `async def relay_loop(engine, dapr_http_port: int, interval: float) -> None`:
  1. Open a new `AsyncSession`.
  2. Query up to 50 unpublished rows (`published_at IS NULL`) ordered by `created_at`.
  3. For each row: call `DaprClient.publish_event(pubsub_name, topic, data=json.dumps(payload))`.
  4. On success: set `published_at = now()`, `attempts += 1`.
  5. On failure: increment `attempts`, set `last_error`, leave `published_at` as NULL so it retries next cycle. After 10 failed attempts, move to a dead-letter log entry and set `published_at` to a sentinel timestamp (e.g., `datetime.max`) to prevent infinite loops.
  6. Commit. Sleep `interval` seconds. Repeat.

  Dead-letter handling: log at `ERROR` level with event ID, topic, and last error; do not raise.

- [ ] **Step 5: Start relay loop in `main.py` lifespan**

  In the `lifespan` async context manager, add after existing startup:

  ```python
  if settings.dapr_enabled:
      from fluxion.database.outbox import relay_loop
      relay_task = asyncio.create_task(
          relay_loop(get_engine(), settings.dapr_http_port, settings.outbox_relay_interval_seconds)
      )
  ```

  On shutdown, cancel and await `relay_task`.

- [ ] **Step 6: Validate relay loop publishes a synthetic event**

  Run with Dapr compose stack active:

  ```bash
  # Insert a synthetic outbox row directly
  docker exec fluxion-postgres psql -U fluxion -c \
    "INSERT INTO outbox_events (id, topic, pubsub_name, payload, created_at) \
     VALUES ('test-001', 'package.updated', 'fluxion-pubsub', '{\"test\": true}', now())"
  # Wait one relay interval
  sleep 5
  docker exec fluxion-postgres psql -U fluxion -c \
    "SELECT id, published_at, attempts, last_error FROM outbox_events WHERE id='test-001'"
  ```

  Expected: `published_at` is not NULL and `last_error` is NULL.

---

## Task 4: Pub/Sub — API publisher, worker subscriber, end-to-end event flow

**Files:**
- Modify: `backend/fluxion/api/routes/updates.py`

- [ ] **Step 1: Replace `BackgroundTasks.add_task` with outbox enqueue (single update path)**

  In `_create_package_update_impl` (`updates.py:202–232`), replace:

  ```python
  background_tasks.add_task(
      _trigger_package_change_webhooks,
      update_data.hostname,
      update_data.package_name,
      old_version,
      update_data.new_version,
      update_data.is_security,
  )
  ```

  With:

  ```python
  if settings.dapr_enabled:
      from fluxion.database.outbox import enqueue
      import uuid
      enqueue(
          session,
          topic=settings.dapr_pubsub_name and "package.updated",
          pubsub_name=settings.dapr_pubsub_name,
          payload={
              "event_id": str(uuid.uuid4()),
              "hostname": update_data.hostname,
              "package_name": update_data.package_name,
              "old_version": old_version,
              "new_version": update_data.new_version,
              "is_security": update_data.is_security,
          },
      )
  else:
      background_tasks.add_task(
          _trigger_package_change_webhooks,
          update_data.hostname,
          update_data.package_name,
          old_version,
          update_data.new_version,
          update_data.is_security,
      )
  ```

  The `enqueue` call is inside the existing `session` transaction; no extra commit is added.

- [ ] **Step 2: Apply the same replacement to the batch path**

  In `_create_batch_package_updates_impl` (`updates.py:484–497`), apply the same `dapr_enabled` guard: when enabled, call `enqueue(...)` once per package inside the existing transaction loop; when disabled, keep the existing `background_tasks.add_task(...)` calls.

- [ ] **Step 3: End-to-end pub/sub smoke test**

  Start the full Dapr Compose stack. POST a minimal update to the API and verify the worker receives and processes it:

  ```bash
  # Start stack
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml --profile dapr up -d
  sleep 20
  # Send a test package update
  curl -sf -X POST http://localhost:8000/api/v1/updates \
    -H "Content-Type: application/json" \
    -H "X-API-Key: <admin-key>" \
    -d '{"hostname":"test-host","package_name":"curl","old_version":"7.68","new_version":"7.90","is_security":false}'
  # Allow relay interval + Dapr delivery
  sleep 8
  # Confirm outbox row was published
  docker exec fluxion-postgres psql -U fluxion -c \
    "SELECT topic, published_at, attempts FROM outbox_events ORDER BY created_at DESC LIMIT 3"
  # Confirm worker received event (check logs)
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml logs worker | tail -20
  ```

  Expected: outbox row has `published_at IS NOT NULL` and worker logs show `handle_package_updated` executing.

---

## Task 5: Dapr service invocation — API-to-worker control boundary

**Files:**
- Modify: `backend/fluxion/worker/main.py`
- Modify: `backend/fluxion/api/routes/health.py` (add worker health probe if not present; read-only otherwise)

- [ ] **Step 1: Add a worker status endpoint invocable via Dapr**

  Add to `backend/fluxion/worker/main.py`:

  ```python
  @app.get("/status")
  async def worker_status():
      return {
          "app_id": "fluxion-worker",
          "status": "running",
          "subscriptions": ["package.updated"],
      }
  ```

  This endpoint is callable from the API via Dapr service invocation:
  `http://localhost:3500/v1.0/invoke/fluxion-worker/method/status`

- [ ] **Step 2: Add optional worker health check to the API health route**

  In `backend/fluxion/api/routes/health.py`, add an `/admin/worker-health` endpoint (admin-only, guarded by `settings.dapr_enabled`) that calls the worker status via `httpx.get(f"http://localhost:{settings.dapr_http_port}/v1.0/invoke/fluxion-worker/method/status")` and returns the result. This tests the service-invocation path without coupling the critical `/health` probe to worker availability.

- [ ] **Step 3: Validate service invocation from the API sidecar**

  With the full Dapr stack running:

  ```bash
  curl -sf http://localhost:3500/v1.0/invoke/fluxion-worker/method/status | python3 -m json.tool
  ```

  Expected: returns the worker status JSON. A non-2xx or connection-refused response indicates a sidecar routing problem; check `api-dapr` and `worker-dapr` are on the same network and placement service is registered.

---

## Task 6: Dapr secrets — Azure Key Vault component, dual-run validation, rollback

**Files:**
- Create: `dapr/components/secretstore.yaml`
- Modify: `backend/fluxion/config.py`
- Modify: `docker-compose.dapr.yml`

> **Note:** This task requires a managed identity or service principal with `Get` and `List` permissions on the Azure Key Vault. The VM identity/access path must be confirmed before proceeding. If the VM does not have managed identity configured, complete Tasks 1–5 first and return to this task when the identity path is resolved.

- [ ] **Step 1: Create `dapr/components/secretstore.yaml`**

  ```yaml
  apiVersion: dapr.io/v1alpha1
  kind: Component
  metadata:
    name: fluxion-secrets
  spec:
    type: secretstores.azure.keyvault
    version: v1
    metadata:
      - name: vaultName
        value: "<YOUR_KEYVAULT_NAME>"
      - name: azureClientId
        value: "<MANAGED_IDENTITY_CLIENT_ID>"
  ```

  Scope this component to `fluxion-api` and `fluxion-worker` only in the `auth.allowedNamespaces` or via Dapr component scopes to avoid broad secret access.

- [ ] **Step 2: Add a dual-run validation helper**

  Before cutting over, verify that the Dapr secret component returns the same value as the current environment-variable path:

  ```bash
  # Current value (from env)
  API_SECRET_CURRENT=$(docker exec fluxion-api env | grep POSTGRES_PASSWORD | cut -d= -f2)
  # Dapr secret value
  API_SECRET_DAPR=$(curl -sf http://localhost:3500/v1.0/secrets/fluxion-secrets/postgres-password | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['postgres-password'])")
  [ "$API_SECRET_CURRENT" = "$API_SECRET_DAPR" ] && echo "MATCH" || echo "MISMATCH — do not proceed"
  ```

  Do not proceed to cutover if the values do not match.

- [ ] **Step 3: Add a config toggle for Dapr secret reads**

  Add `dapr_secrets_enabled: bool = False` to `Settings` in `config.py`. When `True`, the API reads `DATABASE_URL` and `ADMIN_API_KEY` via the Dapr secret store API at startup rather than from environment variables. Retain the existing env-var path as the default fallback so rollback is a single toggle change.

- [ ] **Step 4: Define rollback procedure**

  Rollback from Dapr secrets to CSI/env vars:
  1. Set `DAPR_SECRETS_ENABLED=false` in the API environment (Compose or Helm values).
  2. Restore the `DATABASE_URL` and `ADMIN_API_KEY` environment variables to their previous values.
  3. Restart the API service.
  4. Verify `curl http://localhost:8000/health` returns 200.

  Document these four steps in a comment block at the top of `dapr/components/secretstore.yaml`.

---

## Task 7: Compose profiles, health checks, volumes, resource limits — reproducible VM operation

**Files:**
- Modify: `docker-compose.yml`, `docker-compose.dapr.yml`

- [ ] **Step 1: Confirm Redis volume uses `appendonly yes` and survives restart**

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml --profile dapr up -d redis
  docker exec fluxion-redis redis-cli SET test-key "dapr-pilot"
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml down
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml --profile dapr up -d redis
  docker exec fluxion-redis redis-cli GET test-key
  ```

  Expected: `"dapr-pilot"` — volume is persistent across restarts.

- [ ] **Step 2: Add resource limits to Dapr sidecar containers in `docker-compose.dapr.yml`**

  For both `api-dapr` and `worker-dapr`, add:

  ```yaml
  deploy:
    resources:
      limits:
        cpus: "0.25"
        memory: 128M
      reservations:
        cpus: "0.05"
        memory: 64M
  ```

  For `dapr-placement`:
  ```yaml
  deploy:
    resources:
      limits:
        cpus: "0.1"
        memory: 64M
  ```

- [ ] **Step 3: Verify total idle resource consumption**

  With the full Dapr stack running (API + worker + Redis + Dapr placement + two sidecars):

  ```bash
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
  ```

  Expected at idle: total additional memory for Dapr components (placement + 2 sidecars + Redis) is under 400 MB. If the VM is memory-constrained, reduce sidecar memory limits or defer the worker to a separate VM resource profile.

---

## Task 8: Validation — contract, integration, failure injection, rollback gate

**Files:**
- No application code changes; validation steps only.

- [ ] **Step 1: Outbox durability test — pod kill during relay**

  ```bash
  # Insert outbox row
  docker exec fluxion-postgres psql -U fluxion -c \
    "INSERT INTO outbox_events (id, topic, pubsub_name, payload, created_at) \
     VALUES ('kill-test-001', 'package.updated', 'fluxion-pubsub', '{\"test\": true}', now())"
  # Kill the API container mid-relay
  docker kill fluxion-api
  sleep 2
  docker compose -f docker-compose.yml -f docker-compose.dapr.yml --profile dapr up -d api api-dapr
  sleep 15
  docker exec fluxion-postgres psql -U fluxion -c \
    "SELECT id, published_at, attempts FROM outbox_events WHERE id='kill-test-001'"
  ```

  Expected: `published_at IS NOT NULL` after recovery — the outbox survives the API restart.

- [ ] **Step 2: Redis unavailability test — API continues to ingest**

  ```bash
  docker stop fluxion-redis
  curl -sf -X POST http://localhost:8000/api/v1/updates \
    -H "Content-Type: application/json" \
    -H "X-API-Key: <admin-key>" \
    -d '{"hostname":"resilience-test","package_name":"vim","old_version":"2:8.0","new_version":"2:9.0","is_security":false}' \
    | python3 -m json.tool
  docker start fluxion-redis
  ```

  Expected: the API returns HTTP 201 (ingest succeeds; outbox row is written to PostgreSQL). The relay loop retries and publishes once Redis recovers. The ingest path is never blocked by Redis unavailability.

- [ ] **Step 3: Worker idempotency test — redelivered event**

  Manually invoke the worker's push endpoint twice with the same `event_id`:

  ```bash
  PAYLOAD='{"data": {"event_id": "dedup-001", "hostname": "host1", "package_name": "bash",
    "old_version": "5.1", "new_version": "5.2", "is_security": false}}'
  curl -sf -X POST http://localhost:8001/events/package-updated \
    -H "Content-Type: application/json" -d "$PAYLOAD"
  curl -sf -X POST http://localhost:8001/events/package-updated \
    -H "Content-Type: application/json" -d "$PAYLOAD"
  # Verify webhook delivery history has exactly one entry for event_id dedup-001
  docker exec fluxion-postgres psql -U fluxion -c \
    "SELECT count(*) FROM webhook_delivery_history WHERE payload->>'event_id' = 'dedup-001'"
  ```

  Expected: count is 1. The second invocation was skipped by the idempotency checkpoint.

- [ ] **Step 4: Rollback gate — full Dapr stack to baseline Compose**

  Verify the non-Dapr baseline still works cleanly after Dapr adoption:

  ```bash
  # Start without Dapr
  docker compose -f docker-compose.yml up -d
  sleep 20
  curl -sf http://localhost:8000/health | python3 -m json.tool
  curl -sf -X POST http://localhost:8000/api/v1/updates \
    -H "Content-Type: application/json" \
    -H "X-API-Key: <admin-key>" \
    -d '{"hostname":"rollback-test","package_name":"curl","old_version":"7.68","new_version":"7.90","is_security":false}'
  docker compose logs api | grep "Package update recorded"
  docker compose down
  ```

  Expected: the standard Compose stack (no Dapr, no Redis, no worker) ingests updates and fires background-task webhooks exactly as before. `DAPR_ENABLED=false` (the default) must produce zero behaviour change.

---

## Task 9: AKS/Helm/ArgoCD packaging — later phase

> **Prerequisite:** Complete the Compose pilot and pass all Task 8 validation gates. The AKS target is not the active deployment path as of 2026-07-24. Begin this task only when the AKS cluster is the production environment.

**Files:**
- Modify: `deploy/helm/fluxion/values.yaml`
- Modify: `deploy/helm/fluxion/templates/api-deployment.yaml`
- Create: `deploy/helm/fluxion/templates/dapr-components.yaml`
- Create: `deploy/argocd/apps/dapr.yaml`
- Create: `deploy/argocd/apps/redis.yaml`

- [ ] **Step 1: Add Dapr pod annotation support to `api-deployment.yaml`**

  Wrap the existing `podAnnotations` block with a conditional Dapr section:

  ```yaml
  {{- if .Values.dapr.enabled }}
  dapr.io/enabled: "true"
  dapr.io/app-id: {{ .Values.dapr.appId | quote }}
  dapr.io/app-port: {{ .Values.api.service.targetPort | quote }}
  dapr.io/config: "fluxion-dapr-config"
  dapr.io/log-level: "info"
  {{- end }}
  ```

  Add `dapr.enabled: false` and `dapr.appId: "fluxion-api"` to `values.yaml` under a new `dapr:` block.

- [ ] **Step 2: Add a `dapr-components.yaml` Helm template**

  Render Dapr `Component` CRDs (pub/sub, state store, secret store) from a `dapr.components` map in `values.yaml`. Gate the template on `dapr.enabled`. Include namespace scoping so components are not cluster-wide.

- [ ] **Step 3: Add ArgoCD Application manifests for Dapr operator and Redis**

  `deploy/argocd/apps/dapr.yaml`: sync wave `-1`, auto-sync enabled, namespace `dapr-system`, chart `dapr/dapr` from the Dapr Helm repo.

  `deploy/argocd/apps/redis.yaml`: sync wave `0`, chart `bitnami/redis` with `auth.enabled: false` for Compose parity (enable auth for production with a secret reference), namespace `fluxion`.

  ArgoCD sync wave ordering: Dapr operator (wave -1) → Redis (wave 0) → API (wave 2, existing) → worker (wave 2).

- [ ] **Step 4: Add Calico network policy rules**

  When `networkPolicy.enabled: true` in `values.yaml`, add egress rules permitting:
  - API → Dapr sidecar (port 3500, loopback)
  - Worker sidecar → Redis (port 6379)
  - Dapr sidecar → Dapr placement (port 50006)
  - Dapr sidecar → Dapr sentry (port 50001)

  Document that the Azure Key Vault secret store additionally requires egress to `vault.azure.net:443` from API and worker sidecars.

- [ ] **Step 5: Validate Helm render with Dapr enabled**

  ```bash
  helm lint deploy/helm/fluxion
  helm template fluxion deploy/helm/fluxion \
    --set dapr.enabled=true \
    --set dapr.appId=fluxion-api \
    -f deploy/helm/fluxion/values-dev.yaml > /dev/null
  echo "Helm render OK"
  ```

  Expected: exits 0. Verify the rendered output contains `dapr.io/enabled: "true"` on the API pod template.

---

## Dependencies and sequencing

```
Task 0 (prerequisites)
  └─→ Task 1 (Compose Dapr runtime + Redis)
        └─→ Task 2 (worker extraction)
              └─→ Task 3 (outbox)
                    └─→ Task 4 (pub/sub cutover)
                          └─→ Task 5 (service invocation)
                          └─→ Task 6 (secrets — parallel, identity-gated)
                    └─→ Task 7 (resource limits + persistence)
                          └─→ Task 8 (validation gates)
                                └─→ Task 9 (AKS packaging — later)
```

- **Task 6 is independent** of Tasks 4–5 but requires the VM managed identity / service principal access path to be confirmed before starting. It must not block Tasks 4–5.
- **Task 9 must not start** until all Task 8 gates pass and AKS is the active deployment target.
- **`DAPR_ENABLED=false` (default) must preserve existing behaviour** at every point in the rollout. This is the hard rollback invariant.

---

## Key decisions and constraints

| Decision | Rationale |
|---|---|
| **Compose-first, not AKS-first** | AKS/ArgoCD is a later target; the VM is the active deployment. Learning value is maximised on the running environment. |
| **Redis-first broker** | Simplest addition to an existing Compose stack; no external service dependency. Upgrade path to Azure Service Bus or Kafka is a component YAML swap. |
| **Five building blocks in scope** | Pub/sub (notification durability), state (idempotency), service invocation (worker control), secrets (Key Vault), observability (OTel reuse). |
| **Transactional outbox required** | The post-commit/pre-publish gap is not accepted. `OutboxEvent` rows are committed with the DB transaction; the relay loop is a separate concern. |
| **`WebhookService` unchanged** | ntfy URL normalisation, header sanitisation, and delivery-history writes are business logic; they live in the worker unchanged. |
| **`DAPR_ENABLED` feature flag** | Allows the plan to be implemented and merged without changing production behaviour. Compose pilot and AKS rollout are controlled by this flag. |
| **PostgreSQL is authoritative** | Dapr state store is bounded to idempotency keys and worker checkpoints only. No relational data migrates to Redis. |
| **OTel SDK is reused** | Dapr `config.yaml` points the sidecar's tracing output at the same OTLP endpoint. The existing `telemetry.py` is not replaced. |
| **APT hook is out of scope permanently** | Bash + curl; no SDK support; outside the service mesh. |

---

## Risks

| Risk | Mitigation |
|---|---|
| Redis persistence misconfiguration causes message loss on VM restart | `appendonly yes` in Task 1; durability tested in Task 7. |
| Dapr sidecar resource overhead exceeds VM capacity | Task 0 measures headroom; Task 7 sets limits and validates idle consumption. |
| At-least-once pub/sub delivers duplicate events to worker | Idempotency checkpoint in `subscriber.py` deduplicates by `event_id` (Task 2, Step 2). |
| Secret-permission parity gap between CSI path and Dapr Key Vault component | Dual-run validation in Task 6, Step 2 before cutover. |
| Outbox relay loop contends with ingest under high batch load | `LIMIT 50` per relay cycle; relay interval configurable via `outbox_relay_interval_seconds`; relay operates on a separate DB session. |
| ArgoCD sync ordering with Dapr operator causes API pod admission failure on AKS | Dapr operator at wave `-1`, Redis at wave `0`, API at wave `2` (Task 9, Step 3). |
| Rollback from Dapr secrets to CSI is needed in production | Rollback documented in Task 6, Step 4; `DAPR_SECRETS_ENABLED=false` default preserves the env-var path. |
| Worker sidecar and API sidecar cannot reach placement service | Both sidecars use `network_mode: "service:<app>"` so they share the app container's network namespace; placement is on the shared `fluxion-network`. |
