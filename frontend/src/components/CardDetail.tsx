import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { apiFetch, resolveApiUrl, type UserCardDetail } from '../api/client'
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
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], audio[controls]'))
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

  return <div className="detail-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="card-detail-title">
      <div className="detail-topbar">
        <button onClick={onClose}>닫기</button>
        <button className={isSaved ? 'favorite-button saved' : 'favorite-button'} aria-label={isSaved ? '관심 카드에서 제거' : '관심 카드로 저장'} aria-pressed={isSaved} onClick={onToggleSaved}>
          {isSaved ? '♥' : '♡'}<span>{isSaved ? '저장됨' : '관심 카드'}</span>
        </button>
      </div>
      {detailLoading && <p className="detail-loading" role="status" aria-live="polite">카드 상세 정보를 확인하는 중이에요…</p>}
      <div className="detail-media">
        <img src={imageFor(resolveApiUrl(imageUrl), card.id)} alt="카드 상세" onError={imageError} />
        <span className="official-badge">공식 카드</span>
        <span className="detail-shine" aria-hidden="true">✦</span>
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
      {detail?.card.hasVoice && <><p className="detail-badge">보이스 특전 포함</p><audio controls preload="metadata" src={resolveApiUrl(detail.card.voiceAudioUrl)} aria-label="보이스 특전 재생" /></>}
      {detailError && <div className="detail-error-actions"><p className="detail-hint error-message">카드 상세 정보를 불러오지 못했어요.</p><button className="outline" onClick={() => setDetailAttempt(value => value + 1)}>다시 시도</button></div>}
      {!isOwned && <><p className="detail-hint">카드 패키지의 QR 또는 코드를 사용해 컬렉션에 등록할 수 있어요.</p><button className="primary detail-action" onClick={onRedeem}>카드 등록하기</button></>}
    </aside>
  </div>
}
