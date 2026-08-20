import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { apiFetch, resolveApiUrl, type UserCardDetail } from '../api/client'
import type { Card } from '../types'
import { normalizeCardEffects } from '../utils/cardEffects'
import { InteractiveCollectibleCard } from './InteractiveCollectibleCard'
import { InlineIcon } from '../App'

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
      document.querySelector<HTMLElement>('.card-detail-screen .detail-topbar > button:first-child')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const screen = document.querySelector<HTMLElement>('.card-detail-screen')
      if (!screen) return
      const focusable = Array.from(screen.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], audio[controls], video[controls]'))
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
  const cardIdentity = card.userCardId ?? card.id
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

  const effects = normalizeCardEffects(detail?.card.designConfig)
  const imageUrl = detail?.card.imageUrl ?? card.image
  const displayMember = detail?.card.memberName ?? card.member ?? '유나'
  // Catalog/demo records can still carry the old silhouette or hero placeholder.
  // Resolve the visual fallback from the member identity so the detail view always
  // presents a collectible card asset instead of an unrelated placeholder.
  const imageSeed = `member:${displayMember}`
  const imageError = (event: SyntheticEvent<HTMLImageElement>) => onImageError(event, imageSeed)
  const cardImageAlt = `${detail?.card.name ?? card.title} 공식 카드 앞면`
  const safeBackDetail = {
    title: detail?.card.name ?? card.title,
    artist: detail?.card.artistName ?? card.artist,
    member: detail?.card.memberName ?? card.member,
    serialLabel: detail ? `#${String(detail.serialNumber).padStart(3, '0')}` : (card.id.startsWith('#') ? card.id : 'PREVIEW'),
    limitLabel: detail?.card.issueLimit ? `${detail.card.issueLimit.toLocaleString()}장` : 'FANFOLIO',
    sealLabel: detail?.card.id.slice(-8).toUpperCase() ?? ((card.userCardId ?? card.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'OFFICIAL'),
    hiddenMessage: effects.back.hiddenMessage || (detail ? '공식 컬렉션 인증 카드' : '컬렉션 상세를 불러오면 인증 정보가 업데이트됩니다'),
  }
  const voiceAudioUrl = detail?.card.hasVoice && detail.card.voiceAudioUrl ? resolveApiUrl(detail.card.voiceAudioUrl) : ''
  const videoUrl = detail?.card.hasVideo && detail.card.videoUrl ? resolveApiUrl(detail.card.videoUrl) : ''
  const hasSpecialMedia = Boolean(voiceAudioUrl || videoUrl)

  return <main className="app-shell card-detail-screen detail-reference-panel" aria-labelledby="card-detail-title">
      <div className="detail-topbar">
        <button className="detail-back-button" onClick={onClose} aria-label="카드 상세 닫기"><InlineIcon name="back" /></button>
        <h1>카드 상세</h1>
        <button className={isSaved ? 'favorite-button saved' : 'favorite-button'} aria-label={isSaved ? '관심 카드에서 제거' : '관심 카드로 저장'} aria-pressed={isSaved} onClick={onToggleSaved}>
          <InlineIcon name="heart" /><span className="sr-only">{isSaved ? '저장됨' : '관심 카드'}</span>
        </button>
      </div>
      {detailLoading && <p className="detail-loading" role="status" aria-live="polite">카드 상세 정보를 확인하는 중이에요…</p>}
      <InteractiveCollectibleCard
        imageUrl={imageFor(resolveApiUrl(imageUrl), imageSeed)}
        imageAlt={cardImageAlt}
        identity={cardIdentity}
        title={safeBackDetail.title}
        artist={safeBackDetail.artist}
        member={safeBackDetail.member}
        serialLabel={safeBackDetail.serialLabel}
        limitLabel={safeBackDetail.limitLabel}
        sealLabel={safeBackDetail.sealLabel}
        hiddenMessage={safeBackDetail.hiddenMessage}
        designConfig={detail?.card.designConfig}
        lenticularImageUrl={detail?.card.lenticularImageUrl ? resolveApiUrl(detail.card.lenticularImageUrl) : null}
        onImageError={imageError}
        enableDeviceMotion
      />
      <p className="detail-kicker">{detail?.card.seasonName ?? '드림스케이프 2026 SPRING'}</p>
      <h2 id="card-detail-title" className="detail-title">{detail?.card.memberName ?? card.member} · {detail?.card.name ?? card.title}</h2>
      <dl className="detail-reference-meta">
        {detail?.card.rarity && <div><dt><InlineIcon name="star" />등급</dt><dd>{detail.card.rarity}</dd></div>}
        <div><dt><InlineIcon name="grid" />카드 번호</dt><dd>{detail ? `DS-${String(detail.serialNumber).padStart(3, '0')}` : safeBackDetail.serialLabel}</dd></div>
        <div><dt><InlineIcon name="calendar" />획득일</dt><dd>{detail ? new Date(detail.acquiredAt).toLocaleDateString('ko-KR') : '최근 획득'}</dd></div>
        <div className="detail-meta-secondary"><dt>아티스트</dt><dd>{detail?.card.artistName ?? card.artist}</dd></div>
        <div className="detail-meta-secondary"><dt>멤버</dt><dd>{detail?.card.memberName ?? card.member}</dd></div>
        {detail && <>
          <div className="detail-meta-secondary"><dt>카드 유형</dt><dd>{cardTypeLabel(detail.card.cardType)}</dd></div>
          <div className="detail-meta-secondary"><dt>획득 경로</dt><dd>{detail.acquisitionSource === 'qr' ? 'QR 스캔' : detail.acquisitionSource === 'manual' ? '코드 직접 입력' : '콘텐츠 코드'}</dd></div>
        </>}
      </dl>
      <p className="detail-motion-hint"><InlineIcon name="motion" />카드를 움직여 특별한 효과를 확인해보세요.</p>
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
  </main>
}
