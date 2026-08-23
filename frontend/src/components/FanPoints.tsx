import { useEffect, useState } from 'react'
import { ApiError, exchangePoints, getFanPoints, getPointExchanges, type FanPoints as FanPointsData, type PointExchange } from '../api/client'

export function FanPoints() {
  const [points, setPoints] = useState<FanPointsData | null>(null)
  const [exchanges, setExchanges] = useState<PointExchange[]>([])
  const [message, setMessage] = useState('')
  const [exchanging, setExchanging] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [balance, catalog] = await Promise.all([getFanPoints(), getPointExchanges()])
      setPoints(balance.data)
      setExchanges(catalog.data.items)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setMessage('포인트 정보를 불러오지 못했어요.')
    }
  }
  useEffect(() => { void refresh() }, [])

  const exchange = async (item: PointExchange) => {
    setExchanging(item.id)
    setMessage('')
    try {
      const result = await exchangePoints(item.id)
      setPoints(current => current ? { ...current, balance: result.data.balance } : current)
      setMessage(`${item.name}을(를) 교환했어요.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '포인트 교환에 실패했어요.')
    } finally { setExchanging(null) }
  }

  if (!points && !message) return null
  return <section className="fan-growth-reference-section fan-points-panel" aria-label="포인트">
    <div className="fan-growth-reference-title"><h2>포인트</h2><strong>{(points?.balance ?? 0).toLocaleString()} P</strong></div>
    {exchanges.length > 0 && <div className="fan-points-exchanges">{exchanges.slice(0, 3).map(item => <article key={item.id}><div><strong>{item.name}</strong><small>{item.pointCost.toLocaleString()} P</small></div><button type="button" disabled={exchanging === item.id || (points?.balance ?? 0) < item.pointCost} onClick={() => void exchange(item)}>{exchanging === item.id ? '교환 중' : '교환'}</button></article>)}</div>}
    {message && <p className="fan-growth-message" role="status">{message}</p>}
  </section>
}
