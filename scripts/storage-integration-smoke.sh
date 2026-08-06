#!/usr/bin/env bash

# Start the MinIO/ClamAV verification stack and run both live storage tests.
# The stack is removed by default after the run; set STOP_SERVICES=0 to keep it.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.storage.example.yml"
COMPOSE_PROVIDER="${COMPOSE_PROVIDER:-auto}"
PODMAN_CONNECTION="${PODMAN_CONNECTION:-}"
MINIO_API_HOST_PORT="${MINIO_API_HOST_PORT:-9000}"
MINIO_CONSOLE_HOST_PORT="${MINIO_CONSOLE_HOST_PORT:-9001}"
CLAMAV_HOST_PORT="${CLAMAV_HOST_PORT:-3310}"
COMPOSE=()

podman_compose_version() {
  if [[ -n "$PODMAN_CONNECTION" ]]; then
    podman --connection "$PODMAN_CONNECTION" compose version
  else
    podman compose version
  fi
}

if [[ "$COMPOSE_PROVIDER" != "podman" ]] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif [[ "$COMPOSE_PROVIDER" != "docker" ]] && command -v podman-compose >/dev/null 2>&1 && podman-compose version >/dev/null 2>&1; then
  COMPOSE=(podman-compose)
  if [[ -n "$PODMAN_CONNECTION" ]]; then
    export CONTAINER_CONNECTION="$PODMAN_CONNECTION"
  fi
elif [[ "$COMPOSE_PROVIDER" != "docker" ]] && command -v podman >/dev/null 2>&1 && podman_compose_version >/dev/null 2>&1; then
  if [[ -n "$PODMAN_CONNECTION" ]]; then
    COMPOSE=(podman --connection "$PODMAN_CONNECTION" compose)
  else
    COMPOSE=(podman compose)
  fi
else
  echo "Docker Compose 또는 Podman Compose가 필요합니다." >&2
  podman machine list 2>&1 || true
  podman system connection list 2>&1 || true
  exit 2
fi

compose() {
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" -p fanfolio-storage-integration "$@"
}

cleanup() {
  if [[ "${STOP_SERVICES:-1}" == "1" ]]; then
    compose down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_tcp() {
  local port="$1"
  for _ in {1..90}; do
    if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for TCP port $port" >&2
  return 1
}

wait_for_minio() {
  for _ in {1..90}; do
    if curl -fsS "http://127.0.0.1:${MINIO_API_HOST_PORT}/minio/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for MinIO readiness" >&2
  return 1
}

wait_for_clamav() {
  for _ in {1..120}; do
    if (
      cd "$ROOT_DIR/backend"
      ASSET_SCAN_MODE=clamav \
      CLAMAV_HOST=127.0.0.1 \
      CLAMAV_PORT="$CLAMAV_HOST_PORT" \
      .venv/bin/python - <<'PY'
import asyncio

from app.upload_safety import scan_uploaded_content


asyncio.run(
    scan_uploaded_content(
        content_type="text/plain",
        purpose="readiness",
        content=b"Fanfolio ClamAV readiness probe",
    )
)
PY
    ) >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for ClamAV readiness" >&2
  return 1
}

echo "Starting MinIO and ClamAV with ${COMPOSE[0]}"
export MINIO_API_HOST_PORT MINIO_CONSOLE_HOST_PORT CLAMAV_HOST_PORT
compose up -d
wait_for_tcp "$MINIO_API_HOST_PORT"
wait_for_minio
wait_for_tcp "$CLAMAV_HOST_PORT"
wait_for_clamav

echo "Running S3 round-trip and ClamAV integration tests"
(
  cd "$ROOT_DIR/backend"
  FANFOLIO_S3_INTEGRATION=1 \
  S3_ENDPOINT_URL="http://127.0.0.1:${MINIO_API_HOST_PORT}" \
  S3_REGION=ap-northeast-2 \
  S3_BUCKET=fanfolio-test \
  S3_ACCESS_KEY_ID=fanfolio-local \
  S3_SECRET_ACCESS_KEY=fanfolio-local-secret \
  FANFOLIO_CLAMAV_INTEGRATION=1 \
  ASSET_SCAN_MODE=clamav \
  CLAMAV_HOST=127.0.0.1 \
  CLAMAV_PORT="$CLAMAV_HOST_PORT" \
  .venv/bin/pytest -q tests/integration/test_s3_storage.py tests/integration/test_clamav.py
)

echo "S3 and ClamAV integration smoke test passed."
