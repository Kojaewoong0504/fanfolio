import { useEffect, useState } from 'react'
import { fetchAuthenticatedMedia } from '../api/client'

type AuthenticatedMediaState = { url: string; loading: boolean; error: boolean }

export function useAuthenticatedMedia(path: string, retryKey = 0): AuthenticatedMediaState {
  const [state, setState] = useState<AuthenticatedMediaState>({ url: '', loading: Boolean(path), error: false })

  useEffect(() => {
    let cancelled = false
    setState({ url: '', loading: Boolean(path), error: false })
    if (!path) return () => { cancelled = true }
    const request = retryKey > 0 ? fetchAuthenticatedMedia(path, true) : fetchAuthenticatedMedia(path)
    void request.then(url => {
      if (!cancelled) setState({ url: url ?? '', loading: false, error: !url })
    })
    return () => { cancelled = true }
  }, [path, retryKey])

  return state
}
