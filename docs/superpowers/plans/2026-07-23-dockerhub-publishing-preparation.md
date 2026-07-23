# Docker Hub Publishing Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize Fluxion's canonical Docker Hub images, correct runtime Compose/docs metadata, and publish release images safely from GitHub Actions.

**Architecture:** Keep the existing Docker Hub workflow and branch/PR validation, branch image pushes, and scans, add `v*` release triggers and semver metadata, and publish release tags plus `latest` without removing existing branch tags. Keep ACR workflow and environment-specific registries unchanged. Use runtime-native health checks and port 8080 for the Nginx frontend.

**Tech Stack:** Dockerfiles, Docker Compose YAML, Helm YAML/templates, GitHub Actions, Bash, Docker Buildx, Docker metadata-action.

---

### Task 1: Standardize Docker Hub image references and runtime Compose behavior

**Files:**
- Modify: `docker-compose.dockerhub.yml:45-124`
- Modify: `.env.dockerhub.example:20-23`
- Modify: `scripts/push_to_dockerhub.sh:22-23`
- Modify: `deploy/helm/fluxion/values.yaml:13-18,99-103`
- Modify: `deploy/helm/fluxion/values-local.yaml:9-23`
- Modify: `deploy/helm/fluxion/values-dev.yaml:1-23`
- Modify: `deploy/helm/fluxion/values-staging.yaml:1-22`
- Modify: `deploy/helm/fluxion/values-prod.yaml:1-15`

- [ ] **Step 1: Update Docker Hub Compose image references**

Use `wesback/fluxion-backend:${BACKEND_TAG:-latest}` and
`wesback/fluxion-frontend:${FRONTEND_TAG:-latest}` as the defaults while
retaining tag override variables. Remove the temporary local frontend image
and its commented replacement.

- [ ] **Step 2: Make Compose health checks runtime-native**

Replace the Docker Hub backend `curl` healthcheck with the Python standard
library already included in the backend image:

```yaml
test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
```

Change the frontend healthcheck URL from port 3000 to port 8080 and keep its
probe using the `curl` command installed by the frontend runtime Dockerfile:

```yaml
test: ["CMD", "curl", "-f", "http://localhost:8080/"]
```

- [ ] **Step 3: Correct Docker Hub Compose host-port documentation**

Add explicit host mappings using `${BACKEND_PORT:-8000}:8000` and
`${FRONTEND_PORT:-8080}:8080`; do not alter PostgreSQL or Jaeger mappings.

- [ ] **Step 4: Align the environment template**

Set `FRONTEND_PORT=8080` and update the CORS example from localhost:3000 to
localhost:8080. Do not add credentials or read any `.env` file.

- [ ] **Step 5: Align the manual publishing helper**

Change only the backend image from `${DOCKERHUB_USER}/fluxion-api` to
`${DOCKERHUB_USER}/fluxion-backend`; leave its authentication flow intact for
manual authenticated use.

- [ ] **Step 6: Align Helm Docker Hub defaults**

Set the chart defaults to `wesback/fluxion-backend` and
`wesback/fluxion-frontend`. Set the local override backend repository to
`wesback/fluxion-backend`; preserve its existing frontend repository and all
environment-specific ACR `global.registry` values.

- [ ] **Step 7: Preserve ACR image paths with explicit repository overrides**

In `values-dev.yaml`, `values-staging.yaml`, and `values-prod.yaml`, set the
API repository to `fluxion-backend` and frontend repository to
`fluxion-frontend`. This keeps the existing ACR `global.registry` values
unchanged and prevents Helm from rendering paths such as
`registry.example/wesback/fluxion-backend`.

- [ ] **Step 8: Validate this task's YAML and diff**

Run:

```bash
docker compose -f docker-compose.dockerhub.yml config
helm lint deploy/helm/fluxion
helm template fluxion deploy/helm/fluxion \
  -f deploy/helm/fluxion/values-dev.yaml >/dev/null
git diff --check
```

Expected: Compose and Helm render successfully and `git diff --check` produces
no output. If Helm is unavailable, report that check as skipped.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.dockerhub.yml .env.dockerhub.example scripts/push_to_dockerhub.sh \
  deploy/helm/fluxion/values.yaml deploy/helm/fluxion/values-local.yaml \
  deploy/helm/fluxion/values-dev.yaml deploy/helm/fluxion/values-staging.yaml \
  deploy/helm/fluxion/values-prod.yaml
git commit -m "fix: standardize Docker Hub image references"
```

### Task 2: Update Docker Hub documentation and Helm examples

**Files:**
- Modify: `DOCKERHUB-DEPLOYMENT.md:65-70,93-103,155-188`
- Modify: `README.md:242-249`
- Modify: `deploy/helm/fluxion/README.md:107-129`

- [ ] **Step 1: Correct Docker Hub access ports**

Document the frontend at `http://localhost:8080`, keep backend at 8000, and
update the frontend port variable/default to 8080. Update CORS examples that
refer to the Docker Hub frontend port.

