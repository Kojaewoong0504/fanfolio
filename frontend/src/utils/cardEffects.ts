import type {
  CardDesignConfig,
  CardInteraction,
  CardMaterial,
  EdgeFoil,
  FoilCoverage,
  FoilPattern as ApiFoilPattern,
  SpotUv,
} from '../api/client'

export const EFFECT_CATALOG = [
  {
    id: 'aurora-wave',
    name: '크리스털 포일',
    description: '시안 결정면과 오로라 빛이 겹치는 대표 포일',
    number: 1,
  },
  {
    id: 'satin-pearl',
    name: '새틴 펄',
    description: '부드러운 새틴 결 위로 은은한 진주광이 흐르는 표면',
    number: 2,
  },
  {
    id: 'gold-signature',
    name: '골드 시그니처',
    description: '서명 영역을 금빛 하이라이트처럼 강조하는 효과',
    number: 3,
  },
  {
    id: 'spectrum-edge',
    name: '스펙트럼 엣지',
    description: '카드 가장자리에 각도별 스펙트럼 반사를 더하는 효과',
    number: 4,
  },
  {
    id: 'constellation',
    name: '별자리 글리터',
    description: '작은 별점과 선명한 반짝임이 점층적으로 나타나는 글리터',
    number: 5,
  },
  {
    id: 'glass-caustics',
    name: '유리빛 굴절',
    description: '유리 표면을 통과한 빛처럼 얇은 굴절선을 겹치는 효과',
    number: 6,
  },
  {
    id: 'liquid-silver',
    name: '리퀴드 실버',
    description: '흐르는 은빛 금속 광택이 사진 위를 따라 움직이는 표면',
    number: 7,
  },
  {
    id: 'laser-engraving',
    name: '레이저 인그레이빙',
    description: '미세한 각인선과 날카로운 레이저 반사를 얹는 효과',
    number: 8,
  },
  {
    id: 'cinema-flare',
    name: '시네마 플레어',
    description: '렌즈 플레어 같은 긴 빛줄기로 무대감을 높이는 효과',
    number: 9,
  },
  {
    id: 'blossom-depth',
    name: '블로썸 뎁스',
    description: '꽃잎처럼 퍼지는 레이어 광택으로 깊이를 주는 효과',
    number: 10,
  },
  {
    id: 'light-signature',
    name: '라이트 시그니처',
    description: '사인처럼 남는 얇은 빛의 궤적을 더하는 효과',
    number: 11,
  },
  {
    id: 'diamond-cut',
    name: '다이아몬드 컷',
    description: '다각 컷팅면처럼 선명한 고광택 반사를 만드는 효과',
    number: 12,
  },
] as const

export const LEGACY_FOIL_PATTERN_IDS = [
  'aurora-wave',
  'prism',
  'cracked-ice',
  'micro-star',
  'liquid-chrome',
  'glass-flare',
] as const

export const ALL_FOIL_PATTERN_IDS = [
  ...EFFECT_CATALOG.map((effect) => effect.id),
  ...LEGACY_FOIL_PATTERN_IDS.filter(
    (id) => !EFFECT_CATALOG.some((effect) => effect.id === id),
  ),
] as const

export type FoilPattern = ApiFoilPattern | (typeof ALL_FOIL_PATTERN_IDS)[number]

export type NormalizedCardFrontEffects = {
  material: CardMaterial
  foilPattern: FoilPattern
  foilCoverage: FoilCoverage
  interaction: CardInteraction
  intensity: number
  angle: number
  lenticularAssetId: string | null
  effectSpread: number
  effectGrain: number
}

export type NormalizedCardBackEffects = {
  material: CardMaterial
  edgeFoil: EdgeFoil
  spotUv: SpotUv
  hiddenMessage: string
}

export type NormalizedCardEffects = {
  version: 3
  front: NormalizedCardFrontEffects
  back: NormalizedCardBackEffects
}

const MATERIALS = new Set<CardMaterial>(['matte', 'pearl', 'chrome'])
const FOIL_PATTERNS = new Set<FoilPattern>(ALL_FOIL_PATTERN_IDS)
const FOIL_COVERAGES = new Set<FoilCoverage>(['full', 'background', 'frame', 'signature'])
const INTERACTIONS = new Set<CardInteraction>(['static', 'tilt', 'lenticular'])
const EDGE_FOILS = new Set<EdgeFoil>(['none', 'silver', 'gold'])
const SPOT_UV_TARGETS = new Set<SpotUv>(['none', 'logo', 'symbol', 'serial'])

