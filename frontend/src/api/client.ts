const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
// The deployed fan app proxies normal API traffic through its own origin so
// the refresh cookie is first-party. OAuth start remains on the API origin
// because its provider callback must receive the OAuth state cookie there.
const isDeployedFanApp = typeof window !== 'undefined' && window.location.hostname === 'fanfolio-fan.vercel.app'
const apiBaseUrl = isDeployedFanApp ? '/api' : configuredApiBaseUrl
const oauthApiBaseUrl = configuredApiBaseUrl.startsWith('/') ? apiBaseUrl : configuredApiBaseUrl
const API_REQUEST_TIMEOUT_MS = 15_000
const MEDIA_REQUEST_TIMEOUT_MS = 10_000
const MEDIA_CACHE_LIMIT = 64

let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null
const mediaUrlCache = new Map<string, string>()
const mediaRequestCache = new Map<string, Promise<string | null>>()

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

export async function registerPushDevice(token: string): Promise<void> {
  await apiFetch('/me/push-devices', {
    method: 'PUT',
    body: JSON.stringify({ token, platform: 'web', deviceName: navigator.userAgent.slice(0, 120) }),
  })
}

export async function unregisterPushDevice(token: string): Promise<void> {
  await apiFetch('/me/push-devices', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  })
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

/** Public fan media can be loaded as a normal image so the browser/CDN cache works. */
export function isPublicFanMediaPath(path: string): boolean {
  return /^\/api\/(?:cards|rewards)\/[^/]+\/image(?:\?|$)/.test(path)
}

export async function fetchAuthenticatedMedia(path: string, force = false): Promise<string | null> {
  if (isPublicFanMediaPath(path)) return resolveApiUrl(path)
  const cacheKey = resolveApiUrl(path)
  if (force) {
    const cached = mediaUrlCache.get(cacheKey)
    if (cached) URL.revokeObjectURL(cached)
    mediaUrlCache.delete(cacheKey)
  }
  const cachedUrl = mediaUrlCache.get(cacheKey)
  if (cachedUrl) return cachedUrl
  const pending = mediaRequestCache.get(cacheKey)
  if (pending) return pending

  const requestPromise = (async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), MEDIA_REQUEST_TIMEOUT_MS)
    try {
      const request = async () => fetch(cacheKey, {
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'X-Fanfolio-Client': 'fan',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      })
      let response = await request()
      if (response.status === 401 && await refreshAccessToken()) response = await request()
      if (!response.ok) return null
      const objectUrl = URL.createObjectURL(await response.blob())
      mediaUrlCache.set(cacheKey, objectUrl)
      while (mediaUrlCache.size > MEDIA_CACHE_LIMIT) {
        const oldest = mediaUrlCache.keys().next().value
        if (!oldest) break
        const evicted = mediaUrlCache.get(oldest)
        mediaUrlCache.delete(oldest)
        if (evicted) URL.revokeObjectURL(evicted)
      }
      return objectUrl
    } catch {
      return null
    } finally {
      window.clearTimeout(timeout)
      mediaRequestCache.delete(cacheKey)
    }
  })()
  mediaRequestCache.set(cacheKey, requestPromise)
  return requestPromise
}

export function notificationStreamUrl(): string {
  return `${apiBaseUrl}/notifications/stream?client=fan`
}

export async function connectNotificationStream(
  onNotification: (item: NotificationItem) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!accessToken) return
  const response = await fetch(notificationStreamUrl(), {
    credentials: 'include',
    signal,
    headers: {
      'X-Fanfolio-Client': 'fan',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) throw new ApiError(response.status, `알림 스트림 연결에 실패했습니다. (${response.status})`)
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  while (!signal.aborted) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:') && eventName === 'notification') {
        try { onNotification(JSON.parse(line.slice(5).trim()) as NotificationItem) } catch { /* polling remains the source of truth */ }
      }
      if (!line.trim()) eventName = ''
    }
  }
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
  rarity?: string | null
  seasonName?: string | null
  cardType?: string | null
  signatureText?: string | null
  issueLimit?: number | null
  acquisitionSource?: string | null
  expiresAt?: string | null
  tradable?: boolean
}

