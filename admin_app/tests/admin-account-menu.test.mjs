import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('desktop navigation can be expanded and keeps logout reachable', () => {
  assert.match(source, /navCollapsed/)
  assert.match(source, /id="desktop-nav-toggle"/)
  assert.match(source, /id="logout"/)
})

test('top avatar opens account actions instead of being a passive span', () => {
  assert.match(source, /id="account-menu-toggle"/)
  assert.match(source, /id="account-password-change"/)
  assert.match(source, /id="account-logout"/)
})

test('company scope does not render misleading root ownership labels', () => {
  assert.doesNotMatch(source, /내 회사 운영 범위/)
  assert.doesNotMatch(source, /루트 관리자 관리 범위/)
})
