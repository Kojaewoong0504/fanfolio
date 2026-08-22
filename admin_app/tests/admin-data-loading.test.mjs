import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('optional card operations metrics cannot block the admin dashboard', () => {
  assert.match(source, /async function loadOptionalOperationalMetrics\(/)
  assert.match(source, /loadOptionalOperationalMetrics\(\)/)
  assert.match(source, /if \(error\.status === 401\) throw error/)
  assert.match(source, /return \{ data: null \}/)
})

test('optional workspace modules cannot block the administrator shell', () => {
  assert.match(source, /async function loadOptionalFanGrowth\(/)
  assert.match(source, /async function loadOptionalOrganizations\(/)
  assert.match(source, /loadOptionalFanGrowth\(\)/)
  assert.match(source, /loadOptionalOrganizations\(\)/)
})

test('admin API errors retain the failing endpoint and status for diagnosis', () => {
  assert.match(source, /error\.path = path/)
  assert.match(source, /HTTP \$\{error\.status\}/)
  assert.match(source, /const endpoint = error\.path/)
})
