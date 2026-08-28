import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const clientSource = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectionSource = readFileSync(new URL('../src/components/PublicCollection.tsx', import.meta.url), 'utf8')
const tradeSource = readFileSync(new URL('../src/components/TradeProposal.tsx', import.meta.url), 'utf8')
const fanHubUrl = new URL('../src/components/FanSocialHub.tsx', import.meta.url)
const tradeInboxUrl = new URL('../src/components/TradeInbox.tsx', import.meta.url)
const tradeComposerUrl = new URL('../src/components/TradeComposer.tsx', import.meta.url)
const fanHubSource = existsSync(fileURLToPath(fanHubUrl)) ? readFileSync(fanHubUrl, 'utf8') : ''
const tradeInboxSource = existsSync(fileURLToPath(tradeInboxUrl)) ? readFileSync(tradeInboxUrl, 'utf8') : ''
const tradeComposerSource = existsSync(fileURLToPath(tradeComposerUrl)) ? readFileSync(tradeComposerUrl, 'utf8') : ''

test('fan app exposes public collection and fan connection controls', () => {
  assert.match(clientSource, /getPublicCollection/)
  assert.match(clientSource, /followFan/)
  assert.match(clientSource, /unfollowFan/)
  assert.match(collectionSource, /공개 컬렉션/)
  assert.match(collectionSource, /교환 가능한 카드/)
  assert.match(appSource, /publicCollectionIdFromPath/)
  assert.match(appSource, /<PublicCollection userId=\{publicCollectionUserId\}/)
  assert.match(clientSource, /searchFans/)
  assert.match(clientSource, /getFanConnections/)
  assert.match(fanHubSource, /팬 찾기/)
  assert.match(fanHubSource, /팔로잉/)
  assert.match(appSource, /pathname === '\/fans'/)
  assert.match(clientSource, /blockFan/)
  assert.match(clientSource, /reportFan/)
  assert.match(fanHubSource + readFileSync(new URL('../src/components/FanPublicProfile.tsx', import.meta.url), 'utf8'), /이 팬 차단/)
  assert.match(readFileSync(new URL('../src/components/FanPublicProfile.tsx', import.meta.url), 'utf8'), /신고 접수/)
})

test('fan app exposes trade proposal constraints and submission', () => {
  assert.match(clientSource, /createTradeProposal/)
  assert.match(clientSource, /respondToTradeProposal/)
  assert.match(tradeSource, /기간제·조합·잠금 카드는 거래할 수 없습니다/)
  assert.match(tradeSource, /거래 제안 보내기/)
  assert.match(clientSource, /getTradeProposals/)
  assert.match(clientSource, /getTradeProposal/)
  assert.match(tradeInboxSource, /받은 제안/)
  assert.match(tradeInboxSource, /보낸 제안/)
  assert.match(tradeInboxSource, /respondToTradeProposal/)
  assert.match(tradeInboxSource, /reportFan/)
  assert.match(tradeInboxSource, /targetType: 'trade'/)
  assert.match(tradeInboxSource, /안전 및 거래 신고/)
  assert.match(tradeComposerSource, /내가 보내는 카드/)
  assert.match(appSource, /pathname === '\/trades'/)
  assert.match(appSource, /pathname === '\/trades\/new'/)
})

test('card repository supports text search and keeps real acquisition metadata', () => {
  assert.match(appSource, /placeholder="카드명·멤버·번호 검색"/)
  assert.match(appSource, /setSearchQuery/)
  assert.match(appSource, /slot\.acquisitionSource/)
  assert.match(appSource, /slot\.acquiredAt/)
})
