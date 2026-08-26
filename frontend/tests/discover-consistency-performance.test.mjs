import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/fan-community-reference.css', import.meta.url), 'utf8')
const discoverSource = source.slice(source.indexOf('function Discover('), source.indexOf('function ArtistHubDetail('))
const repositorySource = source.slice(source.indexOf('function CardCollectionRepository('), source.indexOf('function Collection('))
const liveRouteSource = source.slice(source.indexOf("if (!signedIn) {\n    return <Login"), source.indexOf('function tabFromPath('))

test('discover uses the shared shell gutter and keeps compact metadata on one line', () => {
  assert.doesNotMatch(css, /main\.discover-shell\s*\{[^}]*padding-inline:\s*0/s)
  assert.doesNotMatch(css, /main\.app-shell\.discover-shell > header\.app-header\s*\{[^}]*width:\s*calc\(100% - 32px\)/s)
  assert.match(css, /main\.discover-shell \.discover-hub\s*\{[^}]*padding:\s*0 0 110px/s)
  assert.match(css, /\.discover-fan-list em\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/s)
  assert.match(css, /main\.discover-shell \.discover-featured-section \.section-heading button\s*\{[^}]*color:\s*#654cdd[^}]*font-weight:\s*800/s)
  assert.match(discoverSource, /공개 카드 \$\{fan\.ownedCount\}장 보유/)
})

test('discover search submits reliably and resolves every loaded pack before fan fallback', () => {
  assert.match(discoverSource, /enterKeyHint="search"/)
  assert.match(discoverSource, /event\.key === 'Enter'/)
  assert.match(discoverSource, /packs\.find\(pack =>/)
  assert.match(discoverSource, /cards\.find\(card =>/)
  assert.match(discoverSource, /onOpenCard\(toCatalogCard\(matchedCard\)\)/)
  assert.match(discoverSource, /onFindFans\(query\)/)
})

test('discover loads the live card catalog and exposes card loading and empty states', () => {
  assert.match(source, /getCatalogCards/)
  assert.match(source, /seasonName: card\.seasonName/)
  assert.match(source, /issueLimit: card\.issueLimit/)
  assert.match(discoverSource, /cardsLoading/)
  assert.match(discoverSource, /카드를 불러오는 중/)
  assert.match(discoverSource, /공개 카드가 아직 없어요/)
})

test('discover shows loading or honest empty states instead of temporary demo content', () => {
  assert.match(discoverSource, /fansLoading/)
  assert.match(discoverSource, /packsLoading/)
  assert.match(discoverSource, /featuredEventLoading/)
  assert.match(discoverSource, /discover-loading-card/)
  assert.doesNotMatch(discoverSource, /resolveApiUrl\(featuredPack\?\.imageUrl\) \|\| dreamscapeCardPack/)
  assert.doesNotMatch(discoverSource, /resolveApiUrl\(featuredEvent\?\.heroUrl\) \|\| fanWeekNightStage/)
})

test('live card repository never renders preview groups while backend data is pending', () => {
  assert.match(repositorySource, /const repositoryLoading = !usePreviewData && remoteGroups === null/)
  assert.match(repositorySource, /const groups = usePreviewData \? cardCollectionGroups : remoteGroups \?\? \[\]/)
  assert.match(repositorySource, /card-collection-loading/)
  assert.doesNotMatch(repositorySource, /const groups = remoteGroups \?\? cardCollectionGroups/)
})

test('authenticated navigation stays client-side and session boot does not eagerly load every tab', () => {
  assert.match(source, /function navigateAppPath\(/)
  assert.doesNotMatch(liveRouteSource, /window\.location\.assign/)
  assert.match(source, /const refreshUser = useCallback/)
  assert.doesNotMatch(source, /\.then\(\(\) => \{ setSignedIn\(true\); void Promise\.allSettled\(\[refreshCollection\(\), refreshGrowth\(\)\]\) \}\)/)
  assert.match(source, /shouldLoadCollection/)
  assert.match(source, /shouldLoadGrowth/)
})
