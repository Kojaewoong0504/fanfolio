#!/usr/bin/env bash

# Verify the local PostgreSQL, Mailpit, and Redis stack against the real API.
# The script leaves the containers running so Mailpit can be inspected at
# http://localhost:8025. Set STOP_SERVICES=1 when a one-shot teardown is wanted.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-integration.XXXXXX")"
COMPOSE_PROVIDER="${COMPOSE_PROVIDER:-auto}"
PODMAN_CONNECTION="${PODMAN_CONNECTION:-}"
API_PID=""
CELERY_PID=""
BEAT_PID=""
COMPOSE=()
REDEEM_USER_A=""
REDEEM_USER_B=""
REDEEM_SESSION_A=""
REDEEM_SESSION_B=""
REDEEM_CODE=""
REDEEM_CODE_A=""
REDEEM_CODE_B=""
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5432}"
SMTP_HOST_PORT="${SMTP_HOST_PORT:-1025}"
MAILPIT_HOST_PORT="${MAILPIT_HOST_PORT:-8025}"
REDIS_HOST_PORT="${REDIS_HOST_PORT:-6379}"
export POSTGRES_HOST_PORT SMTP_HOST_PORT MAILPIT_HOST_PORT REDIS_HOST_PORT

cleanup() {
  set +e
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$CELERY_PID" ]] && kill "$CELERY_PID" 2>/dev/null || true
  [[ -n "$BEAT_PID" ]] && kill "$BEAT_PID" 2>/dev/null || true
  if [[ "${STOP_SERVICES:-0}" == "1" && "${#COMPOSE[@]}" -gt 0 ]]; then
    compose down
  fi
  # LOG_DIR is an explicit mktemp directory owned by this run. `rm` keeps the
  # script portable across macOS, Linux, and CI images without requiring a
  # desktop trash utility.
  rm -rf -- "$LOG_DIR"
}
trap cleanup EXIT

podman_args=()
if [[ -n "$PODMAN_CONNECTION" ]]; then
  podman_args=(--connection "$PODMAN_CONNECTION")
fi

if [[ "$COMPOSE_PROVIDER" != "podman" ]] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif [[ "$COMPOSE_PROVIDER" != "docker" ]] && command -v podman-compose >/dev/null 2>&1 && podman-compose version >/dev/null 2>&1; then
  COMPOSE=(podman-compose)
  if [[ -n "$PODMAN_CONNECTION" ]]; then
    # podman-compose appends --podman-args after the subcommand, where
    # Podman treats the global --connection flag as unknown. Use Podman's
    # supported environment variable so every generated command inherits it.
    export CONTAINER_CONNECTION="$PODMAN_CONNECTION"
  fi
elif [[ "$COMPOSE_PROVIDER" != "docker" ]] && command -v podman >/dev/null 2>&1 && podman "${podman_args[@]}" compose version >/dev/null 2>&1; then
  COMPOSE=(podman "${podman_args[@]}" compose)
else
  echo "Docker Compose 또는 Podman Compose가 필요합니다." >&2
  if [[ "$COMPOSE_PROVIDER" == "podman" ]] || {
    ! command -v docker >/dev/null 2>&1 && command -v podman >/dev/null 2>&1;
  }; then
    echo "Podman 연결이 필요하면 PODMAN_CONNECTION=<connection-name>을 지정하세요." >&2
    podman machine list 2>&1 || true
    podman system connection list 2>&1 || true
  fi
  exit 2
fi

echo "Using ${COMPOSE[0]} compose${PODMAN_CONNECTION:+ via $PODMAN_CONNECTION}"

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
wait_for_tcp 127.0.0.1 "$POSTGRES_HOST_PORT"
wait_for_tcp 127.0.0.1 "$SMTP_HOST_PORT"
wait_for_tcp 127.0.0.1 "$REDIS_HOST_PORT"
wait_for_url "http://localhost:${MAILPIT_HOST_PORT}/api/v1/info"

export APP_ENV=development
export DATABASE_URL="postgresql+asyncpg://fanfolio:fanfolio-local-only@localhost:${POSTGRES_HOST_PORT}/fanfolio"
export AUTO_CREATE_SCHEMA=false
export FRONTEND_URL=http://localhost:5173
export FRONTEND_ORIGINS=http://localhost:5173
export MAIL_DELIVERY_MODE=smtp
export MAIL_FROM='Fanfolio <no-reply@localhost>'
export SMTP_HOST=localhost
export SMTP_PORT="$SMTP_HOST_PORT"
export SMTP_USE_TLS=false
export TASK_QUEUE_MODE=celery
export UPLOAD_CLEANUP_INTERVAL_SECONDS="${UPLOAD_CLEANUP_INTERVAL_SECONDS:-1}"
export CELERY_BROKER_URL="redis://localhost:${REDIS_HOST_PORT}/0"
export CELERY_RESULT_BACKEND="redis://localhost:${REDIS_HOST_PORT}/0"
export RATE_LIMIT_BACKEND=redis
export RATE_LIMIT_REDIS_URL="redis://localhost:${REDIS_HOST_PORT}/1"

