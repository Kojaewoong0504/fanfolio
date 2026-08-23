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
  const sandbox = {}
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

test('desktop partner layout uses 208px navigation and 280px directory columns', () => {
  assert.match(css, /208px\s+280px\s+minmax\(0,\s*1fr\)/)
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
  assert.match(source, /class="icon-button review-card"/, 'keeps the existing more button in the management cell')
})

test('card review row activation helper handles row keyboard mouse and nested controls', () => {
  const { activateReviewRow, activateReviewButton } = reviewRowHarness()
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
