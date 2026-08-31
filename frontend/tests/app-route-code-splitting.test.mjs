import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('heavy secondary fan screens load outside the initial app bundle', () => {
  assert.match(appSource, /lazy\(\(\) => import\('\.\/components\/CardDetail'\)/)
  assert.match(appSource, /lazy\(\(\) => import\('\.\/components\/Settings'\)/)
  assert.match(appSource, /lazy\(\(\) => import\('\.\/components\/QrRedeemModal'\)/)
  assert.match(appSource, /<Suspense fallback=/)
})
