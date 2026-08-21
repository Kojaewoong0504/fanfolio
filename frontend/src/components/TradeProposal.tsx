import { useState } from 'react'
import { createTradeProposal, type CollectionCard, type TradeProposal } from '../api/client'

type Props = {
  recipientUserId: string
  offeredCards: CollectionCard[]
  requestedUserCardIds?: string[]
  onCreated?: (proposal: TradeProposal) => void
}

export function TradeProposal({ recipientUserId, offeredCards, requestedUserCardIds = [], onCreated }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const submit = async () => {
    if (selected.length === 0) return
    try {
      const response = await createTradeProposal({ recipientUserId, offeredUserCardIds: selected, requestedUserCardIds })
      setMessage('거래 제안을 보냈어요.')
      onCreated?.(response.data)
    } catch {
      setMessage('거래 제안을 보내지 못했어요. 거래 제한 카드인지 확인해 주세요.')
    }
  }

  return <section className="trade-proposal" aria-label="카드 거래 제안">
    <h2>카드 거래 제안</h2>
    <p>상대에게 보낼 카드를 선택하세요. 기간제·조합·잠금 카드는 거래할 수 없습니다.</p>
    <div className="trade-proposal-list">
      {offeredCards.map(card => <label key={card.userCardId}>
        <input type="checkbox" checked={selected.includes(card.userCardId)} onChange={() => toggle(card.userCardId)} />
        <span>{card.name}</span>
      </label>)}
    </div>
    <button type="button" disabled={selected.length === 0} onClick={() => void submit()}>거래 제안 보내기</button>
    {message && <p role="status">{message}</p>}
  </section>
}
