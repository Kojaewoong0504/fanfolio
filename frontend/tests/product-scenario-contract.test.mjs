import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('fan release scenario uses live pack, redemption, collection, and detail APIs', () => {
  assert.match(appSource, /getCardPacks/)
  assert.match(appSource, /openCardPack/)
  assert.match(readFileSync(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8'), /apiFetch[\s\S]*\/redemptions/)
  assert.match(readFileSync(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8'), /\/me\/cards\//)
  assert.match(appSource, /\/me\/collection/)
  assert.match(appSource, /refreshCollection/)
  assert.match(appSource, /onOpenCard/)
})
