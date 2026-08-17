import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const collectibleUrl = new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url)
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('reveal and detail share one interactive collectible renderer', async () => {
  const collectibleSource = await readFile(collectibleUrl, 'utf8')
  assert.match(collectibleSource, /export function InteractiveCollectibleCard/)
  assert.match(appSource, /<InteractiveCollectibleCard/)
  assert.match(detailSource, /<InteractiveCollectibleCard/)
  assert.match(collectibleSource, /normalizeCardEffects/)
})

test('shared collectible supports accessible front and back inspection', async () => {
  const collectibleSource = await readFile(collectibleUrl, 'utf8')
  assert.match(collectibleSource, /aria-label="카드 면 선택"/)
  assert.match(collectibleSource, /aria-pressed=\{visibleSide === 'front'\}/)
  assert.match(collectibleSource, /aria-pressed=\{visibleSide === 'back'\}/)
  assert.match(collectibleSource, /setVisibleSide\('front'\)/)
  assert.match(collectibleSource, /setVisibleSide\('back'\)/)
  assert.match(collectibleSource, /fan-card-back-meta/)
})

test('shared collectible preserves scroll while moving tilt and foil light', async () => {
  const collectibleSource = await readFile(collectibleUrl, 'utf8')
  assert.match(collectibleSource, /handleCollectibleMove/)
  assert.match(collectibleSource, /onPointerDown=\{handleCollectibleStart\}/)
  assert.match(collectibleSource, /onPointerMove=\{handleCollectibleMove\}/)
  assert.match(collectibleSource, /onPointerCancel=\{handleCollectibleEnd\}/)
  assert.match(collectibleSource, /deltaY > deltaX/)
  assert.match(cssSource, /\.fan-card-collectible\{[\s\S]*touch-action:pan-y/)
})

test('reveal presentation is one-shot and reduced-motion safe', async () => {
  const collectibleSource = await readFile(collectibleUrl, 'utf8')
  assert.match(collectibleSource, /presentation === 'reveal'/)
  assert.match(appSource, /presentation="reveal"/)
  assert.match(cssSource, /@keyframes collectible-reveal-enter/)
  assert.match(cssSource, /\.collectible-reveal-enter/)
  assert.match(cssSource, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.collectible-reveal-enter/)
})

test('QA reveal uses a visible v3 collectible effect preset', () => {
  assert.match(appSource, /qaRevealDesignConfig/)
  assert.match(appSource, /material: 'pearl'/)
  assert.match(appSource, /foilPattern: 'prism'/)
  assert.match(appSource, /interaction: 'tilt'/)
  assert.match(appSource, /edgeFoil: 'silver'/)
  assert.match(appSource, /spotUv: 'serial'/)
})
