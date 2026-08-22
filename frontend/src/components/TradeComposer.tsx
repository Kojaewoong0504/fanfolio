import { useEffect, useState } from 'react'
import { ApiError, getMyCollection, type CollectionCard } from '../api/client'
import { TradeProposal } from './TradeProposal'

type Props = {
  recipientUserId: string
  requestedUserCardIds: string[]
  onBack: () => void
  onCreated: () => void
}

export function TradeComposer({ recipientUserId, requestedUserCardIds, onBack, onCreated }: Props) {
  const [cards, setCards] = useState<CollectionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getMyCollection().then(response => {
      if (active) setCards(response.data.cards)
    }).catch(loadError => {
      if (active) setError(loadError instanceof ApiError ? loadError.message : '내 컬렉션을 불러오지 못했어요.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return <main className="app-shell trade-composer-shell">
    <header className="social-topbar">
      <button type="button" onClick={onBack} aria-label="이전 화면으로 돌아가기">‹</button>
      <div><span className="eyebrow">NEW TRADE</span><h1>거래 제안</h1></div>
      <span />
    </header>
    <section className="trade-composer-content">
      <div className="trade-request-summary"><span>상대에게 요청한 카드</span><strong>{requestedUserCardIds.length}장</strong><small>거래가 수락될 때 두 팬의 카드 소유권이 함께 변경돼요.</small></div>
      <div className="trade-composer-section-heading"><h2>내가 제안할 카드</h2><p>거래 가능한 보유 카드 중에서 선택하세요.</p></div>
      {error ? <div className="fan-social-error" role="alert">{error}</div> : loading ? <div className="fan-social-state" role="status">내 컬렉션을 불러오는 중...</div> : <TradeProposal recipientUserId={recipientUserId} offeredCards={cards} requestedUserCardIds={requestedUserCardIds} onCreated={onCreated} />}
    </section>
  </main>
}