export type CardPackCard = {
  cardId: string
  name: string
  rarity: string | null
  imageUrl: string
  memberId: string | null
  probability: number
  position: number
}

export type CardPack = {
  id: string
  artistId: string
  name: string
  seasonName: string | null
  version: string
  imageUrl: string | null
  description: string | null
  status: string
  publishedAt: string | null
  cards: CardPackCard[]
}

export type CardPackOpening = {
  openingId: string
  issuanceCode: string
  userCardId: string
  packId: string
  cardId: string
  serialNumber: number
  probability: number
  card: CardPackCard
}

export type ShopProduct = {
  id: string
  artistId: string
  artistName?: string | null
  productType: 'card_pack' | 'point_item' | 'limited_item'
  cardPackId?: string | null
  name: string
  description?: string | null
  detailContent?: Array<{ key?: string; type?: 'text' | 'image'; title: string; body?: string | null; imageUrl?: string | null; alt?: string | null }> | null
  fulfillment?: { rewardId?: string } | null
  imageUrl?: string | null
  pricePoints: number
  status: 'draft' | 'published' | 'archived'
  startsAt?: string | null
  endsAt?: string | null
  cardPack?: { id: string; name: string; seasonName?: string | null; version: string; imageUrl?: string | null; status: string } | null
}

export type ShopOrder = {
  id: string
  productId: string
  productName: string
  pricePoints: number
  paymentMethod: 'points'
  status: 'completed' | 'failed' | 'refunded'
  createdAt: string
}

export type CardCombinationOdds = {
  cardId: string
  name: string
  rarity: string | null
  imageUrl: string
  probability: number
}

export type CardCombinationRecipe = {
  id: string
  packId?: string
  packName?: string
  inputQuantity: number
  outputRarityPool: string[]
  probabilityVersion: string
  publicOdds: CardCombinationOdds[]
}

export type CardCombinationPreview = CardCombinationRecipe & {
  consumableUserCardIds: string[]
  requiredQuantity: number
}

export type CardCombinationResult = {
  combinationId: string
  recipeId: string
  cardId: string
  userCardId: string
  consumedUserCardIds: string[]
  probabilityVersion: string
  status: string
  card: CardPackCard
}

export type CollectionSummary = {
  ownedCount: number
  totalSlots: number
  completionRate: number
}

export type CollectionGoal = {
  id: string
  packId: string
  packName: string
  seasonName: string | null
  targetCount: number
  ownedCount: number
  completionRate: number
  completedAt: string | null
  createdAt: string
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
  rarity?: string | null
  seasonName?: string | null
  cardType?: string | null
  signatureText?: string | null
  issueLimit?: number | null
}

export type CatalogSort = 'recommended' | 'name' | 'rarity'

export type CatalogArtist = { id: string; name: string; imageUrl: string | null }
export type CatalogMember = { id: string; artistId: string; name: string }

export type FanEventStatus = 'upcoming' | 'active' | 'ended'
export type FanEventType = 'announcement' | 'comment' | 'card_drop' | 'card' | 'fan_mission' | 'external'
export type FanEventRelatedCard = {
  id: string
  name: string
  imageUrl: string
  artistId: string | null
  artistName: string | null
  memberId: string | null
  memberName: string | null
  rarity: string | null
}
export type FanEvent = {
  id: string
  artistId: string | null
  artistName: string | null
  title: string
  summary: string
  description: string
  noticeItems: string[]
  relatedCards: FanEventRelatedCard[]
  eventType: FanEventType
  status: FanEventStatus
  startsAt: string
  endsAt: string | null
  heroUrl: string | null
  ctaLabel: string | null
  ctaTarget: string | null
  venue?: string | null
  participantLimit?: number | null
  participantCount?: number
  applicationStartsAt?: string | null
  applicationEndsAt?: string | null
  applicationStatus?: 'upcoming' | 'available' | 'full' | 'closed' | 'applied'
  applied?: boolean
}
export type EventPagination = { page: number; pageSize: number; total: number; totalPages: number }
export type EventListResponse = { items: FanEvent[]; pagination: EventPagination }
export type FanEventApplication = {
  applicationId: string
  eventId: string
  status: string
  createdAt: string
  event: Pick<FanEvent, 'id' | 'title' | 'summary' | 'startsAt' | 'endsAt' | 'venue'>
}
export type FanEventComment = {
  id: string
  body: string
  authorNickname: string
  createdAt: string
}
export type FanHomeResponse = {
  featuredEvent: FanEvent | null
  upcomingEvents: FanEvent[]
  favoriteArtist: { id: string; name: string; imageUrl: string | null } | null
  newCards: CatalogCard[]
}

