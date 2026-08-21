import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const redeemSource = await readFile(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8')

test('card acquisition keeps QR and manual redemption on one typed client contract', () => {
  assert.match(clientSource, /export type RedemptionSource = 'qr' \| 'manual'/)
  assert.match(clientSource, /export function redeemCard\(code: string, source: RedemptionSource\)/)
  assert.match(clientSource, /apiFetch<[\s\S]*userCardId[\s\S]*>\('\/redemptions'/)
  assert.match(redeemSource, /redeemCard\(code, source\)/)
  assert.doesNotMatch(redeemSource, /apiFetch<[\s\S]*>\('\/redemptions'/)
})

test('every successful acquisition refreshes collection before entering the reveal route', () => {
  assert.match(appSource, /const handleCardPackOpened[\s\S]*?refreshCollection\(\)[\s\S]*?openReveal\(userCardId\)/)
  assert.match(appSource, /onRedeemed=\{\(id\) => \{ closeRedeem\(\); void Promise\.allSettled\(\[refreshCollection\(\), refreshGrowth\(\)\]\)\.then\(\(\) => openReveal\(id\)\) \}\}/)
})

test('collection responses preserve acquisition and detail fields for the independent card route', () => {
  assert.match(clientSource, /acquisitionSource\?: string \| null/)
  assert.match(clientSource, /designConfig\?: CardDesignConfig \| null/)
  assert.match(clientSource, /voiceAudioUrl: string \| null/)
  assert.match(clientSource, /videoUrl: string \| null/)
  assert.match(clientSource, /handwritingImageUrl: string \| null/)
  assert.match(appSource, /apiFetch<\{ ok: true, data: UserCardDetail \}>\(`\/me\/cards\/\$\{item\.card\.userCardId\}`\)/)
})
