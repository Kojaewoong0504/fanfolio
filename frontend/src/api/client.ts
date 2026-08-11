const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
// The deployed fan app proxies normal API traffic through its own origin so
// the refresh cookie is first-party. OAuth start remains on the API origin
// because its provider callback must receive the OAuth state cookie there.
const isDeployedFanApp = typeof window !== 'undefined' && window.location.hostname === 'fanfolio-fan.vercel.app'
const apiBaseUrl = isDeployedFanApp ? '/api' : configuredApiBaseUrl
const oauthApiBaseUrl = configuredApiBaseUrl.startsWith('/') ? apiBaseUrl : configuredApiBaseUrl
const API_REQUEST_TIMEOUT_MS = 15_000

let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Fanfolio-Client': 'fan' },
      })
      if (!response.ok) {
        clearAccessToken()
        return null
      }
      const body = await response.json() as { data?: { accessToken?: string } }
      const token = body.data?.accessToken
      if (!token) {
        clearAccessToken()
        return null
      }
      setAccessToken(token)
      return token
    } catch {
      clearAccessToken()
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/**
 * API 응답의 `/api/...` 자산 경로를 현재 API 서버 기준의 URL로 바꿉니다.
 * 프론트와 백엔드가 같은 origin인 개발 환경에서는 원래 경로를 유지하고,
 * 별도 도메인으로 배포된 환경에서는 이미지·오디오 요청도 API 서버로 보냅니다.
 */
export function resolveApiUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^(https?:|blob:|data:)/.test(path)) return path
  if (apiBaseUrl.startsWith('/')) return path
  const apiOrigin = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl
  return new URL(path, `${apiOrigin}/`).toString()
}

export function notificationStreamUrl(): string {
  return `${apiBaseUrl}/notifications/stream?client=fan`
}

export function oauthStartUrl(provider: 'google' | 'kakao'): string {
  return `${oauthApiBaseUrl}/auth/oauth/${provider}/start?client=fan`
}

export type CollectionCard = {
  userCardId: string
  cardId: string
  name: string
  imageUrl: string
  isOfficial: boolean
  serialNumber: number
  acquiredAt: string
  artistId?: string | null
  artistName?: string | null
  memberId?: string | null
  memberName?: string | null
}

export type CollectionSummary = {
  ownedCount: number
  totalSlots: number
  completionRate: number
}

export type CollectionBenefit = {
  campaignId?: string
  artistId: string | null
  artistName: string
  seasonName: string
  requiredCount: number
  ownedCount: number
  completionRate: number
  status: 'locked' | 'unlocked'
  claimed: boolean
  claimedAt: string | null
  claimable: boolean
  downloadUrl: string | null
  benefit: { type: 'digital_bonus'; title: string; description: string }
}

export type CatalogCard = {
  id: string
  status: string
  isOfficial: boolean
  name: string
  imageUrl: string
  artistId?: string | null
  artistName?: string | null
  memberId?: string | null
  memberName?: string | null
}

export type CatalogSort = 'recommended' | 'name' | 'rarity'

export type CatalogArtist = { id: string; name: string; imageUrl: string | null }
export type CatalogMember = { id: string; artistId: string; name: string }

export type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export type CurrentUser = {
  id: string
  email: string | null
  profileImageUrl: string | null
  role: string
  nickname: string | null
  favoriteArtistIds: string[]
  favoriteMemberIds: string[]
  onboardingCompleted: boolean
}

export type RewardType = 'badge' | 'title' | 'profile_frame' | 'collection_theme' | 'digital_bonus'

export type AchievementProgress = {
  id: string
  title: string
  description: string
  conditionType: string
  targetValue: number
  currentValue: number
  completedAt: string | null
}

export type RewardGrant = {
  id: string
  rewardId: string
  type: RewardType
  name: string
  grantedAt: string | null
  claimedAt: string | null
}

export type ProfileEquipment = {
  titleRewardId: string | null
  badgeRewardIds: string[]
  frameRewardId: string | null
  themeRewardId: string | null
  publicProfileEnabled: boolean
}

export type FanLevel = {
  level: number
  totalXp: number
  nextLevelXp?: number
}

export type PassTier = {
  id: string
  tier: number
  requiredXp: number
  rewardId: string | null
  claimed: boolean
  claimable: boolean
}

export type PassSeason = {
  id: string
  title: string
  organizationId: string | null
  artistId: string | null
  status: string
  isPaid: boolean
  startsAt: string | null
  endsAt: string | null
  progress: { currentXp: number; claimedTierIds: string[] }
  tiers: PassTier[]
}

export type FanPass = {
  seasons: PassSeason[]
}

export type PassTierClaim = {
  seasonId: string
  tierId: string
  claimedAt: string | null
  rewardGrant: RewardGrant | null
}

