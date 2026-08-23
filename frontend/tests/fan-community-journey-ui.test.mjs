import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const fanHubSource = readFileSync(new URL('../src/components/FanSocialHub.tsx', import.meta.url), 'utf8')
const publicCollectionSource = readFileSync(new URL('../src/components/PublicCollection.tsx', import.meta.url), 'utf8')
const tradeComposerSource = readFileSync(new URL('../src/components/TradeComposer.tsx', import.meta.url), 'utf8')
const fanProfileUrl = new URL('../src/components/FanPublicProfile.tsx', import.meta.url)
const fanProfileSource = existsSync(fileURLToPath(fanProfileUrl)) ? readFileSync(fanProfileUrl, 'utf8') : ''

test('fan discovery opens a dedicated public fan profile before collection', () => {
  assert.match(fanHubSource, /onOpenProfile/)
  assert.match(fanHubSource, /onOpenCollection/)
  assert.match(fanHubSource, /같은 아티스트/)
  assert.match(fanHubSource, /거래 가능/)
  assert.match(fanHubSource, /찾는 카드 보유/)
  assert.match(fanHubSource, /추천 팬/)
  assert.match(fanHubSource, /총 \{filteredItems\.length\}명/)
  assert.match(fanHubSource, /fan-social-card-preview/)
  assert.match(appSource, /publicFanProfileIdFromPath/)
  assert.match(appSource, /<FanPublicProfile/)
  assert.match(fanProfileSource, /대표 컬렉션/)
  assert.match(fanProfileSource, /컬렉션 진행률/)
  assert.match(fanProfileSource, /교환 가능한 카드/)
  assert.match(fanProfileSource, /팔로우 중인 아티스트/)
  assert.match(fanProfileSource, /팔로워/)
  assert.match(fanProfileSource, /공개 카드/)
  assert.match(fanHubSource, /<InlineIcon name="grid"/)
  assert.match(fanHubSource, /<InlineIcon name="rotate"/)
  assert.doesNotMatch(fanHubSource, /[▣◇⌕‹]/)
})

test('public collection supports discovery filters and a clear trade path', () => {
  assert.match(publicCollectionSource, /정규 1집 · DREAMSCAPE/)
  assert.match(publicCollectionSource, /Nebula Ver\./)
  assert.match(publicCollectionSource, /교환 가능/)
  assert.match(tradeComposerSource, /컬렉션 매칭/)
  assert.match(publicCollectionSource, /공개 컬렉션/)
  assert.match(publicCollectionSource, /교환 가능한 카드/)
  assert.match(publicCollectionSource, /collection\.nickname/)
  assert.match(publicCollectionSource, /collection\.summary\.ownedCount/)
  assert.match(publicCollectionSource, /tradableCards\.length/)
  assert.match(publicCollectionSource, /public-collection-slot missing/)
  assert.match(tradeComposerSource, /내가 보내는 카드/)
  assert.match(tradeComposerSource, /받고 싶은 카드/)
  assert.match(tradeComposerSource, /거래 조건 확인/)
  assert.match(tradeComposerSource, /서로 원하는 카드가 일치했어요/)
  assert.match(tradeComposerSource, /선택한 카드를 확인했어요/)
  assert.match(tradeComposerSource, /<InlineIcon name="puzzle"/)
  assert.match(tradeComposerSource, /<InlineIcon name="shield"/)
  assert.match(tradeComposerSource, /<InlineIcon name="lock"/)
  assert.match(fanProfileSource, /collection\.nickname/)
  assert.match(fanProfileSource, /collection\.summary\.followerCount/)
  assert.match(fanProfileSource, /collection\.summary\.ownedCount/)
  assert.doesNotMatch(tradeComposerSource, /[◆▣⬡]/)
})

test('discover preview follows the selected recommendation dashboard layout', () => {
  assert.match(appSource, /아티스트, 카드팩, 팬을 검색해보세요/)
  assert.match(appSource, /추천 팬/)
  assert.match(appSource, /공개 컬렉션/)
  assert.match(appSource, /새 카드팩/)
  assert.match(appSource, /진행 중인 이벤트/)
})

test('development previews expose every fan community screen independently', () => {
  for (const preview of ['fan-social', 'fan-profile', 'public-collection', 'trade-composer', 'discover-event']) {
    assert.match(appSource, new RegExp(`preview === '${preview}'`))
  }
})

