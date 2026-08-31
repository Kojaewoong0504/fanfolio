import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')

test('card routes render the detail view as a standalone screen', () => {
  assert.match(appSource, /if \(selectedCard\) \{\s*return <Suspense fallback=\{routeLoading\}><CardDetail/)
  assert.doesNotMatch(appSource, /\{selectedCard && <CardDetail/)
  assert.doesNotMatch(detailSource, /className="detail-backdrop"[^>]*role="presentation"/)
})

test('public catalog cards keep their season and rarity metadata in the detail view', () => {
  assert.match(detailSource, /detail\?\.card\.seasonName \?\? card\.seasonName \?\? '드림스케이프 2026 SPRING'/)
  assert.match(detailSource, /detail\?\.card\.rarity \?\? card\.rarity/)
})

test('card detail exposes a report path for unsafe or incorrect card content', () => {
  assert.match(detailSource, /reportFan/)
  assert.match(detailSource, /targetType: 'card'/)
  assert.match(detailSource, /신고하기/)
})

test('artist card tab opens a public catalog route instead of the owner collection', () => {
  assert.match(appSource, /discoverArtistCardsSlugFromPath/)
  assert.match(appSource, /\/discover\/artists\/\$\{encodeURIComponent\(artist\.id\)\}\/cards/)
  assert.match(appSource, /ArtistCardCatalog/)
})

test('new detail routes reset scroll and keep a stable image fallback', () => {
  assert.match(appSource, /pathname\.startsWith\('\/discover\/artists\/'\)[\s\S]*?window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/)
  assert.match(appSource, /onError=\{event => keepCardVisual\(/)
})