export type NotificationPreferences = { emailEnabled: boolean }

export type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export function getFanHome(): Promise<{ ok: true; data: FanHomeResponse }> {
  return apiFetch<{ ok: true; data: FanHomeResponse }>('/home')
}

export function getNotificationPreferences(): Promise<{ ok: true; data: NotificationPreferences }> {
  return apiFetch<{ ok: true; data: NotificationPreferences }>('/me/notification-preferences')
}

export function updateNotificationPreferences(emailEnabled: boolean): Promise<{ ok: true; data: NotificationPreferences }> {
  return apiFetch<{ ok: true; data: NotificationPreferences }>('/me/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify({ emailEnabled }),
  })
}

export function changeFanPassword(currentPassword: string, newPassword: string): Promise<{ ok: true; data: { changed: true } }> {
  return apiFetch<{ ok: true; data: { changed: true } }>('/auth/fan/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function requestFanPasswordReset(email: string): Promise<{ ok: true; data: { delivery: string } }> {
  return apiFetch<{ ok: true; data: { delivery: string } }>('/auth/fan/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function confirmFanPasswordReset(token: string, newPassword: string): Promise<{ ok: true; data: { changed: true } }> {
  return apiFetch<{ ok: true; data: { changed: true } }>('/auth/fan/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}

export function getFanEvents(params: { status?: FanEventStatus | 'all'; artistId?: string; page?: number; pageSize?: number } = {}): Promise<{ ok: true; data: EventListResponse }> {
  const search = new URLSearchParams()
  search.set('status', params.status ?? 'active')
  search.set('page', String(params.page ?? 1))
  search.set('pageSize', String(params.pageSize ?? 12))
  if (params.artistId) search.set('artistId', params.artistId)
  return apiFetch<{ ok: true; data: EventListResponse }>(`/events?${search.toString()}`)
}

export function getFanEvent(eventId: string): Promise<{ ok: true; data: FanEvent }> {
  return apiFetch<{ ok: true; data: FanEvent }>(`/events/${encodeURIComponent(eventId)}`)
}

export function applyToFanEvent(eventId: string): Promise<{
  ok: true
  data: { id: string; eventId: string; status: string; createdAt: string }
}> {
  return apiFetch(`/events/${encodeURIComponent(eventId)}/applications`, { method: 'POST' })
}

export function getFanEventComments(eventId: string): Promise<{ ok: true; data: { items: FanEventComment[] } }> {
  return apiFetch(`/events/${encodeURIComponent(eventId)}/comments`)
}

export function postFanEventComment(eventId: string, body: string): Promise<{ ok: true; data: FanEventComment }> {
  return apiFetch(`/events/${encodeURIComponent(eventId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function getMyEventApplications(): Promise<{
  ok: true
  data: { items: FanEventApplication[] }
}> {
  return apiFetch('/me/event-applications')
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
  followingCount: number
  followerCount: number
  points: number
  hasPassword: boolean
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
  metadata?: Record<string, unknown>
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
  reward: { id: string; type: RewardType; name: string; metadata: Record<string, unknown> } | null
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

export type FanMission = {
  id: string
  title: string
  description: string | null
  eventKind: string
  targetValue: number
  recurrence: string
  periodKey: string
  currentValue: number
  completed: boolean
  completedAt: string | null
  claimable: boolean
  claimedAt: string | null
  reward: Record<string, unknown>
}

export type PointLedgerItem = {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string
  createdAt: string
}

export type PointExchange = {
  id: string
  name: string
  type: RewardType
  pointCost: number
  metadata: Record<string, unknown>
}

export type FanPoints = { balance: number; items: PointLedgerItem[] }

export function getFanMissions(status?: 'active' | 'completed' | 'ended'): Promise<{ ok: true; data: { items: FanMission[] } }> {
  const query = status ? `?status=${status}` : ''
  return apiFetch<{ ok: true; data: { items: FanMission[] } }>(`/me/missions${query}`)
}

export function claimFanMission(missionId: string): Promise<{ ok: true; data: { missionId: string; grants: RewardGrant[] } }> {
  return apiFetch<{ ok: true; data: { missionId: string; grants: RewardGrant[] } }>(`/me/missions/${encodeURIComponent(missionId)}/claim`, { method: 'POST' })
}

export function getFanPoints(): Promise<{ ok: true; data: FanPoints }> {
  return apiFetch<{ ok: true; data: FanPoints }>('/me/points')
}

export function getPointExchanges(): Promise<{ ok: true; data: { items: PointExchange[] } }> {
  return apiFetch<{ ok: true; data: { items: PointExchange[] } }>('/catalog/point-exchanges')
}

export function exchangePoints(rewardId: string, idempotencyKey = crypto.randomUUID()): Promise<{ ok: true; data: { grantId: string; rewardId: string; points: number; balance: number; replayed?: boolean } }> {
  return apiFetch<{ ok: true; data: { grantId: string; rewardId: string; points: number; balance: number; replayed?: boolean } }>('/me/points/exchange', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ rewardId }),
  })
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

export type UserCardHistoryItem = {
  id: string
  action: string
  sourceType: string
  sourceId: string
  fromUserId: string | null
  toUserId: string | null
  metadata: Record<string, unknown>
  createdAt: string
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

export async function exportPersonalData(): Promise<Record<string, unknown>> {
  const result = await apiFetch<{ ok: true; data: Record<string, unknown> }>('/me/privacy/export')
  return result.data
}

export async function deleteFanAccount(confirmation: string): Promise<void> {
  await apiFetch<void>('/me/privacy/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirmation }),
  })
}

function growthScopeQuery(artistId?: string | null): string {
  return artistId ? `?artistId=${encodeURIComponent(artistId)}` : '?scope=global'
}

export function getProgression(artistId?: string | null): Promise<{ ok: true, data: FanProgression }> {
  return apiFetch<{ ok: true, data: FanProgression }>(`/me/progression${growthScopeQuery(artistId)}`)
}

export function claimReward(grantId: string): Promise<{ ok: true, data: RewardGrant }> {
  return apiFetch<{ ok: true, data: RewardGrant }>(`/me/rewards/${encodeURIComponent(grantId)}/claim`, { method: 'POST' })
}

export function reconcilePassRewards(): Promise<{ ok: true, data: { repairedCount: number } }> {
  return apiFetch<{ ok: true, data: { repairedCount: number } }>('/me/rewards/reconcile-pass', { method: 'POST' })
}

export function updateProfileEquipment(equipment: ProfileEquipment): Promise<{ ok: true, data: ProfileEquipment }> {
  return apiFetch<{ ok: true, data: ProfileEquipment }>('/me/profile/equipment', {
    method: 'PUT',
    body: JSON.stringify(equipment),
  })
}

export function getFanPass(artistId?: string | null): Promise<{ ok: true, data: FanPass }> {
  return apiFetch<{ ok: true, data: FanPass }>(`/me/pass${growthScopeQuery(artistId)}`)
}

export function claimPassTier(tierId: string): Promise<{ ok: true, data: PassTierClaim }> {
  return apiFetch<{ ok: true, data: PassTierClaim }>(`/me/pass-tiers/${encodeURIComponent(tierId)}/claim`, { method: 'POST' })
}

export type RedemptionSource = 'qr' | 'manual'

export type CardRedemption = {
  userCardId: string
  cardId: string
  serialNumber: number
}

export type RedemptionPreview = {
  card: {
    id: string
    name: string
    imageUrl: string
    isOfficial: boolean
    artistId?: string | null
    artistName?: string | null
    memberId?: string | null
    memberName?: string | null
    rarity?: string | null
    seasonName?: string | null
  }
}

export function previewRedemption(code: string, source: RedemptionSource): Promise<{ ok: true, data: RedemptionPreview }> {
  return apiFetch<{ ok: true, data: RedemptionPreview }>('/redemptions/preview', {
    method: 'POST',
    body: JSON.stringify({ code, source }),
  })
}

export function redeemCard(code: string, source: RedemptionSource): Promise<{ ok: true, data: CardRedemption }> {
  return apiFetch<{ ok: true, data: CardRedemption }>('/redemptions', {
    method: 'POST',
    body: JSON.stringify({ code, source }),
  })
}

export function getCardPacks(artistId?: string | null): Promise<{ ok: true, data: { items: CardPack[] } }> {
  const query = artistId ? `?artistId=${encodeURIComponent(artistId)}` : ''
  return apiFetch<{ ok: true, data: { items: CardPack[] } }>(`/catalog/card-packs${query}`)
}

export function getCatalogCards(filters?: { artistId?: string; sort?: CatalogSort }): Promise<{ ok: true, data: { items: CatalogCard[] } }> {
  const params = new URLSearchParams()
  if (filters?.artistId) params.set('artistId', filters.artistId)
  if (filters?.sort) params.set('sort', filters.sort)
  const query = params.size ? `?${params.toString()}` : ''
  return apiFetch<{ ok: true, data: { items: CatalogCard[] } }>(`/catalog/cards${query}`)
}

export function getCardPackOdds(packId: string): Promise<{ ok: true, data: { pack: CardPack, items: CardPackCard[], totalProbability: number } }> {
  return apiFetch<{ ok: true, data: { pack: CardPack, items: CardPackCard[], totalProbability: number } }>(`/catalog/card-packs/${encodeURIComponent(packId)}/odds`)
}

export function getShopProducts(filters?: { artistId?: string; productType?: ShopProduct['productType'] }): Promise<{ ok: true, data: { items: ShopProduct[] } }> {
  const params = new URLSearchParams()
  if (filters?.artistId) params.set('artistId', filters.artistId)
  if (filters?.productType) params.set('productType', filters.productType)
  const query = params.size ? `?${params.toString()}` : ''
  return apiFetch<{ ok: true; data: { items: ShopProduct[] } }>(`/catalog/shop/products${query}`)
}

export function getShopProduct(productId: string): Promise<{ ok: true; data: ShopProduct }> {
  return apiFetch<{ ok: true; data: ShopProduct }>(`/catalog/shop/products/${encodeURIComponent(productId)}`)
}

export function createShopOrder(productId: string): Promise<{ ok: true; data: { id: string; productId: string; status: ShopOrder['status'] } }> {
  return apiFetch<{ ok: true; data: { id: string; productId: string; status: ShopOrder['status'] } }>('/me/shop/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `shop-order-${productId}-${crypto.randomUUID()}` },
    body: JSON.stringify({ productId, paymentMethod: 'points' }),
  })
}

export function refundShopOrder(orderId: string): Promise<{ ok: true; data: { orderId: string; balance: number } }> {
  return apiFetch<{ ok: true; data: { orderId: string; balance: number } }>(`/me/shop/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `shop-refund-${orderId}` },
  })
}

export function getShopOrders(): Promise<{ ok: true; data: { items: ShopOrder[] } }> {
  return apiFetch<{ ok: true; data: { items: ShopOrder[] } }>('/me/shop/orders')
}

export function openCardPack(packId: string): Promise<{ ok: true, data: CardPackOpening }> {
  return apiFetch<{ ok: true, data: CardPackOpening }>(`/me/card-packs/${encodeURIComponent(packId)}/open`, { method: 'POST' })
}

export function getUserCardHistory(userCardId: string): Promise<{ ok: true, data: { userCardId: string, items: UserCardHistoryItem[] } }> {
  return apiFetch<{ ok: true, data: { userCardId: string, items: UserCardHistoryItem[] } }>(`/me/cards/${encodeURIComponent(userCardId)}/history`)
}

export function getCardCombination(packId: string): Promise<{ ok: true, data: CardCombinationRecipe }> {
  return apiFetch<{ ok: true, data: CardCombinationRecipe }>(`/catalog/card-packs/${encodeURIComponent(packId)}/combination`)
}

export function previewCardCombination(recipeId: string, materialUserCardIds: string[]): Promise<{ ok: true, data: CardCombinationPreview }> {
  return apiFetch<{ ok: true, data: CardCombinationPreview }>('/me/card-combinations/preview', {
    method: 'POST',
    body: JSON.stringify({ recipeId, materialUserCardIds }),
  })
}

export function combineCards(recipeId: string, materialUserCardIds: string[], idempotencyKey = `card-combination-${crypto.randomUUID()}`): Promise<{ ok: true, data: CardCombinationResult }> {
  return apiFetch<{ ok: true, data: CardCombinationResult }>('/me/card-combinations', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ recipeId, materialUserCardIds }),
  })
}

