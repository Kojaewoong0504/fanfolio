const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type CollectionCard = {
  userCardId: string
  cardId: string
  name: string
  imageUrl: string
  isOfficial: boolean
  serialNumber: number
  acquiredAt: string
}

export type NotificationItem = {
  id: string
  isRead: boolean
  readAt: string | null
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
    headers: { 'Content-Type': 'application/json', ...init?.headers },
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
