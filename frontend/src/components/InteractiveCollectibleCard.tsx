import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import type { CardDesignConfig } from '../api/client'
import { normalizeCardEffects } from '../utils/cardEffects'
import { hasConfiguredFrontEffect } from '../utils/cardEffects'
import { InlineIcon } from '../App'

type CollectibleStyle = CSSProperties & Record<'--tilt-x' | '--tilt-y' | '--light-x' | '--light-y' | '--lenticular-reveal' | '--effect-opacity' | '--effect-angle' | '--effect-spread' | '--effect-grain', string>
type MotionStatus = 'idle' | 'granted' | 'denied' | 'unsupported'
type VisibleSide = 'front' | 'back'

export type InteractiveCollectibleCardProps = {
  imageUrl: string
  imageAlt: string
  identity: string
  title: string
  artist: string
  member?: string | null
  serialLabel: string
  limitLabel: string
  sealLabel: string
  designConfig?: CardDesignConfig | null
  lenticularImageUrl?: string | null
  hiddenMessage?: string
  badgeLabel?: string
  handwritingImageUrl?: string | null
  handwritingAlt?: string
  onImageError?: (event: SyntheticEvent<HTMLImageElement>) => void
  presentation?: 'detail' | 'reveal'
  enableDeviceMotion?: boolean
  initialSide?: VisibleSide
  swipeToFlip?: boolean
  showControls?: boolean
}

function resolveVisibleSideAfterCardIdentityChange(current: VisibleSide, previousCardIdentity: string | null, nextCardIdentity: string): VisibleSide {
  return previousCardIdentity === null || previousCardIdentity === nextCardIdentity ? current : 'front'
}

function prefersReducedEffects(): boolean {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  const browserNavigator = typeof navigator !== 'undefined'
    ? navigator as Navigator & { deviceMemory?: number }
    : null
  const deviceMemory = Number.isFinite(Number(browserNavigator?.deviceMemory))
    ? Number(browserNavigator?.deviceMemory)
    : null
  return reducedMotion || (deviceMemory !== null && deviceMemory <= 2)
}

function supportsDeviceMotion(): boolean {
  return window.isSecureContext === true && typeof window.DeviceOrientationEvent !== 'undefined'
}

function clampMotion(value: number | null): number {
  if (!Number.isFinite(Number(value))) return 0
  return Math.max(-15, Math.min(15, Number(value)))
}

function resetCollectibleVars(element: HTMLElement): void {
  element.style.setProperty('--tilt-x', '0deg')
  element.style.setProperty('--tilt-y', '0deg')
  element.style.setProperty('--light-x', '50%')
  element.style.setProperty('--light-y', '42%')
  element.style.setProperty('--lenticular-reveal', '0%')
}