echo "[2/5] applying PostgreSQL migrations"
(cd "$BACKEND_DIR" && .venv/bin/alembic upgrade head)

echo "[3/5] starting API against PostgreSQL and Mailpit"
(
  cd "$BACKEND_DIR"
  exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
wait_for_url http://localhost:8000/api/health/ready

echo "[3b/5] starting and checking a Celery worker"
(
  cd "$BACKEND_DIR"
  # The smoke worker only verifies broker reachability. `solo` avoids
  # platform-specific prefork behavior on macOS while remaining valid in CI.
  exec .venv/bin/celery -A app.tasks:celery_app worker --loglevel=INFO --pool=solo \
    --hostname=fanfolio-integration@%h
) >"$LOG_DIR/celery.log" 2>&1 &
CELERY_PID=$!
for _ in {1..30}; do
  if grep -F " ready." "$LOG_DIR/celery.log" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$CELERY_PID" 2>/dev/null; then
    echo "Celery worker exited before responding." >&2
    cat "$LOG_DIR/celery.log" >&2
    exit 1
  fi
  sleep 1
done
if ! grep -F " ready." "$LOG_DIR/celery.log" >/dev/null 2>&1; then
  echo "Timed out waiting for the Celery worker to become ready." >&2
  cat "$LOG_DIR/celery.log" >&2
  exit 1
fi
ping_output="$(cd "$BACKEND_DIR" && .venv/bin/celery -A app.tasks:celery_app inspect ping --timeout=5 2>&1 || true)"
if ! grep -F "pong" <<<"$ping_output" >/dev/null; then
  echo "Celery worker did not answer inspect ping." >&2
  printf '%s\n' "$ping_output" >&2
  cat "$LOG_DIR/celery.log" >&2
  exit 1
fi

echo "[3b/5] starting and checking Celery Beat"
(
  cd "$BACKEND_DIR"
  # Keep the scheduler database inside this run's temporary directory so the
  # smoke test never leaves a persistent schedule artifact in the repository.
  exec .venv/bin/celery -A app.tasks:celery_app beat --loglevel=INFO \
    --schedule "$LOG_DIR/celerybeat-schedule"
) >"$LOG_DIR/beat.log" 2>&1 &
BEAT_PID=$!
for _ in {1..30}; do
  if grep -F "beat: Starting" "$LOG_DIR/beat.log" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BEAT_PID" 2>/dev/null; then
    echo "Celery Beat exited before responding." >&2
    cat "$LOG_DIR/beat.log" >&2
    exit 1
  fi
  sleep 1
done
if ! grep -F "beat: Starting" "$LOG_DIR/beat.log" >/dev/null 2>&1; then
  echo "Timed out waiting for Celery Beat to become ready." >&2
  cat "$LOG_DIR/beat.log" >&2
  exit 1
fi
for _ in {1..30}; do
  if grep -F "Sending due task cleanup-expired-uploads" "$LOG_DIR/beat.log" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BEAT_PID" 2>/dev/null; then
    echo "Celery Beat exited before publishing its cleanup schedule." >&2
    cat "$LOG_DIR/beat.log" >&2
    exit 1
  fi
  sleep 1
done
if ! grep -F "Sending due task cleanup-expired-uploads" "$LOG_DIR/beat.log" >/dev/null 2>&1; then
  echo "Celery Beat did not publish the cleanup schedule." >&2
  cat "$LOG_DIR/beat.log" >&2
  exit 1
fi

echo "[3c/5] verifying PostgreSQL redemption concurrency"
read -r REDEEM_USER_A REDEEM_USER_B REDEEM_SESSION_A REDEEM_SESSION_B REDEEM_CODE \
  REDEEM_CODE_A REDEEM_CODE_B < <(cd "$BACKEND_DIR" && .venv/bin/python - <<'PY'
import asyncio
from secrets import token_hex

from app.db.session import SessionLocal
from app.models import Card, Drop, RedeemCode, Role, Session, User


async def main() -> None:
    suffix = token_hex(8)
    user_a = f"integration-a-{suffix}"
    user_b = f"integration-b-{suffix}"
    session_a = f"integration-session-a-{suffix}"
    session_b = f"integration-session-b-{suffix}"
    card_id = f"integration-card-{suffix}"
    drop_id = f"integration-drop-{suffix}"
    code = f"integration-same-{suffix}"
    code_a = f"integration-a-{suffix}"
    code_b = f"integration-b-{suffix}"

    async with SessionLocal() as session:
        session.add_all(
            [
                User(id=user_a, email=f"{user_a}@example.com", role=Role.FAN),
                User(id=user_b, email=f"{user_b}@example.com", role=Role.FAN),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Session(token=session_a, user_id=user_a),
                Session(token=session_b, user_id=user_b),
                Drop(id=drop_id, name="Integration drop", status="live"),
                Card(
                    id=card_id,
                    name="Integration card",
                    status="published",
                    is_official=True,
                    image_url="https://example.test/integration.png",
                    drop_id=drop_id,
                ),
                RedeemCode(code=code, card_id=card_id, drop_id=drop_id, max_uses=1),
                RedeemCode(code=code_a, card_id=card_id, drop_id=drop_id, max_uses=1),
                RedeemCode(code=code_b, card_id=card_id, drop_id=drop_id, max_uses=1),
            ]
        )
        await session.commit()

    print(user_a, user_b, session_a, session_b, code, code_a, code_b)


asyncio.run(main())
PY
)

same_code_dir="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-redeem.XXXXXX")"
same_code_pids=()
for token in "$REDEEM_SESSION_A" "$REDEEM_SESSION_B"; do
  curl -sS -o "$same_code_dir/$token.json" -w '%{http_code}' -X POST \
    http://localhost:8000/api/redemptions \
    -H 'Content-Type: application/json' \
    -H 'X-Fanfolio-Client: fan' \
    -H "X-Fanfolio-Session: $token" \
    -d "{\"code\":\"$REDEEM_CODE\",\"source\":\"qr\"}" \
    >"$same_code_dir/$token.status" &
  same_code_pids+=("$!")
