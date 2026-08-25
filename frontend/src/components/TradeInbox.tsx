import { useCallback, useEffect, useState } from 'react'
import { ApiError, getTradeProposals, respondToTradeProposal, resolveApiUrl, type TradeProposalDetail } from '../api/client'
import { DetailTopBar } from './DetailTopBar'

type Box = 'received' | 'sent'

type Props = {
  onBack: () => void
  onFindFans: () => void
}

const statusLabel: Record<TradeProposalDetail['status'], string> = {
  pending: '대기 중',
  accepted: '거래 완료',
  rejected: '거절됨',
  cancelled: '취소됨',
  expired: '만료됨',
}

export function TradeInbox({ onBack, onFindFans }: Props) {
  const [box, setBox] = useState<Box>('received')
  const [items, setItems] = useState<TradeProposalDetail[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getTradeProposals(box)
      setItems(response.data.items)
      setSelectedId(current => response.data.items.some(item => item.id === current) ? current : response.data.items[0]?.id ?? null)
    } catch (loadError) {
      setItems([])
      setSelectedId(null)
      setError(loadError instanceof ApiError ? loadError.message : '거래함을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [box])

  useEffect(() => { void load() }, [load])

  const selected = items.find(item => item.id === selectedId) ?? null
  const act = async (action: 'accept' | 'reject' | 'cancel') => {
    if (!selected || processing) return
    setProcessing(true)
    setError('')
    try {
      await respondToTradeProposal(selected.id, action)
      await load()
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : '거래 상태를 변경하지 못했어요.')
    } finally {
      setProcessing(false)
    }
  }

  const peerName = (trade: TradeProposalDetail) => box === 'received'
    ? trade.proposer.nickname ?? '팬'
    : trade.recipient.nickname ?? '팬'

  return <main className="app-shell trade-inbox-shell">
    <DetailTopBar title="거래함" onBack={onBack} right={<button type="button" className="detail-topbar-action" onClick={onFindFans}>팬 찾기</button>} />
    <section className="trade-inbox-content">
      <div className="trade-inbox-tabs" role="tablist" aria-label="거래 제안함">
        <button type="button" role="tab" aria-selected={box === 'received'} className={box === 'received' ? 'active' : ''} onClick={() => setBox('received')}>받은 제안</button>
        <button type="button" role="tab" aria-selected={box === 'sent'} className={box === 'sent' ? 'active' : ''} onClick={() => setBox('sent')}>보낸 제안</button>
      </div>
      {error && <div className="fan-social-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div>}
      {loading ? <div className="fan-social-state" role="status">거래 제안을 불러오는 중...</div> : items.length === 0 ? <div className="fan-social-state"><b>{box === 'received' ? '받은 거래 제안이 없어요.' : '보낸 거래 제안이 없어요.'}</b><small>팬의 공개 컬렉션에서 거래 가능한 카드를 선택해 제안할 수 있어요.</small><button type="button" onClick={onFindFans}>팬 컬렉션 둘러보기</button></div> : <>
        <div className="trade-inbox-list" aria-label={box === 'received' ? '받은 제안' : '보낸 제안'}>
          {items.map(trade => <button type="button" className={trade.id === selectedId ? 'active' : ''} key={trade.id} onClick={() => setSelectedId(trade.id)}>
            <span><strong>{peerName(trade)}님과의 거래</strong><small>{trade.offeredCards.length}장 제안 · {trade.requestedCards.length}장 요청</small></span>
            <em className={`trade-status ${trade.status}`}>{statusLabel[trade.status]}</em>
          </button>)}
        </div>
        {selected && <section className="trade-detail-card" aria-label="거래 상세">
          <header><div><span>{box === 'received' ? '보낸 팬' : '받는 팬'}</span><h2>{peerName(selected)}</h2></div><em className={`trade-status ${selected.status}`}>{statusLabel[selected.status]}</em></header>
          <TradeCardGroup title={box === 'received' ? '상대가 제안한 카드' : '내가 제안한 카드'} cards={selected.offeredCards} />
          <TradeCardGroup title={box === 'received' ? '상대가 요청한 내 카드' : '내가 요청한 카드'} cards={selected.requestedCards} empty="요청한 카드 없이 제안했어요." />
          <p className="trade-expiry">응답 기한 {new Date(selected.expiresAt).toLocaleString('ko-KR')}</p>
          {selected.status === 'pending' && <div className="trade-detail-actions">
            {box === 'received' ? <><button type="button" className="secondary" disabled={processing} onClick={() => void act('reject')}>거절</button><button type="button" disabled={processing} onClick={() => void act('accept')}>{processing ? '처리 중...' : '거래 수락'}</button></> : <button type="button" className="secondary" disabled={processing} onClick={() => void act('cancel')}>{processing ? '처리 중...' : '제안 취소'}</button>}
          </div>}
        </section>}
      </>}
    </section>
  </main>
}

function TradeCardGroup({ title, cards, empty = '카드가 없어요.' }: { title: string; cards: TradeProposalDetail['offeredCards']; empty?: string }) {
  return <section className="trade-card-group"><h3>{title}</h3>{cards.length === 0 ? <p>{empty}</p> : <div>{cards.map(card => <article key={`${card.side}:${card.userCardId}`}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><span><b>{card.name}</b><small>{card.rarity ?? 'CARD'} · #{card.serialNumber}</small></span></article>)}</div>}</section>
}
