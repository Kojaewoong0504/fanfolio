import { useEffect, useMemo, useState } from 'react'
import { ApiError, getPublicCollection, resolveApiUrl, type PublicCollection } from '../api/client'
import avatarFallback from '../assets/profile-avatar-generated.png'
import packImage from '../assets/card-pack-dreamscape-generated.png'
import { InlineIcon, VerifiedIcon } from '../App'

type CollectionFilter = 'owned' | 'tradable' | 'wanted'
type Props = { userId: string; initiallyFollowing?: boolean; onBack?: () => void; onOpenPackCatalog: (packId?: string) => void; onTrade?: (requestedUserCardId: string) => void; initialCollection?: PublicCollection; initialFilter?: CollectionFilter }

export function PublicCollection({ userId, onBack, onOpenPackCatalog, onTrade, initialCollection, initialFilter = 'owned' }: Props) {
  const [collection, setCollection] = useState<PublicCollection | null>(initialCollection ?? null)
  const [error, setError] = useState('')
  const [pack, setPack] = useState<'all' | 'nebula' | 'starlight'>('all')
  const [filter, setFilter] = useState<CollectionFilter>(initialFilter)
  useEffect(() => { if (initialCollection) return; let active = true; void getPublicCollection(userId).then(r => { if (active) setCollection(r.data) }).catch(e => { if (active) setError(e instanceof ApiError ? e.message : '공개된 컬렉션을 불러오지 못했어요.') }); return () => { active = false } }, [initialCollection, userId])
  const slots = useMemo(() => {
    const cards = collection?.cards ?? []
    const packCards = cards.filter(card => {
      if (pack === 'all') return true
      const cardText = `${card.name} ${card.seasonName ?? ''}`.toLocaleLowerCase('ko-KR')
      return cardText.includes(pack)
    })
    if (filter === 'wanted') {
      return Array.from({ length: Math.max(1, 16 - packCards.length) }, (_, index) => ({ number: packCards.length + index + 1, card: undefined }))
    }
    const filteredCards = filter === 'tradable' ? packCards.filter(card => card.tradable) : packCards
    const slotCount = filter === 'tradable' ? filteredCards.length : Math.max(16, filteredCards.length)
    return Array.from({ length: slotCount }, (_, index) => ({ number: index + 1, card: filteredCards[index] }))
  }, [collection, filter, pack])
  if (error) return <main className="app-shell public-collection-screen"><p role="alert">{error}</p></main>
  if (!collection) return <main className="app-shell public-collection-screen"><p role="status">컬렉션을 불러오는 중...</p></main>
  const tradableCards = collection.cards.filter(card => card.tradable)
  const totalSlots = Math.max(40, collection.summary.ownedCount)
  return <main className="app-shell public-collection-screen public-collection-reference">
    <header className="social-reference-topbar"><button type="button" onClick={onBack} aria-label="팬 프로필로 돌아가기"><InlineIcon name="back" /></button><h1>공개 컬렉션</h1><span /></header>
    <section className="public-collection-owner"><img src={resolveApiUrl(collection.profileImageUrl) || avatarFallback} alt={`${collection.nickname ?? '팬'} 프로필`} /><div><h2>{collection.nickname ?? '팬'}의 컬렉션</h2><span>드림스케이프 <VerifiedIcon /></span></div><strong><span><b>{collection.summary.ownedCount}</b> / {totalSlots}</span><small>수집률</small></strong></section>
    <button type="button" className="public-collection-season" onClick={() => onOpenPackCatalog(collection.featuredPackId ?? undefined)}><img src={packImage} alt="" /><b>정규 1집 · DREAMSCAPE</b><span><InlineIcon name="chevron" /></span></button>
    <nav className="public-collection-pack-tabs" aria-label="카드팩 버전">{([['all','전체'],['nebula','Nebula Ver.'],['starlight','Starlight Ver.']] as const).map(([value,label]) => <button type="button" key={value} className={pack === value ? 'active' : ''} onClick={() => setPack(value)}>{label}</button>)}</nav>
    <nav className="public-collection-filter-pills" aria-label="카드 필터">{([['owned','보유','check'],['tradable','교환 가능','rotate'],['wanted','찾는 카드','search']] as const).map(([value,label,icon]) => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}><InlineIcon name={icon} /> {label}</button>)}</nav>
    <section className="public-collection-grid" aria-label="공개 카드 컬렉션">{slots.length === 0 ? <p className="public-collection-empty">이 조건에 맞는 카드가 아직 없어요.</p> : slots.map(({ number, card }) => !card ? <article className="public-collection-slot missing" key={number}><span>?</span><small>{String(number).padStart(3,'0')}</small></article> : card.tradable ? <button type="button" className="public-collection-slot owned" key={number} onClick={() => onTrade?.(card.userCardId)}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><b>{card.rarity ?? 'N'}</b><small>{String(number).padStart(3,'0')}</small><em>교환 가능</em></button> : <article className="public-collection-slot owned" key={number}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><b>{card.rarity ?? 'N'}</b><small>{String(number).padStart(3,'0')}</small></article>)}</section>
    <footer className="public-collection-trade-bar"><span><InlineIcon name="rotate" /> 교환 가능한 카드 <b>{tradableCards.length}장</b></span><button type="button" disabled={tradableCards.length === 0} onClick={() => { const card = tradableCards[0]; if (card) onTrade?.(card.userCardId) }}>거래 제안 <InlineIcon name="chevron" /></button></footer>
  </main>
}
