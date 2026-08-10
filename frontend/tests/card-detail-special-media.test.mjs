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

test('card detail applies designConfig hologram styling with reduced-motion support', () => {
  assert.match(detailSource, /hologramStyle/)
  assert.match(detailSource, /designEffect === 'holographic'/)
  assert.match(detailSource, /--hologram-opacity/)
  assert.match(detailSource, /hologram-aurora-texture\.jpg/)
  assert.match(detailSource, /--hologram-texture/)
  assert.match(detailSource, /detail-media hologram/)
  assert.match(cssSource, /\.detail-media\.hologram::before/)
  assert.match(cssSource, /background-image:var\(--hologram-texture\)/)
  assert.match(cssSource, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.detail-media\.hologram::before/)
  assert.match(cssSource, /animation-name:none/)
})

test('owned hologram cards react to pointer and touch movement instead of only auto-rotating', () => {
  assert.match(detailSource, /handleHologramMove/)
  assert.match(detailSource, /handleHologramReset/)
  assert.match(detailSource, /onPointerDown=\{handleHologramStart\}/)
  assert.match(detailSource, /onPointerMove=\{handleHologramMove\}/)
  assert.match(detailSource, /onPointerUp=\{handleHologramEnd\}/)
  assert.match(detailSource, /onPointerLeave=\{handleHologramReset\}/)
  assert.match(detailSource, /onPointerCancel=\{handleHologramReset\}/)
  assert.match(detailSource, /--hologram-tilt-x/)
  assert.match(detailSource, /--hologram-light-x/)
  assert.match(cssSource, /rotateX\(var\(--hologram-tilt-x\)/)
  assert.match(cssSource, /touch-action:none/)
  assert.match(cssSource, /prefers-reduced-motion:reduce[\s\S]*--hologram-tilt-x:0deg/)
})
