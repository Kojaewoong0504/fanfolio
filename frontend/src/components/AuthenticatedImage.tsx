import { useEffect, useState } from 'react'
import { fetchAuthenticatedMedia, isPublicFanMediaPath, resolveApiUrl } from '../api/client'

export function AuthenticatedImage({ src, fallback, alt, className, draggable, loading, fetchPriority }: { src: string | null | undefined; fallback?: string; alt: string; className?: string; draggable?: boolean; loading?: 'eager' | 'lazy'; fetchPriority?: 'high' | 'low' | 'auto' }) {
  const [resolved, setResolved] = useState(() => src && (!src.startsWith('/api/') || isPublicFanMediaPath(src)) ? resolveApiUrl(src) : fallback ?? '')
  useEffect(() => {
    let cancelled = false
    if (!src) { setResolved(fallback ?? ''); return () => undefined }
    if (!src.startsWith('/api/') || isPublicFanMediaPath(src)) { setResolved(resolveApiUrl(src)); return () => undefined }
    setResolved(fallback ?? '')
    void fetchAuthenticatedMedia(src).then(url => {
      if (cancelled) return
      if (url) setResolved(url)
    })
    return () => { cancelled = true }
  }, [src, fallback])
  const handleError = () => {
    if (fallback && resolved !== resolveApiUrl(fallback)) setResolved(resolveApiUrl(fallback))
  }
  return <img className={className} src={resolved || fallback} alt={alt} draggable={draggable} loading={loading} fetchPriority={fetchPriority} decoding="async" onError={handleError} />
}
