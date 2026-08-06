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
CARD_IMAGE="$ROOT_DIR/frontend/src/assets/hero.png"

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
  # E2E_TMP is an explicit mktemp directory created by this run.
  rm -rf -- "$E2E_TMP"
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
  local output
  output="$("$PWCLI" --session "$PW_SESSION" --raw run-code "async page => { $1 }" 2>&1)" || {
    printf '%s\n' "$output" >&2
    return 1
  }
  if grep -Fq '### Error' <<<"$output"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  printf '%s\n' "$output"
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

echo "[1/5] artist creates a special card with handwriting"
run_code "await page.goto('http://localhost:4175'); await page.getByPlaceholder('artist@fanfolio.com').fill('artist@example.com'); await page.getByRole('button', {name: '로그인 링크 받기'}).click(); await page.getByPlaceholder('artist@fanfolio.com').waitFor({state: 'detached'}); await page.getByPlaceholder('이메일의 로그인 토큰').fill('test-magic-link-artist'); await page.getByRole('button', {name: '스튜디오 입장'}).click(); await page.getByRole('heading', {name: '카드 만들기'}).waitFor(); await page.getByText('● API 연결됨').waitFor();"
run_code "await page.locator('input[name=cardImage]').setInputFiles('${CARD_IMAGE}'); await page.locator('#voice-file').waitFor(); await page.evaluate(() => { const input = document.querySelector('#voice-file'); const transfer = new DataTransfer(); transfer.items.add(new File(['e2e voice'], 'e2e-voice.mp3', {type: 'audio/mpeg'})); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); }); await page.getByText('보이스 파일을 업로드했습니다. 카드를 저장하면 연결됩니다.').waitFor(); await page.getByPlaceholder('카드 이름을 입력하세요').fill('E2E 공식 특별 카드'); await page.locator('select[name=rarity]').selectOption('SR'); await page.locator('input[name=issueLimit]').fill('1'); await page.getByRole('button', {name: '다음: 손글씨'}).click(); await page.getByRole('heading', {name: '손글씨 추가'}).waitFor();"
run_code "const result = await page.evaluate(async () => { const response = await fetch('http://localhost:8000/api/artist/cards', {credentials: 'include', headers: {'X-Fanfolio-Client': 'artist'}}); return response.json(); }); const card = result.data.items.find(item => item.name === 'E2E 공식 특별 카드'); if (!card?.voiceAssetId) throw new Error('voiceAssetId was not attached to the artist card'); if (card.artistId !== 'artist_nova3') throw new Error('artistId was not attached to the artist card');"
run_code "await page.locator('#signature-file').setInputFiles('${CARD_IMAGE}'); await page.getByRole('button', {name: '배경 제거 요청'}).click(); await page.getByText('투명 손글씨가 준비되었습니다.').waitFor({timeout: 15000}); await page.getByRole('button', {name: '배치 저장'}).click(); await page.getByRole('button', {name: '다음: 미리보기'}).click(); await page.getByRole('heading', {name: '카드 미리보기'}).waitFor();"
run_code "await page.locator('#review-note').fill('E2E 전체 여정 검수 요청'); await page.getByRole('button', {name: '검수 요청하기'}).click(); await page.getByRole('heading', {name: '검수 요청 완료'}).waitFor();"
assert_page_contains "검수 요청을 보냈어요"

