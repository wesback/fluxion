# Docker Hub Publishing Preparation Design

## Goal

Prepare Fluxion's Docker Hub distribution path around the canonical images
`wesback/fluxion-backend` and `wesback/fluxion-frontend`, without changing
application source code or the existing ACR workflow.

## Scope

- Standardize Docker Hub image references in Compose, publishing scripts, Helm
  defaults/local overrides, and Docker Hub documentation.
- Keep PostgreSQL, Jaeger, and environment-specific ACR image references
  unchanged.
- Make Docker Hub Compose health checks and ports match the runtime images:
  backend on port 8000 and Nginx frontend on port 8080.
- Publish both images from GitHub Actions for `v*` version tags, in addition to
  the existing branch/PR validation and branch image behavior, using the
  `DOCKERHUB_USERNAME` repository variable (configured as `wesback`) and
  `DOCKERHUB_TOKEN` secret.
- Separately, after implementation, build and attempt to push only the
  `latest` tag locally using the existing Docker authentication; this is not a
  change to the workflow trigger or its release-tag policy.
- Correct invalid build-step digest references.
- Validate YAML/Compose syntax, `git diff --check`, and local Docker builds
  when Docker is available.

## Design

The existing Docker Hub workflow will gain `v*` tag triggers and release
metadata instead of adding a second competing workflow. Existing branch/PR
validation builds, branch image pushes, and scans remain available. Both image
jobs will share the same metadata conventions, with semver-safe version tags
plus a stable `latest` tag for a release. Build steps will have explicit IDs
so digest reporting references valid outputs; tag-aware scan selection will
avoid treating a release as a development image.

The Docker Hub Compose file will reference the canonical images directly by
default while retaining tag overrides. Its backend health check will use the
Python runtime already present in the image rather than requiring `curl`.
Frontend health and documentation will use Nginx's actual port 8080.

Helm's default and local Docker Hub repositories will use the canonical
`wesback/...` names. ACR environment files and registry composition remain
unchanged so existing deployments preserve their current registry behavior.

The legacy push helper will use the backend canonical name. It remains a
manual authenticated helper; no credentials will be added to repository files.

Expected implementation files are:

- `docker-compose.dockerhub.yml`
- `DOCKERHUB-DEPLOYMENT.md`
- `README.md`
- `scripts/push_to_dockerhub.sh`
- `.github/workflows/build-push-dockerhub.yml`
- `.env.dockerhub.example`
- `deploy/helm/fluxion/values.yaml`
- `deploy/helm/fluxion/values-local.yaml`
- `deploy/helm/fluxion/values-dev.yaml`
- `deploy/helm/fluxion/values-staging.yaml`
- `deploy/helm/fluxion/values-prod.yaml`
- `deploy/helm/fluxion/README.md`

## Validation

- Parse YAML and Docker Compose files with available local tooling.
- Run `git diff --check`.
- Build both canonical images locally if Docker is available.
- Attempt no credential-file reads and no explicit `docker login`.
- If an already-authenticated Docker daemon is available, push only the
  requested `latest` images and report exact digests; otherwise report the
  authentication or daemon blocker and provide the exact local commands.
