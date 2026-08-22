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
const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const collectibleSource = await readFile(
  new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url),
  'utf8',
)
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

function sourceContainsAll(source, snippets) {
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `Expected source to include: ${snippet}`)
  }
}

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

test('shared collectible renders normalized v3 front and back classes', () => {
  sourceContainsAll(collectibleSource, [
    "import { normalizeCardEffects",
    'normalizeCardEffects(designConfig)',
    "material-${effects.front.material}",
    "pattern-${effects.front.foilPattern}",
    "coverage-${effects.front.foilCoverage}",
    "material-${effects.back.material}",
    "back edge-foil-${effects.back.edgeFoil}",
    "spot-uv-${effects.back.spotUv}",
    'const [visibleSide, setVisibleSide] = useState<VisibleSide>(initialSide)',
    "setVisibleSide('front')",
    'aria-pressed={visibleSide ===',
    '>앞면</button>',
    '>뒷면</button>',
    'effects.back.hiddenMessage',
  ])
  assert.match(detailSource, /\.slice\(-8\)\.toUpperCase\(\)/)
  assert.doesNotMatch(collectibleSource, /import hologramTexture/)
  assert.doesNotMatch(collectibleSource, /hologramStyle/)
})

test('collectible effects are opt-in and do not expose a redundant effect button', () => {
  sourceContainsAll(effectsSource, [
    'export function hasConfiguredFrontEffect',
  ])
  assert.match(collectibleSource, /hasConfiguredFrontEffect\(designConfig\)/)
  assert.match(collectibleSource, /const hasSurface = hasConfiguredFrontEffect\(designConfig\)/)
  assert.doesNotMatch(collectibleSource, /const \[effectPreview, setEffectPreview\]/)
  assert.doesNotMatch(collectibleSource, /card-effect-action/)
})

test('card detail supports a stable authenticated handwriting layer and media retry', () => {
  assert.match(detailSource, /useAuthenticatedMedia\(handwritingPath, mediaRetryKey\)/)
  assert.match(detailSource, /onRetryMedia/)
  assert.match(collectibleSource, /handwritingImageUrl\?: string \| null/)
  assert.match(collectibleSource, /fan-card-handwriting-layer/)
  assert.match(cssSource, /\.fan-card-handwriting-layer/)
  assert.match(detailSource, /스페셜 미디어 다시 불러오기/)
})

test('collection detail keeps the shared collectible media contract', () => {
  assert.match(appSource, /handwritingImageUrl=\{handwritingImageUrl\}/)
  assert.match(appSource, /useAuthenticatedMedia\(handwritingPath, mediaRetryKey\)/)
  assert.match(appSource, /스페셜 미디어 다시 불러오기/)
  assert.match(appSource, /designConfig=\{detail\?\.card\.designConfig \?\? null\}/)
})

test('card detail does not expose a fake back serial before owned detail loads', () => {
  assert.doesNotMatch(detailSource, /detail\?\.serialNumber\s*\?\?\s*0/)
  assert.doesNotMatch(detailSource, /padStart\(3,\s*'0'\)[\s\S]{0,80}UNLIMITED/)
  assert.doesNotMatch(detailSource, />#000</)
  assert.match(collectibleSource, /visibleSide === 'back'/)
  assert.match(detailSource, /String\(detail\.serialNumber\)\.padStart\(3, '0'\)/)
})

test('card detail only offers device motion before permission is settled on loaded owned detail', () => {
  assert.match(collectibleSource, /const canRequestDeviceMotion = Boolean\([\s\S]*enableDeviceMotion[\s\S]*motionStatus === 'idle'[\s\S]*motionSupported[\s\S]*effects\.front\.interaction !== 'static'[\s\S]*\)/)
  assert.match(collectibleSource, /if \(!enableDeviceMotion \|\| motionStatus !== 'idle'\) return/)
  assert.match(collectibleSource, /\{canRequestDeviceMotion && <button/)
  assert.doesNotMatch(collectibleSource, /\{motionSupported && visibleSide === 'front' && effects\.front\.interaction !== 'static' && <button/)
  assert.match(detailSource, /enableDeviceMotion/)
})

test('card detail keeps the back side selected with fallback metadata while detail loads', () => {
  assert.doesNotMatch(collectibleSource, /if \(!detail && visibleSide === 'back'\) setVisibleSide\('front'\)/)
  assert.doesNotMatch(collectibleSource, /disabled=\{!detail\}/)
  assert.doesNotMatch(collectibleSource, /aria-disabled=\{!detail\}/)
  assert.match(collectibleSource, /aria-pressed=\{visibleSide === 'back'\} onClick=\{\(\) => setVisibleSide\('back'\)\}/)
  assert.match(detailSource, /const safeBackDetail =/)
})

test('card detail protects lenticular scene and keeps movement permission explicit', () => {
  sourceContainsAll(collectibleSource, [
    'hasLenticular',
    'lenticularImageUrl',
    'className="fan-card-lenticular"',
    '--lenticular-reveal',
    'requestDeviceMotion',
    'DeviceOrientationEvent.requestPermission',
    '기기 움직임으로 보기',
    '손가락으로 움직여 볼 수 있어요',
    'window.isSecureContext',
    'deviceorientation',
    'prefers-reduced-motion: reduce',
    '첫 장면',
    '두 번째 장면',
  ])
  assert.match(detailSource, /detail\.card\.lenticularImageUrl/)
  assert.match(collectibleSource, /navigator[\s\S]{0,160}deviceMemory/)
  const permissionButtonIndex = collectibleSource.indexOf('기기 움직임으로 보기')
  const requestPermissionIndex = collectibleSource.indexOf('requestPermission')
  assert.ok(permissionButtonIndex > -1 && requestPermissionIndex > -1)
  assert.ok(
    requestPermissionIndex < permissionButtonIndex,
    'requestPermission should live in the explicit handler rendered by the button',
  )
  assert.doesNotMatch(collectibleSource, /useEffect\([\s\S]{0,240}requestPermission/)
})

test('fan collectible css replaces moving texture with reduced-motion-safe layered surfaces', () => {
  sourceContainsAll(cssSource, [
    '.fan-card-collectible',
    '--tilt-x:0deg',
    '--tilt-y:0deg',
    '--light-x:50%',
    '--light-y:42%',
    '--lenticular-reveal:0%',
    'touch-action:pan-y',
    '.fan-card-material',
    '.fan-card-surface',
    '.fan-card-lenticular',
    'clip-path:inset(0 calc(100% - var(--lenticular-reveal)) 0 0)',
    'pointer-events:none',
    '.material-matte',
    '.material-pearl',
    '.material-chrome',
    '.pattern-aurora-wave',
    '.pattern-prism',
    '.pattern-cracked-ice',
    '.pattern-micro-star',
    '.coverage-full',
    '.coverage-background',
    '.coverage-frame',
    '.coverage-signature',
    '.edge-foil-silver',
    '.edge-foil-gold',
    '.spot-uv-logo',
    '.spot-uv-symbol',
    '.spot-uv-serial',
    '-webkit-line-clamp:2',
    '@media(prefers-reduced-motion:reduce)',
  ])
  assert.doesNotMatch(cssSource, /hologram-sweep/)
  assert.doesNotMatch(cssSource, /--hologram-texture/)
  assert.doesNotMatch(cssSource, /translateX\(calc\(var\(--hologram-shift/)
})
