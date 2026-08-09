import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('email login field declares a stable browser autofill contract', () => {
  assert.match(appSource, /id="login-email"[^>]*name="email"/)
  assert.match(appSource, /id="login-email"[^>]*autoComplete="email"/)
  assert.match(appSource, /id="login-email"[^>]*inputMode="email"/)
})

test('browser-injected contact controls cannot escape the email input', () => {
  assert.match(cssSource, /::-webkit-contacts-auto-fill-button/)
  assert.match(cssSource, /::-webkit-credentials-auto-fill-button/)
})
