import type { ReactEventHandler } from 'react'

type ProtectedCardImageProps = {
  src: string
  alt: string
  onError?: ReactEventHandler<HTMLImageElement>
}

export function ProtectedCardImage({ src, alt, onError }: ProtectedCardImageProps) {
  return <span className="protected-card-image" data-card-asset>
    <img src={src} alt={alt} draggable={false} onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()} onError={onError} />
  </span>
}
