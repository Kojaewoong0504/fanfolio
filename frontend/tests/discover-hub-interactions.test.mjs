import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const referenceCss = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')
const discoverSource = source.slice(source.indexOf('function Discover('), source.indexOf('function ArtistHubDetail('))
const artistHubSource = source.slice(source.indexOf('function ArtistHubDetail('), source.indexOf('function notificationTimeLabel('))
const liveArtistRoute = source.slice(source.indexOf('if (discoverArtistSlug)'), source.indexOf('if (showCardCollection)'))

test('discover hub exposes working category and destination controls', () => {
  assert.match(source, /function Discover\(\{ onFindFans, onOpenFanProfile, onOpenPublicCollection, onOpenEvent, onOpenArtist, onOpenPackCatalog, onOpenPack, featuredArtist, featuredEvent, featuredEventLoading/)
  assert.match(source, /searchFans\(''\)/)
  assert.match(source, /<form className="discover-global-search"[^>]*onSubmit=\{submitDiscoverSearch\}/)
  assert.match(source, /onFindFans\(query\)/)
  assert.match(source, /onClick=\{\(\) => onFindFans\(\)\}/)
  assert.match(source, /onOpenFanProfile\(fan\.id\)/)
  assert.match(source, /tabIndex=\{0\} aria-label=\{`\$\{fan\.nickname\}님의 공개 프로필 보기`\}/)
  assert.match(source, /event\.target as HTMLElement\)\.closest\('button, a, input, select, textarea'\)/)
  assert.match(source, /onOpenPublicCollection\(featuredFan\.id\)/)
  assert.match(discoverSource, /<h2>공개 컬렉션<\/h2><button type="button" onClick=\{\(\) => onFindFans\(\)\}/)
  assert.match(source, /onOpenEvent\(displayedFeaturedEvent\)/)
  assert.match(source, /onOpenArtist\(selectedArtist\.id\)/)
  assert.match(source, /onClick=\{onOpenPackCatalog\}/)
  assert.match(source, /const openFeaturedPack = \(\) =>/)
  assert.match(source, /onClick=\{openFeaturedPack\}/)
  assert.doesNotMatch(source, /preview-nebula/)
  assert.match(source, /setActiveCategory/)
  assert.match(source, /aria-selected=\{activeCategory === category\.id\}/)
})

test('discover category tabs reserve one column for every category', () => {
  assert.match(referenceCss, /main\.discover-shell \.discover-categories \{[^}]*grid-template-columns: repeat\(5,minmax\(0,1fr\)\)/)
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

test('authenticated discovery renders fan and collection metadata returned by the API', () => {
  assert.match(discoverSource, /fan\.sharedFavoriteArtists\[0\]\?\.name/)
  assert.match(discoverSource, /featuredFan\.previewCards\.slice\(0, 3\)/)
  assert.match(discoverSource, /featuredFan\.previewCards\.length/)
  assert.doesNotMatch(discoverSource, /공유 아티스트 <b>드림스케이프<\/b>/)
  assert.doesNotMatch(discoverSource, /\[collectionCardHarinGenerated, collectionCardDoyunGenerated, collectionCardMinjaeGenerated\]/)
  assert.doesNotMatch(discoverSource, /드림스케이프 공개 컬렉션/)
})

test('authenticated discovery scopes catalog content to all favorite artists', () => {
  assert.match(discoverSource, /favoriteArtists\?: CatalogArtist\[\]/)
  assert.match(discoverSource, /관심 아티스트 범위/)
  assert.match(discoverSource, /activeArtistId/)
  assert.match(discoverSource, /전체/)
  assert.match(discoverSource, /selectedArtist/)
  assert.match(discoverSource, /visibleFans/)
  assert.match(discoverSource, /getFanEvents\(\{ artistId: activeArtistId/)
  assert.match(discoverSource, /getCardPacks\(artistId\)/)
  assert.match(discoverSource, /getCatalogCards\(\{ artistId: artistId, sort: 'recommended' \}\)/)
})

test('authenticated artist hub loads packs and events for the selected backend artist', () => {
  assert.match(artistHubSource, /getCardPacks\(artist\.id\)/)
  assert.match(artistHubSource, /getFanEvents\(\{ artistId: artist\.id, status: 'all'/)
  assert.match(artistHubSource, /pack\.cards/)
  assert.match(artistHubSource, /artistEvent/)
  assert.match(source, /preview === 'discover-artist'.*usePreviewData/s)
  assert.match(liveArtistRoute, /return <ArtistHubDetail artist=\{artist\}/)
  assert.doesNotMatch(liveArtistRoute, /usePreviewData/)
  assert.match(artistHubSource, /const visibleEvents = usePreviewData \? previewEvents : artistEvents/)
  assert.doesNotMatch(artistHubSource, /<h3>드림스케이프/)
})

test('home and shop keep multi-artist content scoped to the selected favorite artist', () => {
  assert.match(source, /activeHomeArtistId/)
  assert.match(source, /homeVisibleCards/)
  assert.match(source, /homeVisibleEvents/)
  assert.match(source, /favoriteArtists=\{catalogArtists\.filter\(/)
  assert.match(source, /shopFavoriteArtists/)
  assert.match(source, /getShopProducts\(\{ artistId: artist \?\? undefined \}\)/)
})