echo "[2/5] admin reviews and publishes the card"
run_code "await page.goto('http://localhost:4174'); await page.getByPlaceholder('admin@fanfolio.com').fill('admin@example.com'); await page.getByRole('button', {name: '로그인 링크 받기'}).click(); await page.locator('#admin-login-token').waitFor(); await page.locator('#admin-login-token').fill('test-magic-link-admin'); await page.getByRole('button', {name: '운영 센터 들어가기'}).click(); await page.getByRole('heading', {name: '대시보드'}).waitFor(); await page.getByRole('button', {name: /카드 관리/}).click(); await page.getByRole('heading', {name: '운영 카드 등록'}).waitFor(); await page.getByRole('button', {name: '검수하기'}).waitFor(); const catalog = await page.evaluate(async () => { const response = await fetch('http://localhost:8000/api/admin/catalog', {credentials: 'include', headers: {'X-Fanfolio-Client': 'admin'}}); return response.json(); }); if (catalog.data.artists[0].id !== 'artist_nova3') throw new Error('admin catalog was not loaded'); await page.locator('#admin-card-form input[name=name]').fill('E2E 운영 카탈로그 카드'); await page.locator('#admin-card-form input[name=cardImage]').setInputFiles('${CARD_IMAGE}'); await page.locator('#admin-card-form select[name=artistId]').selectOption('artist_nova3'); await page.locator('#admin-card-form select[name=memberId]').selectOption('member_yuna'); await page.locator('#admin-card-form button[type=submit]').click(); await page.getByText('운영 카드를 등록했습니다.').waitFor(); const createdCards = await page.evaluate(async () => { const response = await fetch('http://localhost:8000/api/admin/cards', {credentials: 'include', headers: {'X-Fanfolio-Client': 'admin'}}); return response.json(); }); const createdCard = createdCards.data.items.find((card) => card.name === 'E2E 운영 카탈로그 카드'); if (!createdCard?.imageAssetId) throw new Error('admin card image was not uploaded'); const adminCardRow = page.getByRole('row', {name: /E2E 운영 카탈로그 카드/}); await adminCardRow.getByRole('button', {name: '상세 보기'}).click(); await page.getByRole('img', {name: 'E2E 운영 카탈로그 카드 미리보기'}).waitFor(); await page.locator('#admin-card-edit-form input[name=name]').fill('E2E 운영 카탈로그 카드 수정'); await page.locator('#admin-card-edit-form input[name=issueLimit]').fill('321'); await page.locator('#admin-card-edit-form button[type=submit]').click(); await page.getByText('카드 정보를 수정했습니다.').waitFor(); await page.getByRole('heading', {name: 'E2E 운영 카탈로그 카드 수정'}).waitFor(); await page.getByRole('button', {name: '닫기'}).click();"
run_code "await page.getByRole('button', {name: '검수하기'}).click(); await page.getByRole('heading', {name: 'E2E 공식 특별 카드'}).waitFor(); await page.locator('#review-note').fill('이미지와 손글씨 특전을 확인했습니다.'); await page.getByRole('button', {name: '검수 승인'}).click(); await page.getByText('검수가 승인되었습니다. 공개하기를 누르면 팬에게 카드가 노출됩니다.').waitFor(); await page.locator('button.review-publish').click(); await page.getByText('게시 완료').waitFor(); const publishedRow = page.getByRole('row', {name: /E2E 공식 특별 카드/}); await publishedRow.getByRole('button', {name: '상세 보기'}).click(); await page.getByRole('heading', {name: 'E2E 공식 특별 카드'}).waitFor(); if (await page.locator('#admin-card-edit-form').count() !== 0) throw new Error('published cards must remain read-only'); await page.getByRole('button', {name: '닫기'}).click(); await page.getByRole('button', {name: /대시보드/}).click(); await page.getByText('최근 활동').waitFor(); await page.getByText('카드가 공개되었습니다').waitFor();"
assert_page_contains "카드가 공개되었습니다"

echo "[3/5] admin issues a one-time redeem code"
run_code "await page.getByRole('button', {name: /드롭·코드 관리/}).click(); await page.locator('select[name=cardId]').waitFor(); await page.locator('select[name=cardId]').selectOption({label: 'E2E 공식 특별 카드'}); await page.locator('input[name=quantity]').fill('1'); await page.locator('input[name=maxUsesPerCode]').fill('1'); await page.locator('input[name=expiresAt]').fill('2030-12-31T23:59'); await page.locator('input[name=prefix]').fill('E2E'); await page.getByRole('button', {name: '코드 배치 생성'}).click(); await page.getByText(/배치 batch_/).waitFor(); await page.getByRole('heading', {name: '생성된 코드 배치'}).waitFor(); const generatedBatchRow = page.getByRole('row', {name: /E2E/}).last(); await generatedBatchRow.getByRole('button', {name: '코드 보기'}).click(); await page.getByText('개별 코드 관리').waitFor(); await page.getByText('사용 가능').waitFor(); await page.getByRole('button', {name: '닫기'}).click();"
run_code "const dropRow = page.locator('tr').filter({hasText: 'E2E 종료 드롭'}); await page.locator('#drop-form input[name=name]').fill('E2E 종료 드롭'); await page.locator('#drop-form button[type=submit]').click(); await page.getByText('드롭을 생성했습니다.').waitFor(); await dropRow.locator('button.drop-status[data-status=live]').click(); await page.getByText('드롭을 활성화했습니다.').waitFor(); await page.locator('tr').filter({hasText: 'E2E 종료 드롭'}).locator('button.drop-status[data-status=ended]').click(); await page.getByText('드롭을 종료했습니다.').waitFor();"
REDEEM_CODE="$(run_code "const text = await page.locator('body').innerText(); const batchId = text.match(/batch_[a-z0-9]+/)[0]; const csv = await page.evaluate(async id => { const response = await fetch('http://localhost:8000/api/admin/redeem-code-batches/' + id + '/export', {credentials: 'include', headers: {'X-Fanfolio-Client': 'admin'}}); return response.text(); }, batchId); return csv.split('\\n')[1].split(',')[0];" | tr -d '\r\"')"
if [[ ! "$REDEEM_CODE" =~ ^E2E-[A-Z0-9]+$ ]]; then
  echo "Could not extract the generated redeem code: $REDEEM_CODE" >&2
  exit 1
fi
QR_IMAGE="$E2E_TMP/redeem-code.png"
"$ROOT_DIR/backend/.venv/bin/python" - "$QR_IMAGE" "$REDEEM_CODE" <<'PY'
import sys

import qrcode

output_path, code = sys.argv[1:]
qrcode.make(code).save(output_path)
PY
run_code "await page.evaluate(async code => { const response = await fetch('http://localhost:8000/api/admin/redeem-codes/' + code + '/qr', {credentials: 'include', headers: {'X-Fanfolio-Client': 'admin'}}); if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/png')) throw new Error('admin QR PNG endpoint failed'); }, '${REDEEM_CODE}')"

