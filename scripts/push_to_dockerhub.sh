#!/usr/bin/env bash
set -euo pipefail

# Push built images to Docker Hub under the specified user (default: wesback)
# Usage:
#   scripts/push_to_dockerhub.sh [tag]
# Environment variables:
#   DOCKERHUB_USER - Docker Hub username (default: wesback)
#   DOCKERHUB_PASS - Docker Hub password or token (optional; if set, login will be non-interactive)
#   BUILD - if set to 0, skip building and only push existing local images (default: 1)
# Examples:
#   scripts/push_to_dockerhub.sh latest
#   DOCKERHUB_USER=wesback DOCKERHUB_PASS=... scripts/push_to_dockerhub.sh $(git rev-parse --short HEAD)

DOCKERHUB_USER="${DOCKERHUB_USER:-wesback}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
BUILD_FLAG="${BUILD:-1}"

BACKEND_CONTEXT="./backend"
FRONTEND_CONTEXT="./frontend"

BACKEND_IMAGE="${DOCKERHUB_USER}/fluxion-api:${TAG}"
FRONTEND_IMAGE="${DOCKERHUB_USER}/fluxion-frontend:${TAG}"

echo "Docker Hub user: ${DOCKERHUB_USER}"
echo "Tag: ${TAG}"

docker_login() {
  if [ -n "${DOCKERHUB_PASS:-}" ]; then
    echo "Logging in to Docker Hub as ${DOCKERHUB_USER} (non-interactive)"
    echo "${DOCKERHUB_PASS}" | docker login --username "${DOCKERHUB_USER}" --password-stdin
  else
    echo "Please login to Docker Hub (interactive) as ${DOCKERHUB_USER}"
    docker login --username "${DOCKERHUB_USER}"
  fi
}

build_images() {
  if [ "${BUILD_FLAG}" != "0" ]; then
    echo "Building backend image: ${BACKEND_IMAGE}"
    docker build -t "${BACKEND_IMAGE}" -f "${BACKEND_CONTEXT}/Dockerfile" "${BACKEND_CONTEXT}"

    echo "Building frontend image: ${FRONTEND_IMAGE}"
    docker build -t "${FRONTEND_IMAGE}" -f "${FRONTEND_CONTEXT}/Dockerfile" "${FRONTEND_CONTEXT}"
  else
    echo "Skipping build step (BUILD=0). Will attempt to push existing local images."
  fi
}

push_images() {
  echo "Pushing ${BACKEND_IMAGE}"
  docker push "${BACKEND_IMAGE}"

  echo "Pushing ${FRONTEND_IMAGE}"
  docker push "${FRONTEND_IMAGE}"
}

main() {
  docker_login
  build_images
  push_images
  echo "All done. Images pushed as:"
  echo "  ${BACKEND_IMAGE}"
  echo "  ${FRONTEND_IMAGE}"
}

main "$@"