export type PublicCollection = {
  userId: string
  nickname: string | null
  profileImageUrl?: string | null
  featuredPackId?: string | null
  visibility: 'public'
  isFollowing: boolean
  summary: { ownedCount: number; followerCount: number; followingCount: number }
  cards: Array<CollectionCard & { expiresAt?: string | null; tradable: boolean }>
  wantedCards?: PublicWantedCard[]
}

export type PublicWantedCard = {
  cardId: string
  name: string
  imageUrl: string
  isOfficial: boolean
  artistId?: string | null
  artistName?: string | null
  memberId?: string | null
  memberName?: string | null
  rarity?: string | null
  seasonName?: string | null
  cardType?: string | null
  signatureText?: string | null
  issueLimit?: number | null
}

export type FanSummary = {
  id: string
  nickname: string
  profileImageUrl?: string | null
  isFollowing: boolean
  followerCount: number
  followingCount: number
  ownedCount: number
  tradableCount: number
  favoriteArtists: CatalogArtist[]
  sharedFavoriteArtists: CatalogArtist[]
  previewCards: CollectionCard[]
  matchingWishlistCount: number
  latestCardAt: string | null
}

export type TradeProposal = {
  id: string
  proposerUserId: string
  recipientUserId: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'
  offeredUserCardIds: string[]
  requestedUserCardIds: string[]
  expiresAt: string
  createdAt: string
}

