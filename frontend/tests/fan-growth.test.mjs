import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('fan growth component is mounted from home and settings without adding a sixth bottom tab', async () => {
  await access(new URL('../src/components/FanGrowth.tsx', import.meta.url))
  await access(new URL('../src/components/FanGrowth.css', import.meta.url))
  await access(new URL('../src/components/FanGrowth.test.tsx', import.meta.url))
  assert.match(appSource, /import \{ FanGrowth/)
  assert.match(appSource, /<FanGrowth[\s\S]*progression=\{fanProgression\}/)
  assert.match(appSource, /fanGrowthMode="summary"/)
  assert.match(appSource, /fanGrowthMode="full"/)
  assert.doesNotMatch(appSource, /label="팬 패스"/)
  assert.equal([...appSource.matchAll(/<NavItem /g)].length, 5)
})

test('fan growth API client exposes typed progression reward equipment and pass calls', () => {
  assert.match(apiSource, /export type FanProgression =/)
  assert.match(apiSource, /export type RewardGrant =/)
  assert.match(apiSource, /export type ProfileEquipment =/)
  assert.match(apiSource, /export function getProgression\(\)/)
  assert.match(apiSource, /apiFetch<\{ ok: true, data: FanProgression \}>\('\/me\/progression'\)/)
  assert.match(apiSource, /export function claimReward\(grantId: string\)/)
  assert.match(apiSource, /`\/me\/rewards\/\$\{encodeURIComponent\(grantId\)\}\/claim`/)
  assert.match(apiSource, /export function updateProfileEquipment\(equipment: ProfileEquipment\)/)
  assert.match(apiSource, /apiFetch<\{ ok: true, data: ProfileEquipment \}>\('\/me\/profile\/equipment'/)
  assert.match(apiSource, /export function getFanPass\(\)/)
  assert.match(apiSource, /apiFetch<\{ ok: true, data: FanPass \}>\('\/me\/pass'\)/)
  assert.match(apiSource, /export function claimPassTier\(tierId: string\)/)
})

test('progression claimed rewards are server-owned inventory, not local invented state', () => {
  assert.match(apiSource, /claimedRewards: RewardGrant\[\]/)
  assert.doesNotMatch(apiSource, /claimedRewards\?: RewardGrant\[\]/)
  assert.doesNotMatch(appSource, /claimedGrowthRewards/)
  assert.doesNotMatch(appSource, /setClaimedGrowthRewards/)
  assert.doesNotMatch(appSource, /claimedRewards: current\?\.claimedRewards/)
  assert.match(appSource, /\.\.\.progression\.data/)
  assert.match(appSource, /pass: pass\.data/)
})

test('progression refresh is parallel with collection and non-blocking on failure', () => {
  assert.match(appSource, /refreshGrowth/)
  assert.match(appSource, /Promise\.allSettled\(\[\s*refreshCollection\(\),\s*refreshGrowth\(\)/s)
  assert.match(appSource, /성장 정보를 불러오지 못했어요/)
  assert.doesNotMatch(appSource, /await refreshCollection\(\)\s*;\s*await refreshGrowth\(\)/)
})

test('fan growth UI has Korean reward pass equipment states and bottom sheet behavior', async () => {
  const componentSource = await readFile(new URL('../src/components/FanGrowth.tsx', import.meta.url), 'utf8')
  assert.match(componentSource, /수령 가능한 보상/)
  assert.match(componentSource, /칭호 받기/)
  assert.match(componentSource, /무료 팬 패스/)
  assert.match(componentSource, /장착 패널/)
  assert.match(componentSource, /bottom sheet/)
  assert.match(componentSource, /claimingRewardId/)
  assert.match(componentSource, /equipmentSaving/)
  assert.match(componentSource, /claimedRewards/)
  assert.match(componentSource, /claimableRewards/)
  assert.match(componentSource, /availableBadges/)
  assert.match(componentSource, /badgeRewardIds\.includes/)
  assert.match(componentSource, /배지 3개까지 장착할 수 있어요/)
  assert.match(componentSource, /role="dialog"/)
  assert.match(componentSource, /aria-modal="true"/)
})

test('fan growth styles preserve card UI, 360px layout, touch targets, and no horizontal overflow', async () => {
  const componentCssSource = await readFile(new URL('../src/components/FanGrowth.css', import.meta.url), 'utf8')
  assert.match(appCssSource, /@media\(max-width:360px\)/)
  assert.match(componentCssSource, /\.fan-growth-card/)
  assert.match(componentCssSource, /box-shadow:/)
  assert.match(componentCssSource, /min-height:44px/)
  assert.match(componentCssSource, /max-width:100%/)
  assert.match(componentCssSource, /overflow-x:hidden/)
  assert.match(componentCssSource, /@media\(max-width:360px\)/)
})
