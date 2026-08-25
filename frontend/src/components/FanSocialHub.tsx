import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, followFan, resolveApiUrl, searchFans, unfollowFan, type FanSummary } from '../api/client'
import avatarFallback from '../assets/profile-avatar-generated.png'
import { InlineIcon, VerifiedIcon } from '../App'
import { ProfileAvatar } from './ProfileAvatar'
import { DetailTopBar } from './DetailTopBar'

type Props = {
  onBack: () => void
  onOpenProfile: (userId: string) => void
  onOpenCollection: (userId: string) => void
  onOpenTrades: (userId: string) => void
  initialItems?: FanSummary[]
  initialQuery?: string
}

export function FanSocialHub({ onBack, onOpenProfile, onOpenCollection, onOpenTrades, initialItems, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim())
  const [items, setItems] = useState<FanSummary[]>(initialItems ?? [])
  const [loading, setLoading] = useState(!initialItems)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'artist' | 'tradable' | 'wishlist' | 'new'>('artist')
  const load = useCallback(async () => {
    if (initialItems) { setItems(initialItems); setLoading(false); return }
    setLoading(true); setError('')
    try { const response = await searchFans(submittedQuery); setItems(response.data.items) }
    catch (loadError) { setItems([]); setError(loadError instanceof ApiError ? loadError.message : '팬 목록을 불러오지 못했어요.') }
    finally { setLoading(false) }
  }, [initialItems, submittedQuery])
  useEffect(() => { void load() }, [load])
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setSubmittedQuery(query.trim()) }
  const filteredItems = useMemo(() => {
    if (filter === 'artist') return items.filter(fan => fan.sharedFavoriteArtists.length > 0)
    if (filter === 'tradable') return items.filter(fan => fan.tradableCount > 0)
    if (filter === 'wishlist') return items.filter(fan => fan.matchingWishlistCount > 0)
    return [...items].sort((first, second) => {
      const firstTime = first.latestCardAt ? Date.parse(first.latestCardAt) : 0
      const secondTime = second.latestCardAt ? Date.parse(second.latestCardAt) : 0
      return secondTime - firstTime
    })
  }, [filter, items])
  const toggleFollow = async (fan: FanSummary) => {
    if (initialItems) { setItems(current => current.map(item => item.id === fan.id ? { ...item, isFollowing: !item.isFollowing } : item)); return }
    try { const result = fan.isFollowing ? await unfollowFan(fan.id) : await followFan(fan.id); setItems(current => current.map(item => item.id === fan.id ? { ...item, isFollowing: result.data.following } : item)) }
    catch (followError) { setError(followError instanceof ApiError ? followError.message : '팔로우 상태를 변경하지 못했어요.') }
  }
  return <main className="app-shell fan-social-shell fan-social-reference">
    <DetailTopBar title="팬 찾기" onBack={onBack} />
    <section className="fan-social-content">
      <form className="fan-search-reference" onSubmit={submitSearch} role="search"><span aria-hidden="true"><InlineIcon name="search" /></span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="닉네임 또는 카드를 검색해보세요" /></form>
      <div className="fan-recommendation-filters" role="tablist" aria-label="추천 팬 필터">{([['artist', '같은 아티스트'], ['tradable', '거래 가능'], ['wishlist', '찾는 카드 보유'], ['new', '신규 팬']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <p className="fan-result-count">총 {filteredItems.length}명</p>
      {error && <div className="fan-social-error" role="alert">{error}</div>}
      {loading ? <div className="fan-social-state" role="status">팬 목록을 불러오는 중...</div> : filteredItems.length === 0 ? <div className="fan-social-state" role="status">이 조건에 맞는 팬이 아직 없어요.</div> : <div className="fan-social-list">{filteredItems.map(fan => {
        const level = Math.max(1, Math.ceil(fan.ownedCount / 4))
        const note = filter === 'wishlist'
          ? `내가 찾는 카드 ${fan.matchingWishlistCount}장을 보유하고 있어요`
          : filter === 'tradable'
            ? `교환 가능한 카드가 ${fan.tradableCount}장 있어요`
            : filter === 'new'
              ? '최근 컬렉션에 새 카드를 추가했어요'
              : `${fan.sharedFavoriteArtists.map(artist => artist.name).join(', ')}를 함께 좋아해요`
        return <article className="fan-social-card fan-social-card-preview" key={fan.id} tabIndex={0} aria-label={`${fan.nickname}님의 공개 프로필 보기`} onClick={event => { if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return; onOpenProfile(fan.id) }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenProfile(fan.id) } }}>
        <button type="button" className="fan-social-avatar-button" onClick={() => onOpenProfile(fan.id)} aria-label={`${fan.nickname}님의 공개 프로필 보기`}><ProfileAvatar imageUrl={resolveApiUrl(fan.profileImageUrl) || avatarFallback} fallback={fan.nickname} alt={`${fan.nickname} 프로필`} /></button>
        <div className="fan-social-copy"><strong>{fan.nickname} <em>LV.{level}</em></strong><span className="fan-social-tags">{fan.favoriteArtists.map((artist, artistIndex) => <i key={artist.id}>{artist.name}{artistIndex === 0 && <VerifiedIcon />}</i>)}</span></div>
        <button type="button" className={fan.isFollowing ? 'following' : ''} onClick={() => void toggleFollow(fan)}>{fan.isFollowing ? '팔로잉' : '팔로우'}</button>
        <p className="fan-social-affinity"><InlineIcon name="heart" /><mark>{note}</mark></p>
        <div className="fan-social-stats"><button type="button" onClick={() => onOpenCollection(fan.id)}><InlineIcon name="grid" /> 공개 컬렉션 <b>{fan.ownedCount}개</b></button><button type="button" disabled={fan.tradableCount === 0} onClick={() => onOpenTrades(fan.id)}><InlineIcon name="rotate" /> 거래 가능 카드 <b>{fan.tradableCount}장</b></button></div>
        <div className="fan-social-card-previews">{fan.previewCards.map(card => <span key={card.userCardId}><img src={resolveApiUrl(card.imageUrl)} alt={`${card.name} 공개 카드 미리보기`} /><b>{card.rarity ?? 'N'}</b></span>)}</div>
      </article> })}</div>}
    </section>
  </main>
}
