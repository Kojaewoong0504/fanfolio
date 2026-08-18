import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const imageSource = await readFile(new URL('../src/components/AuthenticatedImage.tsx', import.meta.url), 'utf8')
const fanRouterSource = await readFile(new URL('../../backend/app/routers/fan.py', import.meta.url), 'utf8')
const storageSource = await readFile(new URL('../../backend/app/storage.py', import.meta.url), 'utf8')

test('public fan media uses the browser cache instead of authenticated blob downloads', () => {
  assert.match(clientSource, /isPublicFanMediaPath/)
  assert.match(clientSource, /(?:cards|rewards)/)
  assert.match(imageSource, /isPublicFanMediaPath\(src\)/)
})

test('protected media requests are deduplicated and bounded', () => {
  assert.match(clientSource, /mediaRequestCache/)
  assert.match(clientSource, /MEDIA_REQUEST_TIMEOUT_MS/)
  assert.match(clientSource, /AbortController/)
})

test('fan image responses advertise cacheability for immutable public assets', () => {
  assert.match(storageSource, /Cache-Control.*cache_control/)
  assert.match(fanRouterSource, /cache_control="public, max-age/)
  assert.match(fanRouterSource, /cache_control=/)
})
