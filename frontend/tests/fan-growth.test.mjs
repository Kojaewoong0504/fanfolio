import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appCssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const referenceCssSource = await readFile(new URL('../src/reference.css', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const fanGrowthSource = await readFile(new URL('../src/components/FanGrowth.tsx', import.meta.url), 'utf8')
const fanGrowthCssSource = await readFile(new URL('../src/components/FanGrowth.css', import.meta.url), 'utf8')
const fanGrowthReferenceCssSource = await readFile(new URL('../src/components/FanGrowthReference.css', import.meta.url), 'utf8')

test('fan growth is a persistent bottom tab instead of settings content', async () => {
  await access(new URL('../src/components/FanGrowth.tsx', import.meta.url))
  await access(new URL('../src/components/FanGrowth.css', import.meta.url))
  await access(new URL('../src/components/FanGrowth.test.tsx', import.meta.url))
  assert.match(appSource, /import \{ FanGrowth/)
  assert.match(appSource, /<FanGrowth[\s\S]*progression=\{fanProgression\}/)
  assert.match(appSource, /fanGrowthMode="full"/)
  assert.doesNotMatch(appSource, /fanGrowthMode="summary"/)
  assert.doesNotMatch(appSource, /label="팬 패스"/)
  assert.equal([...appSource.matchAll(/<NavItem /g)].length, 5)
  assert.match(appSource, /type Tab = 'home' \| 'discover' \| 'collection' \| 'growth' \| 'settings' \| 'alerts'/)
  assert.match(appSource, /if \(pathname === '\/growth'\) return 'growth'/)
  assert.match(appSource, /growth: '\/growth'/)
  assert.match(appSource, /growth: '팬 레벨'/)
  assert.match(appSource, /tab === 'growth' && <FanGrowth/)
  assert.doesNotMatch(appSource, /tab === 'settings' && currentUser && <><Settings[\s\S]*<FanGrowth/)
  assert.match(appSource, /label="팬 레벨"/)
})

test('all authenticated screens use one shared app header contract', () => {
  assert.equal([...appSource.matchAll(/<header className="app-header">/g)].length, 1)
  assert.match(referenceCssSource, /Global app header contract[\s\S]*main\.app-shell > header\.app-header/)
  assert.match(referenceCssSource, /main\.app-shell > header\.app-header \.header-alert-button,[\s\S]*?width:\s*32px\s*!important/)
  assert.match(referenceCssSource, /main\.app-shell > header\.app-header \.header-profile-button[\s\S]*?width:\s*32px\s*!important/)
  assert.match(referenceCssSource, /main\.app-shell > header\.app-header \.header-profile-button \.profile-avatar[\s\S]*?height:\s*32px\s*!important/)
  assert.match(referenceCssSource, /main\.app-shell > header\.app-header \.eyebrow[\s\S]*?color:\s*var\(--fan-violet\)\s*!important/)
  assert.match(fanGrowthReferenceCssSource, /Keep the growth route on the same global app-header contract[\s\S]*?header-alert-button[\s\S]*?width:32px!important/)
  assert.match(referenceCssSource, /Home header spacing contract[\s\S]*?main\.app-shell\.home-shell > header\.app-header[\s\S]*?margin-bottom:\s*0\s*!important/)
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

test('full fan level view exposes the supplied reference composition while keeping live progression mapping', () => {
  const source = fanGrowthSource
  assert.doesNotMatch(source, /팬 활동을 통해 레벨을 올리고 특별한 혜택을 받아보세요!/, 'page subtitle belongs to the shared app header')
  assert.match(source, /fan-growth-hero/, 'reference level hero should be present')
  assert.match(source, /fan-growth-missions/, 'reference mission section should be present')
  assert.match(source, /fan-growth-milestones/, 'reference milestone section should be present')
  assert.match(source, /fan-growth-benefits/, 'reference benefits section should be present')
  assert.match(source, /progression\.level\.totalXp/, 'level XP must come from live progression')
  assert.match(source, /progression\.achievements/, 'missions must come from live progression')
  assert.match(source, /completedAt/, 'mission completion must remain data-driven')
  assert.match(source, /currentValue[\s\S]{0,80}targetValue/, 'mission progress must remain data-driven')
})

test('fan level reference stylesheet defines the mobile geometry and fixed navigation-safe spacing', () => {
  const cssSource = `${fanGrowthCssSource}\n${fanGrowthReferenceCssSource}`
  assert.match(cssSource, /fan-growth-reference/, 'reference styles should be scoped to the feature')
  assert.match(cssSource, /fan-growth-milestones/, 'milestones should have dedicated styles')
  assert.match(cssSource, /max-width:\s*640px/, 'mobile stacking breakpoint should be present')
  assert.match(cssSource, /padding:\s*18px 0 112px/, 'content should reserve space for fixed bottom navigation')
  assert.match(cssSource, /growth-shell\{width:min\(100%,430px\)!important/, 'growth must remain inside the shared mobile app shell')
})

test('milestone cards keep a readable fixed width inside a keyboard-scrollable horizontal rail', () => {
  assert.match(
    fanGrowthSource,
    /className="fan-growth-milestones"[^>]*role="list"[^>]*aria-label="전체 레벨 마일스톤"[^>]*tabIndex=\{0\}/,
    'the milestone rail should be focusable and named for keyboard users',
  )
  assert.match(
    fanGrowthSource,
    /event\.key !== 'ArrowLeft'[\s\S]*?event\.key !== 'ArrowRight'[\s\S]*?scrollBy\(\{ left:/,
    'left and right arrow keys should move the focused milestone rail',
  )
  assert.doesNotMatch(
    fanGrowthSource,
    /milestoneLevels\.map\(item => <article key=\{item\.level\}/,
    'low levels can repeat numerically, so milestone keys must include reward identity',
  )
  assert.match(
    fanGrowthReferenceCssSource,
    /Milestone rail scroll contract:[\s\S]*?\.fan-growth-milestones\s*\{[\s\S]*?display:flex!important;[\s\S]*?overflow-x:auto!important;[\s\S]*?scroll-snap-type:x proximity!important;[\s\S]*?\}/,
    'the final shell override should preserve horizontal scrolling',
  )
  assert.match(
    fanGrowthReferenceCssSource,
    /Milestone rail scroll contract:[\s\S]*?\.fan-growth-milestone\s*\{[\s\S]*?flex:0 0 122px!important;[\s\S]*?\}/,
    'milestone cards should not shrink below the reference width',
  )
  assert.match(
    fanGrowthReferenceCssSource,
    /Milestone rail scroll contract:[\s\S]*?\.fan-growth-milestone:last-child\s*\{[\s\S]*?scroll-snap-align:end!important;/,
    'the final milestone should snap fully into view',
  )
  assert.match(
    fanGrowthSource,
    /function MilestoneLockIcon\(/,
    'locked milestone states should use a named lock icon component',
  )
  assert.match(
    fanGrowthSource,
    /circle cx="12" cy="14\.5"/,
    'the lock icon should include a visible keyhole instead of ambiguous overlapping circles',
  )
  assert.match(
    fanGrowthSource,
    /currentLocked/,
    'the current milestone should support a locked state',
  )
  assert.match(
    fanGrowthSource,
    /onScroll=\{handleMilestoneScroll\}/,
    'the rail should publish native scroll updates',
  )
  assert.match(
    fanGrowthSource,
    /fan-growth-milestone-track-viewport/,
    'the lower track should render a small scroll-position marker',
  )
  assert.match(
    fanGrowthSource,
    /scrollWidth[\s\S]*clientWidth/,
    'scroll progress should use the rail geometry',
  )
  assert.doesNotMatch(
    fanGrowthSource,
    /milestoneIndicatorPercent = Math\.max\(levelPercent[\s\S]*milestoneScroll\.ratio/,
    'the XP progress line should not grow into a large scroll-position bar',
  )
  assert.match(
    fanGrowthSource,
    /milestoneProgressPercent = Math\.max\(18, levelPercent\)/,
    'the progress line should stay tied to live XP progress',
  )
  assert.match(
    fanGrowthSource,
    /fan-growth-milestone-track-fill[\s\S]*fan-growth-milestone-track-viewport/,
    'the track should expose separate XP progress and scroll-position layers',
  )
  assert.match(
    fanGrowthSource,
    /<b className="fan-growth-milestone-track-fill"[\s\S]*<b className="fan-growth-milestone-track-viewport"/,
    'track layers should avoid generic span styling that creates an oversized pill',
  )
  assert.match(
    fanGrowthReferenceCssSource,
    /fan-growth-milestone-track-viewport[\s\S]*width:8px!important/,
    'the scroll-position marker should remain visually small',
  )
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