export type TradeParticipant = {
  id: string
  nickname?: string | null
  profileImageUrl?: string | null
}

export type TradeCard = CollectionCard & {
  side: 'offered' | 'requested'
  unavailable?: boolean
}

export type TradeProposalDetail = TradeProposal & {
  proposer: TradeParticipant
  recipient: TradeParticipant
  offeredCards: TradeCard[]
  requestedCards: TradeCard[]
}

export function getPublicCollection(userId: string): Promise<{ ok: true, data: PublicCollection }> {
  return apiFetch<{ ok: true, data: PublicCollection }>(`/fans/${encodeURIComponent(userId)}/collection`)
}

export function searchFans(query = ''): Promise<{ ok: true, data: { items: FanSummary[] } }> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return apiFetch<{ ok: true, data: { items: FanSummary[] } }>(`/fans${suffix}`)
}

export function getFanConnections(kind: 'following' | 'followers'): Promise<{ ok: true, data: { kind: typeof kind; items: FanSummary[] } }> {
  return apiFetch<{ ok: true, data: { kind: typeof kind; items: FanSummary[] } }>(`/me/follows?kind=${kind}`)
}

export function getMyCollection(): Promise<{ ok: true, data: { summary: CollectionSummary; cards: CollectionCard[] } }> {
  return apiFetch<{ ok: true, data: { summary: CollectionSummary; cards: CollectionCard[] } }>('/me/collection')
}

