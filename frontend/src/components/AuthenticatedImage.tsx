import { useEffect, useState } from 'react'
import { fetchAuthenticatedMedia, resolveApiUrl } from '../api/client'

export function AuthenticatedImage({ src, fallback, alt, className, draggable }: { src: string | null | undefined; fallback?: string; alt: string; className?: string; draggable?: boolean }) {
  const [resolved, setResolved] = useState(() => src && !src.startsWith('/api/') ? resolveApiUrl(src) : fallback ?? '')
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    if (!src) { setResolved(fallback ?? ''); return () => undefined }
    if (!src.startsWith('/api/')) { setResolved(resolveApiUrl(src)); return () => undefined }
    setResolved(fallback ?? '')
    void fetchAuthenticatedMedia(src).then(url => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return }
      objectUrl = url
      if (url) setResolved(url)
    })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src, fallback])
  const handleError = () => {
    if (fallback && resolved !== resolveApiUrl(fallback)) setResolved(resolveApiUrl(fallback))
  }
  return <img className={className} src={resolved || fallback} alt={alt} draggable={draggable} onError={handleError} />
}
