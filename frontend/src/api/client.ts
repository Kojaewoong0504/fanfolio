const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export function notificationStreamUrl(): string {
  return `${apiBaseUrl}/notifications/stream?client=fan`
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
  email: string
  role: string
  nickname: string | null
  favoriteArtistIds: string[]
  favoriteMemberIds: string[]
  onboardingCompleted: boolean
}

export type UserCardDetail = {
  userCardId: string
  serialNumber: number
  acquisitionSource: string
  card: {
    id: string
    name: string
    isOfficial: boolean
    handwritingImageUrl: string | null
    hasVoice: boolean
    voiceAudioUrl: string | null
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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Fanfolio-Client': 'fan', ...init?.headers },
    ...init,
  })

  if (!response.ok) {
    let message = `API 요청에 실패했습니다. (${response.status})`
    try {
      const body = await response.json() as { error?: { message?: string } }
      message = body.error?.message ?? message
    } catch {
      // Empty error responses are still represented by the HTTP status.
    }
    throw new ApiError(response.status, message)
  }

  return response.json() as Promise<T>
}