test('authenticated fan community routes use backend data instead of preview injections', () => {
  assert.doesNotMatch(appSource, /isLocalFanAppRoute/)
  assert.doesNotMatch(appSource, /function LocalFanApp\(/)
  assert.doesNotMatch(appSource, /import\.meta\.env\.DEV && !signedIn && isLocalFanAppRoute\(pathname\)/)
  assert.match(appSource, /pathname === '\/fans'/)
  assert.match(appSource, /\/fans\/\$\{encodeURIComponent\(userId\)\}/)
  assert.match(appSource, /\/fans\/\$\{encodeURIComponent\(userId\)\}\/collection/)
  assert.match(appSource, /\/trades\/new\?recipient=/)
  assert.match(fanHubSource, /searchFans\(submittedQuery\)/)
  assert.match(tradeComposerSource, /getPublicCollection\(recipientUserId\)/)
  assert.match(tradeComposerSource, /requestedUserCardIds\.includes\(card\.userCardId\)/)
  assert.doesNotMatch(tradeComposerSource, /const wanted = cards\[1\]/)
})

test('fan community previews avoid nested shell gutters and preserve compact spacing', () => {
  const css = readFileSync(new URL('../src/fan-community-reference.css', import.meta.url), 'utf8')
  assert.match(css, /main\.discover-shell\s*\{[^}]*padding-inline:\s*0/s)
  assert.match(css, /main\.app-shell\.discover-shell > header\.app-header\s*\{[^}]*width:\s*calc\(100% - 32px\)\s*!important[^}]*margin:\s*0 16px 8px\s*!important/s)
  assert.match(css, /main\.fan-social-shell\s*\{[^}]*padding-inline:\s*0/s)
  assert.match(css, /\.fan-social-content\s*\{[^}]*padding:\s*12px 16px 44px/s)
  assert.match(css, /\.fan-social-tags \.inline-icon\s*\{[^}]*width:\s*12px/s)
  assert.match(css, /\.discover-collection-ownerline/)
  assert.match(css, /\.discover-fan-list article > \.discover-fan-profile\s*\{[^}]*height:\s*auto/s)
  assert.match(css, /@keyframes trade-card-float/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

test('fan community visuals keep icons, avatars, chips, and motion aligned with the reference', () => {
  const css = readFileSync(new URL('../src/fan-community-reference.css', import.meta.url), 'utf8')

  assert.match(fanProfileSource, /<InlineIcon name="rotate"/)
  assert.match(fanProfileSource, /<InlineIcon name="grid"/)
  assert.doesNotMatch(fanProfileSource, /[⇆▣⟳]/)

  assert.equal((tradeComposerSource.match(/className="trade-card-visual"/g) ?? []).length, 2)
  assert.match(css, /\.discover-fan-list \.profile-avatar\s*\{[^}]*border-radius:\s*50%/s)
  assert.match(css, /main\.discover-shell \.discover-fans-section \.section-heading button\s*\{[^}]*color:\s*#654cdd[^}]*font-weight:\s*800/s)
  assert.match(css, /\.fan-social-tags i\s*\{[^}]*display:\s*inline-flex[^}]*width:\s*auto/s)
  assert.match(css, /\.fan-profile-panel \.section-heading\s*\{[^}]*margin:\s*0 0 12px/s)
  assert.match(css, /\.fan-profile-tradable-cards \.more \.inline-icon\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/s)
  assert.match(css, /\.fan-profile-summary > div > span\s*\{[^}]*width:\s*42px[^}]*border-radius:\s*50%[^}]*background:\s*#f1eeff/s)
  assert.match(css, /\.fan-profile-summary > div > span \.inline-icon\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/s)
  assert.match(css, /\.trade-match-cards > article \.trade-card-visual\s*\{[^}]*animation:\s*trade-card-float/s)
  assert.doesNotMatch(css, /\.trade-match-cards > article\s*\{[^}]*animation:\s*trade-card-float/s)
})

test('secondary fan-community controls have real destinations or state changes', () => {
  assert.match(fanProfileSource, /onOpenArtist/)
  assert.match(fanProfileSource, /onClick=\{\(\) => onOpenArtist/)
  assert.match(publicCollectionSource, /onOpenPackCatalog/)
  assert.match(publicCollectionSource, /featuredPackId/)
  assert.match(publicCollectionSource, /public-collection-season[^>]*onClick=\{\(\) => onOpenPackCatalog\(collection\.featuredPackId \?\? undefined\)\}/)
  assert.match(tradeComposerSource, /selectedOfferedUserCardId/)
  assert.match(tradeComposerSource, /selectNextOfferedCard/)
  assert.match(tradeComposerSource, /onClick=\{selectNextOfferedCard\}/)
  assert.doesNotMatch(tradeComposerSource, /<button type="button">다른 카드로 변경/)
  assert.match(appSource, /onOpenArtist=\{artistId => window\.location\.assign/)
  assert.match(appSource, /const openPublicPackCatalog = \(packId\?: string\) =>/)
  assert.match(appSource, /onOpenPackCatalog=\{openPublicPackCatalog\}/)
  assert.match(appSource, /\/discover\/packs\/\$\{encodeURIComponent\(packId\)\}/)
})

test('live fan discovery renders backend metadata and applies each filter', () => {
  assert.match(fanHubSource, /favoriteArtists/)
  assert.match(fanHubSource, /tradableCount/)
  assert.match(fanHubSource, /matchingWishlistCount/)
  assert.match(fanHubSource, /latestCardAt/)
  assert.match(fanHubSource, /previewCards/)
  assert.match(fanHubSource, /filteredItems/)
  assert.match(fanHubSource, /onOpenTrades\(fan\.id\)/)
  assert.doesNotMatch(fanHubSource, /const fanMeta =/)
  assert.doesNotMatch(fanHubSource, /const previewCards =/)
})

test('trade composer submits the displayed requested card once', () => {
  assert.match(tradeComposerSource, /effectiveRequestedUserCardIds/)
  assert.match(tradeComposerSource, /requestedUserCardIds:\s*effectiveRequestedUserCardIds/)
  assert.match(tradeComposerSource, /submitting/)
  assert.match(tradeComposerSource, /if \(!mine \|\| !wanted \|\| !confirmed \|\| submitting\) return/)
  assert.match(tradeComposerSource, /disabled=\{!confirmed \|\| submitting\}/)
})

test('fan-community routes preserve a validated return destination', () => {
  assert.match(appSource, /safeAppReturnPath/)
  assert.match(appSource, /routeWithReturnTo/)
  assert.match(appSource, /returnTo/)
  assert.match(appSource, /window\.history\.replaceState\(\{\}, '', '\/fans'\)/)
})
