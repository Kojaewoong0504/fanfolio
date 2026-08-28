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

test('notification items resolve operational destinations and mark themselves read', () => {
  assert.match(source, /notificationDestination\(/)
  assert.match(source, /data-notification-view=/)
  assert.match(source, /data-notification-ticket=/)
  assert.match(source, /data-notification-delivery=/)
  assert.match(source, /openNotification\(notificationId, cardId, view, ticketId, deliveryId\)/)
})

test('point charging operations use a structured package form and compact table', () => {
  assert.match(source, /point-charge-catalog-panel/)
  assert.match(source, /point-package-create-grid/)
  assert.match(source, /point-package-table/)
  assert.match(css, /\.point-charge-catalog-panel/)
  assert.match(css, /\.point-package-create-grid/)
  assert.match(css, /\.point-package-table/)
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
  assert.match(css, /@media \(max-width: 1119px\)[\s\S]*\.review-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.doesNotMatch(source, /function releaseQueue\(/)
})

test('review image fallback keeps readable copy and controls at compact desktop widths', () => {
  assert.match(css, /\.review-detail-panel \.review-effect-card,[\s\S]{0,180}\.review-detail-panel \.review-effect-summary\s*\{[\s\S]{0,100}width:\s*min\(100%,\s*220px\)/)
  assert.match(css, /\.review-detail-panel \.review-effect-card,[\s\S]{0,160}\.review-detail-panel \.review-image\s*\{[\s\S]{0,100}aspect-ratio:\s*2\s*\/\s*3/)
  assert.match(css, /\.review-image-uploads\s*\{[\s\S]{0,240}flex-direction:\s*column/)
  assert.match(css, /\.review-image-upload\s*\{[\s\S]{0,300}white-space:\s*nowrap/)
  assert.doesNotMatch(css, /\.review-detail-panel \.review-effect-card,[\s\S]{0,180}width:\s*min\(100%,\s*120px\)/)
})

test('card packs and shop products expose row-level detail entry points', () => {
  assert.match(source, /data-card-pack-row-id=/)
  assert.match(source, /data-shop-product-row-id=/)
  assert.match(source, /async function loadShopProductDetail\(/)
  assert.match(source, /\/admin\/shop\/products\/\$\{encodeURIComponent\(productId\)\}/)
  assert.match(source, /method: "PATCH"/)
  assert.match(css, /\.card-pack-select-row, \.shop-product-select-row/)
})

test('card row actions render as a viewport popover instead of expanding table rows', () => {
  assert.match(source, /function positionOpenCardActionMenu\(/)
  assert.match(source, /getBoundingClientRect\(\)/)
  assert.match(source, /function activateReviewButton[\s\S]*state\.cardActionMenuId = null/)
  assert.match(css, /\.row-action-menu-popover\s*\{[^}]*position:\s*fixed/s)
  assert.match(css, /\.card-table \.row-actions\s*\{[^}]*width:\s*48px/s)
  assert.ok(
    css.lastIndexOf('.card-table .row-action-menu-popover') > css.lastIndexOf('.row-action-menu-popover { position: absolute'),
    'the production fixed popover rule must finish the cascade after legacy preview styles',
  )
})

test('card review actions protect published cards and expose draft deletion only', () => {
  assert.match(source, /releaseStatus\(card\) === "draft" && can\("cards:write"\)/)
  assert.match(source, /class="row-action-menu-item danger-button delete-draft-card"/)
  assert.match(source, /초안 삭제/)
})

test('card pack composition provides a selectable visual preview rail', () => {
  assert.match(source, /selectedCompositionCardId/)
  assert.match(source, /data-composition-card-id=/)
  assert.match(source, /composition-card-preview/)
  assert.match(source, /data-composition-preview-rarity/)
  assert.match(source, /data-composition-preview-probability/)
})

test('production card pack composition keeps readable columns and a compact validation rail', () => {
  assert.match(source, /composition-card-cell/)
  assert.match(source, /composition-status-panel/)
  assert.match(css, /\.card-operations-page \.composition-table th:first-child,[\s\S]*width:\s*42%/)
  assert.match(css, /\.card-operations-page \.composition-table\s*\{[^}]*display:\s*table;/s)
  assert.match(css, /\.card-operations-page \.composition-table td:first-child\s*\{[^}]*border-right:/s)
  assert.match(css, /\.card-operations-page \.odds-editor-panel\s*\{[^}]*align-self:\s*start/s)
  assert.match(css, /\.composition-status-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s)
})

test('shop and point catalogs use explicit summary, status, and action cells', () => {
  assert.match(source, /shop-product-summary/)
  assert.match(source, /shopProductTypeLabel\(/)
  assert.match(source, /shop-product-manage/)
  assert.match(source, /point-package-product-field/)
  assert.match(source, /point-package-state/)
  assert.match(source, /point-package-schedule-field/)
  assert.match(css, /\.shop-product-summary/)
  assert.match(css, /\.point-package-state/)
})

test('card management action cells keep table row separators aligned', () => {
  assert.match(css, /\.card-table td\.row-actions\s*\{[^}]*display:\s*table-cell[^}]*vertical-align:\s*middle/s)
})

test('card pack composition identifies cards with thumbnail previews', () => {
  assert.match(source, /composition-card-thumbnail/)
  assert.match(source, /state\.cardThumbnailUrls\[card\.cardId\]/)
  assert.match(css, /\.composition-card-thumbnail img/)
})

test('issuance filters render one control border instead of nested borders', () => {
  assert.match(css, /\.production-issuance-page \.card-ops-toolbar > \.admin-select\.filter-select\s*\{[^}]*border:\s*0/s)
  assert.match(css, /\.production-issuance-page \.card-ops-toolbar > \.admin-select\.filter-select \.admin-select-trigger\s*\{[^}]*width:\s*100%/s)
})

test('datetime picker uses the Korean Fanfolio Flatpickr theme', () => {
  assert.match(source, /fanfolioDateTimeLocale/)
  assert.match(source, /time_24hr:\s*true/)
  assert.match(source, /altFormat:\s*"Y년 m월 d일 H:i"/)
  assert.match(source, /fanfolio-calendar/)
  assert.match(css, /\.flatpickr-calendar\.fanfolio-calendar/)
})
