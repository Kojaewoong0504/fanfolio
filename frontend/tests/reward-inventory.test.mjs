import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const referenceCssSource = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')

test('collection exposes a fan collection entry backed by claimed rewards', () => {
  assert.match(appSource, /className="collection-reward-inventory-entry"/)
  assert.match(appSource, /팬 컬렉션/)
  assert.match(appSource, /팬 활동으로 모은 아이템을 한곳에서 관리해요/)
  assert.match(appSource, /claimedRewards\.filter\(reward => reward\.claimedAt\)/)
  assert.match(appSource, /onRewards=\{openRewardInventory\}/)
})

test('collection inventory merges artist and global progression rewards', () => {
  assert.match(appSource, /function mergeProgressionsForInventory\(/)
  assert.match(appSource, /const inventoryProgression = mergeProgressionsForInventory\(fanProgression, globalFanProgression\)/)
  assert.match(appSource, /<RewardInventory progression=\{inventoryProgression\}/)
  assert.match(appSource, /rewards=\{inventoryProgression\?\.claimedRewards \?\? \[\]\}/)
  assert.match(appSource, /seasons: mergeById\(available\.map\(progression => progression\.pass\.seasons\)\)/)
})

test('reward inventory has a dedicated collection route and returns to the collection', () => {
  assert.match(appSource, /window\.location\.pathname === '\/collection\/rewards'/)
  assert.match(appSource, /window\.history\.pushState\(\{\}, '', '\/collection\/rewards'\)/)
  assert.match(appSource, /window\.history\.replaceState\(\{\}, '', '\/collection'\)/)
  assert.match(appSource, /if \(pathname === '\/collection\/rewards'\) return 'collection'/)
  assert.match(appSource, /<RewardInventory/)
})

test('reward inventory groups real items by source and lifecycle while preserving equipment changes', () => {
  assert.match(appSource, /function RewardInventory\(/)
  assert.match(appSource, /inventoryRewardSource/)
  assert.match(appSource, /inventoryRewardLifecycle/)
  assert.match(appSource, /보유 아이템/)
  assert.match(appSource, /전체.*적용 중.*기간제.*1회성/s)
  assert.match(appSource, /updateProfileEquipment/)
  assert.match(appSource, /onEquip=\{saveGrowthEquipment\}/)
  assert.match(appSource, /rewardArtworkUrl\(reward\)/)
  assert.match(appSource, /<div><h1>팬 컬렉션<\/h1><\/div>/)
  assert.match(appSource, /현재 적용 중/)
  assert.match(appSource, /기간제/)
  assert.match(appSource, /1회성/)
  assert.match(appSource, /영구 보유/)
  assert.doesNotMatch(appSource, /현재 장착 중/)
})

test('inventory source identity separates artist logos from global rewards', () => {
  assert.match(appSource, /name: '랜덤 카드 뽑기권',[\s\S]*?metadata: \{ scope: 'global'/)
  assert.match(appSource, /type InventorySource =/)
  assert.match(appSource, /logoUrl: string \| null/)
  assert.match(appSource, /className="reward-inventory-source-logo"/)
  assert.match(appSource, /source\.kind !== 'global'/)
  assert.doesNotMatch(appSource, /artwork: inventoryRewardArtwork\(reward\)/)
})

test('inventory sources use compact chips and omit the global logo', () => {
  assert.match(appSource, /source\.kind !== 'global'/)
  assert.match(appSource, /reward-inventory-source-count/)
  assert.doesNotMatch(appSource, /reward-inventory-source-logo global/)
  assert.match(referenceCssSource, /min-height:46px/)
  assert.match(referenceCssSource, /\.reward-inventory-source-logo\s*\{[^}]*width:28px[^}]*height:28px/s)
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
  assert.match(referenceCssSource, /\.reward-inventory-sources/)
  assert.match(referenceCssSource, /\.reward-inventory-grid/)
  assert.match(referenceCssSource, /grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(referenceCssSource, /\.reward-inventory-tabs\s*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s)
  assert.match(referenceCssSource, /\.reward-inventory-card-action/)
  assert.match(referenceCssSource, /\.reward-inventory-status\.equipped/)
  assert.match(referenceCssSource, /\.reward-inventory-status\.timed/)
  assert.match(referenceCssSource, /\.reward-inventory-status\.consumable/)
})
