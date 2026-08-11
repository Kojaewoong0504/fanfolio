import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

function assertMatches(value, pattern, contract) {
  assert.ok(pattern.test(value), contract)
}

test('fan growth navigation is scoped to engagement writers and global managers', () => {
  assert.match(source, /id: "fan-growth"/)
  assert.match(source, /label: "팬 성장"/)
  assert.match(source, /canViewFanGrowth/)
  assert.match(source, /can\("engagement:write"\)/)
  assert.match(source, /can\("engagement:manage_global"\)/)
  assert.match(source, /can\("engagement:approve_global"\)/)
  assert.match(source, /engagement\/achievements/)
})

test('platform approvers can view fan growth review queues without create controls', () => {
  assert.match(source, /const canViewFanGrowth = \(\) =>/)
  assert.match(source, /canManageFanGrowth\(\) \|\| canApproveFanGrowth\(\)/)
  assert.match(source, /if \(!canViewFanGrowth\(\)\)/)
  assert.match(source, /if \(!canViewFanGrowth\(\) && state\.view === "fan-growth"\)/)
  assert.match(source, /canManageFanGrowth\(\) \? `[\s\S]*open-fan-pass-drawer/)
  assert.match(source, /canManageFanGrowth\(\) \? `[\s\S]*open-achievement-drawer/)
})

test('approve-only fan growth users do not see row edit or draft submit controls', () => {
  assert.match(source, /const writeActions = canManageFanGrowth\(\)[\s\S]*edit-achievement/)
  assert.match(source, /const writeActions = canManageFanGrowth\(\)[\s\S]*edit-fan-pass/)
  assert.match(source, /canApproveFanGrowth\(\) && item\.status === "pending_review"[\s\S]*업적 공개 승인/)
  assert.match(source, /canApproveFanGrowth\(\) && item\.status === "pending_review"[\s\S]*패스 공개 승인/)
})

test('fan growth loads achievements rewards and pass seasons in one isolated request group', () => {
  assert.match(source, /function loadFanGrowth/)
  assert.match(source, /Promise\.all\(\[/)
  assert.match(source, /\/admin\/engagement\/achievements/)
  assert.match(source, /\/admin\/engagement\/rewards/)
  assert.match(source, /\/admin\/engagement\/pass-seasons/)
})

test('achievement drawer exposes scoped Korean templates and separates draft review and approval actions', () => {
  assert.match(source, /function achievementDrawer/)
  assert.match(source, /organization/)
  assert.match(source, /artistId/)
  assert.match(source, /memberId/)
  for (const condition of [
    'first_card',
    'card_count',
    'member_count',
    'specific_card',
    'set_complete',
    'drop_participation',
  ]) {
    assert.match(source, new RegExp(condition))
  }
  assert.match(source, /목표 수치/)
  assert.match(source, /XP/)
  assert.match(source, /보상/)
  assert.match(source, /기간/)
  assert.match(source, /임시 저장/)
  assert.match(source, /검수 요청/)
  assert.match(source, /업적 공개 승인/)
  assert.match(source, /can\("engagement:approve"\)|can\("engagement:approve_global"\)/)
})

test('achievement drawer saves period fields in the achievement payload', () => {
  assert.match(source, /name="startsAt"/)
  assert.match(source, /name="endsAt"/)
  assert.match(source, /toLocalInputDateTime\(achievement\.startsAt\)/)
  assert.match(source, /toLocalInputDateTime\(achievement\.endsAt\)/)
  assert.match(source, /startsAt:\s*startsAt \? new Date\(startsAt\)\.toISOString\(\) : null/)
  assert.match(source, /endsAt:\s*endsAt \? new Date\(endsAt\)\.toISOString\(\) : null/)
  assert.match(source, /업적 종료 시각은 시작 시각 이후로 선택해 주세요/)
})

test('free fan pass drawer omits paid fields and validates end after start inline', () => {
  assert.match(source, /function fanPassDrawer/)
  assert.match(source, /무료 팬 패스/)
  assert.match(source, /name="startsAt"/)
  assert.match(source, /name="endsAt"/)
  assert.match(source, /maxFanPassTiers/)
  assert.match(source, /10/)
  assert.match(source, /tierXp/)
  assert.match(source, /tierReward/)
  assert.match(source, /패스 종료 시각은 시작 시각 이후로 선택해 주세요/)
  assert.doesNotMatch(source, /name="price"|payment|paid|유료|결제/)
})

test('fan growth management styles stay responsive without horizontal overflow', () => {
  assertMatches(css, /fan-growth-grid/, 'renders a dedicated responsive fan growth grid')
  assertMatches(css, /achievement-builder/, 'styles the achievement builder drawer')
  assertMatches(css, /pass-tier-list/, 'styles the pass tier list')
  assertMatches(css, /overflow-wrap:\s*anywhere/, 'long Korean labels can wrap inside narrow panels')
  assertMatches(css, /@media\s*\(max-width:\s*767px\)[\s\S]*fan-growth-grid/, 'fan growth view has a mobile breakpoint')
})
