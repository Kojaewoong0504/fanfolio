import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settingsSource = await readFile(new URL('../src/components/Settings.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const referenceCss = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('my page mirrors the approved profile summary and six-item menu', () => {
  assert.match(settingsSource, /className="my-profile-card"/)
  assert.match(settingsSource, /className="my-profile-stats"/)
  assert.match(settingsSource, /user\.nickname/)
  assert.match(settingsSource, /user\.email/)
  assert.match(settingsSource, /profile-decorate-screen/)
  assert.match(settingsSource, /프로필 꾸미기/)
  assert.match(settingsSource, /저장하고 완료/)
  assert.match(settingsSource, /계정 보안 · 비밀번호 변경/)
  assert.match(settingsSource, /소셜 계정에서 비밀번호와 보안을 관리해요/)
  assert.match(settingsSource, /favoriteArtistIds: profileForm\.artistIds/)
  assert.match(settingsSource, /favoriteMemberIds: profileForm\.memberIds/)
  assert.doesNotMatch(settingsSource, /profile-edit-shortcuts/)
  assert.doesNotMatch(settingsSource, /3,450/)
  assert.doesNotMatch(settingsSource, /@dreamy_0412/)

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

test('my page utility menus open as dedicated mobile screens', () => {
  assert.match(settingsSource, /settings-info-screen/)
  assert.match(settingsSource, /한국어/)
  assert.match(settingsSource, /English/)
  assert.match(settingsSource, /자주 묻는 질문/)
  assert.match(settingsSource, /개인정보의 수집 및 이용/)
  assert.match(settingsSource, /언어 설정[\s\S]*settings-info-screen/)
  assert.match(settingsSource, /고객센터[\s\S]*settings-info-screen/)
  assert.match(settingsSource, /이용 약관[\s\S]*settings-info-screen/)
  assert.match(settingsSource, /개인정보 처리방침[\s\S]*settings-info-screen/)
})

test('profile editor supports searching the artist catalog without losing multi-select state', () => {
  assert.match(settingsSource, /const \[artistQuery, setArtistQuery\] = useState\(''\)/)
  assert.match(settingsSource, /aria-label="아티스트 검색"/)
  assert.match(settingsSource, /artists\.filter\(artist => artist\.name\.toLowerCase\(\)\.includes\(artistQuery\.trim\(\)\.toLowerCase\(\)\)\)/)
})

test('privacy settings expose the persisted consent history contract', () => {
  assert.match(clientSource, /export type ConsentRecord =/)
  assert.match(clientSource, /export function getConsentHistory\(\)/)
  assert.match(clientSource, /export function recordConsent\(/)
  assert.match(clientSource, /\/me\/privacy\/consents/)
  assert.match(settingsSource, /동의 이력/)
  assert.match(settingsSource, /개인정보 동의 기록/)
})

test('settings does not retain a misleading placeholder panel fallback', () => {
  assert.doesNotMatch(settingsSource, /type MyPanel\s*=/)
  assert.doesNotMatch(settingsSource, /useState<MyPanel>/)
  assert.doesNotMatch(settingsSource, /해당 메뉴의 상세 내용은 준비 중입니다\./)
  assert.match(settingsSource, /onNotificationSettings: \(\) => void/)
  assert.match(settingsSource, /onClick=\{onNotificationSettings\}/)
})
