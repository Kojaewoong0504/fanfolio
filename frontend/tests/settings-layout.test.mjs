import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settingsSource = await readFile(new URL('../src/components/Settings.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('settings keeps profile text centered and logout after all content', () => {
  assert.match(settingsSource, /className="profile-text"/)
  assert.match(settingsSource, /<button className="logout"[\s\S]*<\/button>\s*<\/div>/)
  assert.match(appCssSource, /\.profile-button\{[\s\S]*min-height:76px/)
  assert.match(appCssSource, /\.profile-text\{[\s\S]*align-content:center/)
})

test('settings icons and notification copy keep fixed row geometry', () => {
  assert.match(settingsSource, /className="preference-copy"/)
  assert.match(appCssSource, /\.setting-row-icon\{[\s\S]*flex:0 0 34px/)
  assert.match(appCssSource, /\.setting-row-icon \.nav-icon\{[\s\S]*width:18px/)
  assert.match(appCssSource, /\.preference-row\{[\s\S]*display:grid/)
  assert.match(appCssSource, /\.preference-row\{[\s\S]*grid-template-columns:34px minmax\(0,1fr\) 42px/)
  assert.match(appCssSource, /\.preference-copy\{[\s\S]*align-content:center/)
})