export function getWishlist(): Promise<{ ok: true, data: { items: Array<{ cardId: string }> } }> {
  return apiFetch<{ ok: true, data: { items: Array<{ cardId: string }> } }>('/me/wishlist')
}

export function saveWishlistCard(cardId: string): Promise<{ ok: true, data: { cardId: string; saved: true } }> {
  return apiFetch<{ ok: true, data: { cardId: string; saved: true } }>(`/me/wishlist/${encodeURIComponent(cardId)}`, { method: 'PUT' })
}

export function removeWishlistCard(cardId: string): Promise<{ ok: true, data: { cardId: string; saved: false } }> {
  return apiFetch<{ ok: true, data: { cardId: string; saved: false } }>(`/me/wishlist/${encodeURIComponent(cardId)}`, { method: 'DELETE' })
}

export function getCollectionGoals(): Promise<{ ok: true, data: { items: CollectionGoal[] } }> {
  return apiFetch<{ ok: true, data: { items: CollectionGoal[] } }>('/me/collection-goals')
}

export function createCollectionGoal(packId: string, targetCount?: number): Promise<{ ok: true, data: CollectionGoal }> {
  return apiFetch<{ ok: true, data: CollectionGoal }>('/me/collection-goals', {
    method: 'POST',
    body: JSON.stringify({ packId, ...(targetCount ? { targetCount } : {}) }),
  })
}

