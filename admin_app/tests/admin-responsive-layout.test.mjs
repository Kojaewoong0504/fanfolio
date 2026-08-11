import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

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

test('card creation opens a right drawer and is not rendered as the old inline toolbar', () => {
  assert.match(source, /card-create-drawer/)
  assert.match(source, /open-card-drawer/)
  assert.doesNotMatch(source, /<form class=["']toolbar["'] id=["']admin-card-form["']/)
})

test('card artist choices use the current administrator assignment scope', () => {
  assert.match(source, /assignedArtists/)
  assert.match(source, /scopedArtists/)
})
