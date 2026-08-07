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
    handwritingImageUrl: string | null
    hasVoice: boolean
    voiceAudioUrl: string | null
    hasVideo: boolean
    videoUrl: string | null
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
      let message = `API 요청에 실패했습니다. (${response.status})`
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
