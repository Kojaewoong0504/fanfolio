import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const clientSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('fan card detail exposes acquisition history from the API', () => {
  assert.match(clientSource, /getUserCardHistory\(userCardId: string\)/)
  assert.match(clientSource, /\/me\/cards\/\$\{encodeURIComponent\(userCardId\)\}\/history/)
  assert.match(appSource, /카드 획득 기록/)
  assert.match(appSource, /card-collection-detail-history/)
})

test('fan app keeps operational card notifications in the shared notification flow', () => {
  assert.match(appSource, /connectNotificationStream/)
  assert.match(appSource, /notifications/)
})