echo "[4/5] fan redeems the published card and opens its detail"
run_code "await page.goto('http://localhost:5173/?token=test-magic-link-fan'); await page.getByRole('heading', {name: '좋아하는 아티스트를 선택해 주세요'}).waitFor();"
run_code "await page.getByRole('button', {name: '드림스케이프'}).click(); await page.getByRole('button', {name: '유나'}).click(); await page.getByPlaceholder('닉네임을 입력하세요').fill('E2E팬'); await page.getByRole('button', {name: '시작하기'}).click();"
run_code "await page.getByRole('button', {name: '+ 카드 등록'}).click(); await page.getByRole('button', {name: /QR QR 스캔/}).click(); await page.getByText(/이 브라우저에서는 QR 스캔을 지원하지 않습니다|카메라를 사용할 수 없습니다/).waitFor(); await page.getByText('사진으로 QR 읽기').waitFor(); await page.locator('.qr-photo-upload input').setInputFiles('${QR_IMAGE}'); await page.getByText('사진에서 QR 코드가 인식되었습니다.').waitFor(); await page.getByRole('button', {name: '카드 등록하기'}).click(); await page.getByRole('button', {name: '카드 공개하기'}).click(); await page.getByRole('heading', {name: '새 카드가 컬렉션에 추가됐어요'}).waitFor(); await page.locator('img[alt=\"손글씨 특전\"]').waitFor({state: 'attached'});"
assert_page_contains "E2E 공식 특별 카드"
run_code "await page.getByRole('button', {name: '컬렉션으로 이동'}).click(); await page.getByRole('heading', {name: '내 컬렉션'}).waitFor(); await page.getByRole('button', {name: '탐색', exact: true}).click(); await page.getByRole('combobox', {name: '정렬'}).selectOption('rarity'); await page.getByRole('heading', {name: '희귀도 높은 카드'}).waitFor(); await page.getByRole('combobox', {name: '정렬'}).selectOption('recommended'); await page.getByRole('heading', {name: '추천 카드'}).waitFor(); await page.getByRole('button', {name: '설정', exact: true}).click(); await page.getByRole('heading', {name: '설정'}).waitFor(); const emailToggle = page.locator('.preference-row input'); await emailToggle.click(); await page.waitForTimeout(500); if (!(await emailToggle.isChecked())) throw new Error('fan email preference was not saved'); await page.locator('.settings-list button').filter({hasText: '프로필'}).click(); await page.getByRole('heading', {name: '프로필 수정'}).waitFor(); await page.locator('.settings-modal input').fill('E2E 설정팬'); await page.getByRole('button', {name: '저장하기'}).click(); await page.getByRole('heading', {name: '설정'}).waitFor(); await page.getByRole('button', {name: '컬렉션', exact: true}).click(); await page.getByRole('heading', {name: '내 컬렉션'}).waitFor(); await page.getByRole('button', {name: '카드 이미지 #001 유나'}).click(); await page.getByRole('heading', {name: 'E2E 공식 특별 카드'}).waitFor(); await page.locator('audio[aria-label=\"보이스 특전 재생\"]').waitFor({state: 'attached'}); await page.locator('img[alt=\"손글씨 특전\"]').waitFor({state: 'attached'});"
assert_page_contains "QR 스캔"

echo "[5/5] scoped browser sessions remain available across apps"
run_code "await page.goto('http://localhost:4174'); await page.getByRole('heading', {name: '대시보드'}).waitFor(); await page.goto('http://localhost:4175'); await page.getByRole('heading', {name: '카드 만들기'}).waitFor(); await page.getByRole('button', {name: '내 카드'}).click(); await page.getByText('E2E 공식 특별 카드').waitFor(); const publishedRow = page.locator('.studio-card-row').filter({hasText: 'E2E 공식 특별 카드'}); if (await publishedRow.locator('button.card-edit').count() !== 0) throw new Error('published cards must be read-only in the artist studio'); await page.getByRole('button', {name: '팬 반응'}).click(); await page.getByRole('heading', {name: '팬 반응'}).waitFor(); await page.getByText('전체 수집 수').waitFor(); await page.getByText('E2E 공식 특별 카드').waitFor(); await page.locator('[data-studio-view=settings]').click(); await page.getByRole('heading', {name: '설정'}).waitFor(); await page.locator('input[name=nickname]').fill('E2E 아티스트'); await page.locator('#email-enabled').check(); await page.getByRole('button', {name: '변경사항 저장'}).click(); await page.getByText('설정을 저장했습니다.').waitFor(); await page.goto('http://localhost:5173'); await page.getByRole('heading', {name: '내 컬렉션'}).waitFor(); await page.getByRole('button', {name: '카드 이미지 #001 유나'}).click(); await page.getByRole('heading', {name: 'E2E 공식 특별 카드'}).waitFor();"
assert_page_contains "E2E 공식 특별 카드"

echo "Fanfolio browser smoke test passed."
