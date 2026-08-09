import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { apiFetch, resolveApiUrl, type UserCardDetail } from '../api/client'
import hologramTexture from '../assets/hologram-aurora-texture.jpg'
import type { Card } from '../types'

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
  const isOwned = Boolean(card.userCardId)
  const hasRemoteDetail = Boolean(card.userCardId && !card.userCardId.startsWith('user-card-'))
  const [detailLoading, setDetailLoading] = useState(hasRemoteDetail)
  useDialogFocus(true)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailError(false)
    const remoteDetail = Boolean(card.userCardId && !card.userCardId.startsWith('user-card-'))
    setDetailLoading(remoteDetail)
    if (!remoteDetail || !card.userCardId) return
    void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${card.userCardId}`)
      .then(result => { if (!cancelled) { setDetail(result.data); setDetailLoading(false) } })
      .catch(() => { if (!cancelled) { setDetailError(true); setDetailLoading(false) } })
    return () => { cancelled = true }
  }, [card.userCardId, detailAttempt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const imageUrl = detail?.card.imageUrl ?? card.image
  const imageError = (event: SyntheticEvent<HTMLImageElement>) => onImageError(event, card.id)
  const designEffect = detail?.card.designConfig?.front?.effect
  const effectIntensity = Math.max(0, Math.min(1, Number(detail?.card.designConfig?.front?.effectIntensity ?? 0) || 0))
  const hasHologram = designEffect === 'holographic' && effectIntensity > 0
  const hologramStyle = {
    '--hologram-opacity': hasHologram ? String(0.18 + effectIntensity * 0.34) : '0',
    '--hologram-shift': `${Math.round(18 + effectIntensity * 18)}px`,
    '--hologram-texture': `url("${hologramTexture}")`,
  } as CSSProperties & Record<'--hologram-opacity' | '--hologram-shift' | '--hologram-texture', string>
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
      <div className={hasHologram ? 'detail-media hologram' : 'detail-media'} style={hologramStyle}>
        <img src={imageFor(resolveApiUrl(imageUrl), card.id)} alt="카드 상세" onError={imageError} />
        <span className="official-badge">공식 카드</span>
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
