import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

function assertCssMatches(pattern, contract) {
  assert.ok(pattern.test(css), contract)
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

test('partner member role menu persists a custom-select choice through the member API', () => {
  assert.match(source, /control\.classList\.contains\("member-role"\)/)
  assert.match(source, /updateOrganizationMember\(/)
  assert.match(source, /member-role-/)
})

test('card creation opens a right drawer and is not rendered as the old inline toolbar', () => {
  assert.match(source, /card-create-drawer/)
  assert.match(source, /open-card-drawer/)
  assert.doesNotMatch(source, /<form class=["']toolbar["'] id=["']admin-card-form["']/)
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
