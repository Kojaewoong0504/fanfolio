import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const imageSource = await readFile(new URL('../src/components/AuthenticatedImage.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const eventCardSource = await readFile(new URL('../src/components/EventCard.tsx', import.meta.url), 'utf8')
const eventDetailSource = await readFile(new URL('../src/components/EventDetail.tsx', import.meta.url), 'utf8')
const fanRouterSource = await readFile(new URL('../../backend/app/routers/fan.py', import.meta.url), 'utf8')
const storageSource = await readFile(new URL('../../backend/app/storage.py', import.meta.url), 'utf8')
const vercelSource = await readFile(new URL('../vercel.json', import.meta.url), 'utf8')

test('public fan media uses the browser cache instead of authenticated blob downloads', () => {
  const publicMediaMatcher = clientSource.match(/export function isPublicFanMediaPath[\s\S]*?\n}/)?.[0] ?? ''
  assert.match(clientSource, /isPublicFanMediaPath/)
  assert.match(publicMediaMatcher, /(?:cards|rewards)/)
  assert.match(publicMediaMatcher, /events/)
  assert.match(imageSource, /isPublicFanMediaPath\(src\)/)
})

test('home re-entry keeps global events visible without inheriting a growth default', () => {
  assert.doesNotMatch(appSource, /useEffect\(\(\) => \{\s*writeActiveArtistId\(growthArtistId\)\s*\}, \[growthArtistId\]\)/)
  assert.match(appSource, /apiHeroEvents\.filter\(event => !event\.artistId \|\| event\.artistId === activeHomeArtistId\)/)
})

test('protected media requests are deduplicated and bounded', () => {
  assert.match(clientSource, /mediaRequestCache/)
  assert.match(clientSource, /MEDIA_REQUEST_TIMEOUT_MS/)
  assert.match(clientSource, /AUTH_REFRESH_TIMEOUT_MS/)
  assert.match(clientSource, /refreshAccessToken[\s\S]*AUTH_REFRESH_TIMEOUT_MS[\s\S]*auth\/refresh/)
  assert.match(clientSource, /AbortController/)
})

test('fan image responses advertise cacheability for immutable public assets', () => {
  assert.match(storageSource, /Cache-Control.*cache_control/)
  assert.match(fanRouterSource, /cache_control="public, max-age/)
  assert.match(fanRouterSource, /cache_control=/)
})

test('fingerprinted frontend assets are cached immutably at the edge and in the browser', () => {
  assert.match(vercelSource, /"src": "\/assets\/\(\.\*\)"[\s\S]*?"Cache-Control": "public, max-age=31536000, immutable"/)
})

test('event imagery always has a local fallback when remote media is unavailable', () => {
  assert.match(appSource, /<AuthenticatedImage draggable=\{false\} src=\{slide\.event\.heroUrl\} fallback=\{dreamscapeHero\}/)
  assert.match(eventCardSource, /AuthenticatedImage src=\{event\.heroUrl\} fallback=\{dreamscapeDemoAssets\.eventHero\}/)
  assert.match(eventDetailSource, /AuthenticatedImage className="event-detail-hero" src=\{event\.heroUrl\} fallback=\{dreamscapeDemoAssets\.eventHero\}/)
})
