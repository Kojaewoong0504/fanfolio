import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const growthSource = await readFile(new URL('../src/components/FanGrowth.tsx', import.meta.url), 'utf8')
const missionSource = await readFile(new URL('../src/components/FanMissionPage.tsx', import.meta.url), 'utf8').catch(() => '')

test('fan level mission summary opens the dedicated mission route', () => {
  assert.match(growthSource, /onViewMissions:\s*\(\) => void/)
  assert.match(growthSource, /fan-growth-mission-summary[\s\S]*onClick=\{onViewMissions\}/)
  assert.match(appSource, /window\.history\.pushState\(\{\}, '', '\/growth\/missions'\)/)
  assert.match(appSource, /showMissionPage[\s\S]*<FanMissionPage/)
})

test('mission page supports status tabs, progress, and reward claiming', () => {
  assert.match(missionSource, /'active'\s*\|\s*'completed'\s*\|\s*'ended'/)
  assert.match(missionSource, /getFanMissions\(status\)/)
  assert.match(missionSource, /claimFanMission\(mission\.id\)/)
  assert.match(missionSource, /진행 중/)
  assert.match(missionSource, /완료/)
  assert.match(missionSource, /종료/)
  assert.match(missionSource, /보상 받기/)
  assert.match(missionSource, /mission\.claimable/)
  assert.match(clientSource, /claimable:\s*boolean/)
  assert.match(clientSource, /claimedAt:\s*string \| null/)
  assert.match(clientSource, /data:\s*\{\s*missionId:\s*string;\s*grants:\s*RewardGrant\[\]\s*\}/)
  assert.doesNotMatch(clientSource, /claimFanMission[\s\S]*data:\s*\{\s*items:\s*RewardGrant\[\]\s*\}/)
})

test('mission detail header only keeps back navigation and the centered title', () => {
  assert.match(missionSource, /aria-label="팬 레벨로 돌아가기"/)
  assert.match(missionSource, /<h1>미션<\/h1>/)
  assert.doesNotMatch(missionSource, /mission-page-header-actions/)
  assert.doesNotMatch(missionSource, /aria-label="알림"/)
  assert.doesNotMatch(missionSource, /alt="프로필"/)
})
