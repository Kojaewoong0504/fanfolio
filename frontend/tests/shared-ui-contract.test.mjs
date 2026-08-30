import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const referenceCss = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')
const fanGrowthReferenceCss = await readFile(new URL('../src/components/FanGrowthReference.css', import.meta.url), 'utf8')
const qrRedeemCss = await readFile(new URL('../src/components/QrRedeemModal.css', import.meta.url), 'utf8')
const fanPassSource = await readFile(new URL('../src/components/FanPassPage.tsx', import.meta.url), 'utf8')
const fanPassCss = await readFile(new URL('../src/components/FanPassPage.css', import.meta.url), 'utf8')
const missionSource = await readFile(new URL('../src/components/FanMissionPage.tsx', import.meta.url), 'utf8')
const tradeInboxSource = await readFile(new URL('../src/components/TradeInbox.tsx', import.meta.url), 'utf8')

test('app canvas reserves a stable scrollbar gutter and hides browser chrome', () => {
  assert.match(indexCss, /scrollbar-gutter:\s*stable/)
  assert.match(indexCss, /body::-webkit-scrollbar\s*\{[^}]*width:\s*0/s)
  assert.match(indexCss, /scrollbar-width:\s*none/)
})

test('shared app shell and bottom navigation use one five-item geometry contract', () => {
  assert.match(css, /--app-shell-width:\s*430px/)
  assert.match(css, /--bottom-nav-height:\s*74px/)
  assert.match(css, /\.bottom-nav\s*\{[^}]*height:\s*var\(--bottom-nav-height\)/s)
  assert.match(css, /\.bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s)
  assert.match(css, /\.shop-featured-pack\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/s)
  assert.match(css, /\.shop-featured-pack\s*\{[^}]*overflow:\s*clip/s)
})

test('alerts route owns its detail header without duplicating the app header or bottom tabs', () => {
  assert.match(source, /\{tab !== 'alerts' && <header className="app-header">/)
  assert.match(source, /\{tab !== 'alerts' && <BottomNavigation active=\{tab\} onNavigate=\{navigateTab\} \/>\}/)
})

test('card collection controls and four-card grid stay inside the app canvas', () => {
  assert.match(referenceCss, /\.card-collection-catalog\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s)
  assert.match(referenceCss, /\.card-collection-search\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/s)
  assert.match(referenceCss, /\.card-collection-heading\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s)
  assert.match(referenceCss, /\.card-collection-grid\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/s)
})

test('fan pass uses the shared five-tab shop destination', () => {
  assert.match(fanPassSource, /label="상점"/)
  assert.match(fanPassSource, /onNavigate\('shop'\)/)
  assert.doesNotMatch(fanPassSource, /label="마이"/)
})

test('secondary detail routes use the shared detail top bar', () => {
  assert.match(missionSource, /import \{ DetailTopBar \} from '\.\/DetailTopBar'/)
  assert.match(missionSource, /<DetailTopBar title="미션" onBack=/)
  assert.match(tradeInboxSource, /import \{ DetailTopBar \} from '\.\/DetailTopBar'/)
  assert.match(tradeInboxSource, /<DetailTopBar title="거래함" onBack=/)
  assert.match(source, /<DetailTopBar title="알림" onBack=\{onBack\}/)
})

test('mobile detail routes stay on the full viewport canvas', () => {
  assert.match(referenceCss, /@media \(max-width: 600px\)[\s\S]*\.app-shell,[\s\S]*width:\s*100%/)
  assert.match(referenceCss, /@media \(max-width: 600px\)[\s\S]*\.app-shell\.detail-screen-shell,[\s\S]*width:\s*100%/)
  assert.match(referenceCss, /@media \(max-width: 600px\)[\s\S]*\.app-shell,[\s\S]*max-width:\s*none/)
  assert.match(referenceCss, /@media \(max-width: 600px\)[\s\S]*\.bottom-nav\s*\{\s*width:\s*100%/)
  assert.match(referenceCss, /@media \(max-width: 600px\)[\s\S]*\.redeem-flow-screen\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s)
  assert.match(fanGrowthReferenceCss, /@media\(max-width:600px\)[\s\S]*main\.growth-shell\{width:100vw!important;max-width:100vw!important;margin-inline:0!important\}/)
  assert.match(fanPassCss, /@media \(max-width: 600px\)[\s\S]*\.app-shell\.fan-pass-shell\.detail-screen-shell\s*\{[\s\S]*width:\s*100vw;[\s\S]*max-width:\s*100vw;[\s\S]*margin-inline:\s*0;/)
  assert.match(qrRedeemCss, /@media \(max-width: 600px\)[\s\S]*\.redeem-flow-screen\s*\{[\s\S]*width:\s*100vw;[\s\S]*max-width:\s*100vw;[\s\S]*margin-inline:\s*0;/)
})

test('fan growth hero copy stays inside the mobile column', () => {
  assert.match(fanGrowthReferenceCss, /@media\(max-width:430px\)\{[\s\S]*?fan-growth-hero-copy \.fan-growth-artist-art\{width:100%!important;max-width:100%!important\}/)
  assert.match(fanGrowthReferenceCss, /@media\(max-width:430px\)\{[\s\S]*?fan-growth-hero-copy h2\{[^}]*white-space:normal!important/)
  assert.match(fanGrowthReferenceCss, /@media\(max-width:600px\)\{[\s\S]*?fan-growth-hero-copy\{padding-left:0!important;min-width:0!important;max-width:100%!important\}/)
  assert.match(fanGrowthReferenceCss, /@media\(max-width:600px\)\{[\s\S]*?fan-growth-hero-copy h2\{[^}]*white-space:normal!important/)
})

test('mobile QR registration stays within the phone viewport', () => {
  assert.match(qrRedeemCss, /\.redeem-flow-backdrop\s*\{[\s\S]*overflow-x:\s*clip;/)
  assert.match(qrRedeemCss, /@media \(max-width: 430px\)[\s\S]*\.redeem-flow-screen\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*clip;/)
  assert.match(qrRedeemCss, /@media \(max-width: 430px\)[\s\S]*\.redeem-flow-screen > \.detail-topbar\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*margin-right:\s*0;[\s\S]*margin-left:\s*0;/)
})
