export function normalizeQrValue(rawValue: string): string {
  const fallback = rawValue.trim()
  try {
    const url = new URL(rawValue)
    const queryCode = url.searchParams.get('code')?.trim()
    if (queryCode) return queryCode
    return url.pathname.split('/').filter(Boolean).pop() ?? fallback
  } catch {
    return fallback
  }
}
