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
const fanPassSource = await readFile(new URL('../src/components/FanPassPage.tsx', import.meta.url), 'utf8')
const fanPassCssSource = await readFile(new URL('../src/components/FanPassPage.css', import.meta.url), 'utf8')

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
  assert.match(appSource, /type Tab = 'home' \| 'discover' \| 'collection' \| 'growth' \| 'shop' \| 'settings' \| 'alerts'/)
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
  assert.match(fanGrowthReferenceCssSource, /\.fan-growth-reference[\s\S]*?fan-growth-artist-heading/)
  assert.match(referenceCssSource, /Home header spacing contract[\s\S]*?main\.app-shell\.home-shell > header\.app-header[\s\S]*?margin-bottom:\s*0\s*!important/)
})

test('fan growth API client exposes typed progression reward equipment and pass calls', () => {
  assert.match(apiSource, /export type FanProgression =/)
  assert.match(apiSource, /export type RewardGrant =/)
  assert.match(apiSource, /export type ProfileEquipment =/)
  assert.match(apiSource, /export function getProgression\(artistId\?: string \| null\)/)
  assert.match(apiSource, /`\/me\/progression\$\{growthScopeQuery\(artistId\)\}`/)
  assert.match(apiSource, /export function claimReward\(grantId: string\)/)
  assert.match(apiSource, /`\/me\/rewards\/\$\{encodeURIComponent\(grantId\)\}\/claim`/)
  assert.match(apiSource, /export function updateProfileEquipment\(equipment: ProfileEquipment\)/)
  assert.match(apiSource, /apiFetch<\{ ok: true, data: ProfileEquipment \}>\('\/me\/profile\/equipment'/)
  assert.match(apiSource, /export function getFanPass\(artistId\?: string \| null\)/)
  assert.match(apiSource, /`\/me\/pass\$\{growthScopeQuery\(artistId\)\}`/)
  assert.match(apiSource, /export function claimPassTier\(tierId: string\)/)
  assert.match(apiSource, /export function reconcilePassRewards\(\)/)
  assert.match(apiSource, /'\/me\/rewards\/reconcile-pass'/)
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
  assert.match(source, /fan-growth-mission-summary/, 'reference mission summary should be present')
  assert.match(source, /fan-growth-milestones/, 'reference milestone section should be present')
  assert.match(source, /fan-growth-next-reward/, 'reference next reward section should be present')
  assert.match(source, /progression\.level\.totalXp/, 'level XP must come from live progression')
  assert.match(source, /progression\.achievements/, 'missions must come from live progression')
  assert.match(source, /progression\.pass\.seasons/, 'milestones must come from the published fan pass')
  assert.match(source, /tier\.reward\?\.name/, 'milestones must show the admin-published reward name')
  assert.doesNotMatch(source, /스페셜 포토카드|드림스케이프 전용 콘텐츠 열람|아티스트 콘텐츠 좋아요/, 'growth view must not invent demo missions or benefits')
  assert.match(source, /visibleBenefits = useMemo/, 'growth benefits should deduplicate grants for the same reward')
  assert.match(source, /completedAt/, 'mission completion must remain data-driven')
  assert.match(source, /currentValue[\s\S]{0,80}targetValue/, 'mission progress must remain data-driven')
})

test('fan growth keeps global growth as a detail entry instead of a duplicate top scope tab', () => {
  const scopeTabs = fanGrowthSource.match(/<div className="fan-growth-scope-tabs"[\s\S]*?<\/div>/)?.[0] ?? ''
  assert.match(scopeTabs, /artistScopes\.map\(artist => <button/)
  assert.doesNotMatch(
    scopeTabs,
    />전체 팬<\/button>/,
    'the global scope should be opened from the account-wide growth card below',
  )
  assert.match(fanGrowthSource, /className="fan-growth-global-section"/)
  assert.match(fanGrowthSource, /<b>전체 팬 레벨<\/b>/)
})

test('fan growth renders admin-selected reward artwork for presets and uploaded assets', () => {
  assert.match(apiSource, /metadata\?: Record<string, unknown>/)
  assert.match(fanGrowthSource, /function rewardArtworkUrl/)
  assert.match(fanGrowthSource, /imagePreset/)
  assert.match(fanGrowthSource, /imageAssetId/)
  assert.match(fanGrowthSource, /`\/api\/rewards\/\$\{encodeURIComponent\(rewardId\)\}\/image`/)
  assert.match(fanGrowthSource, /fan-growth-next-reward-icon[\s\S]*?<img src=/)
  assert.match(fanGrowthSource, /fan-growth-pass-tier[\s\S]{0,420}rewardArtworkUrl\(tier\.reward\)[\s\S]{0,180}<img src=/)
  assert.match(fanGrowthReferenceCssSource, /fan-growth-next-reward-icon img/)
})

test('fan growth preview carries reward artwork metadata through the same pass-tier shape as the API', () => {
  assert.match(appSource, /imagePreset: 'ticket'/, 'preview data should exercise a real reward artwork preset')
  assert.match(appSource, /name: '미공개 콘텐츠',[\s\S]{0,180}metadata: \{ imagePreset: 'ticket' \}/, 'the preview next reward should use the selected reward artwork path')
})

test('fan level reference stylesheet defines the mobile geometry and fixed navigation-safe spacing', () => {
  const cssSource = `${fanGrowthCssSource}\n${fanGrowthReferenceCssSource}`
  assert.match(cssSource, /fan-growth-reference/, 'reference styles should be scoped to the feature')
  assert.match(cssSource, /fan-growth-milestones/, 'milestones should have dedicated styles')
  assert.match(cssSource, /@media\(min-width:700px\)/, 'desktop canvas boundary should be explicit')
  assert.match(cssSource, /padding:0 0 118px!important/, 'content should reserve space for fixed bottom navigation')
  assert.match(cssSource, /\.fan-growth-hero\{display:grid;grid-template-columns:112px/, 'hero geometry should use the reference proportions')
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
    /\.fan-growth-milestones\{display:flex;[\s\S]*?overflow-x:auto;[\s\S]*?scroll-snap-type:x proximity/,
    'the final shell override should preserve horizontal scrolling',
  )
  assert.match(
    fanGrowthReferenceCssSource,
    /\.fan-growth-milestone\{[\s\S]*?flex:0 0 108px;[\s\S]*?\}/,
    'milestone cards should not shrink below the reference width',
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
    /milestoneProgressPercent = currentSeason[\s\S]*currentSeason\.progress\.currentXp/,
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

test('fan pass opens as a dedicated page with a vertical season journey', () => {
  assert.match(appSource, /FanPassPage/)
  assert.match(appSource, /\/growth\/pass/)
  assert.match(fanGrowthSource, /onViewPass/)
  assert.match(fanGrowthSource, /onViewPass\(\)/)
  assert.match(fanPassSource, /드림스케이프 팬 레벨|시즌 종료까지/)
  assert.match(fanPassSource, /season-pass-journey/)
  assert.match(fanPassSource, /보상 받기/)
  assert.match(fanPassSource, /보상을 받았어요\. 보관함에서 확인할 수 있어요\./)
  assert.match(fanPassCssSource, /season-pass-journey/)
  assert.doesNotMatch(fanGrowthSource, /onClick=\{\(\) => setActiveSheet\('pass'\)\}/)
})

test('fan pass purchase failures are announced to the fan instead of disappearing silently', () => {
  assert.match(fanPassSource, /purchaseError/)
  assert.match(fanPassSource, /role="alert"/)
  assert.match(fanPassSource, /구매하지 못했어요|포인트가 부족/)
})

test('fan pass bottom navigation delegates to the app tab router', () => {
  assert.match(fanPassSource, /onNavigate: \(tab: 'discover' \| 'collection' \| 'home' \| 'growth' \| 'shop'\) => void/)
  assert.match(fanPassSource, /onClick=\{\(\) => onNavigate\('discover'\)\}/)
  assert.match(fanPassSource, /onClick=\{\(\) => onNavigate\('collection'\)\}/)
  assert.match(fanPassSource, /onClick=\{\(\) => onNavigate\('home'\)\}/)
  assert.match(fanPassSource, /onClick=\{\(\) => onNavigate\('shop'\)\}/)
  assert.match(appSource, /onNavigate=\{navigateTab\}/)
  assert.match(appSource, /const navigateTab = \(nextTab: Tab\) => \{[\s\S]*?setShowFanPassPage\(false\)/)
})

test('season pass keeps the reward flow compact and the premium purchase cue visible', () => {
  assert.doesNotMatch(fanPassSource, /season-pass-tier-detail/)
  assert.doesNotMatch(fanPassSource, /expandedTierId/)
  assert.match(fanPassSource, /season-pass-purchase-cue/)
  assert.match(fanPassCssSource, /\.season-pass-purchase-cue\s*\{[^}]*position:sticky/)
  assert.match(fanPassCssSource, /\.season-pass-lane\s*\{[^}]*grid-template-columns:48px/)
  assert.match(appCssSource, /\.detail-screen-content\s*\{[^}]*padding:[^;]*calc\(var\(--bottom-nav-height\)/)
})

test('global fan pass uses shared canvas spacing and intentional empty state', () => {
  assert.doesNotMatch(fanPassCssSource, /width: calc\(100% \+ 48px\)/)
  assert.doesNotMatch(fanPassCssSource, /width: calc\(100% \+ 36px\)/)
  assert.match(fanPassSource, /fan-pass-empty-section/)
  assert.match(fanPassSource, /시즌 패스 보상/)
  assert.match(fanPassCssSource, /\.fan-pass-empty-section\{/)
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
