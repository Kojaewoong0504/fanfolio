import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import ts from 'typescript'

const frontendRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
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

async function compileTypeFixture(source) {
  const tempDir = await mkdtemp(join(tmpdir(), 'fanfolio-card-effects-'))
  const fixturePath = join(tempDir, 'fixture.ts')
  await writeFile(fixturePath, source)

  try {
    return spawnSync(
      process.execPath,
      [
        join(frontendRoot, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--ignoreConfig',
        '--target',
        'ES2023',
        '--module',
        'ESNext',
        '--moduleResolution',
        'bundler',
        '--allowImportingTsExtensions',
        '--types',
        'vite/client',
        '--skipLibCheck',
        fixturePath,
      ],
      { cwd: frontendRoot, encoding: 'utf8' },
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
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

test('card detail API contract compiles legacy version 2 migration payloads', async () => {
  const result = await compileTypeFixture(`
    import type { CardDesignConfig, UserCardDetail } from '${frontendRoot}/src/api/client.ts'

    const legacyDesign: CardDesignConfig = {
      version: 2,
      front: {
        effect: 'holographic',
        effectPreset: 'stardust',
        effectFinish: 'glass',
        effectIntensity: 72,
        effectMotion: false,
      },
      back: { effect: 'sparkle' },
    }

    const detail: UserCardDetail = {
      userCardId: 'owned-1',
      serialNumber: 1,
      acquiredAt: '2026-08-10T00:00:00.000Z',
      acquisitionSource: 'drop',
      drop: null,
      redeemCode: null,
      futureBenefitPreview: null,
      card: {
        id: 'card-1',
        name: 'Legacy card',
        isOfficial: true,
        seasonName: null,
        cardType: null,
        rarity: null,
        signatureText: null,
        handwrittenMessage: null,
        issueLimit: null,
        status: 'published',
        designConfig: legacyDesign,
        handwritingImageUrl: null,
        hasVoice: false,
        voiceAudioUrl: null,
        hasVideo: false,
        videoUrl: null,
      },
    }

    void detail
  `)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('user card detail keeps version 3 design fields optional and legacy-compatible', () => {
  assert.match(apiSource, /version\?: 2 \| 3/)
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
