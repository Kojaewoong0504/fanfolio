import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settingsSource = await readFile(new URL('../src/components/Settings.tsx', import.meta.url), 'utf8')
const referenceCss = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('my page mirrors the approved profile summary and six-item menu', () => {
  assert.match(settingsSource, /className="my-profile-card"/)
  assert.match(settingsSource, /className="my-profile-stats"/)
  assert.match(settingsSource, /드리미/)
  assert.match(settingsSource, /@dreamy_0412/)
  assert.match(settingsSource, /LV\. 12/)
  assert.match(settingsSource, /3,450/)

  for (const label of ['나의 이벤트', '알림 설정', '언어 설정', '고객센터', '이용 약관', '개인정보 처리방침']) {
    assert.match(settingsSource, new RegExp(label))
  }

  assert.equal((settingsSource.match(/className="my-setting-row"/g) ?? []).length, 6)
  assert.match(settingsSource, /className="my-logout"/)
})

test('my page uses compact reference geometry instead of legacy setting rows', () => {
  assert.match(referenceCss, /\.my-profile-main\s*\{[\s\S]*grid-template-columns:\s*112px minmax\(0,\s*1fr\) 20px/)
  assert.match(referenceCss, /\.my-profile-image\s*\{[\s\S]*width:\s*112px[\s\S]*height:\s*112px/)
  assert.match(referenceCss, /\.my-setting-row\s*\{[\s\S]*min-height:\s*58px/)
  assert.match(referenceCss, /\.my-settings-list\s*\{[\s\S]*border-radius:\s*20px/)
  assert.match(referenceCss, /\.my-logout\s*\{[\s\S]*height:\s*49px/)
})
