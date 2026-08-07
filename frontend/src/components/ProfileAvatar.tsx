import { useEffect, useState } from 'react'

export function ProfileAvatar({ imageUrl, fallback, className = '', alt = '' }: { imageUrl: string | null, fallback: string, className?: string, alt?: string }) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [imageUrl])

  if (imageUrl && !imageFailed) {
    return <img className={`profile-avatar ${className}`} src={imageUrl} alt={alt} onError={() => setImageFailed(true)} />
  }
  return <span className={`profile-avatar profile-avatar-fallback ${className}`} aria-hidden={alt ? undefined : true}>{fallback.slice(0, 1) || '팬'}</span>
}
