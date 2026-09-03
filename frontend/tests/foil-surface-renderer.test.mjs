import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const surfaceSource = await readFile(
  new URL('../src/components/FoilSurfaceCanvas.tsx', import.meta.url),
  'utf8',
)
const cardSource = await readFile(
  new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url),
  'utf8',
)
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const rendererTypes = await readFile(new URL('../../builder_app/foil-renderer.d.ts', import.meta.url), 'utf8')

const ATELIER_12_PATTERN_IDS = [
  'aurora-wave',
  'satin-pearl',
  'gold-signature',
  'spectrum-edge',
  'constellation',
  'glass-caustics',
  'liquid-silver',
  'laser-engraving',
  'cinema-flare',
  'blossom-depth',
  'light-signature',
  'diamond-cut',
]

const LEGACY_PATTERN_IDS = [
  'prism',
  'cracked-ice',
  'micro-star',
  'liquid-chrome',
  'glass-flare',
]

test('card surface imports the shared studio WebGL foil renderer only on demand', () => {
  assert.match(surfaceSource, /import\('\.\.\/\.\.\/\.\.\/builder_app\/foil-renderer\.js'\)/)
  assert.match(surfaceSource, /createFoilRenderer\(canvas\)/)
  assert.match(surfaceSource, /\.ready/)
  assert.match(surfaceSource, /renderer\.dispose\(\)/)
  assert.doesNotMatch(surfaceSource, /from ['"]\.\.\/\.\.\/\.\.\/builder_app\/foil-renderer\.js['"]/)
})

test('card surface draws with real normalized pointer coordinates and studio effect settings', () => {
  assert.match(surfaceSource, /x: pointer\.x/)
  assert.match(surfaceSource, /y: pointer\.y/)
  assert.match(surfaceSource, /intensity/)
  assert.match(surfaceSource, /spread/)
  assert.match(surfaceSource, /grain/)
  assert.match(surfaceSource, /pattern/)
  assert.match(surfaceSource, /material/)
  assert.match(surfaceSource, /coverage/)
  assert.doesNotMatch(surfaceSource, /requestAnimationFrame/)
})

test('card remounts the foil surface for each card identity so ready state is replayed', () => {
  assert.match(cardSource, /key=\{identity \|\| imageUrl\}/)
})

test('card hides legacy foil layers only after WebGL is ready and falls back on failure', () => {
  assert.match(surfaceSource, /onReadyChange\?: \(ready: boolean\) => void/)
  assert.match(surfaceSource, /webglReady/)
  assert.match(surfaceSource, /markReady\(true\)/)
  assert.match(surfaceSource, /markReady\(false\)/)
  assert.match(surfaceSource, /onReadyChange\(ready\)/)
  assert.match(surfaceSource, /visibility: webglReady \? 'visible' : 'hidden'/)
  assert.match(surfaceSource, /webglcontextlost/)
  assert.match(cardSource, /legacySurfaceHidden/)
  assert.match(cardSource, /<FoilSurfaceCanvas/)
  assert.match(cardSource, /className="fan-card-material"/)
  assert.match(cardSource, /className="fan-card-surface"/)
  assert.match(cardSource, /display: legacySurfaceHidden \|\| effects.front.foilCoverage === 'background' \? 'none' : undefined/)
})

test('card surface redraws on resize without a permanent animation loop', () => {
  assert.match(surfaceSource, /ResizeObserver/)
  assert.match(surfaceSource, /resizeObserver\.observe\(canvas\)/)
  assert.match(surfaceSource, /resizeObserver\?\.disconnect\(\)/)
  assert.doesNotMatch(surfaceSource, /requestAnimationFrame/)
})

test('api accepts all atelier 12 pattern IDs while preserving legacy IDs', () => {
  for (const patternId of [...ATELIER_12_PATTERN_IDS, ...LEGACY_PATTERN_IDS]) {
    assert.match(apiSource, new RegExp(`'${patternId}'`))
  }
})

test('shared renderer declaration matches the studio runtime contract', () => {
  assert.match(rendererTypes, /export function createFoilRenderer/)
  assert.match(rendererTypes, /draw\(settings\?: FoilRendererSettings\): void/)
  assert.match(rendererTypes, /ready: Promise<void>/)
  assert.match(rendererTypes, /dispose\(\): void/)
})
