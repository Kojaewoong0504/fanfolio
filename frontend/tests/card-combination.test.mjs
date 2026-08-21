import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const clientSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('fan app exposes the published combination policy and completion API', () => {
  assert.match(clientSource, /getCardCombination/)
  assert.match(clientSource, /combineCards/)
  assert.match(appSource, /중복 카드 조합/)
  assert.match(appSource, /조합 결과 확률/)
})

test('combination completion makes the reveal route authoritative over the repository screen', () => {
  assert.match(appSource, /const openReveal = \(userCardId: string\) => \{[\s\S]*?setShowCardCollection\(false\)[\s\S]*?setRevealedCardId\(userCardId\)/)
  assert.ok(appSource.indexOf('if (revealedCardId)') < appSource.indexOf('if (showCardCollection)'))
})
