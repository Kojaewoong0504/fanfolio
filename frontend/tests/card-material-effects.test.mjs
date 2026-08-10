import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const effectsSource = await readFile(new URL('../src/utils/cardEffects.ts', import.meta.url), 'utf8')

async function importCardEffects() {
  const output = ts.transpileModule(effectsSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
      verbatimModuleSyntax: true,
    },
  })
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputText).toString('base64')}`
  return import(moduleUrl)
}

test('card detail API contract exposes version 3 collectible effect types', () => {
  assert.match(apiSource, /export type CardMaterial = 'matte' \| 'pearl' \| 'chrome'/)
  assert.match(
    apiSource,
    /export type FoilPattern =\s*\| 'aurora-wave'\s*\| 'prism'\s*\| 'cracked-ice'\s*\| 'micro-star'/,
  )
  assert.match(
    apiSource,
    /export type FoilCoverage = 'full' \| 'background' \| 'frame' \| 'signature'/,
  )
  assert.match(apiSource, /export type CardInteraction = 'static' \| 'tilt' \| 'lenticular'/)
  assert.match(apiSource, /export type EdgeFoil = 'none' \| 'silver' \| 'gold'/)
  assert.match(apiSource, /export type SpotUv = 'none' \| 'logo' \| 'symbol' \| 'serial'/)
})

test('user card detail keeps version 3 design fields optional and legacy-compatible', () => {
  assert.match(apiSource, /version\?: 3/)
  assert.match(apiSource, /material\?: CardMaterial/)
  assert.match(apiSource, /foilPattern\?: FoilPattern/)
  assert.match(apiSource, /foilCoverage\?: FoilCoverage/)
  assert.match(apiSource, /interaction\?: CardInteraction/)
  assert.match(apiSource, /lenticularAssetId\?: string \| null/)
  assert.match(apiSource, /edgeFoil\?: EdgeFoil/)
  assert.match(apiSource, /spotUv\?: SpotUv/)
  assert.match(apiSource, /hiddenMessage\?: string/)
  assert.match(apiSource, /effect\?: string/)
  assert.match(apiSource, /effectIntensity\?: number/)
  assert.match(apiSource, /effectMotion\?: boolean/)
  assert.match(apiSource, /lenticularImageUrl\?: string \| null/)
})

test('normalizeCardEffects mirrors studio defaults and legacy version 2 mappings', async () => {
  assert.match(effectsSource, /export function normalizeCardEffects/)

  const { normalizeCardEffects } = await importCardEffects()
  const normalized = normalizeCardEffects({
    version: 2,
    front: {
      effect: 'holographic',
      effectPreset: 'stardust',
      effectFinish: 'glass',
      effectIntensity: 72,
      effectAngle: 210,
      effectMotion: false,
      effectSpread: 64,
      effectGrain: 38,
    },
  })

  assert.deepEqual(normalized, {
    version: 3,
    front: {
      material: 'pearl',
      foilPattern: 'micro-star',
      foilCoverage: 'full',
      interaction: 'static',
      intensity: 0.72,
      angle: 210,
      lenticularAssetId: null,
      effectSpread: 0.64,
      effectGrain: 0.38,
    },
    back: {
      material: 'matte',
      edgeFoil: 'none',
      spotUv: 'none',
      hiddenMessage: '',
    },
  })
})

test('normalizeCardEffects clamps unknown v3 values and truncates hidden messages by code point', async () => {
  const { normalizeCardEffects } = await importCardEffects()
  const input = {
    version: 3,
    front: {
      material: 'plastic',
      foilPattern: 'laser-grid',
      foilCoverage: 'portrait-mask',
      interaction: 'spin',
      intensity: 800,
      angle: -20,
      lenticularAssetId: 'secondary',
      effectSpread: -1,
      effectGrain: Number.POSITIVE_INFINITY,
    },
    back: {
      material: 'paper',
      edgeFoil: 'bronze',
      spotUv: 'everything',
      hiddenMessage: `${'가'.repeat(39)}😀나`,
    },
  }

  const normalized = normalizeCardEffects(input)

  assert.deepEqual(normalized, {
    version: 3,
    front: {
      material: 'matte',
      foilPattern: 'aurora-wave',
      foilCoverage: 'full',
      interaction: 'static',
      intensity: 1,
      angle: 340,
      lenticularAssetId: null,
      effectSpread: 0,
      effectGrain: 0.38,
    },
    back: {
      material: 'matte',
      edgeFoil: 'none',
      spotUv: 'none',
      hiddenMessage: `${'가'.repeat(39)}😀`,
    },
  })
  assert.equal(Array.from(normalized.back.hiddenMessage).length, 40)
  assert.equal(input.front.material, 'plastic')
  assert.equal(input.back.hiddenMessage, `${'가'.repeat(39)}😀나`)
})

test('normalizeCardEffects accepts lenticular asset ids only for lenticular interaction', async () => {
  const { normalizeCardEffects } = await importCardEffects()

  assert.equal(
    normalizeCardEffects({
      front: { interaction: 'lenticular', lenticularAssetId: 'asset_alt' },
    }).front.lenticularAssetId,
    'asset_alt',
  )
  assert.equal(
    normalizeCardEffects({
      front: { interaction: 'lenticular', lenticularAssetId: '   ' },
    }).front.lenticularAssetId,
    null,
  )
  assert.equal(
    normalizeCardEffects({
      front: { interaction: 'tilt', lenticularAssetId: 'asset_alt' },
    }).front.lenticularAssetId,
    null,
  )
  assert.deepEqual(normalizeCardEffects(null), {
    version: 3,
    front: {
      material: 'matte',
      foilPattern: 'aurora-wave',
      foilCoverage: 'full',
      interaction: 'tilt',
      intensity: 0.58,
      angle: 135,
      lenticularAssetId: null,
      effectSpread: 0.64,
      effectGrain: 0.38,
    },
    back: {
      material: 'matte',
      edgeFoil: 'none',
      spotUv: 'none',
      hiddenMessage: '',
    },
  })
})
