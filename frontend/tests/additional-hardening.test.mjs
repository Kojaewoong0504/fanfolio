import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cardDetailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const workflowSource = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

test('notification destinations prefer the server entity contract and keep kind fallback', () => {
  assert.match(appSource, /function notificationDestination\(item: Pick<NotificationItem, 'kind' \| 'entityType'>\)/)
  assert.match(appSource, /case 'pass_season':/)
  assert.match(appSource, /const destination = notificationDestination\(item\)/)
  assert.match(appSource, /if \(kind === 'card_redeemed'\)/)
  assert.match(clientSource, /entityType\?: string \| null/)
  assert.match(clientSource, /entityId\?: string \| null/)
})

test('card ownership history exposes both action and immutable source', () => {
  assert.match(cardDetailSource, /ownershipActionLabel/)
  assert.match(cardDetailSource, /ownershipSourceLabel/)
  assert.match(cardDetailSource, /event\.sourceType/)
})

test('CI enforces the existing frontend performance budget', () => {
  assert.match(workflowSource, /npm run perf:budget/)
})
