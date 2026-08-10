import type {
  CardDesignConfig,
  CardInteraction,
  CardMaterial,
  EdgeFoil,
  FoilCoverage,
  FoilPattern,
  SpotUv,
} from '../api/client'

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
const FOIL_PATTERNS = new Set<FoilPattern>([
  'aurora-wave',
  'prism',
  'cracked-ice',
  'micro-star',
])
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
  const legacyPreset = typeof front.effectPreset === 'string' ? front.effectPreset : ''

  return {
    version: 3,
    front: {
      material: oneOf(front.material, MATERIALS, legacyMaterial ?? 'matte'),
      foilPattern: oneOf(
        front.foilPattern,
        FOIL_PATTERNS,
        LEGACY_PATTERN[legacyPreset] ?? 'aurora-wave',
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
