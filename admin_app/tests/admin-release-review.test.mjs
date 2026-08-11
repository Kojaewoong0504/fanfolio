import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

test('admin card detail uses the release workflow stages and review endpoints', () => {
  assert.match(source, /releaseStatus/)
  assert.match(source, /pending_partner_review/)
  assert.match(source, /pending_platform_review/)
  assert.match(source, /review\/partner/)
  assert.match(source, /review\/platform/)
  assert.match(source, /releasePolicy/)
  assert.match(source, /reviewVersion/)
  assert.match(source, /nextAction/)
  assert.doesNotMatch(source, /review-publish/)
})

test('notification bell loads scoped release notifications with unread count', () => {
  assert.match(source, /\/admin\/notifications/)
  assert.match(source, /notification-badge/)
  assert.match(source, /data-open-notification/)
  assert.match(source, /unreadNotificationCount/)
})

test('approved cards are linked to drops instead of directly published', () => {
  assert.match(source, /\/admin\/drops\/\$\{[^}]+}\/cards/)
  assert.match(source, /drop-link-drawer/)
  assert.match(source, /linkApprovedCardToDrop/)
  assert.match(source, /드롭 준비됨/)
  assert.doesNotMatch(source, /review-publish/)
})

test('release workflow has queue, notification, and drop-link styles', () => {
  assert.match(css, /release-queue/)
  assert.match(css, /notification-badge/)
  assert.match(css, /drop-link-drawer/)
})