const LEGACY_MATERIAL: Record<string, CardMaterial> = {
  glass: 'pearl',
  silk: 'matte',
  diamond: 'chrome',
}
const LEGACY_PATTERN: Record<string, FoilPattern> = {
  aurora: 'aurora-wave',
  moonlight: 'aurora-wave',
  'rose-opal': 'aurora-wave',
  prism: 'prism',
  crystal: 'cracked-ice',
  stardust: 'micro-star',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizedIntensity(value: unknown, fallback = 0.78): number {
  const parsed = numeric(value, fallback)
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed))
}

function normalizedAngle(value: unknown, fallback = 135): number {
  const angle = numeric(value, fallback) % 360
  return angle < 0 ? angle + 360 : angle
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback
}

function nonemptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * A missing/empty design is the normal card state. Keep the visual treatment
 * opt-in so legacy cards do not receive a fake foil effect just because the
 * normalizer has safe defaults.
 */
export function hasConfiguredFrontEffect(designConfig?: CardDesignConfig | null): boolean {
  if (!isRecord(designConfig) || !isRecord(designConfig.front)) return false
  const front = designConfig.front
  const frontValues = front as Record<string, unknown>
  const effectKeys = ['material', 'foilPattern', 'foilCoverage', 'effect', 'effectPreset', 'effectIntensity', 'effectAngle', 'effectSpread', 'effectGrain', 'effectFinish']
  if (effectKeys.some(key => frontValues[key] !== undefined && frontValues[key] !== null && String(frontValues[key]).trim() !== '')) return true
  return front.interaction === 'tilt' || front.interaction === 'lenticular'
}

export function normalizeCardEffects(designConfig?: CardDesignConfig | null): NormalizedCardEffects
export function normalizeCardEffects(designConfig: unknown): NormalizedCardEffects
export function normalizeCardEffects(designConfig: unknown = {}): NormalizedCardEffects {
  const config = isRecord(designConfig) ? designConfig : {}
  const front = isRecord(config.front) ? config.front : {}
  const back = isRecord(config.back) ? config.back : {}
  const interaction = front.interaction ?? (front.effectMotion === false ? 'static' : 'tilt')
  const normalizedInteraction = oneOf(interaction, INTERACTIONS, 'static')
  const legacyFinish = front.effectFinish ?? (front.effect === 'holographic' ? 'glass' : undefined)
  const legacyMaterial =
    typeof legacyFinish === 'string' ? LEGACY_MATERIAL[legacyFinish] : undefined
  const configuredPreset = typeof front.preset === 'string' ? front.preset : ''
  const legacyPreset = typeof front.effectPreset === 'string' ? front.effectPreset : configuredPreset
  const presetPattern = {
    light: 'aurora-wave',
    glow: 'aurora-wave',
    foil: 'prism',
    hologram: 'prism',
    particles: 'micro-star',
    motion: 'aurora-wave',
  } as const

  return {
    version: 3,
    front: {
      material: oneOf(front.material, MATERIALS, legacyMaterial ?? 'matte'),
      foilPattern: oneOf(
        front.foilPattern,
        FOIL_PATTERNS,
        LEGACY_PATTERN[legacyPreset] ?? presetPattern[configuredPreset as keyof typeof presetPattern] ?? 'aurora-wave',
      ),
      foilCoverage: oneOf(front.foilCoverage, FOIL_COVERAGES, 'full'),
      interaction: normalizedInteraction,
      intensity: normalizedIntensity(front.intensity ?? front.effectIntensity, 0.58),
      angle: normalizedAngle(front.angle ?? front.effectAngle, 135),
      lenticularAssetId:
        normalizedInteraction === 'lenticular' ? nonemptyString(front.lenticularAssetId) : null,
      effectSpread: normalizedIntensity(front.effectSpread, 0.64),
      effectGrain: normalizedIntensity(front.effectGrain, 0.38),
    },
    back: {
      material: oneOf(back.material, MATERIALS, 'matte'),
      edgeFoil: oneOf(back.edgeFoil, EDGE_FOILS, 'none'),
      spotUv: oneOf(back.spotUv, SPOT_UV_TARGETS, 'none'),
      hiddenMessage: Array.from(String(back.hiddenMessage ?? '')).slice(0, 40).join(''),
    },
  }
}