done
for pid in "${same_code_pids[@]}"; do wait "$pid"; done
same_code_statuses="$(cat "$same_code_dir"/*.status | sort | tr '\n' ' ')"
[[ "$same_code_statuses" == *"201"* && "$same_code_statuses" == *"409"* ]] || {
  echo "Expected one 201 and one 409 for the same redeem code, got: $same_code_statuses" >&2
  for response in "$same_code_dir"/*.status "$same_code_dir"/*.json; do
    echo "--- $response" >&2
    cat "$response" >&2
  done
  exit 1
}

different_code_dir="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-redeem.XXXXXX")"
curl -sS -o "$different_code_dir/a.json" -w '%{http_code}' -X POST \
  http://localhost:8000/api/redemptions \
  -H 'Content-Type: application/json' -H 'X-Fanfolio-Client: fan' \
  -H "X-Fanfolio-Session: $REDEEM_SESSION_A" \
  -d "{\"code\":\"$REDEEM_CODE_A\",\"source\":\"qr\"}" \
  >"$different_code_dir/a.status" &
pid_a=$!
curl -sS -o "$different_code_dir/b.json" -w '%{http_code}' -X POST \
  http://localhost:8000/api/redemptions \
  -H 'Content-Type: application/json' -H 'X-Fanfolio-Client: fan' \
  -H "X-Fanfolio-Session: $REDEEM_SESSION_B" \
  -d "{\"code\":\"$REDEEM_CODE_B\",\"source\":\"qr\"}" \
  >"$different_code_dir/b.status" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"
[[ "$(cat "$different_code_dir/a.status")" == "201" && "$(cat "$different_code_dir/b.status")" == "201" ]] || {
  echo "Expected both different redeem codes to succeed." >&2
  for response in "$different_code_dir"/*.status "$different_code_dir"/*.json; do
    echo "--- $response" >&2
    cat "$response" >&2
  done
  exit 1
}

(cd "$BACKEND_DIR" && .venv/bin/python - "$REDEEM_CODE" "$REDEEM_CODE_A" "$REDEEM_CODE_B" <<'PY'
import asyncio
import sys

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import RedeemCode, UserCard


async def main() -> None:
    same_code, code_a, code_b = sys.argv[1:]
    async with SessionLocal() as session:
        used_count = await session.scalar(
            select(RedeemCode.used_count).where(RedeemCode.code == same_code)
        )
        serials = (
            await session.scalars(
                select(UserCard.serial_number)
                .where(
                    UserCard.card_id
                    == select(RedeemCode.card_id)
                    .where(RedeemCode.code == code_a)
                    .scalar_subquery()
                )
            )
        ).all()
        card_count = await session.scalar(
            select(func.count())
            .select_from(UserCard)
            .where(
                UserCard.card_id
                == select(RedeemCode.card_id)
                .where(RedeemCode.code == code_a)
                .scalar_subquery(),
                UserCard.serial_number.in_([1, 2]),
            )
        )
    if used_count != 1 or sorted(serials) != [1, 2, 3] or card_count < 2:
        raise SystemExit(
            f"Unexpected redemption concurrency state: used_count={used_count}, "
            f"serials={serials}, card_count={card_count}"
        )


asyncio.run(main())
PY
)
rm -rf -- "$same_code_dir" "$different_code_dir"

echo "[4/5] verifying Redis reachability"
"$BACKEND_DIR/.venv/bin/python" - <<'PY'
import os
import socket

with socket.create_connection(("127.0.0.1", int(os.environ["REDIS_HOST_PORT"])), timeout=3) as connection:
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
  messages="$(curl -fsS "http://localhost:${MAILPIT_HOST_PORT}/api/v1/messages")"
  if grep -Fq 'integration@example.com' <<<"$messages"; then
    echo "Fanfolio integration smoke test passed."
    exit 0
  fi
  sleep 1
done

echo "Mailpit did not receive the integration message." >&2
cat "$LOG_DIR/api.log" >&2
exit 1
