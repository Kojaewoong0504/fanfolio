import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const topbar = await readFile(new URL('../src/components/DetailTopBar.tsx', import.meta.url), 'utf8').catch(() => '')

test('collection detail routes share the approved detail topbar component', () => {
  assert.match(app, /import \{ DetailTopBar \} from '\.\/components\/DetailTopBar'/)
  assert.match(app, /<DetailTopBar[^>]+title="원하는 카드 등록"/)
  assert.match(app, /<DetailTopBar[^>]+title="카드 컬렉션"/)
  assert.match(app, /<DetailTopBar[^>]+title="팬 컬렉션"/)
  assert.match(topbar, /className="detail-topbar"/)
})

test('fan pass and card registration reuse the shared detail topbar geometry', async () => {
  const fanPass = await readFile(new URL('../src/components/FanPassPage.tsx', import.meta.url), 'utf8')
  const redeem = await readFile(new URL('../src/components/QrRedeemModal.tsx', import.meta.url), 'utf8')
  const redeemCss = await readFile(new URL('../src/components/QrRedeemModal.css', import.meta.url), 'utf8')
  const fanPassCss = await readFile(new URL('../src/components/FanPassPage.css', import.meta.url), 'utf8')
  assert.match(fanPass, /<DetailTopBar[^>]+title=\{isGlobal \? '전체 팬 레벨' : '시즌 패스'\}/)
  assert.match(redeem, /<DetailTopBar[\s\S]*redeem-flow-step-count/)
  assert.match(redeemCss, /\.redeem-flow-screen > \.detail-topbar/)
  assert.match(fanPassCss, /\.fan-pass-shell > \.detail-topbar/)
})

test('fan auth has a social-first landing and separate email recovery destinations', () => {
  assert.match(app, /auth-landing-screen/)
  assert.match(app, /\/login\/email/)
  assert.match(app, /\/signup/)
  assert.match(app, /\/account\/find-id/)
  assert.match(app, /\/account\/reset-password/)
  assert.match(app, /requestFanPasswordReset/)
  assert.match(app, /confirmFanPasswordReset/)
  assert.match(app, /새 비밀번호 확인/)
  assert.doesNotMatch(app, /className="auth-mode" role="tablist"/)
})
