import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('onboarding exposes the approved three-segment progress header', () => {
  assert.match(appSource, /className="onboarding-progress-segments"/)
  assert.match(appSource, /Array\.from\(\{ length: 3 \}/)
  assert.match(appSource, /aria-current=\{index \+ 1 === step \? 'step' : undefined\}/)
})

test('artist and member steps render full visual choice cards', () => {
  assert.match(appSource, /className="onboarding-step-copy"/)
  assert.match(appSource, /className="choice-visual"/)
  assert.match(appSource, /className="choice-check"/)
  assert.match(appSource, /aria-pressed=\{group === artist\.id\}/)
  assert.match(appSource, /aria-pressed=\{member === item\.id\}/)
  assert.match(cssSource, /\.artist-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(cssSource, /\.member-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
})

test('member and nickname steps include the missing reference details', () => {
  assert.match(appSource, /className="selected-artist-summary"/)
  assert.match(appSource, /선택한 아티스트/)
  assert.match(appSource, /className="profile-photo-edit"/)
  assert.match(appSource, /aria-label="프로필 이미지 변경"/)
  assert.match(appSource, /<InlineIcon name="camera"/)
})

test('onboarding actions use a dedicated bottom action rail', () => {
  assert.match(appSource, /className="onboarding-action"/)
  assert.match(cssSource, /\.onboarding-action\{[^}]*margin-top:auto/)
  assert.match(cssSource, /@media\(max-width:360px\)\{[^}]*\.onboarding-screen/s)
})