- [ ] **Step 2: Use canonical image names in examples**

Use `wesback/fluxion-backend` and `wesback/fluxion-frontend` in explicit
examples, while retaining `${DOCKERHUB_USERNAME}` where the document is
describing configurable deployments.

- [ ] **Step 3: Document release-tag usage without secrets**

Describe that GitHub Actions publishes `v*` tags and that local manual push
requires existing Docker authentication. Do not include passwords, tokens, or
credential-file paths.

- [ ] **Step 4: Validate Markdown references**

Run:

```bash
rg -n "(image:\s*(fluxion-api|ghcr\.io/wesback/fluxion)|localhost:3000|FRONTEND_PORT.*3000)" \
  DOCKERHUB-DEPLOYMENT.md README.md deploy/helm/fluxion/README.md
```

Expected: no Docker Hub-specific stale references remain; unrelated Grafana
port 3000 references are not part of this task.

- [ ] **Step 5: Commit**

```bash
git add DOCKERHUB-DEPLOYMENT.md README.md deploy/helm/fluxion/README.md
git commit -m "docs: update Docker Hub image and port references"
```

### Task 3: Update the Docker Hub release workflow

**Files:**
- Modify: `.github/workflows/build-push-dockerhub.yml:3-190`

- [ ] **Step 1: Add release tag triggering**

Keep existing `main`/`develop` push, `main` pull request, and manual triggers,
and add `push.tags: ['v*']`.

- [ ] **Step 2: Add safe semver metadata for both images**

For each metadata step, retain branch/sha/PR tags for validation builds and
add:

```text
type=semver,pattern={{version}}
type=semver,pattern={{major}}.{{minor}}
type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}
```

Use the existing `DOCKERHUB_USERNAME` environment value and canonical image
suffixes; do not hard-code tokens or usernames into secrets/configuration.

- [ ] **Step 3: Preserve existing pushes and add release pushes**

Keep the existing push behavior for branch pushes and add publishing for push
events whose ref starts with `refs/tags/v`; pull requests remain build-only.

- [ ] **Step 4: Fix digest output references**

Give each build-push action an explicit ID (`build`) and reference
`steps.build.outputs.digest` in its following digest step.

- [ ] **Step 5: Keep existing CI jobs coherent**

Retain Trivy and Docker Hub description jobs. Make Trivy select `latest` for a
release tag and the existing branch tags for branch pushes; avoid scanning a
nonexistent `dev-latest` release tag. Keep permissions least-privileged and
continue using `DOCKERHUB_TOKEN` only through action inputs.

- [ ] **Step 6: Validate workflow syntax**

Run an available YAML parser, for example:

```bash
python - <<'PY'
import yaml
from pathlib import Path
yaml.safe_load(Path(".github/workflows/build-push-dockerhub.yml").read_text())
print("workflow YAML OK")
PY
```

If PyYAML is unavailable, use another installed YAML parser and report the
fallback.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/build-push-dockerhub.yml
git commit -m "ci: publish Docker Hub images on version tags"
```

### Task 4: Build and publish only the requested local `latest` images

**Files:** None.

- [ ] **Step 1: Check Docker availability without reading credentials**

Run:

```bash
docker version
```

Do not run `docker login`, inspect Docker config files, or read any credential
file.

- [ ] **Step 2: Build canonical local images**

Run:

```bash
docker build -t wesback/fluxion-backend:latest -f backend/Dockerfile backend
docker build -t wesback/fluxion-frontend:latest -f frontend/Dockerfile frontend
```

Expected: both builds succeed.

- [ ] **Step 3: Push only `latest` using existing authentication**

Run:

```bash
docker push wesback/fluxion-backend:latest
docker push wesback/fluxion-frontend:latest
```

Do not push release, branch, SHA, or any other tag. If Docker reports missing
authentication or unavailable registry access, stop pushing and report the
exact blocker rather than attempting login.

- [ ] **Step 4: Report exact digests**

Capture the digest returned by each successful push. If a push fails, report
the full blocker and provide the exact commands the user can run after local
authentication.

### Task 5: Final verification

**Files:** None.

- [ ] **Step 1: Run repository checks**

Run:

```bash
docker compose -f docker-compose.dockerhub.yml config
git diff --check
git status --short
```

- [ ] **Step 2: Confirm application source is untouched**

Run:

```bash
git diff --name-only HEAD
```

Verify no `backend/fluxion/**` or `frontend/app/**` application source files
were changed by this task.

- [ ] **Step 3: Summarize changed files, checks, image digests, and blockers**

Include exact local authentication/push commands only if a push was blocked.
