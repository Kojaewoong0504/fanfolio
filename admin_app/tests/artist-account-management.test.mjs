import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('admin keeps a visible list of issued artist studio accounts', () => {
  assert.match(source, /artistAccounts:\s*\[\]/)
  assert.match(source, /api\('\/admin\/artist-accounts'\)/)
  assert.match(source, /아티스트 스튜디오 계정 목록/)
})

test('admin can issue a one-time replacement password for an existing account', () => {
  assert.match(source, /\/artist-accounts\/\$\{[^}]+\}\/reset-password/)
  assert.match(source, /data-artist-reset/)
})

test('hosted admin routes authentication through its same-origin API proxy', async () => {
  assert.doesNotMatch(source, /https:\/\/fanfolio-api\.onrender\.com\/api/)
  assert.match(source, /:\s*'\/api'/)

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
