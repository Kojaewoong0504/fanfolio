import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  followFan,
  getFanConnections,
  resolveApiUrl,
  searchFans,
  unfollowFan,
  type FanSummary,
} from '../api/client'
import { ProfileAvatar } from './ProfileAvatar'

type View = 'search' | 'following' | 'followers'

type Props = {
  onBack: () => void
  onOpenCollection: (userId: string) => void
  onOpenTrades: () => void
}

export function FanSocialHub({ onBack, onOpenCollection, onOpenTrades }: Props) {
  const [view, setView] = useState<View>('following')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [items, setItems] = useState<FanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = view === 'search'
        ? await searchFans(submittedQuery)
        : await getFanConnections(view)
      setItems(response.data.items)
    } catch (loadError) {
      setItems([])
      setError(loadError instanceof ApiError ? loadError.message : '팬 목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [submittedQuery, view])

  useEffect(() => { void load() }, [load])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setSubmittedQuery(query.trim())
    setView('search')
  }

  const toggleFollow = async (fan: FanSummary) => {
    setError('')
    try {
      const result = fan.isFollowing ? await unfollowFan(fan.id) : await followFan(fan.id)
      setItems(current => current
        .map(item => item.id === fan.id
          ? { ...item, isFollowing: result.data.following, followerCount: Math.max(0, item.followerCount + (result.data.following ? 1 : -1)) }
          : item)
        .filter(item => view !== 'following' || item.isFollowing))
    } catch (followError) {
      setError(followError instanceof ApiError ? followError.message : '팔로우 상태를 변경하지 못했어요.')
    }
  }

  const emptyCopy = view === 'following'
    ? '아직 팔로우한 팬이 없어요.'
    : view === 'followers'
      ? '아직 나를 팔로우한 팬이 없어요.'
      : submittedQuery
        ? '검색 결과가 없어요.'
        : '닉네임이나 이메일로 팬을 찾아보세요.'

  return <main className="app-shell fan-social-shell">
    <header className="social-topbar">
      <button type="button" onClick={onBack} aria-label="이전 화면으로 돌아가기">‹</button>
      <div><span className="eyebrow">FAN COMMUNITY</span><h1>팬 찾기</h1></div>
      <button type="button" className="social-trade-entry" onClick={onOpenTrades}>거래함</button>
    </header>

    <section className="fan-social-content">
      <form className="fan-search-form" onSubmit={submitSearch} role="search">
        <label><span className="sr-only">팬 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="닉네임 또는 이메일 검색" /></label>
        <button type="submit">검색</button>
      </form>

      <div className="fan-social-tabs" role="tablist" aria-label="팬 목록">
        {([['following', '팔로잉'], ['followers', '팔로워'], ['search', '검색 결과']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={view === value} className={view === value ? 'active' : ''} key={value} onClick={() => setView(value)}>{label}</button>)}
      </div>

      {error && <div className="fan-social-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div>}
      {loading ? <div className="fan-social-state" role="status">팬 목록을 불러오는 중...</div> : items.length === 0 ? <div className="fan-social-state"><b>{emptyCopy}</b><small>공개 컬렉션을 둘러보고 관심 있는 팬을 팔로우할 수 있어요.</small></div> : <div className="fan-social-list">
        {items.map(fan => <article className="fan-social-card" key={fan.id}>
          <button type="button" className="fan-social-profile" onClick={() => onOpenCollection(fan.id)} aria-label={`${fan.nickname}님의 공개 컬렉션 보기`}>
            <ProfileAvatar imageUrl={resolveApiUrl(fan.profileImageUrl)} fallback={fan.nickname} alt={`${fan.nickname} 프로필`} />
            <span><strong>{fan.nickname}</strong><small>카드 {fan.ownedCount}장 · 팔로워 {fan.followerCount}</small></span>
          </button>
          <button type="button" className={fan.isFollowing ? 'following' : ''} onClick={() => void toggleFollow(fan)}>{fan.isFollowing ? '팔로잉' : '팔로우'}</button>
        </article>)}
      </div>}
    </section>
  </main>
}
