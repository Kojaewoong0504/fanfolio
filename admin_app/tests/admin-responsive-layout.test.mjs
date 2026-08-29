import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

function assertCssMatches(pattern, contract) {
  assert.ok(pattern.test(css), contract)
}

function extractFunction(name) {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `expected ${name} to exist`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`could not extract ${name}`)
}

function reviewRowHarness() {
  const sandbox = { state: { cardActionMenuId: 'card-6' } }
  vm.createContext(sandbox)
  vm.runInContext(
    [
      extractFunction('isReviewRowInteractiveTarget'),
      extractFunction('activateReviewRow'),
      extractFunction('activateReviewButton'),
    ].join('\n'),
    sandbox,
  )
  return sandbox
}

test('page root clips accidental horizontal overflow and layout children can shrink', () => {
  assert.match(css, /overflow-x:\s*clip/)
  assert.match(css, /min-width:\s*0/)
})

test('admin shell keeps the full navigation reachable while dense dashboards stay compact', () => {
  assert.match(css, /\.app-nav nav\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(css, /\.app-nav nav\s*\{[^}]*scrollbar-width:\s*none/s)
  assert.match(css, /\.app-nav nav::-webkit-scrollbar\s*\{[^}]*display:\s*none/s)
  assert.match(css, /\.admin-shell\s*\{[^}]*overflow-x:\s*clip/s)
  assert.match(css, /\.fan-pass-summary\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
  assert.match(css, /\.operational-metrics-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6/s)
  assert.match(css, /\.artist-overview-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
})

test('admin dashboard keeps operational panels in a balanced two-column rhythm', () => {
  assert.match(css, /\.dashboard-grid\s*>\s*\.action-panel\s*\{[^}]*grid-column:\s*1/s)
  assert.match(css, /\.dashboard-grid\s*>\s*\.card-pack-summary\s*\{[^}]*grid-column:\s*2/s)
  assert.match(css, /\.dashboard-grid\s*>\s*\.operational-metrics-panel\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)
})

test('sidecar workspaces preserve readable compact cards at desktop tablet widths', () => {
  assert.match(css, /\.fan-pass-workspace-body \.fan-pass-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2/s)
  assert.match(css, /\.workspace-sidecar-body \.fan-pass-summary \.summary-card\s*\{[^}]*min-width:\s*0/s)
  assert.match(css, /\.event-list-panel > \.compact-toolbar > \.admin-select\.filter-select\s*\{[^}]*min-width:\s*0/s)
  assert.match(css, /\.event-list-panel > \.compact-toolbar \.admin-select-label\s*\{[^}]*overflow:\s*hidden/s)
})

test('large admin collections expose bounded list and interaction contracts', () => {
  assert.match(source, /tablePagination\("issuancePage"/)
  assert.match(source, /data-card-action="delete"/)
  assert.match(source, /function deleteDraftCard\(/)
  assert.match(source, /class="content-calendar-list"/)
  assert.match(css, /\.content-calendar-list \.empty/)
})

test('desktop partner layout uses 208px navigation and 280px directory columns', () => {
  assert.match(css, /208px\s+280px\s+minmax\(0,\s*1fr\)/)
})

test('admin navigation groups operational pages by workflow while keeping card issuance nested', () => {
  assert.match(source, /groupLabels\s*=\s*\{[^}]*콘텐츠 운영/)
  assert.match(source, /groupLabels\s*=\s*\{[^}]*커머스 운영/)
  assert.match(source, /groupLabels\s*=\s*\{[^}]*팬 운영/)
  assert.match(source, /groupLabels\s*=\s*\{[^}]*검수·관제/)
  assert.match(source, /groupLabels\s*=\s*\{[^}]*시스템 관리/)
  assert.match(source, /data-nav-section="\$\{group\}"/)
  assert.match(source, /nav-section-group.*카드 관리/s)
})

test('admin navigation sections can collapse without hiding the current workflow context', () => {
  assert.match(source, /navSectionsCollapsed/)
  assert.match(source, /data-nav-section-toggle="\$\{group\}"/)
  assert.match(source, /aria-expanded="\$\{!collapsed\}"/)
  assert.match(source, /toggleNavigationSection/)
  assert.match(css, /\.nav-section\.collapsed\s+\.nav-section-content\s*\{[^}]*display:\s*none/s)
  assert.match(css, /\.nav-section-toggle\s*\{/)
})

test('new operational forms use the shared control visual contract and sticky action treatment', () => {
  assert.match(css, /\.ops-control,\s*[\s\S]*\.ops-form\s*>\s*input\s*\{/)
  assert.match(css, /\.ops-control:focus-visible,\s*[\s\S]*\.ops-form\s*>\s*input:focus-visible\s*\{/)
  assert.match(css, /\.ops-action-bar\s*\{[^}]*position:\s*sticky/s)
  assert.match(css, /\.toolbar\s*>\s*\.search,[\s\S]*\.card-ops-toolbar\s*>\s*select\s*\{/)
  assert.match(source, /class="[^"]*ops-control/)
  assert.match(source, /shop-product-editor-footer/)
})

test('native selects across older admin workflows inherit the shared control language', () => {
  assertCssMatches(
    /select:not\(\[multiple\]\)\s*\{[^}]*min-height:\s*40px[\s\S]*border-radius:\s*10px/s,
    'legacy native selects keep the same size and radius as newer controls',
  )
  assertCssMatches(
    /select\[multiple\]\s*\{[^}]*border-radius:\s*10px/s,
    'multi-selects keep the same surface treatment without a misleading chevron',
  )
})

test('account and drop creation forms use the shared admin combobox contract', () => {
  assert.match(source, /id: "artist-account-artist"[\s\S]*name: "artistId"/)
  assert.match(source, /id: "drop-artist"[\s\S]*name: "artistId"/)
  assert.doesNotMatch(source, /<select class="search" name="artistId"/)
  assert.doesNotMatch(source, /<select class="filter ops-control" name="artistId"/)
})

test('single-value editors use the shared admin combobox while preserving form names', () => {
  assert.match(source, /function eventConnectionOptions\([\s\S]*adminSelect\(/)
  assert.match(source, /id: "admin-card-rarity"[\s\S]*name: "rarity"/)
  assert.match(source, /id: "campaign-artist"[\s\S]*name: "artistId"/)
  assert.match(source, /id: "fan-pass-preset"[\s\S]*name: "preset"/)
})

test('card operations preview filters and creation forms use the shared combobox contract', () => {
  assert.match(source, /data-preview-filter="cardArtist"[\s\S]*adminSelect|adminSelect\([\s\S]*cardArtist/)
  assert.match(source, /data-preview-filter="packArtist"[\s\S]*adminSelect|adminSelect\([\s\S]*packArtist/)
  assert.match(source, /data-preview-filter="issueType"[\s\S]*adminSelect|adminSelect\([\s\S]*issueType/)
  assert.match(source, /id: "preview-pack-artist"[\s\S]*name: "packArtist"/)
  assert.match(source, /id: "preview-issue-type"[\s\S]*name: "issueType"/)
  assert.doesNotMatch(source, /<select data-preview-filter=/)
  assert.doesNotMatch(source, /<select name="packArtist"/)
  assert.doesNotMatch(source, /<select name="issueType"/)
})

test('administrator account settings is a real view instead of a toast-only placeholder', () => {
  assert.match(source, /settings:\s*settingsView/)
  assert.doesNotMatch(source, /function settingsView\(\)\s*\{\s*return "";/)
  assert.match(source, /state\.view\s*=\s*"settings"[\s\S]*layout\(\)/)
})

test('admin shell exposes global operations search and queue urgency badges', () => {
  assert.match(source, /data-global-search-toggle/)
  assert.match(source, /function globalSearchView\(/)
  assert.match(source, /data-global-search-input/)
  assert.match(source, /data-nav-badge/)
  assert.match(source, /function navigationBadge\(/)
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey[\s\S]*event\.key\.toLowerCase\(\) === "k"/)
})

test('card operations toolbar inputs opt into the shared control contract', () => {
  assert.match(source, /querySelectorAll\("\[data-preview-search\], \[data-preview-filter\], #issuance-search, \[data-issuance-filter\]"\)/)
  assert.match(source, /control\.classList\.add\("ops-control"\)/)
})

test('large admin catalogs expose real pagination state instead of decorative page numbers', () => {
  assert.match(source, /cardPage:\s*1/)
  assert.match(source, /cardPackPage:\s*1/)
  assert.match(source, /issuancePage:\s*1/)
  assert.match(source, /fanPassPage:\s*1/)
  assert.match(source, /function tablePagination\(/)
  assert.match(source, /api\(`\/admin\/card-packs\?\$\{cardPackParams\}`\)/)
  assert.match(source, /async function loadCardPacks\(renderAfter = true\)/)
  assert.match(source, /api\(`\/admin\/cards\?\$\{params\}`\)/)
  assert.match(source, /async function loadCards\(renderAfter = true\)/)
  assert.doesNotMatch(source, /\["\.review-list-panel \.card-table", "cardPage"\]/)
  assert.doesNotMatch(source, /\["\.production-issuance-page \.table", "issuancePage"\]/)
  assert.match(source, /\["\.fan-pass-table", "fanPassPage"\]/)
  assert.match(source, /pageSize:\s*"10"/)
  assert.match(source, /cardPagination\?\.pageSize \?\? 10|pageSize: 10/)
})

test('admin activity labels explain delivery and support events in Korean', () => {
  assert.match(source, /"notification_delivery\.retried":\s*"알림 전달을 재시도했습니다"/)
  assert.match(source, /"support_ticket\.status_changed":\s*"고객센터 문의 상태가 변경되었습니다"/)
})

test('paged card lists keep a complete catalog for dependent operating forms', () => {
  assert.match(source, /cardCatalog:\s*\[\]/)
  assert.match(source, /function cardCatalogItems\(\)/)
  assert.match(source, /async function loadCardCatalog\(\)/)
  assert.match(source, /api\("\/admin\/cards\?page=1&pageSize=100"\)/)
  assert.match(source, /Array\.from\(\{ length: totalPages - 1 \}/)
  assert.match(source, /const cardOptions = cardCatalogItems\(\)\.map/)
  assert.match(source, /const publishedCards = cardCatalogItems\(\)\.filter/)
  assert.match(source, /await loadCardCatalog\(\)/)
})

test('global operations search includes cards outside the visible table page', () => {
  assert.match(source, /function globalSearchRecords\(\)[\s\S]*cardCatalogItems\(\)\.forEach/)
  assert.match(source, /운영자가 현재 불러온 데이터 범위에서 검색합니다/)
})

test('issuance filters use the shared admin select interaction contract', () => {
  assert.match(source, /issuance-status-filter[\s\S]*dataFilter:\s*"status"/)
  assert.match(source, /issuance-type-filter[\s\S]*dataFilter:\s*"type"/)
  assert.match(source, /issuance-period-filter[\s\S]*dataFilter:\s*"period"/)
  assert.match(source, /control\.dataset\.issuanceFilter[\s\S]*state\.issuancePage\s*=\s*1[\s\S]*layout\(\)/)
})

test('drop scheduling controls keep the shared operating form treatment', () => {
  assert.match(source, /id="drop-form"[^>]*class="toolbar"[\s\S]*input class="search ops-control"/)
  assert.match(source, /id="drop-form"[^>]*class="toolbar"[\s\S]*id: "drop-artist"/)
  assert.match(source, /id="drop-form"[^>]*class="toolbar"[\s\S]*type="datetime-local"/)
  assert.match(source, /id="drop-form"[^>]*data-card-id=[\s\S]*input class="ops-control" name="startsAt"/)
  assert.match(source, /id="drop-form"[^>]*data-card-id=[\s\S]*id: "drop-link-artist"/)
})

test('compact desktop and tablet breakpoints collapse navigation and partner directory', () => {
  assert.match(css, /@media\s*\(max-width:\s*1279px\)/)
  assert.match(css, /72px\s+240px\s+minmax\(0,\s*1fr\)/)
  assert.match(css, /@media\s*\(max-width:\s*1023px\)/)
  assert.match(css, /mobile-nav-toggle/)
})

test('narrow viewports ignore persisted collapsed desktop grid state', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*1023px\)[\s\S]*\.admin-shell\.nav-collapsed,\s*\.admin-shell\.nav-collapsed\.partner-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'a persisted collapsed sidebar must not reserve a 72px page column on narrow screens',
  )
  assert.match(
    css,
    /@media\s*\(max-width:\s*1023px\)[\s\S]*\.admin-shell\.nav-collapsed\s+\.app-nav,[\s\S]*\.admin-shell\.nav-collapsed\.partner-layout\s+\.app-nav\s*\{[^}]*position:\s*fixed/,
    'the collapsed sidebar must become an off-canvas navigation on narrow screens',
  )
})

test('mobile tables become vertical records instead of widening the page', () => {
  assert.match(css, /@media\s*\(max-width:\s*767px\)/)
  assert.match(css, /\.responsive-table/)
  assert.match(css, /display:\s*grid/)
})

test('partner member role menu can escape the table row without being clipped', () => {
  assert.match(source, /table-wrap member-table-wrap/)
  assertCssMatches(
    /\.member-table-wrap\s*\{[^}]*overflow:\s*visible/s,
    'allows the role menu to extend below the member table',
  )
  assertCssMatches(
    /\.member-table td:nth-child\(2\)\s*\{[^}]*overflow:\s*visible/s,
    'allows the role menu to extend outside its table cell',
  )
})

test('table roles use compact badges and open a dedicated role editor instead of inline selects', () => {
  assert.match(source, /function accessRoleBadge/)
  assert.match(source, /data-edit-member-role/)
  assert.match(source, /data-edit-user-role/)
  assert.match(source, /function saveRoleChange/)
  assert.doesNotMatch(source, /className: "member-role"/)
  assert.doesNotMatch(source, /className: "role-change"/)
})

test('artist profile reviews keep dense table cells as summaries and edit in a dedicated drawer', () => {
  assert.match(source, /data-edit-artist-profile/)
  assert.match(source, /function artistProfileReviewDrawer/)
  assert.match(source, /id="artist-profile-review-form"/)
  assert.equal(
    (source.match(/document\.querySelector\("#artist-profile-review-form"\)/g) || []).length,
    1,
    'the review form is bound once so a save creates one API request',
  )
  assert.doesNotMatch(source, /className: "artist-profile-artist"/)
  assert.doesNotMatch(source, /className: "artist-profile-status"/)
})

test('root and company workspaces expose their operating boundary in the topbar and artist page', () => {
  assert.match(source, /function scopeContextChip/)
  assert.match(source, /ROOT 운영 영역/)
  assert.match(source, /기업 운영 영역/)
  assert.match(source, /루트 전용 아티스트·스튜디오 운영/)
  assert.match(source, /내 회사 아티스트 운영/)
})

test('form custom selects preserve a hidden form value and do not collapse labels with descriptions', () => {
  assert.match(source, /name = ""/)
  assert.match(source, /admin-select-value/)
  assert.match(source, /option\.dataset\.label/)
  assert.match(source, /hiddenValue\.value = option\.dataset\.value/)
})

test('shared custom selects expose keyboard navigation and combobox state', () => {
  assert.match(source, /admin-select-trigger.*keydown/s)
  assert.match(source, /ArrowDown|ArrowUp/)
  assert.match(source, /Home|End/)
  assert.match(source, /aria-expanded/)
})

test('drop connection and code forms use the reusable form select with client-side empty-state feedback', () => {
  assert.match(source, /id: "drop-link-drop", name: "dropId"/)
  assert.match(source, /id: "batch-card", name: "cardId"/)
  assert.match(source, /id: "batch-drop", name: "dropId"/)
  assert.match(source, /공개 카드와 라이브 드롭을 각각 선택해 주세요/)
})

test('operational list filters use the same accessible custom control as role changes', () => {
  assert.match(source, /className: "filter-select card-artist-filter"/)
  assert.match(source, /className: "filter-select card-status-filter"/)
  assert.match(source, /className: "filter-select user-role-filter"/)
  assert.match(source, /className: "filter-select audit-action-filter"/)
  assert.match(source, /control\.classList\.contains\("card-artist-filter"\)/)
})

test('company administrators can inspect but cannot alter their organization artist scope', () => {
  assert.match(source, /const canManageScope = isRoot\(\)/)
  assert.match(source, /연결된 아티스트 범위 안에서 카드와 드롭을 운영할 수 있습니다/)
  assert.doesNotMatch(source, /루트 관리자 관리 범위/)
  assert.match(source, /canManageScope \? '<button class="primary" id="save-organization-artists"/)
})

test('card creation opens a right drawer and is not rendered as the old inline toolbar', () => {
  assert.match(source, /card-create-drawer/)
  assert.match(source, /open-card-drawer/)
  assert.doesNotMatch(source, /<form class=["']toolbar["'] id=["']admin-card-form["']/)
})

test('card review rows open details from the whole row without double-triggering nested controls', () => {
  assert.match(source, /review-table-row selected-review-row/)
  assert.doesNotMatch(source, /<tr[^`]*role="button"/)
  assert.match(source, /tabindex="0"/)
  assert.match(source, /aria-label="\$\{escapeHtml\(card\.name\)\} 상세 보기"/)
  assert.match(source, /aria-current="\$\{selected \? "true" : "false"\}"/)
  assert.match(source, /data-review-row-id="\$\{escapeHtml\(card\.id\)\}"/)
  assert.match(source, /function activateReviewRow\(/)
  assert.match(source, /event\.key !== "Enter" && event\.key !== " "/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /event\.target\.closest\('button, a, input, select, textarea, label, \[role="button"\]'\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /data-card-action-menu/, 'keeps the more-actions menu in the management cell')
})

test('card review row activation helper handles row keyboard mouse and nested controls', () => {
  const { activateReviewRow, activateReviewButton, state } = reviewRowHarness()
  const calls = []
  const opener = (id) => calls.push(id)
  const row = { dataset: { reviewRowId: 'card-1' } }
  const rowTarget = { closest: () => row }
  const nestedButton = { closest: () => ({ tagName: 'BUTTON' }) }
  let prevented = 0
  let stopped = 0

  assert.equal(activateReviewRow({ currentTarget: row, target: rowTarget }, 'card-1', opener), true)
  assert.deepEqual(calls, ['card-1'])
  assert.equal(activateReviewRow({ currentTarget: row, target: rowTarget, key: 'Enter', preventDefault: () => { prevented += 1 } }, 'card-2', opener), true)
  assert.equal(activateReviewRow({ currentTarget: row, target: rowTarget, key: ' ', preventDefault: () => { prevented += 1 } }, 'card-3', opener), true)
  assert.equal(prevented, 2)
  assert.equal(activateReviewRow({ currentTarget: row, target: rowTarget, key: 'Escape', preventDefault: () => { prevented += 1 } }, 'card-4', opener), false)
  assert.equal(activateReviewRow({ currentTarget: row, target: nestedButton }, 'card-5', opener), false)
  activateReviewButton({ stopPropagation: () => { stopped += 1 } }, 'card-6', opener)
  assert.deepEqual(calls, ['card-1', 'card-2', 'card-3', 'card-6'])
  assert.equal(stopped, 1)
  assert.equal(state.cardActionMenuId, null)
})

test('commercial review workspace keeps a dense master-detail layout at laptop widths', () => {
  assertCssMatches(
    /\.review-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(520px,\s*1fr\)\s+minmax\(320px,\s*420px\)/s,
    'uses a compact list plus 320-420px detail column before tablet stacking',
  )
  assertCssMatches(
    /@media\s*\(max-width:\s*1119px\)[\s\S]*\.review-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'stacks the review workspace when the expanded 208px nav leaves too little content width',
  )
  assert.doesNotMatch(
    css,
    /@media\s*\(max-width:\s*1279px\)\s*\{\s*\.review-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'does not collapse the master-detail review workspace at laptop widths',
  )
  assert.doesNotMatch(
    css,
    /@media\s*\(max-width:\s*1147px\)\s*\{\s*\.review-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'keeps the review workspace two-column at the 1147px screenshot width',
  )
})

test('card review table rows expose visible hover selected and keyboard focus states', () => {
  assertCssMatches(/\.card-table tr\.review-table-row\s*\{[^}]*cursor:\s*pointer/s, 'marks review rows as clickable')
  assertCssMatches(/\.card-table tr\.review-table-row:hover\s*\{[^}]*background:/s, 'shows hover feedback for clickable review rows')
  assertCssMatches(/\.card-table tr\.review-table-row:focus-visible\s*\{[^}]*outline:\s*3px\s+solid/s, 'shows keyboard focus around review rows')
  assertCssMatches(/\.card-table tr\.selected-review-row\s*\{[^}]*box-shadow:\s*inset 3px 0 0 #6357e8/s, 'keeps a persistent selected-row indicator')
})

test('tablet review detail keeps preview and metadata side by side until phone widths', () => {
  assertCssMatches(
    /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1119px\)[\s\S]*\.review-detail-panel\s+\.review-content\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*280px\)\s+minmax\(0,\s*1fr\)/,
    'stacked tablet and narrow laptop detail keeps preview and metadata in two columns',
  )
  assertCssMatches(
    /@media\s*\(max-width:\s*767px\)[\s\S]*\.review-content,[\s\S]*\.review-meta,[\s\S]*\.release-status-grid,[\s\S]*\.snapshot-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'phone layouts stack review preview and metadata',
  )
})

test('card artist choices use the current administrator assignment scope', () => {
  assert.match(source, /assignedArtists/)
  assert.match(source, /scopedArtists/)
})

test('partner list logos render in fixed forty four pixel frames without distortion', () => {
  assertCssMatches(/\.company-avatar\s*\{[^}]*width:\s*44px/s, 'fixes partner list logo frame width at 44px')
  assertCssMatches(/\.company-avatar\s*\{[^}]*height:\s*44px/s, 'fixes partner list logo frame height at 44px')
  assertCssMatches(/\.company-avatar\s*\{[^}]*flex:\s*0\s+0\s+44px/s, 'prevents partner list logo frames from resizing')
  assertCssMatches(/\.company-avatar img\s*\{[^}]*object-fit:\s*contain/s, 'preserves partner logo image aspect ratio')
})

test('partner detail logos render in fixed ninety six pixel frames without distortion', () => {
  assertCssMatches(/\.company-avatar\.large\s*\{[^}]*width:\s*96px/s, 'fixes partner detail logo frame width at 96px')
  assertCssMatches(/\.company-avatar\.large\s*\{[^}]*height:\s*96px/s, 'fixes partner detail logo frame height at 96px')
  assertCssMatches(/\.company-avatar\.large\s*\{[^}]*flex-basis:\s*96px/s, 'prevents partner detail logo frames from resizing')
})

test('partner logo picker has responsive layout styles for narrow admin drawers', () => {
  assertCssMatches(/\.organization-logo-picker/, 'styles the partner logo picker')
  assertCssMatches(
    /@media\s*\(max-width:\s*640px\)[\s\S]*\.organization-logo-picker/,
    'keeps the partner logo picker responsive on narrow drawers',
  )
})
