import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const clientSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectionSource = readFileSync(new URL('../src/components/PublicCollection.tsx', import.meta.url), 'utf8')
const tradeSource = readFileSync(new URL('../src/components/TradeProposal.tsx', import.meta.url), 'utf8')

test('fan app exposes public collection and follow controls', () => {
  assert.match(clientSource, /getPublicCollection/)
  assert.match(clientSource, /followFan/)
  assert.match(clientSource, /unfollowFan/)
  assert.match(collectionSource, /공개 카드 컬렉션/)
  assert.match(collectionSource, /팔로우/)
  assert.match(appSource, /publicCollectionIdFromPath/)
  assert.match(appSource, /<PublicCollection userId=\{publicCollectionUserId\}/)
})

test('fan app exposes trade proposal constraints and submission', () => {
  assert.match(clientSource, /createTradeProposal/)
  assert.match(clientSource, /respondToTradeProposal/)
  assert.match(tradeSource, /기간제·조합·잠금 카드는 거래할 수 없습니다/)
  assert.match(tradeSource, /거래 제안 보내기/)
})
