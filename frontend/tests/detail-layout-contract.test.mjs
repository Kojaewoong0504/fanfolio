import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const topbar = readFileSync(new URL('../src/components/DetailTopBar.tsx', import.meta.url), 'utf8')
const fanPass = readFileSync(new URL('../src/components/FanPassPage.tsx', import.meta.url), 'utf8')
const fanPassCss = readFileSync(new URL('../src/components/FanPassPage.css', import.meta.url), 'utf8')
const publicCollection = readFileSync(new URL('../src/components/PublicCollection.tsx', import.meta.url), 'utf8')
const tradeComposer = readFileSync(new URL('../src/components/TradeComposer.tsx', import.meta.url), 'utf8')
const missionPage = readFileSync(new URL('../src/components/FanMissionPage.tsx', import.meta.url), 'utf8')
const missionPageCss = readFileSync(new URL('../src/components/FanMissionPage.css', import.meta.url), 'utf8')
const referenceCss = readFileSync(new URL('../src/reference.css', import.meta.url), 'utf8')

test('detail pages use one full-canvas header and content gutter contract', () => {
  assert.match(appCss, /--detail-content-gutter:\s*18px/)
  assert.match(appCss, /--detail-content-start:\s*16px/)
  assert.match(appCss, /\.app-shell\.detail-screen-shell\s*\{[^}]*padding:\s*0\s*!important;/s)
  assert.match(appCss, /\.detail-screen-content\s*\{[^}]*padding:\s*var\(--detail-content-start\) var\(--detail-content-gutter\)/s)

  assert.match(app, /className="app-shell shop-history-shell detail-screen-shell"/)
  assert.match(app, /className="shop-history-content detail-screen-content"/)
  assert.match(app, /className="app-shell reward-inventory-shell detail-screen-shell"/)
  assert.match(app, /className="reward-inventory-screen detail-screen-content"/)
  assert.match(app, /className="app-shell discover-artist-shell detail-screen-shell"/)
  assert.match(app, /<DetailTopBar title="아티스트 홈"/)
  assert.match(app, /className="artist-hub detail-screen-content"/)
  assert.doesNotMatch(app, /discover-detail-topbar/)
  assert.match(app, /tab === 'alerts' \? 'detail-screen-shell' : ''/)
  assert.match(app, /className="alerts-content detail-screen-content"/)
  assert.doesNotMatch(app, /<DetailTopBar title="알림"[^>]*right=/)

  assert.match(publicCollection, /className="app-shell public-collection-screen public-collection-reference detail-screen-shell"/)
  assert.match(publicCollection, /className="public-collection-content detail-screen-content"/)
  assert.match(fanPass, /className="app-shell fan-pass-shell detail-screen-shell"/)
  assert.match(fanPass, /className="fan-pass-content detail-screen-content"/)
  assert.match(tradeComposer, /className="app-shell trade-picker-shell detail-screen-shell"/)
  assert.match(tradeComposer, /className="trade-picker-content detail-screen-content"/)
  assert.match(missionPage, /className="app-shell mission-page-shell detail-screen-shell"/)
  assert.match(missionPage, /className="mission-page-body detail-screen-content"/)
  assert.doesNotMatch(missionPageCss, /\.mission-page-shell\s*\{[^}]*background:\s*#fff/i)
  assert.doesNotMatch(fanPassCss, /margin-(?:right|left):\s*(?:18|14)px/)
  assert.match(referenceCss, /\.public-collection-screen\.detail-screen-shell,[\s\S]*padding:\s*0!important;/)
  assert.match(appCss, /\.public-collection-content\s*>\s*\.public-collection-owner\s*\{[^}]*margin-top:\s*0!important;/)
  assert.doesNotMatch(referenceCss, /\.reward-inventory-screen\s*\{[^}]*padding-top:\s*19px/)
  assert.doesNotMatch(appCss, /\.alerts-shell \.screen > \.detail-topbar/)
})

test('the shared detail header has one title row without route-specific eyebrow labels', () => {
  assert.doesNotMatch(topbar, /eyebrow/)
  assert.doesNotMatch(app, /<DetailTopBar[^>]*eyebrow=/)
  assert.doesNotMatch(publicCollection, /<DetailTopBar[^>]*eyebrow=/)
})