export function InteractiveCollectibleCard({
  imageUrl,
  imageAlt,
  identity,
  title,
  artist,
  member,
  serialLabel,
  limitLabel,
  sealLabel,
  designConfig,
  lenticularImageUrl,
  hiddenMessage,
  badgeLabel = '공식 카드',
  handwritingImageUrl,
  handwritingAlt = '카드에 포함된 손글씨·사인·그림 특전',
  onImageError,
  presentation = 'detail',
  enableDeviceMotion = false,
  initialSide = 'front',
  swipeToFlip = false,
  showControls = true,
}: InteractiveCollectibleCardProps) {
  const [visibleSide, setVisibleSide] = useState<VisibleSide>(initialSide)
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('idle')
  const [deviceMotionEnabled, setDeviceMotionEnabled] = useState(false)
  const collectibleRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ pointerId: number, x: number, y: number } | null>(null)
  const previousIdentityRef = useRef<string | null>(identity)

  useEffect(() => {
    setVisibleSide(current => resolveVisibleSideAfterCardIdentityChange(current, previousIdentityRef.current, identity))
    previousIdentityRef.current = identity
    setMotionStatus('idle')
    setDeviceMotionEnabled(false)
    if (collectibleRef.current) resetCollectibleVars(collectibleRef.current)
  }, [identity])

  const effects = normalizeCardEffects(designConfig)
  const hasSurface = hasConfiguredFrontEffect(designConfig)
  const hasLenticular = Boolean(effects.front.interaction === 'lenticular' && lenticularImageUrl)
  const reducedEffects = prefersReducedEffects()
  const motionSupported = !reducedEffects && supportsDeviceMotion()
  const canRequestDeviceMotion = Boolean(
    enableDeviceMotion &&
    motionStatus === 'idle' &&
    motionSupported &&
    (visibleSide === 'back' || effects.front.interaction !== 'static'),
  )

  const collectibleStyle = {
    '--tilt-x': '0deg',
    '--tilt-y': '0deg',
    '--light-x': '50%',
    '--light-y': '42%',
    '--lenticular-reveal': '0%',
    '--effect-opacity': hasSurface ? String(0.2 + effects.front.intensity * 0.42) : '0',
    '--effect-angle': `${effects.front.angle}deg`,
    '--effect-spread': `${Math.round(effects.front.effectSpread * 100)}%`,
    '--effect-grain': String(effects.front.effectGrain),
  } as CollectibleStyle
  const frontClassName = `fan-card-collectible front material-${effects.front.material} pattern-${effects.front.foilPattern} coverage-${effects.front.foilCoverage} interaction-${effects.front.interaction}${hasLenticular ? ' has-lenticular' : ''}${hasSurface ? ' has-surface' : ''}`
  const backClassName = `fan-card-collectible material-${effects.back.material} back edge-foil-${effects.back.edgeFoil} spot-uv-${effects.back.spotUv}`

  const handleCollectibleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      const start = dragStartRef.current
      if (!start || start.pointerId !== event.pointerId) return
      const deltaX = Math.abs(event.clientX - start.x)
      const deltaY = Math.abs(event.clientY - start.y)
      if (deltaX < 8 && deltaY < 8) return
      if (deltaY > deltaX) return
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (reducedEffects) return
    const element = event.currentTarget
    const box = element.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
    const canTilt = visibleSide === 'back' || effects.front.interaction !== 'static'
    if (canTilt) {
      element.style.setProperty('--tilt-x', `${((0.5 - y) * 10).toFixed(2)}deg`)
      element.style.setProperty('--tilt-y', `${((x - 0.5) * 12).toFixed(2)}deg`)
    }
    if (visibleSide === 'front') {
      element.style.setProperty('--light-x', `${Math.round(x * 100)}%`)
      element.style.setProperty('--light-y', `${Math.round(y * 100)}%`)
      if (hasLenticular) element.style.setProperty('--lenticular-reveal', `${Math.round(x * 100)}%`)
    }
  }

  const handleCollectibleStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedEffects) return
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    if (event.pointerType !== 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId)
      handleCollectibleMove(event)
    }
  }

  const handleCollectibleEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (swipeToFlip && start?.pointerId === event.pointerId) {
      const deltaX = event.clientX - start.x
      const deltaY = event.clientY - start.y
      if (Math.abs(deltaX) >= 42 && Math.abs(deltaX) > Math.abs(deltaY)) {
        setVisibleSide(current => current === 'front' ? 'back' : 'front')
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragStartRef.current = null
    resetCollectibleVars(event.currentTarget)
  }

  const setLenticularReveal = (reveal: '0%' | '100%') => {
    collectibleRef.current?.style.setProperty('--lenticular-reveal', reveal)
  }

  const requestDeviceMotion = async () => {
    if (!enableDeviceMotion || motionStatus !== 'idle') return
    if (reducedEffects || !supportsDeviceMotion()) {
      setMotionStatus('unsupported')
      setDeviceMotionEnabled(false)
      return
    }
    try {
      const DeviceOrientationEvent = window.DeviceOrientationEvent as typeof window.DeviceOrientationEvent & {
        requestPermission?: () => Promise<PermissionState | 'default'>
      }
      const permission = typeof DeviceOrientationEvent.requestPermission === 'function'
        ? await DeviceOrientationEvent.requestPermission()
        : 'granted'
      if (permission !== 'granted') throw new Error('denied')
      setMotionStatus('granted')
      setDeviceMotionEnabled(true)
    } catch {
      setMotionStatus('denied')
      setDeviceMotionEnabled(false)
    }
  }

  useEffect(() => {
    if (!deviceMotionEnabled || reducedEffects || !supportsDeviceMotion()) return
    const applyDeviceOrientation = (event: DeviceOrientationEvent) => {
      const element = collectibleRef.current
      if (!element) return
      const beta = clampMotion(event.beta)
      const gamma = clampMotion(event.gamma)
      const lightX = Math.round(((gamma + 15) / 30) * 100)
      const lightY = Math.round(((beta + 15) / 30) * 100)
      element.style.setProperty('--tilt-x', `${(-beta).toFixed(2)}deg`)
      element.style.setProperty('--tilt-y', `${gamma.toFixed(2)}deg`)
      if (visibleSide === 'front') {
        element.style.setProperty('--light-x', `${lightX}%`)
        element.style.setProperty('--light-y', `${lightY}%`)
        if (hasLenticular) element.style.setProperty('--lenticular-reveal', `${lightX}%`)
      }
    }
    window.addEventListener('deviceorientation', applyDeviceOrientation, { passive: true })
    return () => window.removeEventListener('deviceorientation', applyDeviceOrientation)
  }, [deviceMotionEnabled, effects.front.interaction, hasLenticular, reducedEffects, visibleSide])

  const card = visibleSide === 'front' ? <div
    ref={collectibleRef}
    className={frontClassName}
    style={collectibleStyle}
    role="img"
    aria-label={imageAlt}
    onPointerDown={handleCollectibleStart}
    onPointerMove={handleCollectibleMove}
    onPointerUp={handleCollectibleEnd}
    onPointerLeave={handleCollectibleEnd}
    onPointerCancel={handleCollectibleEnd}
  >
    <div className="fan-card-art-window">
      <img className="fan-card-photo" src={imageUrl} alt="" onError={onImageError} />
      {hasLenticular && <img className="fan-card-lenticular" src={lenticularImageUrl ?? ''} alt="" aria-hidden="true" />}
      {handwritingImageUrl && <img className="fan-card-handwriting-layer" src={handwritingImageUrl} alt={handwritingAlt} />}
    </div>
    <span className="fan-card-material" aria-hidden="true" />
    <span className="fan-card-surface" aria-hidden="true" />
    <span className="official-badge">{badgeLabel}</span>
  </div> : <div
    ref={collectibleRef}
    className={backClassName}
    style={collectibleStyle}
    role="img"
    aria-label={`${title} 카드 뒷면`}
    onPointerDown={handleCollectibleStart}
    onPointerMove={handleCollectibleMove}
    onPointerUp={handleCollectibleEnd}
    onPointerLeave={handleCollectibleEnd}
    onPointerCancel={handleCollectibleEnd}
  >
    <div className="fan-card-back-meta">
      <span className="fan-card-official-label">OFFICIAL FAN CARD</span>
      <strong>{title}</strong>
      <span>{artist}{member ? ` · ${member}` : ''}</span>
    </div>
    <dl className="fan-card-back-stats">
      <div><dt>SERIAL</dt><dd>{serialLabel}</dd></div>
      <div><dt>LIMIT</dt><dd>{limitLabel}</dd></div>
      <div><dt>SEAL</dt><dd>{sealLabel}</dd></div>
    </dl>
    <p className="fan-card-hidden-message">{effects.back.hiddenMessage || hiddenMessage || '공식 컬렉션 인증 카드'}</p>
    <span className="fan-card-material" aria-hidden="true" />
    <span className="fan-card-surface" aria-hidden="true" />
  </div>

  return <section className={`interactive-collectible presentation-${presentation}${presentation === 'reveal' ? ' collectible-reveal-enter' : ''}`} aria-label="인터랙티브 카드 보기">
    {card}
    {showControls && presentation === 'detail' && <div className="detail-interaction-actions" role="group" aria-label="카드 인터랙션">
      <button type="button" className="card-flip-action" onClick={() => setVisibleSide(current => current === 'front' ? 'back' : 'front')}>
        <span aria-hidden="true"><InlineIcon name="rotate" /></span>카드 뒤집기
      </button>
    </div>}
    {showControls && <div className="card-side-toggle" role="group" aria-label="카드 면 선택">
      <button type="button" aria-pressed={visibleSide === 'front'} onClick={() => setVisibleSide('front')}>앞면</button>
      <button type="button" aria-pressed={visibleSide === 'back'} onClick={() => setVisibleSide('back')}>뒷면</button>
    </div>}
    <div className="fan-card-motion-actions">
      {canRequestDeviceMotion && <button type="button" className="motion-permission-button" onClick={requestDeviceMotion}>기기 움직임으로 보기</button>}
      {motionStatus === 'denied' && <p className="motion-helper">손가락으로 움직여 볼 수 있어요</p>}
      {hasLenticular && reducedEffects && visibleSide === 'front' && <div className="lenticular-scene-controls" aria-label="렌티큘러 장면 선택">
        <button type="button" onClick={() => setLenticularReveal('0%')}>첫 장면</button>
        <button type="button" onClick={() => setLenticularReveal('100%')}>두 번째 장면</button>
      </div>}
      {presentation === 'reveal' && <p className="collectible-gesture-hint">앞면과 뒷면을 눌러 카드를 확인해 보세요</p>}
    </div>
  </section>
}
