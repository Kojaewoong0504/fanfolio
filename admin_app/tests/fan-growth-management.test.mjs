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
  assert.match(source, /class="edit-fan-pass/)
  assert.match(source, /canApproveFanGrowth\(\) && item\.status === "pending_review"[\s\S]*업적 공개 승인/)
  assert.match(source, /const approvalAction = canApproveFanGrowth\(\) && season\.id[\s\S]*패스 공개 승인/)
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

test('reward drawer sends organization and artist scope for scoped rewards', () => {
  assert.match(source, /function rewardDrawer/)
  assert.match(source, /name="organizationId"/)
  assert.match(source, /name="artistId"/)
  assert.match(source, /organizationId: data\.get\("organizationId"\) \|\| null/)
  assert.match(source, /artistId: data\.get\("artistId"\) \|\| null/)
})

test('reward drawer implements the approved image library upload preview and persistence flow', () => {
  assert.match(source, /rewardImagePresets/)
  assert.match(source, /reward-ticket\.png/)
  assert.match(source, /reward-vip\.png/)
  assert.match(source, /reward-crystal\.png/)
  assert.match(source, /reward-music\.png/)
  assert.match(source, /id="reward-image-upload-button"/)
  assert.match(source, /id="reward-media-library-button"/)
  assert.match(source, /URL\.createObjectURL\(file\)/)
  assert.match(source, /uploadAsset\(state\.rewardImageFile, "reward_image"\)/)
  assert.match(source, /imagePreset:/)
  assert.match(source, /imageAssetId/)
  assert.match(css, /\.reward-builder \{ position: relative; width: min\(100%, 500px\)/)
  assert.match(source, /기본 이미지 선택/)
  assert.match(source, /is-highlighted/)
  assert.match(css, /\.reward-image-presets/)
  assert.match(css, /\.reward-live-preview/)
})

test('custom select updates only its label and preserves the chevron icon', () => {
  assert.match(source, /class="admin-select-label"/)
  assert.match(source, /querySelector\("\.admin-select-label"\)\.textContent = option\.dataset\.label/)
  assert.doesNotMatch(source, /querySelector\("\.admin-select-trigger span"\)\.textContent = option\.dataset\.label/)
})

test('reward save explains an expired administrator session instead of a generic scope failure', () => {
  assert.match(source, /catch \(error\) \{[\s\S]*error\?\.status === 401[\s\S]*관리자 로그인이 만료되었습니다\. 다시 로그인해 주세요\./)
})

test('free fan pass drawer omits paid fields and validates end after start inline', () => {
  const drawerStart = source.indexOf('function fanPassDrawer')
  const drawerEnd = source.indexOf('function cardsView', drawerStart)
  const drawerSource = source.slice(drawerStart, drawerEnd)
  assert.match(drawerSource, /function fanPassDrawer/)
  assert.match(drawerSource, /레벨 패스 편집/)
  assert.match(drawerSource, /name="startsAt"/)
  assert.match(drawerSource, /name="endsAt"/)
  assert.match(drawerSource, /maxFanPassTiers/)
  assert.match(drawerSource, /10/)
  assert.match(drawerSource, /tierXp/)
  assert.match(drawerSource, /tierReward/)
  assert.match(drawerSource, /패스 종료 시각은 시작 시각 이후로 선택해 주세요/)
  assert.doesNotMatch(drawerSource, /name="price"|payment|paid|유료|결제/)
})

test('season level pass workspace matches the approved sidecar management design', () => {
  assert.match(source, /레벨 패스 목록/)
  assert.match(source, /활성 패스/)
  assert.match(source, /등록 보상/)
  assert.match(source, /fan-pass-workspace-body/)
  assert.match(source, /fan-pass-status-filter/)
  assert.match(source, /fan-pass-artist-filter/)
  assert.match(source, /method: seasonId \? "PATCH" : "POST"/)
  assert.match(css, /workspace-sidecar-body/)
  assert.match(css, /fan-pass-sidecar/)
  assert.match(css, /fan-pass-table tbody tr\.selected/)
})

test('season level pass drawer anchors its footer inside the drawer', () => {
  assert.match(css, /\.fan-pass-drawer\s*\{[^}]*position:\s*relative/)
  assert.match(css, /\.fan-pass-editor-form\s*\{[^}]*position:\s*relative/)
  assert.match(css, /\.fan-pass-editor-form\s*\{[^}]*overflow-y:\s*auto/)
  assert.match(css, /\.fan-pass-editor-form\s*>\s*\.drawer-footer\s*\{[^}]*position:\s*sticky/)
})

test('fan growth management styles stay responsive without horizontal overflow', () => {
  assertMatches(css, /fan-growth-grid/, 'renders a dedicated responsive fan growth grid')
  assertMatches(css, /achievement-builder/, 'styles the achievement builder drawer')
  assertMatches(css, /pass-tier-list/, 'styles the pass tier list')
  assertMatches(css, /overflow-wrap:\s*anywhere/, 'long Korean labels can wrap inside narrow panels')
  assertMatches(css, /@media\s*\(max-width:\s*767px\)[\s\S]*fan-growth-grid/, 'fan growth view has a mobile breakpoint')
})

test('fan pass tier rows keep XP and reward controls readable in a narrow drawer', () => {
  assert.match(css, /\.fan-pass-editor-form \.pass-tier-row\s*\{[^}]*grid-template-columns:\s*24px minmax\(0, 1fr\) minmax\(0, 1fr\) 28px/s)
  assert.match(css, /\.fan-pass-editor-form \.pass-tier-row > \.field:nth-of-type\(2\)\s*\{[^}]*grid-column:\s*2\s*\/\s*3/s)
  assert.match(css, /\.fan-pass-editor-form \.pass-tier-row > \.field:nth-of-type\(3\)\s*\{[^}]*grid-column:\s*3\s*\/\s*4/s)
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*\.fan-pass-editor-form \.pass-tier-row\s*\{[\s\S]*grid-template-columns:\s*24px minmax\(0, 1fr\) 28px/s)
})

test('fan pass editor offers reusable 15 and 30 level season presets', () => {
  assert.match(source, /maxFanPassTiers = 30/)
  assert.match(source, /season-15/)
  assert.match(source, /season-30/)
  assert.match(source, /applyFanPassPreset/)
  assert.match(source, /fan-pass-preset/)
})

test('fan pass date controls keep the submitted datetime value visible and pass save reports the API reason', () => {
  assert.match(source, /altInput:\s*false/)
  assert.match(source, /errorBox\.textContent = error\?\.message \|\| "레벨 패스 저장에 실패했습니다\./)
  assert.match(source, /finally[\s\S]*disabled = false/)
})

test('root fan pass save rejects an artist scope without an organization', () => {
  assert.match(source, /if \(isRoot\(\) && \(\(organizationId && !artistId\) \|\| \(!organizationId && artistId\)\)\)/)
  assert.match(source, /조직과 아티스트 범위를 함께 선택/)
})

test('mission editor exposes collection completion as a processable engagement event', () => {
  assert.match(source, /collection_goal_completed/)
  assert.match(source, /컬렉션 완성/)
})

test('reward editor explains the supported point and card-pack reward paths', () => {
  assert.match(source, /카드팩은 공개된 카드팩을 팬 패스 수령 보상으로 지급합니다/)
  assert.match(source, /value: "card_pack"/)
})
