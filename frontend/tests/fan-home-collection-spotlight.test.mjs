import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const cardVisualSource = await readFile(new URL('../src/utils/cardVisual.ts', import.meta.url), 'utf8')

test('home foregrounds the signed-in fan collection and keeps its primary actions working', () => {
  assert.match(appSource, /`member:\$\{card\.memberName/)
  assert.match(appSource, /nickname=\{currentUser\?\.nickname/)
  assert.match(appSource, /새 카드가 도착했어요/)
  assert.match(appSource, /className="collection-spotlight"/)
  assert.match(appSource, /role="progressbar"/)
  assert.match(appSource, /Math\.min\(100, Math\.max\(0, summary\.completionRate\)\)/)
  assert.doesNotMatch(appSource, />UR <i>·<\/i> OFFICIAL</)
  assert.match(appSource, /최근 수집/)
  assert.match(appSource, /className="collection-register-cta"/)
  assert.match(appSource, /<RedeemIcon name="scan"/)
  assert.match(appSource, /onClick=\{onRedeem\}/)
  assert.match(appSource, /onClick=\{\(\) => onSelect\(featured\)\}/)
  assert.match(appSource, /onClick=\{onCollection\}/)
})

test('legacy demo cards use a member-matched first-party portrait', () => {
  assert.match(cardVisualSource, /seed\.includes\('유나'\)/)
  assert.match(cardVisualSource, /return cardYuna/)
  assert.match(cardVisualSource, /seed\.includes\('민호'\)/)
  assert.match(cardVisualSource, /return cardMinho/)
})

test('fan navigation uses five persistent destinations with alerts retained in the header', () => {
  assert.equal([...appSource.matchAll(/<NavItem /g)].length, 5)
  assert.match(appSource, /label="홈"/)
  assert.match(appSource, /label="탐색"/)
  assert.match(appSource, /label="보관함"/)
  assert.match(appSource, /label="팬 레벨"/)
  assert.match(appSource, /label="마이"/)
  assert.match(appSource, /label="탐색"[\s\S]*label="보관함"[\s\S]*label="홈"/)
  assert.match(appSource, /header-alert-button/)
  assert.match(appSource, /navigateTab\('alerts'\)/)
})

test('top header and bottom nav share one geometry across all app tabs', () => {
  assert.match(appCssSource, /\.app-shell\{[\s\S]*padding:18px 22px 118px/)
  assert.match(appCssSource, /\.app-header\{[\s\S]*min-height:58px/)
  assert.match(appCssSource, /\.app-header h1\{[\s\S]*font-size:28px/)
  assert.match(appCssSource, /\.bottom-nav\{[\s\S]*display:grid/)
  assert.match(appCssSource, /\.bottom-nav\{[\s\S]*grid-template-columns:repeat\(5,1fr\)/)
  assert.doesNotMatch(appCssSource, /\.home-shell \.app-header/)
  assert.doesNotMatch(appCssSource, /\.home-shell \.bottom-nav/)
})

test('collection spotlight styles create the selected editorial hierarchy and mobile rail', () => {
  assert.match(appCssSource, /\.collection-spotlight\{/)
  assert.match(appCssSource, /\.collection-spotlight::after/)
  assert.match(appCssSource, /\.collection-progress-track/)
  assert.match(appCssSource, /\.recent-collection-row/)
  assert.match(appCssSource, /overflow-x:auto/)
  assert.match(appCssSource, /\.collection-register-cta/)
  assert.match(appCssSource, /@media\(max-width:360px\)/)
})

test('home surfaces the editorial artist, new cards, and upcoming drop sections', () => {
  assert.match(appSource, /className="home-artist-section"/)
  assert.match(appSource, /관심 아티스트/)
  assert.match(appSource, /className="home-new-cards"/)
  assert.match(appSource, /새로 공개된 카드/)
  assert.match(appSource, /className="home-coming-soon"/)
  assert.match(appSource, /fallbackHomeCards/)
})
