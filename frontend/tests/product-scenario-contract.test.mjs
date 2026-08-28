import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const _apiSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('fan release scenario uses live pack, redemption, collection, and detail APIs', () => {
  assert.match(appSource, /getCardPacks/)
  assert.match(appSource, /openCardPack/)
  assert.match(readFileSync(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8'), /redeemCard\(code, source\)/)
  assert.match(readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8'), /apiFetch<[\s\S]*userCardId[\s\S]*>\('\/redemptions'/)
  assert.match(readFileSync(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8'), /\/me\/cards\//)
  assert.match(appSource, /\/me\/collection/)
  assert.match(appSource, /refreshCollection/)
  assert.match(appSource, /onOpenCard/)
})

test('the release scenario keeps role handoffs and completion navigation explicit', () => {
  assert.match(appSource, /\/reveal\//)
  assert.match(appSource, /컬렉션에 추가/)
  assert.match(appSource, /보관함에서 카드 보기/)
  assert.match(appSource, /getCardPacks/)
  assert.match(appSource, /refreshCollection/)
})
