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

test('fan growth request failures cannot hide core administrator data', () => {
  assert.match(source, /async function loadOptionalFanGrowth\(\)[\s\S]*?catch \(error\)/)
  assert.match(source, /await loadOptionalFanGrowth\(\)/)
  assert.match(source, /Optional fan growth data unavailable/)
})

test('root workspace request failures cannot hide core administrator data', () => {
  assert.match(source, /async function loadOptionalAdminRequest\(/)
  assert.match(source, /loadOptionalAdminRequest\("\/admin\/drops"/)
  assert.match(source, /async function loadAllRedeemCodeBatches\(/)
  assert.match(source, /loadAllRedeemCodeBatches\(\)/)
  assert.match(source, /loadOptionalAdminRequest\(`\/admin\/users\?/)
})

test('approved card flow creates a drop inside the card drop-link panel', () => {
  assert.doesNotMatch(source, /id: "drops", label: "드롭 운영"/)
  assert.doesNotMatch(source, /drops: dropsView/)
  assert.match(source, /id="drop-link-form"/)
  assert.match(source, /id="drop-form" data-card-id=/)
  assert.match(source, /async function createDrop\(/)
  assert.match(source, /createDrop\(event\)/)
  assert.match(source, /data-native-datetime/)
  assert.match(source, /input\[type="datetime-local"\]\:not\(\[data-native-datetime\]\)/)
  assert.match(source, /class="secondary submit-drop" data-id=/)
  assert.match(source, /class="primary drop-status" data-id=.*data-status="live"/)
  assert.match(source, /\["approved", "drop_ready"\]\.includes\(status\)/)
})

test('admin API errors retain the failing endpoint and status for diagnosis', () => {
  assert.match(source, /error\.path = path/)
  assert.match(source, /HTTP \$\{error\.status\}/)
  assert.match(source, /const endpoint = error\.path/)
})

test('safe GET requests retry transient network failures during session restoration', () => {
  assert.match(source, /async function fetchWithRetry\(/)
  assert.match(source, /network failure/i)
  assert.match(source, /method === "GET"/)
})

test('admin API requests have bounded timeouts so session restoration cannot hang forever', () => {
  assert.match(source, /AbortController/)
  assert.match(source, /timeoutMs = Number\.isFinite\(options\.timeoutMs\)/)
  assert.match(source, /controller\.abort\(\)/)
  assert.match(source, /timedOut && error\?\.name === "AbortError"/)
  assert.match(source, /timeoutMs: 10000/)
})

test('card registration uses the shared admin select controls for catalog metadata', () => {
  const start = source.indexOf('function cardCreateDrawer()')
  const end = source.indexOf('function rewardOptions', start)
  const drawer = source.slice(start, end)
  assert.match(drawer, /admin-card-artist/)
  assert.match(drawer, /admin-card-member/)
  assert.match(drawer, /admin-card-rarity/)
  assert.doesNotMatch(drawer, /<select name="artistId"/)
  assert.doesNotMatch(drawer, /<select name="memberId"/)
  assert.doesNotMatch(drawer, /<select name="rarity"/)
})
