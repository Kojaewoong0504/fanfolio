import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('discover hub exposes working category and destination controls', () => {
  assert.match(source, /function Discover\(\{ onFindFans, onOpenFanProfile, onOpenPublicCollection, onOpenEvent, onOpenArtist, onOpenPackCatalog, onOpenPack, featuredArtist, featuredEvent, initialFans/)
  assert.match(source, /searchFans\(''\)/)
  assert.match(source, /<form className="discover-global-search"[^>]*onSubmit=\{submitDiscoverSearch\}/)
  assert.match(source, /onFindFans\(query\)/)
  assert.match(source, /onClick=\{\(\) => onFindFans\(\)\}/)
  assert.match(source, /onOpenFanProfile\(fan\.id\)/)
  assert.match(source, /onOpenPublicCollection\(featuredFan\.id\)/)
  assert.match(source, /onOpenEvent\(featuredEvent \?\? null\)/)
  assert.match(source, /onOpenArtist\(featuredArtist\.id\)/)
  assert.match(source, /onClick=\{onOpenPackCatalog\}/)
  assert.match(source, /const openFeaturedPack = \(\) =>/)
  assert.match(source, /onClick=\{openFeaturedPack\}/)
  assert.doesNotMatch(source, /preview-nebula/)
  assert.match(source, /setActiveCategory/)
  assert.match(source, /aria-selected=\{activeCategory === category\.id\}/)
})

test('discover destinations use dedicated routes and detail surfaces', () => {
  assert.match(source, /\/discover\/artists\/\$\{encodeURIComponent\(artistId\)\}/)
  assert.match(source, /\/discover\/packs\//)
  assert.match(source, /pathname === '\/discover\/packs'/)
  assert.match(source, /\/fans\?q=\$\{encodeURIComponent\(query\)\}/)
  assert.match(source, /initialQuery=\{fanSearchQuery\}/)
  assert.match(source, /function ArtistHubDetail\(/)
  assert.match(source, /discoverArtistSlugFromPath/)
  assert.match(source, /discoverPackIdFromPath/)
  assert.match(source, /preview === 'discover-artist'/)
  assert.match(source, /preview === 'discover-pack'/)
  assert.match(source, /preview === 'discover-event'/)
  assert.match(source, /preview === 'public-collection'/)
  assert.match(source, /preview === 'card-collection'.*usePreviewData/s)
})
