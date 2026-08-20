import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('fan card collection exposes the published pack opening flow', () => {
  assert.match(source, /getCardPackOdds/)
  assert.match(source, /openCardPack/)
  assert.match(source, /팩 열기/)
  assert.match(source, /공개 확률표/)
})

test('a successful pack opening hands the issued user card to the reveal route', () => {
  assert.match(source, /onOpenCard\(opening\.data\.userCardId\)/)
  assert.match(source, /refreshCollection\(\)/)
  assert.match(source, /refreshGrowth\(\)/)
})
