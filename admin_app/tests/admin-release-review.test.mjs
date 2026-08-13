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

test('release workflow has review status, notification, and drop-link styles', () => {
  assert.match(css, /review-status-tabs/)
  assert.match(css, /notification-badge/)
  assert.match(css, /drop-link-drawer/)
})

test('card list uses each card source asset for its thumbnail', () => {
  assert.match(source, /cardThumbnailUrls/)
  assert.match(source, /sourceImageUrl/)
  assert.match(source, /URL\.createObjectURL/)
  assert.match(css, /\.card-thumb img/)
})

test('card review route uses the commercial list and detail 검수 workspace', () => {
  assert.match(source, /commercial-review-workspace/)
  assert.match(source, /review-breadcrumb/)
  assert.match(source, /카드\s*>[\s\S]*검수/)
  assert.match(source, /review-status-tabs/)
  assert.match(source, /review-list-heading/)
  assert.match(source, /review-list-panel/)
  assert.match(source, /review-detail-panel/)
  assert.match(source, /review-register-cta/)
  assert.match(source, /cardDeadlineLabel\(card\)/)
  assert.match(source, /cardAssigneeLabel\(card\)/)
  assert.match(source, /card\.status === "pending_review" \|\| \["pending_partner_review", "pending_platform_review"\]/)
  assert.match(source, /selected-review-row/)
  assert.match(css, /\.app-nav[\s\S]*#080d27/)
  assert.match(css, /\.commercial-review-workspace/)
  assert.match(css, /\.review-status-tabs/)
  assert.match(css, /\.selected-review-row/)
  assert.match(css, /@media \(max-width: 1279px\)[\s\S]*\.review-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.doesNotMatch(source, /function releaseQueue\(/)
})
