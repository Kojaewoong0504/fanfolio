#!/usr/bin/env bash

# Repeatable browser smoke test for the three local Fanfolio surfaces.
#
# This intentionally uses the Playwright CLI instead of adding another test
# framework to the frontend.  The script exercises the same browser cookies,
# CORS headers, and API calls that a user sees in development.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"
PW_SESSION="fanfolio-e2e"
E2E_TMP="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-e2e.XXXXXX")"

BACKEND_PID=""
FRONTEND_PID=""
ADMIN_PID=""
BUILDER_PID=""

cleanup() {
  set +e
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$ADMIN_PID" ]] && kill "$ADMIN_PID" 2>/dev/null || true
  [[ -n "$BUILDER_PID" ]] && kill "$BUILDER_PID" 2>/dev/null || true
  "$PWCLI" --session "$PW_SESSION" close >/dev/null 2>&1 || true
  trash "$E2E_TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to run the Playwright CLI." >&2
  exit 1
fi

if [[ ! -x "$ROOT_DIR/backend/.venv/bin/uvicorn" ]]; then
  echo "backend/.venv/bin/uvicorn is missing; create the backend environment first." >&2
  exit 1
fi

DATABASE_URL="sqlite+aiosqlite:///$E2E_TMP/fanfolio.db" \
STORAGE_DIR="$E2E_TMP/storage" \
APP_ENV=test \
FRONTEND_ORIGINS="http://localhost:5173,http://localhost:4174,http://localhost:4175" \
  "$ROOT_DIR/backend/.venv/bin/uvicorn" app.main:app --app-dir "$ROOT_DIR/backend" \
  --host 127.0.0.1 --port 8000 >"$E2E_TMP/backend.log" 2>&1 &
BACKEND_PID=$!

(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 127.0.0.1 --port 5173 >"$E2E_TMP/frontend.log" 2>&1
) &
FRONTEND_PID=$!

(
  cd "$ROOT_DIR/admin_app"
  python3 -m http.server 4174 --bind 127.0.0.1 >"$E2E_TMP/admin.log" 2>&1
) &
ADMIN_PID=$!

(
  cd "$ROOT_DIR/builder_app"
  python3 -m http.server 4175 --bind 127.0.0.1 >"$E2E_TMP/builder.log" 2>&1
) &
BUILDER_PID=$!

wait_for() {
  local url="$1"
  for _ in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "Timed out waiting for $url" >&2
  exit 1
}

wait_for "http://localhost:8000/api/health"
wait_for "http://localhost:5173"
wait_for "http://localhost:4174"
wait_for "http://localhost:4175"

curl -fsS -X POST "http://localhost:8000/api/test/reset" >/dev/null
curl -fsS -X POST "http://localhost:8000/api/test/seed" \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"core"}' >/dev/null

"$PWCLI" --session "$PW_SESSION" delete-data >/dev/null 2>&1 || true
"$PWCLI" --session "$PW_SESSION" open "http://localhost:5173" >/dev/null

run_code() {
  "$PWCLI" --session "$PW_SESSION" --raw run-code "async page => { $1 }"
}

assert_page_contains() {
  local expected="$1"
  local body
  body="$(run_code 'return await page.locator("body").innerText();')"
  if ! grep -Fq "$expected" <<<"$body"; then
    echo "Expected page text not found: $expected" >&2
    echo "$body" >&2
    exit 1
  fi
}

echo "[1/4] fan login, onboarding, code redemption, and card detail"
run_code "await page.goto('http://localhost:5173'); await page.getByPlaceholder('이메일을 입력하세요').fill('fan@example.com'); await page.getByRole('button', {name: '로그인 링크 받기'}).click(); await page.getByPlaceholder('이메일의 로그인 토큰을 입력하세요').waitFor(); await page.getByPlaceholder('이메일의 로그인 토큰을 입력하세요').fill('test-magic-link-fan'); await page.getByRole('button', {name: '로그인하기'}).click();"
run_code "await page.getByRole('button', {name: '드림스케이프'}).click(); await page.getByRole('button', {name: '유나'}).click(); await page.getByPlaceholder('닉네임을 입력하세요').fill('E2E팬'); await page.getByRole('button', {name: '시작하기'}).click();"
run_code "await page.getByRole('button', {name: '+ 카드 등록'}).click(); await page.getByPlaceholder('예: NOVA-VALID-01').fill('NOVA-VALID-01'); await page.getByRole('button', {name: '카드 등록하기'}).click(); await page.getByRole('button', {name: '카드 공개하기'}).click();"
assert_page_contains "새 카드가 컬렉션에 추가됐어요"
run_code "await page.getByRole('button', {name: '컬렉션으로 이동'}).click(); await page.getByRole('button', {name: '카드 이미지 #001 유나'}).click();"
assert_page_contains "컴백 기념 사인 카드"
assert_page_contains "콘텐츠 코드"

echo "[2/4] admin login and dashboard access"
run_code "await page.goto('http://localhost:4174'); await page.getByPlaceholder('admin@fanfolio.com').fill('admin@example.com'); await page.getByRole('button', {name: '로그인 링크 받기'}).click(); await page.locator('#admin-login-token').waitFor(); await page.locator('#admin-login-token').fill('test-magic-link-admin'); await page.getByRole('button', {name: '운영 센터 들어가기'}).click(); await page.getByRole('heading', {name: '대시보드'}).waitFor();"
assert_page_contains "대시보드"

echo "[3/4] artist login and studio access"
run_code "await page.goto('http://localhost:4175'); await page.getByPlaceholder('artist@fanfolio.com').fill('artist@example.com'); await page.getByRole('button', {name: '로그인 링크 받기'}).click(); await page.getByPlaceholder('artist@fanfolio.com').waitFor({state: 'detached'}); await page.getByPlaceholder('이메일의 로그인 토큰').fill('test-magic-link-artist'); await page.getByRole('button', {name: '스튜디오 입장'}).click(); await page.getByRole('heading', {name: '카드 만들기'}).waitFor();"
assert_page_contains "카드 만들기"

echo "[4/4] scoped browser sessions remain available across apps"
run_code "await page.goto('http://localhost:5173'); await page.getByRole('heading', {name: '내 컬렉션'}).waitFor(); await page.getByRole('button', {name: '카드 이미지 #001 유나'}).click(); await page.getByRole('heading', {name: '컴백 기념 사인 카드'}).waitFor();"
assert_page_contains "내 컬렉션"
assert_page_contains "컴백 기념 사인 카드"

echo "Fanfolio browser smoke test passed."
