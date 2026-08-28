import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('admin keeps a visible list of issued artist studio accounts', () => {
  assert.match(source, /artistAccounts:\s*\[\]/)
  assert.match(source, /api\(["']\/admin\/artist-accounts["']\)/)
  assert.match(source, /아티스트 스튜디오 계정 목록/)
})

test('admin can issue a one-time replacement password for an existing account', () => {
  assert.match(source, /\/artist-accounts\/\$\{[^}]+\}\/reset-password/)
  assert.match(source, /data-artist-reset/)
})

test('artist account issuance exposes a browser-copy action for the one-time password', () => {
  assert.match(source, /id="artist-temporary-password"/)
  assert.match(source, /id="copy-artist-temporary-password"/)
  assert.match(source, /artist-temporary-password[\s\S]*navigator\.clipboard\.writeText/)
})

test('artist account issuance refreshes the account list independently of the full dashboard load', () => {
  assert.match(source, /async function loadArtistAccounts\(\)/)
  assert.match(source, /await loadArtistAccounts\(\)/)
  assert.match(source, /state\.artistAccounts = result\.data\.items/)
})

test('artist account issuance can bind the new studio account to an artist catalog', () => {
  assert.match(source, /name="artistId"/)
  assert.match(source, /artist-profiles\/\$\{[^}]+\}/)
  assert.match(source, /verificationStatus: "pending"/)
})

test('service users view passes its declared role options to the select', () => {
  assert.match(source, /const roleOptions = \[/)
  assert.match(source, /id: "user-role-filter"[\s\S]*options: roleOptions/)
})

test('successful admin data loads clear a previously rendered error', () => {
  assert.match(source, /async function loadData\(\) \{\s*state\.error = ""/)
  assert.match(source, /if \(!canViewFanGrowth\(\)[\s\S]*?state\.error = "";\s*\n  \}/)
})

test('hosted admin routes authentication through its same-origin API proxy', async () => {
  assert.doesNotMatch(source, /https:\/\/fanfolio-api\.onrender\.com\/api/)
  assert.match(source, /:\s*["']\/api["']/)

  const config = JSON.parse(
    await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  )
  assert.ok(
    config.routes.some(
      (route) =>
        route.src === '/api/(.*)' &&
        route.dest === 'https://fanfolio-api.onrender.com/api/$1',
    ),
  )
})

test('local admin preview accepts an explicit isolated API origin', () => {
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\(["']api["']\)/)
  assert.match(source, /localApiQuery \|\|/)
})

test('admin keeps the login form hidden while restoring a refresh-cookie session', () => {
  assert.match(source, /restoringSession:\s*true/)
  assert.match(source, /관리자 세션 확인 중/)
  assert.match(source, /state\.restoringSession = false/)
})
