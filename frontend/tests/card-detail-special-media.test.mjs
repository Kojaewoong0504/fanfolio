import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

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