export function deleteCollectionGoal(goalId: string): Promise<{ ok: true, data: { deleted: boolean } }> {
  return apiFetch<{ ok: true, data: { deleted: boolean } }>(`/me/collection-goals/${encodeURIComponent(goalId)}`, { method: 'DELETE' })
}

export function followFan(userId: string): Promise<{ ok: true, data: { followingUserId: string; following: boolean } }> {
  return apiFetch<{ ok: true, data: { followingUserId: string; following: boolean } }>(`/me/follows/${encodeURIComponent(userId)}`, { method: 'POST' })
}

export function unfollowFan(userId: string): Promise<{ ok: true, data: { followingUserId: string; following: boolean } }> {
  return apiFetch<{ ok: true, data: { followingUserId: string; following: boolean } }>(`/me/follows/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function updateCollectionVisibility(publicEnabled: boolean): Promise<{ ok: true, data: { public: boolean } }> {
  return apiFetch<{ ok: true, data: { public: boolean } }>('/me/collection-visibility', {
    method: 'PUT',
    body: JSON.stringify({ public: publicEnabled }),
  })
}

export function createTradeProposal(input: {
  recipientUserId: string
  offeredUserCardIds: string[]
  requestedUserCardIds?: string[]
}): Promise<{ ok: true, data: TradeProposal }> {
  return apiFetch<{ ok: true, data: TradeProposal }>('/me/trades', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getTradeProposals(
  box: 'all' | 'sent' | 'received' = 'all',
  tradeStatus?: TradeProposal['status'],
): Promise<{ ok: true, data: { box: typeof box; items: TradeProposalDetail[] } }> {
  const params = new URLSearchParams({ box })
  if (tradeStatus) params.set('status', tradeStatus)
  return apiFetch<{ ok: true, data: { box: typeof box; items: TradeProposalDetail[] } }>(`/me/trades?${params.toString()}`)
}

export function getTradeProposal(proposalId: string): Promise<{ ok: true, data: TradeProposalDetail }> {
  return apiFetch<{ ok: true, data: TradeProposalDetail }>(`/me/trades/${encodeURIComponent(proposalId)}`)
}

export function respondToTradeProposal(
  proposalId: string,
  action: 'accept' | 'reject' | 'cancel',
): Promise<{ ok: true, data: { id: string; status: TradeProposal['status'] } }> {
  return apiFetch<{ ok: true, data: { id: string; status: TradeProposal['status'] } }>(`/me/trades/${encodeURIComponent(proposalId)}/${action}`, { method: 'POST' })
}
