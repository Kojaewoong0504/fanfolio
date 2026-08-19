import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const referenceCssSource = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('collection exposes a pass reward inventory entry backed by claimed rewards', () => {
  assert.match(appSource, /className="collection-reward-inventory-entry"/)
  assert.match(appSource, /패스 보상 인벤토리/)
  assert.match(appSource, /팬 패스에서 받은 아이템을 장착하고 사용해요/)
  assert.match(appSource, /claimedRewards\.filter\(reward => reward\.claimedAt\)/)
  assert.match(appSource, /onRewards=\{openRewardInventory\}/)
})

test('reward inventory has a dedicated collection route and returns to the collection', () => {
  assert.match(appSource, /window\.location\.pathname === '\/collection\/rewards'/)
  assert.match(appSource, /window\.history\.pushState\(\{\}, '', '\/collection\/rewards'\)/)
  assert.match(appSource, /window\.history\.replaceState\(\{\}, '', '\/collection'\)/)
  assert.match(appSource, /if \(pathname === '\/collection\/rewards'\) return 'collection'/)
  assert.match(appSource, /<RewardInventory/)
})

test('reward inventory filters real claimed rewards and connects equipment changes', () => {
  assert.match(appSource, /function RewardInventory\(/)
  assert.match(appSource, /보유 보상/)
  assert.match(appSource, /현재 장착 중/)
  assert.match(appSource, /전체.*배지.*디지털 보너스.*프로필/s)
  assert.match(appSource, /updateProfileEquipment/)
  assert.match(appSource, /onEquip=\{saveGrowthEquipment\}/)
  assert.match(appSource, /rewardArtworkUrl\(reward\)/)
  assert.match(appSource, /<div><h1>패스 보상<\/h1><\/div>/)
  assert.match(appSource, /장착하기/)
  assert.match(appSource, /장착 해제/)
})

test('pass reward claim completes the grant, refreshes growth, and refreshes notifications', () => {
  assert.match(appSource, /const rewardGrant = result\.data\.rewardGrant/)
  assert.match(appSource, /if \(rewardGrant && !rewardGrant\.claimedAt\) await claimReward\(rewardGrant\.id\)/)
  assert.match(appSource, /fanfolio:refresh-notifications/)
})

test('approved mobile inventory composition is styled inside the shared app shell', () => {
  assert.match(referenceCssSource, /Pass reward inventory/)
  assert.match(referenceCssSource, /\.collection-reward-inventory-entry/)
  assert.match(referenceCssSource, /\.reward-inventory-shell/)
  assert.match(referenceCssSource, /\.reward-inventory-grid/)
  assert.match(referenceCssSource, /grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(referenceCssSource, /\.reward-inventory-tabs\s*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s)
  assert.match(referenceCssSource, /\.reward-inventory-action-bar/)
})
