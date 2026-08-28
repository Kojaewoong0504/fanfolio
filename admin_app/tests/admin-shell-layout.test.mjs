import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

test('admin dashboard grid keeps sibling panels aligned', () => {
  assert.match(css, /\.dashboard-grid\s*>\s*\.panel\s*\{[^}]*margin-top:\s*0/)
})

test('admin review workbench keeps list and detail panels aligned', () => {
  assert.match(css, /\.review-workbench\s*>\s*\.panel\s*\{[^}]*margin-top:\s*0/)
})

test('admin split workspaces keep sibling panels aligned', () => {
  assert.match(css, /\.card-operations-layout\s*>\s*\.panel[^}]*margin-top:\s*0/s)
  assert.match(css, /\.support-layout\s*>\s*\.panel[^}]*margin-top:\s*0/s)
  assert.match(css, /\.fan-growth-admin-grid\s*>\s*\.panel[^}]*margin-top:\s*0/s)
})

test('admin split workspace definitions preserve stretch alignment after page-specific rules', () => {
  assert.match(css, /\.card-operations-layout\s*\{[^}]*align-items:\s*stretch/s)
  assert.match(css, /\.support-layout\s*\{[^}]*align-items:\s*stretch/s)
  assert.match(css, /\.fan-growth-admin-grid\s*\{[^}]*align-items:\s*stretch/s)
  assert.match(css, /\.card-operations-layout\s*>\s*\.panel,[\s\S]*?align-self:\s*stretch/s)
})

test('admin navigation keeps section labels and items on a shared type scale', () => {
  assert.match(css, /\.nav-section-toggle\s*\{[^}]*font-size:\s*10px/s)
  assert.match(css, /\.nav-item span:last-child\s*\{[^}]*font-size:\s*13px/s)
  assert.match(css, /\.nav-subitem\s*\{[^}]*font-size:\s*12px/s)
})

test('admin navigation starts compact with secondary groups collapsed', () => {
  assert.match(source, /const defaultNavSectionsCollapsed = \{[^}]*content:\s*true/s)
  assert.match(source, /commerce:\s*true/)
  assert.match(source, /fan:\s*true/)
  assert.match(source, /control:\s*true/)
  assert.match(source, /system:\s*true/)
  assert.match(source, /fanfolio\.admin\.navSectionsCollapsed\.v2/)
})

test('admin shell defines a shared type and spacing scale for dense operations', () => {
  assert.match(css, /--space-1:\s*4px/)
  assert.match(css, /--space-2:\s*8px/)
  assert.match(css, /--space-4:\s*16px/)
  assert.match(css, /--text-body:\s*13px/)
  assert.match(css, /--text-meta:\s*11px/)
  assert.match(css, /--text-table:\s*12px/)
  assert.match(css, /--control-height:\s*40px/)
})

test('admin shell applies the shared control and panel density contract', () => {
  assert.match(css, /\.page-content\s*\{[^}]*padding:\s*var\(--space-6\) 28px 40px/s)
  assert.match(css, /\.page-heading h2\s*\{[^}]*font-size:\s*var\(--text-page-title\)/s)
  assert.match(css, /\.panel\s*\{[^}]*padding:\s*var\(--space-4\)/s)
  assert.match(css, /\.field input,[\s\S]*?min-height:\s*var\(--control-height\)/s)
})

test('admin empty detail states stay compact so primary operations remain visible', () => {
  assert.match(css, /\.review-detail-panel\.empty-detail[^}]*min-height:\s*180px/s)
  assert.match(css, /\.card-pack-detail-panel\.empty-detail[^}]*min-height:\s*180px/s)
  assert.match(css, /\.support-layout\s*>\s*\.empty[^}]*min-height:\s*180px/s)
})

test('admin split empty details stretch to their sibling workspace height', () => {
  assert.match(css, /\.review-workbench,[\s\S]*?\.support-layout\s*\{[^}]*align-items:\s*stretch/s)
  assert.match(css, /\.review-workbench\s*>\s*\.review-detail-panel\.empty-detail,[\s\S]*?\.card-operations-layout\s*>\s*\.card-pack-detail-panel\.empty-detail,[\s\S]*?\.support-layout\s*>\s*\.panel\.empty\s*\{[^}]*align-self:\s*stretch[^}]*height:\s*auto/s)
  assert.match(css, /\.review-detail-panel\.empty-detail\s*\{[^}]*max-height:\s*none/s)
})

test('admin dense surfaces use compact metrics, tables, empty states, and drawers', () => {
  assert.match(css, /\.metric\s*\{[^}]*min-height:\s*88px/s)
  assert.match(css, /\.table th\s*\{[^}]*height:\s*34px/s)
  assert.match(css, /\.table td\s*\{[^}]*height:\s*48px/s)
  assert.match(css, /\.inline-empty,\s*\.partner-empty-state\s*\{[^}]*padding:\s*28px 20px/s)
  assert.match(css, /\.drawer-header\s*\{[^}]*padding:\s*var\(--space-4\) 20px/s)
  assert.match(css, /\.drawer-body\s*\{[^}]*padding:\s*var\(--space-4\) 20px/s)
})

test('admin navigation and table content remain readable at compact density', () => {
  assert.match(css, /\.nav-item\s*\{[^}]*min-height:\s*38px/s)
  assert.match(css, /\.table td\s*\{[^}]*font-size:\s*var\(--text-table\)/s)
  assert.match(css, /\.table td small\s*\{[^}]*font-size:\s*var\(--text-meta\)/s)
})

test('event workspaces do not reserve a full viewport for an empty detail pane', () => {
  assert.match(css, /\.event-detail-empty\s*\{[^}]*min-height:\s*180px/s)
  assert.match(css, /\.event-list-panel\s*\{[^}]*min-height:\s*520px/s)
})

test('navigation resets the workspace scroll position after changing pages', () => {
  assert.match(source, /function resetWorkspaceScroll\(\)\s*\{\s*window\.scrollTo\(\{ top: 0, behavior: "instant" \}\);\s*\}/)
  assert.match(source, /state\.mobileNavOpen = false;\s*state\.accountMenuOpen = false;\s*layout\(\);\s*resetWorkspaceScroll\(\);/)
  assert.match(source, /loadSupportTickets\(true\)\.then\(resetWorkspaceScroll\)/)
})
