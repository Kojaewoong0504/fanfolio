import { useEffect, useState } from 'react'
import { ApiError, createTradeProposal, getMyCollection, getPublicCollection, resolveApiUrl, type CollectionCard, type PublicWantedCard } from '../api/client'
import { InlineIcon } from '../App'

type TradeSelection = { offeredUserCardId: string; requestedUserCardId: string }

type PickerProps = { recipientUserId: string; requestedUserCardIds: string[]; onBack: () => void; onContinue: (selection: TradeSelection) => void }

export function TradeCardPicker({ recipientUserId, requestedUserCardIds, onBack, onContinue }: PickerProps) {
  const [cards, setCards] = useState<CollectionCard[]>([])
  const [requestedCards, setRequestedCards] = useState<CollectionCard[]>([])
  const [wantedCards, setWantedCards] = useState<PublicWantedCard[]>([])
  const [selectedOfferedId, setSelectedOfferedId] = useState<string | null>(null)
  const [selectedRequestedId, setSelectedRequestedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([getMyCollection(), getPublicCollection(recipientUserId)]).then(([mine, theirs]) => {
      if (!active) return
      const available = mine.data.cards.filter(card => card.tradable !== false)
      const requested: CollectionCard[] = theirs.data.cards
      const requestedFromRoute = requestedUserCardIds.map(id => requested.find(card => card.userCardId === id)).filter(Boolean) as CollectionCard[]
      const requestedFromWishlist = (theirs.data.wantedCards ?? []).map(wanted => requested.find(card => card.cardId === wanted.cardId)).filter(Boolean) as CollectionCard[]
      const mergedRequested = Array.from(new Map([...requestedFromRoute, ...requestedFromWishlist, ...requested].map(card => [card.userCardId, card])).values())
      setCards(available.length > 0 ? available : mine.data.cards)
      setRequestedCards(mergedRequested)
      setWantedCards(theirs.data.wantedCards ?? [])
      setSelectedOfferedId((available[0] ?? mine.data.cards[0])?.userCardId ?? null)
      setSelectedRequestedId((requestedFromRoute[0] ?? requestedFromWishlist[0] ?? mergedRequested[0])?.userCardId ?? null)
    }).catch(errorValue => { if (active) setError(errorValue instanceof ApiError ? errorValue.message : '거래할 카드를 불러오지 못했어요.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [recipientUserId, requestedUserCardIds])

  const selectedOffered = cards.find(card => card.userCardId === selectedOfferedId)
  const selectedRequested = requestedCards.find(card => card.userCardId === selectedRequestedId)
  const wantedCardIds = new Set(wantedCards.map(card => card.cardId))
  const cardLabel = (card: CollectionCard) => `${card.rarity ?? 'N'} · ${card.memberName ?? card.name}`

  return <main className="app-shell trade-picker-shell">
    <header className="social-reference-topbar"><button type="button" onClick={onBack} aria-label="팬 프로필로 돌아가기"><InlineIcon name="back" /></button><h1>거래 제안</h1><span /></header>
    <section className="trade-picker-content">
      <section className="trade-picker-intro"><InlineIcon name="rotate" /><div><b>서로 원하는 카드를 골라보세요</b><p>상대가 원하는 카드와 내가 보낼 카드를 선택해요.</p></div></section>
      {error ? <p role="alert">{error}</p> : loading ? <p role="status">카드를 불러오는 중...</p> : <>
        <section className="trade-picker-section"><div className="trade-picker-heading"><div><h2>상대가 원하는 카드</h2><p>받고 싶은 카드 {requestedCards.length}장</p></div><b>{requestedCards.length}장</b></div><div className="trade-picker-wanted-grid">{requestedCards.slice(0, 4).map(card => { const selected = card.userCardId === selectedRequestedId; return <button type="button" key={card.userCardId} className={`trade-picker-card ${selected ? 'selected' : ''}`} onClick={() => setSelectedRequestedId(card.userCardId)} aria-pressed={selected} aria-label={`${cardLabel(card)} ${selected ? '선택됨' : '선택'}`}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><span>{card.rarity ?? 'N'}</span><em><InlineIcon name="star" /> 1</em>{(wantedCardIds.has(card.cardId) || selected) && <small>원하는 카드</small>}{selected && <i><InlineIcon name="check" /></i>}</button> })}</div></section>
        <section className="trade-picker-section"><div className="trade-picker-heading"><div><h2>내가 보낼 카드</h2><p>교환할 카드 1장을 선택해 주세요.</p></div><b>{cards.length}장</b></div><div className="trade-picker-offered-grid">{cards.slice(0, 8).map(card => { const selected = card.userCardId === selectedOfferedId; return <button type="button" key={card.userCardId} className={`trade-picker-card ${selected ? 'selected' : ''}`} onClick={() => setSelectedOfferedId(card.userCardId)} aria-pressed={selected} aria-label={`${cardLabel(card)} ${selected ? '선택 해제' : '선택'}`}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><span>{card.rarity ?? 'N'}</span><em><InlineIcon name="star" /> 1</em>{selected && <i><InlineIcon name="check" /></i>}</button> })}</div></section>
        {selectedOffered && selectedRequested && <div className="trade-picker-summary"><img src={resolveApiUrl(selectedOffered.imageUrl)} alt="내가 보낼 카드" /><span>선택한 카드 <b>{selectedOffered.name}</b><small>받고 싶은 카드: {selectedRequested.name}</small></span><InlineIcon name="chevron" /></div>}
      </>}
    </section>
    <footer className="trade-picker-footer"><button type="button" onClick={onBack}>취소</button><button type="button" className="primary" disabled={!selectedOfferedId || !selectedRequestedId || loading} onClick={() => selectedOfferedId && selectedRequestedId && onContinue({ offeredUserCardId: selectedOfferedId, requestedUserCardId: selectedRequestedId })}>선택 완료</button></footer>
  </main>
}

type Props = { recipientUserId: string; requestedUserCardIds: string[]; onBack: () => void; onCreated: () => void; initialCards?: CollectionCard[]; initialRequestedCards?: CollectionCard[]; initialOfferedUserCardId?: string }

export function TradeComposer({ recipientUserId, requestedUserCardIds, onBack, onCreated, initialCards, initialRequestedCards, initialOfferedUserCardId }: Props) {
  const [cards, setCards] = useState<CollectionCard[]>(initialCards ?? [])
  const [requestedCards, setRequestedCards] = useState<CollectionCard[]>(initialRequestedCards ?? [])
  const [recipientNickname, setRecipientNickname] = useState('별빛수집가')
  const [loading, setLoading] = useState(!initialCards)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedOfferedUserCardId, setSelectedOfferedUserCardId] = useState<string | null>(initialOfferedUserCardId ?? initialCards?.find(card => card.tradable !== false)?.userCardId ?? initialCards?.[0]?.userCardId ?? null)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (initialCards) {
      setCards(initialCards)
      setRequestedCards(initialRequestedCards ?? initialCards)
      setLoading(false)
      return
    }
    let active = true
    void Promise.all([getMyCollection(), getPublicCollection(recipientUserId)])
      .then(([mine, theirs]) => {
        if (!active) return
        setCards(mine.data.cards)
        setRequestedCards(theirs.data.cards)
        setRecipientNickname(theirs.data.nickname ?? recipientUserId)
      })
      .catch(e => { if (active) setError(e instanceof ApiError ? e.message : '거래할 컬렉션을 불러오지 못했어요.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [initialCards, initialRequestedCards, recipientUserId])
  const selectableCards = cards.filter(card => card.tradable !== false)
  const offeredCards = selectableCards.length > 0 ? selectableCards : cards
  const mine = offeredCards.find(card => card.userCardId === selectedOfferedUserCardId) ?? offeredCards[0]
  const wanted = requestedCards.find(card => requestedUserCardIds.includes(card.userCardId)) ?? requestedCards[0]
  const effectiveRequestedUserCardIds = wanted ? [wanted.userCardId] : []
  const selectNextOfferedCard = () => {
    if (offeredCards.length < 2) return
    const currentIndex = Math.max(0, offeredCards.findIndex(card => card.userCardId === mine?.userCardId))
    const nextCard = offeredCards[(currentIndex + 1) % offeredCards.length]
    setSelectedOfferedUserCardId(nextCard.userCardId)
    setConfirmed(false)
    setMessage('')
  }
  const submit = async () => {
    if (!mine || !wanted || !confirmed || submitting) return
    setSubmitting(true)
    if (initialCards) { setMessage('거래 제안을 보냈어요.'); window.setTimeout(onCreated, 500); return }
    try { await createTradeProposal({ recipientUserId, offeredUserCardIds: [mine.userCardId], requestedUserCardIds: effectiveRequestedUserCardIds }); setMessage('거래 제안을 보냈어요.'); onCreated() }
    catch (e) { setMessage(e instanceof ApiError ? e.message : '거래 제안을 보내지 못했어요.'); setSubmitting(false) }
  }
  return <main className="app-shell trade-composer-shell trade-composer-reference">
    <header className="social-reference-topbar"><button type="button" onClick={onBack} aria-label="공개 컬렉션으로 돌아가기"><InlineIcon name="back" /></button><h1>컬렉션 매칭</h1><span /></header>
    <section className="trade-composer-content">
      <section className="trade-match-hero"><span className="trade-match-icon" aria-hidden="true"><InlineIcon name="puzzle" /></span><div><h2>서로 원하는 카드가 일치했어요</h2><p>보유한 중복 카드로 원하는 카드를 제안해보세요.</p></div></section>
      {error ? <p role="alert">{error}</p> : loading ? <p role="status">카드를 불러오는 중...</p> : <>
        <section className="trade-match-panel"><div className="trade-match-cards"><article><h3>내가 보내는 카드</h3><div className="trade-card-visual"><img src={resolveApiUrl(mine?.imageUrl)} alt="내가 보내는 카드" /></div><b><span>{mine?.rarity ?? 'N'}</span> {mine?.name ?? '선택한 카드'}</b><p>{mine?.artistName ?? 'DREAMSCAPE'}<br />{mine?.seasonName ?? 'Nebula Ver.'}</p><small>내 보유 카드 <strong>1장</strong></small><button type="button" disabled={offeredCards.length < 2 || submitting} onClick={selectNextOfferedCard}>다른 카드로 변경 ›</button></article><i aria-hidden="true"><InlineIcon name="rotate" /></i><article><h3>받고 싶은 카드</h3><div className="trade-card-visual"><img src={resolveApiUrl(wanted?.imageUrl)} alt="받고 싶은 카드" /></div><b><span>{wanted?.rarity ?? 'SR'}</span> {wanted?.name ?? '요청한 카드'}</b><p>{wanted?.artistName ?? 'DREAMSCAPE'}<br />{wanted?.seasonName ?? 'STARLIGHT Ver.'}</p><small>보유자 <strong>{recipientNickname}</strong></small></article></div>
          <div className="trade-match-table"><dl><div><dt>희귀도</dt><dd>{mine?.rarity ?? '-'}</dd></div><div><dt>팩</dt><dd>{mine?.artistName ?? '-'}</dd></div><div><dt>버전</dt><dd>{mine?.seasonName ?? '-'}</dd></div><div><dt>컨디션</dt><dd>A</dd></div></dl><dl><div><dt>희귀도</dt><dd>{wanted?.rarity ?? '-'}</dd></div><div><dt>팩</dt><dd>{wanted?.artistName ?? '-'}</dd></div><div><dt>버전</dt><dd>{wanted?.seasonName ?? '-'}</dd></div><div><dt>컨디션</dt><dd>A</dd></div></dl></div>
        </section>
        <details className="trade-condition-details"><summary><span className="trade-condition-label"><InlineIcon name="shield" /> 거래 조건 확인</span><InlineIcon name="chevron" /></summary><p>양쪽 팬이 모두 거래 제안을 수락해야 카드가 잠금 처리됩니다.</p></details>
        <aside className="trade-safety-note"><span className="trade-safety-icon" aria-hidden="true"><InlineIcon name="lock" /></span><div><b>안전한 팬간 거래를 위해</b><p>양쪽 팬이 모두 거래 제안을 수락해야 카드가 잠금 처리돼요.</p></div></aside>
        <label className="trade-confirm-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span />선택한 카드를 확인했어요.</label>
        <div className="trade-match-actions"><button type="button" disabled={submitting} onClick={onBack}>다시 선택</button><button type="button" disabled={!confirmed || submitting} onClick={() => void submit()}>{submitting ? '거래 제안 보내는 중...' : '거래 제안 보내기'}</button></div>
        {message && <p className="trade-submit-message" role="status">{message}</p>}
      </>}
    </section>
  </main>
}
