import { useEffect, useState } from 'react'
import { ApiError, followFan, getPublicCollection, resolveApiUrl, unfollowFan, type PublicCollection } from '../api/client'

type Props = {
  userId: string
  initiallyFollowing?: boolean
  onBack?: () => void
  onTrade?: (requestedUserCardId: string) => void
}

export function PublicCollection({ userId, initiallyFollowing = false, onBack, onTrade }: Props) {
  const [collection, setCollection] = useState<PublicCollection | null>(null)
  const [following, setFollowing] = useState(initiallyFollowing)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getPublicCollection(userId).then(response => {
      if (active) {
        setCollection(response.data)
        setFollowing(response.data.isFollowing)
      }
    }).catch(loadError => {
      if (active) setError(loadError instanceof ApiError ? loadError.message : '공개된 컬렉션을 불러오지 못했어요.')
    })
    return () => { active = false }
  }, [userId])

  const toggleFollow = async () => {
    try {
      const response = following ? await unfollowFan(userId) : await followFan(userId)
      setFollowing(response.data.following)
      setCollection(current => current ? { ...current, summary: { ...current.summary, followerCount: Math.max(0, current.summary.followerCount + (response.data.following ? 1 : -1)) } } : current)
    } catch (followError) {
      setError(followError instanceof ApiError ? followError.message : '팔로우 상태를 변경하지 못했어요.')
    }
  }

  if (error) return <main className="public-collection-screen"><header className="public-collection-header"><button type="button" onClick={onBack}>‹</button><div><span className="eyebrow">PUBLIC COLLECTION</span><h1>팬 컬렉션</h1></div><span /></header><section className="public-collection-state" role="alert"><b>{error}</b><button type="button" onClick={onBack}>팬 찾기로 돌아가기</button></section></main>
  if (!collection) return <main className="public-collection-screen"><section className="public-collection-state" role="status">컬렉션을 불러오는 중...</section></main>

  return <main className="public-collection-screen">
    <header className="public-collection-header">
      <button type="button" onClick={onBack}>‹</button>
      <div><span className="eyebrow">PUBLIC COLLECTION</span><h1>{collection.nickname ?? '팬'}님의 컬렉션</h1><p>카드 {collection.summary.ownedCount}장 · 팔로워 {collection.summary.followerCount} · 팔로잉 {collection.summary.followingCount}</p></div>
      <button type="button" onClick={() => void toggleFollow()}>{following ? '팔로잉' : '팔로우'}</button>
    </header>
    <section className="public-collection-grid" aria-label="공개 카드 컬렉션">
      {collection.cards.map(card => <article className="public-collection-card" key={card.userCardId}>
        <img src={resolveApiUrl(card.imageUrl)} alt={card.name} />
        <strong>{card.name}</strong>
        <span>{card.rarity ?? 'CARD'} · {card.tradable ? '거래 가능' : '거래 제한'}</span>
        {card.tradable && onTrade && <button type="button" onClick={() => onTrade(card.userCardId)}>거래 제안</button>}
      </article>)}
      {collection.cards.length === 0 && <div className="public-collection-empty" role="status"><b>아직 공개할 카드가 없어요.</b><small>이 팬이 카드를 수집하면 여기에 표시돼요.</small></div>}
    </section>
  </main>
}
