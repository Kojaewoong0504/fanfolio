#!/usr/bin/env bash

# Verify the local PostgreSQL, Mailpit, and Redis stack against the real API.
# The script leaves the containers running so Mailpit can be inspected at
# http://localhost:8025. Set STOP_SERVICES=1 when a one-shot teardown is wanted.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-integration.XXXXXX")"
API_PID=""
CELERY_PID=""

cleanup() {
  set +e
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$CELERY_PID" ]] && kill "$CELERY_PID" 2>/dev/null || true
  if [[ "${STOP_SERVICES:-0}" == "1" ]]; then
    compose down
  fi
  # LOG_DIR is an explicit mktemp directory owned by this run. `rm` keeps the
  # script portable across macOS, Linux, and CI images without requiring a
  # desktop trash utility.
  rm -rf -- "$LOG_DIR"
}
trap cleanup EXIT

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  COMPOSE=(podman compose)
else
  echo "Docker Compose 또는 Podman Compose가 필요합니다." >&2
  exit 2
fi

compose() {
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" -p fanfolio-integration "$@"
}

wait_for_url() {
  local url="$1"
  for _ in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  exit 1
}

wait_for_tcp() {
  local host="$1"
  local port="$2"
  "$BACKEND_DIR/.venv/bin/python" - "$host" "$port" <<'PY'
import socket
import sys
import time

host, port = sys.argv[1], int(sys.argv[2])
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=1):
            raise SystemExit(0)
    except OSError:
        time.sleep(1)
raise SystemExit(1)
PY
}

echo "[1/5] starting local dependencies"
compose up -d
wait_for_tcp 127.0.0.1 5432
wait_for_tcp 127.0.0.1 1025
wait_for_tcp 127.0.0.1 6379
wait_for_url http://localhost:8025/api/v1/info

export APP_ENV=development
export DATABASE_URL=postgresql+asyncpg://fanfolio:fanfolio-local-only@localhost:5432/fanfolio
export AUTO_CREATE_SCHEMA=false
export FRONTEND_URL=http://localhost:5173
export FRONTEND_ORIGINS=http://localhost:5173
export MAIL_DELIVERY_MODE=smtp
export MAIL_FROM='Fanfolio <no-reply@localhost>'
export SMTP_HOST=localhost
export SMTP_PORT=1025
export SMTP_USE_TLS=false
export TASK_QUEUE_MODE=celery
export CELERY_BROKER_URL=redis://localhost:6379/0
export CELERY_RESULT_BACKEND=redis://localhost:6379/0
export RATE_LIMIT_BACKEND=redis
export RATE_LIMIT_REDIS_URL=redis://localhost:6379/1

echo "[2/5] applying PostgreSQL migrations"
(cd "$BACKEND_DIR" && .venv/bin/alembic upgrade head)

echo "[3/5] starting API against PostgreSQL and Mailpit"
(
  cd "$BACKEND_DIR"
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
wait_for_url http://localhost:8000/api/health/ready

echo "[3b/5] starting and checking a Celery worker"
(
  cd "$BACKEND_DIR"
  .venv/bin/celery -A app.tasks:celery_app worker --loglevel=WARNING --concurrency=1
) >"$LOG_DIR/celery.log" 2>&1 &
CELERY_PID=$!
for _ in {1..30}; do
  if "$BACKEND_DIR/.venv/bin/celery" -A app.tasks:celery_app inspect ping --timeout=1 2>/dev/null \
    | grep -q "pong"; then
    break
  fi
  if ! kill -0 "$CELERY_PID" 2>/dev/null; then
    echo "Celery worker exited before responding." >&2
    cat "$LOG_DIR/celery.log" >&2
    exit 1
  fi
  sleep 1
done
if ! "$BACKEND_DIR/.venv/bin/celery" -A app.tasks:celery_app inspect ping --timeout=1 2>/dev/null \
  | grep -q "pong"; then
  echo "Timed out waiting for the Celery worker." >&2
  cat "$LOG_DIR/celery.log" >&2
  exit 1
fi

echo "[4/5] verifying Redis reachability"
"$BACKEND_DIR/.venv/bin/python" - <<'PY'
import socket

with socket.create_connection(("127.0.0.1", 6379), timeout=3) as connection:
    connection.sendall(b"*1\r\n$4\r\nPING\r\n")
    response = connection.recv(64)
if response != b"+PONG\r\n":
    raise SystemExit(f"Unexpected Redis response: {response!r}")
PY

echo "[4b/5] verifying API rate limiting uses Redis"
rate_limit_email="integration-rate-limit-$(date +%s)@example.com"
for _ in {1..5}; do
  status_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    http://localhost:8000/api/auth/magic-link/request \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$rate_limit_email\",\"purpose\":\"login\"}")"
  [[ "$status_code" == "202" ]] || {
    echo "Expected the first five requests to succeed, got $status_code" >&2
    exit 1
  }
done
status_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  http://localhost:8000/api/auth/magic-link/request \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$rate_limit_email\",\"purpose\":\"login\"}")"
[[ "$status_code" == "429" ]] || {
  echo "Expected the sixth request to be rate limited, got $status_code" >&2
  exit 1
}

echo "[5/5] verifying SMTP delivery through Mailpit"
curl -fsS -X POST http://localhost:8000/api/auth/magic-link/request \
  -H 'Content-Type: application/json' \
  -d '{"email":"integration@example.com","purpose":"login"}' >/dev/null

for _ in {1..30}; do
  messages="$(curl -fsS http://localhost:8025/api/v1/messages)"
  if grep -Fq 'integration@example.com' <<<"$messages"; then
    echo "Fanfolio integration smoke test passed."
    exit 0
  fi
  sleep 1
done

echo "Mailpit did not receive the integration message." >&2
cat "$LOG_DIR/api.log" >&2
exit 1
