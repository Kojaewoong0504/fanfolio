import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import { apiFetch, resolveApiUrl, type UserCardDetail } from '../api/client'
import type { Card } from '../types'
import { normalizeCardEffects } from '../utils/cardEffects'

type CardDetailProps = {
  card: Card
  isSaved: boolean
  onClose: () => void
  onToggleSaved: () => void
  onRedeem: () => void
  imageFor: (imageUrl: string, seed: string) => string
  onImageError: (event: SyntheticEvent<HTMLImageElement>, seed: string) => void
  cardTypeLabel: (cardType: string | null) => string
}

type CollectibleStyle = CSSProperties & Record<'--tilt-x' | '--tilt-y' | '--light-x' | '--light-y' | '--lenticular-reveal' | '--effect-opacity' | '--effect-angle' | '--effect-spread' | '--effect-grain', string>
type MotionStatus = 'idle' | 'granted' | 'denied' | 'unsupported'

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

function useDialogFocus(open: boolean): void {
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.detail-panel .detail-topbar > button:first-child')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('.detail-panel[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], audio[controls], video[controls]'))
        .filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      previousActiveElement.current?.focus()
      previousActiveElement.current = null
    }
  }, [open])
}

export function CardDetail({ card, isSaved, onClose, onToggleSaved, onRedeem, imageFor, onImageError, cardTypeLabel }: CardDetailProps) {
  const [detail, setDetail] = useState<UserCardDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [visibleSide, setVisibleSide] = useState<'front' | 'back'>('front')
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('idle')
  const [deviceMotionEnabled, setDeviceMotionEnabled] = useState(false)
  const collectibleRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ pointerId: number, x: number, y: number } | null>(null)
  const isOwned = Boolean(card.userCardId)
  const hasRemoteDetail = Boolean(card.userCardId && !card.userCardId.startsWith('user-card-'))
  const [detailLoading, setDetailLoading] = useState(hasRemoteDetail)
  useDialogFocus(true)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailError(false)
    setVisibleSide('front')
    setMotionStatus('idle')
    setDeviceMotionEnabled(false)
    const remoteDetail = Boolean(card.userCardId && !card.userCardId.startsWith('user-card-'))
    setDetailLoading(remoteDetail)
    if (!remoteDetail || !card.userCardId) return
    void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${card.userCardId}`)
      .then(result => { if (!cancelled) { setDetail(result.data); setDetailLoading(false) } })
      .catch(() => { if (!cancelled) { setDetailError(true); setDetailLoading(false) } })
    return () => { cancelled = true }
  }, [card.userCardId, detailAttempt])

  useEffect(() => {
    setVisibleSide('front')
    setMotionStatus('idle')
    setDeviceMotionEnabled(false)
    if (collectibleRef.current) resetCollectibleVars(collectibleRef.current)
  }, [card.id, detail?.userCardId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const effects = normalizeCardEffects(detail?.card.designConfig)
  const designConfig = detail?.card.designConfig
  const legacyHolographic = designConfig?.front?.effect === 'holographic'
  const hasSurface = Boolean(legacyHolographic || designConfig?.version === 3)
  const hasLenticular = Boolean(effects.front.interaction === 'lenticular' && detail && detail.card.lenticularImageUrl)
  const lenticularImageUrl = detail?.card.lenticularImageUrl ?? ''
  const reducedEffects = prefersReducedEffects()
  const motionSupported = !reducedEffects && supportsDeviceMotion()
  const imageUrl = detail?.card.imageUrl ?? card.image
  const imageError = (event: SyntheticEvent<HTMLImageElement>) => onImageError(event, card.id)
  const cardImageAlt = `${detail?.card.name ?? card.title} 공식 카드 앞면`
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
    if (visibleSide !== 'front' || reducedEffects) return
    if (event.pointerType === 'touch' && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      const start = dragStartRef.current
      if (!start || start.pointerId !== event.pointerId) return
      const deltaX = Math.abs(event.clientX - start.x)
      const deltaY = Math.abs(event.clientY - start.y)
      if (deltaX < 8 && deltaY < 8) return
      if (deltaY > deltaX) return
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const element = event.currentTarget
    const box = element.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
    if (effects.front.interaction !== 'static') {
      element.style.setProperty('--tilt-x', `${((0.5 - y) * 10).toFixed(2)}deg`)
      element.style.setProperty('--tilt-y', `${((x - 0.5) * 12).toFixed(2)}deg`)
    }
    element.style.setProperty('--light-x', `${Math.round(x * 100)}%`)
    element.style.setProperty('--light-y', `${Math.round(y * 100)}%`)
    if (hasLenticular) {
      element.style.setProperty('--lenticular-reveal', `${Math.round(x * 100)}%`)
    }
  }
  const handleCollectibleStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (visibleSide !== 'front' || reducedEffects) return
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    if (event.pointerType !== 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId)
      handleCollectibleMove(event)
    }
  }
  const handleCollectibleReset = (element: HTMLElement) => {
    resetCollectibleVars(element)
  }
  const handleCollectibleEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStartRef.current = null
    handleCollectibleReset(event.currentTarget)
  }
  const setLenticularReveal = (reveal: '0%' | '100%') => {
    collectibleRef.current?.style.setProperty('--lenticular-reveal', reveal)
  }
  const requestDeviceMotion = async () => {
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
    if (
      !deviceMotionEnabled ||
      visibleSide !== 'front' ||
      reducedEffects ||
      effects.front.interaction === 'static' ||
      !detail ||
      !supportsDeviceMotion()
    ) {
      return
    }
    const applyDeviceOrientation = (event: DeviceOrientationEvent) => {
      const element = collectibleRef.current
      if (!element) return
      const beta = clampMotion(event.beta)
      const gamma = clampMotion(event.gamma)
      const lightX = Math.round(((gamma + 15) / 30) * 100)
      const lightY = Math.round(((beta + 15) / 30) * 100)
      element.style.setProperty('--tilt-x', `${(-beta).toFixed(2)}deg`)
      element.style.setProperty('--tilt-y', `${gamma.toFixed(2)}deg`)
      element.style.setProperty('--light-x', `${lightX}%`)
      element.style.setProperty('--light-y', `${lightY}%`)
      if (hasLenticular) {
        element.style.setProperty('--lenticular-reveal', `${lightX}%`)
      }
    }
    window.addEventListener('deviceorientation', applyDeviceOrientation, { passive: true })
    return () => window.removeEventListener('deviceorientation', applyDeviceOrientation)
  }, [detail, deviceMotionEnabled, effects.front.interaction, hasLenticular, reducedEffects, visibleSide])

  const voiceAudioUrl = detail?.card.hasVoice && detail.card.voiceAudioUrl ? resolveApiUrl(detail.card.voiceAudioUrl) : ''
  const videoUrl = detail?.card.hasVideo && detail.card.videoUrl ? resolveApiUrl(detail.card.videoUrl) : ''
  const hasSpecialMedia = Boolean(voiceAudioUrl || videoUrl)

  return <div className="detail-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="card-detail-title">
      <div className="detail-topbar">
        <button onClick={onClose}>닫기</button>
        <button className={isSaved ? 'favorite-button saved' : 'favorite-button'} aria-label={isSaved ? '관심 카드에서 제거' : '관심 카드로 저장'} aria-pressed={isSaved} onClick={onToggleSaved}>
          {isSaved ? '♥' : '♡'}<span>{isSaved ? '저장됨' : '관심 카드'}</span>
        </button>
      </div>
      {detailLoading && <p className="detail-loading" role="status" aria-live="polite">카드 상세 정보를 확인하는 중이에요…</p>}
      <div className="card-side-toggle" role="group" aria-label="카드 면 선택">
        <button type="button" aria-pressed={visibleSide === 'front'} onClick={() => setVisibleSide('front')}>앞면</button>
        <button type="button" aria-pressed={visibleSide === 'back'} onClick={() => setVisibleSide('back')}>뒷면</button>
      </div>
      {visibleSide === 'front' || !detail ? <div
        ref={collectibleRef}
        className={frontClassName}
        style={collectibleStyle}
        onPointerDown={handleCollectibleStart}
        onPointerMove={handleCollectibleMove}
        onPointerUp={handleCollectibleEnd}
        onPointerLeave={handleCollectibleEnd}
        onPointerCancel={handleCollectibleEnd}
      >
        <img className="fan-card-photo" src={imageFor(resolveApiUrl(imageUrl), card.id)} alt={cardImageAlt} onError={imageError} />
        {hasLenticular && <img className="fan-card-lenticular" src={resolveApiUrl(lenticularImageUrl)} alt="" aria-hidden="true" />}
        <span className="fan-card-material" aria-hidden="true" />
        <span className="fan-card-surface" aria-hidden="true" />
        <span className="official-badge">공식 카드</span>
      </div> : visibleSide === 'back' && detail && <div className={backClassName} style={collectibleStyle}>
        <div className="fan-card-back-meta">
          <span className="fan-card-official-label">OFFICIAL FAN CARD</span>
          <strong>{detail.card.name}</strong>
          <span>{detail.card.artistName ?? card.artist}{(detail.card.memberName ?? card.member) ? ` · ${detail.card.memberName ?? card.member}` : ''}</span>
        </div>
        <dl className="fan-card-back-stats">
          <div><dt>SERIAL</dt><dd>#{String(detail.serialNumber).padStart(3, '0')}</dd></div>
          <div><dt>LIMIT</dt><dd>{detail.card.issueLimit ? `${detail.card.issueLimit.toLocaleString()}장` : 'UNLIMITED'}</dd></div>
          <div><dt>SEAL</dt><dd>{detail.card.id.slice(-8).toUpperCase()}</dd></div>
        </dl>
        <p className="fan-card-hidden-message">{effects.back.hiddenMessage || '공식 컬렉션 인증 카드'}</p>
        <span className="fan-card-material" aria-hidden="true" />
        <span className="fan-card-surface" aria-hidden="true" />
      </div>}
      <div className="fan-card-motion-actions">
        {motionSupported && visibleSide === 'front' && effects.front.interaction !== 'static' && <button type="button" className="motion-permission-button" onClick={requestDeviceMotion}>기기 움직임으로 보기</button>}
        {motionStatus === 'denied' && <p className="motion-helper">손가락으로 움직여 볼 수 있어요</p>}
        {hasLenticular && reducedEffects && visibleSide === 'front' && <div className="lenticular-scene-controls" aria-label="렌티큘러 장면 선택">
          <button type="button" onClick={() => setLenticularReveal('0%')}>첫 장면</button>
          <button type="button" onClick={() => setLenticularReveal('100%')}>두 번째 장면</button>
        </div>}
      </div>
      <p className="detail-kicker">공식 디지털 카드</p>
      <h2 id="card-detail-title" className="detail-title">{detail?.card.name ?? card.title}</h2>
      <dl>
        <div><dt>아티스트</dt><dd>{detail?.card.artistName ?? card.artist}</dd></div>
        <div><dt>멤버</dt><dd>{detail?.card.memberName ?? card.member}</dd></div>
        {detail && <>
          <div><dt>카드 유형</dt><dd>{cardTypeLabel(detail.card.cardType)}</dd></div>
          <div><dt>발행번호</dt><dd>#{String(detail.serialNumber).padStart(3, '0')}</dd></div>
          <div><dt>획득일</dt><dd>{new Date(detail.acquiredAt).toLocaleDateString('ko-KR')}</dd></div>
          <div><dt>획득 경로</dt><dd>{detail.acquisitionSource === 'qr' ? 'QR 스캔' : detail.acquisitionSource === 'manual' ? '코드 직접 입력' : '콘텐츠 코드'}</dd></div>
          {detail.drop && <div><dt>드롭</dt><dd>{detail.drop.name}</dd></div>}
          {detail.card.seasonName && <div><dt>시즌</dt><dd>{detail.card.seasonName}</dd></div>}
          {detail.card.rarity && <div><dt>등급</dt><dd>{detail.card.rarity}</dd></div>}
          {detail.card.issueLimit && <div><dt>발행 한도</dt><dd>{detail.card.issueLimit.toLocaleString()}장</dd></div>}
        </>}
      </dl>
      {detail?.card.signatureText && <p className="detail-hint">“{detail.card.signatureText}”</p>}
      {detail?.futureBenefitPreview && <div className="notice">{detail.futureBenefitPreview}</div>}
      {detail?.card.handwritingImageUrl && <div className="handwriting-special"><p className="detail-badge">손글씨 특전</p><img src={resolveApiUrl(detail.card.handwritingImageUrl)} alt="손글씨 특전" /></div>}
      {hasSpecialMedia && <section className="special-media-section" aria-labelledby="special-media-title">
        <div className="special-media-heading">
          <span>스페셜 미디어</span>
          <small>팬 전용 특전을 직접 재생해 보세요.</small>
        </div>
        <h3 id="special-media-title">스페셜 미디어</h3>
        {voiceAudioUrl && <div className="special-player voice-player">
          <div>
            <b>보이스 메시지</b>
            <small>재생 버튼을 눌러 아티스트 음성을 들어보세요.</small>
          </div>
          <audio controls preload="metadata" src={voiceAudioUrl} aria-label="보이스 메시지 재생" />
        </div>}
        {videoUrl && <div className="special-player video-player">
          <div>
            <b>스페셜 비디오</b>
            <small>음소거된 미리보기로 열리며 컨트롤에서 소리를 켤 수 있어요.</small>
          </div>
          <video controls muted playsInline loop preload="metadata" src={videoUrl} aria-label="스페셜 비디오 재생" />
        </div>}
      </section>}
      {detailError && <div className="detail-error-actions"><p className="detail-hint error-message">카드 상세 정보를 불러오지 못했어요.</p><button className="outline" onClick={() => setDetailAttempt(value => value + 1)}>다시 시도</button></div>}
      {!isOwned && <><p className="detail-hint">카드 패키지의 QR 또는 코드를 사용해 컬렉션에 등록할 수 있어요.</p><button className="primary detail-action" onClick={onRedeem}>카드 등록하기</button></>}
    </aside>
  </div>
}
