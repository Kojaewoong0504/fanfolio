import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')

test('card routes render the detail view as a standalone screen', () => {
  assert.match(appSource, /if \(selectedCard\) \{\s*return <CardDetail/)
  assert.doesNotMatch(appSource, /\{selectedCard && <CardDetail/)
  assert.doesNotMatch(detailSource, /className="detail-backdrop"[^>]*role="presentation"/)
})
