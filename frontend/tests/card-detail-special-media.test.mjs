import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

function loadHelper(name) {
  const match = detailSource.match(new RegExp(`function ${name}\\(([^)]*)\\): [^{]+\\{([\\s\\S]*?)\\n\\}`))
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
})

test('card detail applies normalized collectible effects with reduced-motion support', () => {
  assert.match(detailSource, /normalizeCardEffects/)
  assert.match(detailSource, /fan-card-collectible/)
  assert.match(detailSource, /fan-card-material/)
  assert.match(detailSource, /fan-card-surface/)
  assert.match(detailSource, /prefersReducedEffects/)
  assert.match(cssSource, /\.fan-card-collectible/)
  assert.match(cssSource, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.fan-card-collectible/)
  assert.match(cssSource, /transition:none/)
  assert.doesNotMatch(detailSource, /hologram-aurora-texture\.jpg/)
  assert.doesNotMatch(cssSource, /\.detail-media\.hologram::before/)
})

test('card detail back side remains usable with safe fallback metadata', () => {
  assert.match(detailSource, /const safeBackDetail =/)
  assert.match(detailSource, /setVisibleSide\('back'\)/)
  assert.doesNotMatch(detailSource, /disabled=\{!detail\}/)
  assert.doesNotMatch(detailSource, /aria-disabled=\{!detail\}/)
  assert.match(detailSource, /visibleSide === 'back' && safeBackDetail/)
  assert.match(detailSource, /safeBackDetail\.title/)
  assert.match(detailSource, /safeBackDetail\.serialLabel/)
})

test('card detail preserves selected back side when remote detail resolves', () => {
  const resolveVisibleSideAfterCardIdentityChange = loadHelper('resolveVisibleSideAfterCardIdentityChange')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('back', 'owned-card-1', 'owned-card-1'), 'back')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('front', 'owned-card-1', 'owned-card-1'), 'front')
  assert.equal(resolveVisibleSideAfterCardIdentityChange('back', 'owned-card-1', 'owned-card-2'), 'front')
  assert.doesNotMatch(detailSource, /\[card\.id, detail\?\.userCardId\]/)
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
  assert.match(detailSource, /className="fan-card-art-window"/)
})

test('collectible cards react to intentional pointer movement while preserving scroll', () => {
  assert.match(detailSource, /handleCollectibleMove/)
  assert.match(detailSource, /handleCollectibleReset/)
  assert.match(detailSource, /onPointerDown=\{handleCollectibleStart\}/)
  assert.match(detailSource, /onPointerMove=\{handleCollectibleMove\}/)
  assert.match(detailSource, /onPointerUp=\{handleCollectibleEnd\}/)
  assert.match(detailSource, /onPointerLeave=\{handleCollectibleEnd\}/)
  assert.match(detailSource, /onPointerCancel=\{handleCollectibleEnd\}/)
  assert.match(detailSource, /--tilt-x/)
  assert.match(detailSource, /--light-x/)
  assert.match(detailSource, /--lenticular-reveal/)
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