export type FanProgression = {
  level: FanLevel
  achievements: AchievementProgress[]
  claimableRewards: RewardGrant[]
  claimedRewards: RewardGrant[]
  pass: FanPass
  equipment: ProfileEquipment
  debugEvents?: Array<{ kind: string; sourceUserCardId?: string; status: string }>
}

export type CardMaterial = 'matte' | 'pearl' | 'chrome'
export type FoilPattern =
  | 'aurora-wave'
  | 'prism'
  | 'cracked-ice'
  | 'micro-star'
export type FoilCoverage = 'full' | 'background' | 'frame' | 'signature'
export type CardInteraction = 'static' | 'tilt' | 'lenticular'
export type EdgeFoil = 'none' | 'silver' | 'gold'
export type SpotUv = 'none' | 'logo' | 'symbol' | 'serial'

export type CardFrontDesignConfig = {
  material?: CardMaterial
  foilPattern?: FoilPattern
  foilCoverage?: FoilCoverage
  interaction?: CardInteraction
  intensity?: number
  angle?: number
  lenticularAssetId?: string | null
  effect?: string
  effectPreset?: string
  effectIntensity?: number
  effectAngle?: number
  effectMotion?: boolean
  effectSpread?: number
  effectGrain?: number
  effectFinish?: string
}

export type CardBackDesignConfig = {
  material?: CardMaterial
  edgeFoil?: EdgeFoil
  spotUv?: SpotUv
  hiddenMessage?: string
  effect?: string
}

export type CardDesignConfig = {
  version?: 2 | 3
  front?: CardFrontDesignConfig
  back?: CardBackDesignConfig
}

export type UserCardDetail = {
  userCardId: string
  serialNumber: number
  acquiredAt: string
  acquisitionSource: string
  drop: { name: string } | null
  redeemCode: { code: string } | null
  futureBenefitPreview: string | null
  card: {
    id: string
    name: string
    isOfficial: boolean
    seasonName: string | null
    cardType: string | null
    rarity: string | null
    signatureText: string | null
    handwrittenMessage: string | null
    issueLimit: number | null
    status: string
    designConfig?: CardDesignConfig | null
    handwritingImageUrl: string | null
    hasVoice: boolean
    voiceAudioUrl: string | null
    hasVideo: boolean
    videoUrl: string | null
    lenticularImageUrl?: string | null
    imageUrl?: string
    artistId?: string | null
    artistName?: string | null
    memberId?: string | null
    memberName?: string | null
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const { headers: customHeaders, ...requestInit } = init ?? {}
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS)
  const callerSignal = requestInit.signal
  const abortFromCaller = () => controller.abort()

  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestInit,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Fanfolio-Client': 'fan',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...customHeaders,
      },
    })

    if (!response.ok) {
      if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
        const refreshed = await refreshAccessToken()
        if (refreshed) return apiFetch<T>(path, init, false)
      }
      let message = response.status === 502 || response.status === 503
        ? '서비스가 잠시 준비 중입니다. 잠시 후 다시 시도해 주세요.'
        : `API 요청에 실패했습니다. (${response.status})`
      try {
        const body = await response.json() as { error?: { message?: string } }
        message = body.error?.message ?? message
      } catch {
        // Empty error responses are still represented by the HTTP status.
      }
      throw new ApiError(response.status, message)
    }

    // Logout and other command-style endpoints legitimately return 204 with
    // no response body. Do not turn a successful empty response into a JSON
    // parsing error in the shared client.
    if (response.status === 204) return undefined as T

    return response.json() as Promise<T>
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(408, '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.')
    }
    if (error instanceof TypeError) {
      throw new ApiError(0, '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export function getProgression(): Promise<{ ok: true, data: FanProgression }> {
  return apiFetch<{ ok: true, data: FanProgression }>('/me/progression')
}

export function claimReward(grantId: string): Promise<{ ok: true, data: RewardGrant }> {
  return apiFetch<{ ok: true, data: RewardGrant }>(`/me/rewards/${encodeURIComponent(grantId)}/claim`, { method: 'POST' })
}

export function updateProfileEquipment(equipment: ProfileEquipment): Promise<{ ok: true, data: ProfileEquipment }> {
  return apiFetch<{ ok: true, data: ProfileEquipment }>('/me/profile/equipment', {
    method: 'PUT',
    body: JSON.stringify(equipment),
  })
}

export function getFanPass(): Promise<{ ok: true, data: FanPass }> {
  return apiFetch<{ ok: true, data: FanPass }>('/me/pass')
}

export function claimPassTier(tierId: string): Promise<{ ok: true, data: PassTierClaim }> {
  return apiFetch<{ ok: true, data: PassTierClaim }>(`/me/pass-tiers/${encodeURIComponent(tierId)}/claim`, { method: 'POST' })
}
