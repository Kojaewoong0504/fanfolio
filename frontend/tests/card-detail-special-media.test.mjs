import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectibleSource = await readFile(new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

function loadHelper(source, name) {
  const match = source.match(new RegExp(`function ${name}\\(([^)]*)\\): [^{]+\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `${name} helper must exist`)
  const params = match[1].split(',').map(param => param.trim().split(':')[0].trim()).join(', ')
  return Function(`return function ${name}(${params}) {${match[2]}\n}`)()
}

test('card detail API contract exposes special media and design configuration', () => {
  assert.match(apiSource, /designConfig\?: CardDesignConfig \| null/)
  assert.match(apiSource, /effectIntensity\?: number/)
  assert.match(apiSource, /voiceAudioUrl: string \| null/)
  assert.match(apiSource, /hasVideo: boolean/)
  assert.match(apiSource, /videoUrl: string \| null/)
})

test('card detail renders accessible user-controlled voice and video players', () => {
  assert.match(detailSource, /className="special-media-section"/)
  assert.match(detailSource, />스페셜 미디어</)
  assert.match(detailSource, />보이스 메시지</)
  assert.match(detailSource, /aria-label="보이스 메시지 재생"/)
  assert.match(detailSource, /<audio[^>]*controls[^>]*preload="metadata"/s)
  assert.doesNotMatch(detailSource, /<audio[^>]*autoPlay/s)
  assert.match(detailSource, />스페셜 비디오</)
  assert.match(detailSource, /aria-label="스페셜 비디오 재생"/)
  assert.match(detailSource, /<video[^>]*controls[^>]*muted[^>]*playsInline/s)
  assert.match(detailSource, /<video[^>]*preload="metadata"/s)
  assert.doesNotMatch(detailSource, /<video[^>]*autoPlay/s)
  assert.match(detailSource, /onError=\{\(\) => setMediaError\(true\)\}/)
  assert.match(detailSource, /스페셜 미디어를 불러오지 못했어요/)
})

test('standalone card detail keeps metadata and history independent from detail loading', () => {
  assert.match(detailSource, /getUserCardHistory\(card\.userCardId\)/)
  assert.match(detailSource, /앨범·시즌/)
  assert.match(detailSource, /카드팩/)
  assert.match(detailSource, /발행 수량/)
  assert.match(detailSource, /card-collection-detail-history/)
  assert.match(detailSource, /카드 정보는 계속 확인할 수 있어요/)
})

test('standalone card detail labels card-pack acquisitions distinctly', () => {
  assert.match(detailSource, /detail\?\.acquisitionSource === 'card_pack'/)
  assert.match(detailSource, /detail\?\.acquisitionSource === 'combination'/)
  assert.match(detailSource, /detail\?\.acquisitionSource === 'trade'/)
  assert.match(detailSource, /'카드팩'/)
})

test('collection cards preserve signature and issue-limit metadata for detail fallbacks', () => {
  assert.match(appSource, /signatureText: card\.signatureText \?\? undefined/)
  assert.match(appSource, /issueLimit: card\.issueLimit \?\? undefined/)
  assert.match(detailSource, /detail\?\.card\.signatureText \?\? card\.signatureText/)
})

test('card detail applies normalized collectible effects with reduced-motion support', () => {
  assert.match(detailSource, /InteractiveCollectibleCard/)
  assert.match(collectibleSource, /normalizeCardEffects/)
  assert.match(collectibleSource, /fan-card-collectible/)
  assert.match(collectibleSource, /fan-card-material/)
  assert.match(collectibleSource, /fan-card-surface/)
  assert.match(collectibleSource, /prefersReducedEffects/)
  assert.match(cssSource, /\.fan-card-collectible/)
  assert.match(cssSource, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.fan-card-collectible/)
  assert.match(cssSource, /transition:none/)
  assert.doesNotMatch(collectibleSource, /hologram-aurora-texture\.jpg/)
  assert.doesNotMatch(cssSource, /\.detail-media\.hologram::before/)
})

test('card detail back side remains usable with safe fallback metadata', () => {
  assert.match(detailSource, /const safeBackDetail =/)
  assert.match(collectibleSource, /setVisibleSide\('back'\)/)
  assert.doesNotMatch(detailSource, /disabled=\{!detail\}/)
  assert.doesNotMatch(detailSource, /aria-disabled=\{!detail\}/)
  assert.match(collectibleSource, /visibleSide === 'front'/)
  assert.match(detailSource, /title=\{safeBackDetail\.title\}/)
  assert.match(detailSource, /serialLabel=\{safeBackDetail\.serialLabel\}/)
})

test('card detail preserves selected back side when remote detail resolves', () => {
  const resolveVisibleSideAfterCardIdentityChange = loadHelper(collectibleSource, 'resolveVisibleSideAfterCardIdentityChange')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('back', 'owned-card-1', 'owned-card-1'), 'back')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('front', 'owned-card-1', 'owned-card-1'), 'front')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('back', 'owned-card-1', 'owned-card-2'), 'front')
  assert.doesNotMatch(collectibleSource, /\[card\.id, detail\?\.userCardId\]/)
})

test('collectible front and back use a physical 2:3 framed card with clipped cover art', () => {
  assert.match(cssSource, /\.fan-card-collectible\{[\s\S]*aspect-ratio:2\/3/)
  assert.match(cssSource, /\.fan-card-collectible\{[\s\S]*flex:0 0 auto/)
  assert.match(cssSource, /\.fan-card-collectible\{[\s\S]*padding:10px/)
  assert.match(cssSource, /\.fan-card-collectible::before/)
  assert.match(cssSource, /\.fan-card-art-window/)
  assert.match(cssSource, /\.fan-card-art-window\{[\s\S]*overflow:hidden/)
  assert.match(cssSource, /\.fan-card-photo,.fan-card-lenticular\{[\s\S]*object-fit:cover/)
  assert.match(cssSource, /\.fan-card-collectible\.back\{[\s\S]*border:1px solid/)
  assert.match(collectibleSource, /className="fan-card-art-window"/)
})

test('collectible cards react to intentional pointer movement while preserving scroll', () => {
  assert.match(collectibleSource, /handleCollectibleMove/)
  assert.match(collectibleSource, /resetCollectibleVars/)
  assert.match(collectibleSource, /onPointerDown=\{handleCollectibleStart\}/)
  assert.match(collectibleSource, /onPointerMove=\{handleCollectibleMove\}/)
  assert.match(collectibleSource, /onPointerUp=\{handleCollectibleEnd\}/)
  assert.match(collectibleSource, /onPointerLeave=\{handleCollectibleEnd\}/)
  assert.match(collectibleSource, /onPointerCancel=\{handleCollectibleEnd\}/)
  assert.match(collectibleSource, /--tilt-x/)
  assert.match(collectibleSource, /--light-x/)
  assert.match(collectibleSource, /--lenticular-reveal/)
  assert.match(cssSource, /rotateX\(var\(--tilt-x\)/)
  assert.match(cssSource, /touch-action:pan-y/)
  assert.match(cssSource, /prefers-reduced-motion:reduce[\s\S]*transform:none/)
})

test('handwriting special remains an accessible image benefit', () => {
  assert.match(detailSource, /className="handwriting-special"/)
  assert.match(detailSource, />손글씨 특전</)
  assert.match(detailSource, /alt="손글씨 특전"/)
  assert.match(cssSource, /\.handwriting-special/)
})
