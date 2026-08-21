import { useEffect, useState } from 'react'
import { followFan, getPublicCollection, unfollowFan, type PublicCollection } from '../api/client'

type Props = {
  userId: string
  initiallyFollowing?: boolean
  onBack?: () => void
}

export function PublicCollection({ userId, initiallyFollowing = false, onBack }: Props) {
  const [collection, setCollection] = useState<PublicCollection | null>(null)
  const [following, setFollowing] = useState(initiallyFollowing)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getPublicCollection(userId).then(response => {
      if (active) setCollection(response.data)
    }).catch(() => {
      if (active) setError('공개된 컬렉션을 불러오지 못했어요.')
    })
    return () => { active = false }
  }, [userId])

  const toggleFollow = async () => {
    try {
      const response = following ? await unfollowFan(userId) : await followFan(userId)
      setFollowing(response.data.following)
    } catch {
      setError('팔로우 상태를 변경하지 못했어요.')
    }
  }

  if (error) return <section className="public-collection-state" role="alert">{error}</section>
  if (!collection) return <section className="public-collection-state">컬렉션을 불러오는 중...</section>

  return <main className="public-collection-screen">
    <header className="public-collection-header">
      <button type="button" onClick={onBack}>‹</button>
      <div><span className="eyebrow">PUBLIC COLLECTION</span><h1>{collection.nickname ?? '팬'}님의 컬렉션</h1><p>보유 카드 {collection.summary.ownedCount}장</p></div>
      <button type="button" onClick={() => void toggleFollow()}>{following ? '팔로잉' : '팔로우'}</button>
    </header>
    <section className="public-collection-grid" aria-label="공개 카드 컬렉션">
      {collection.cards.map(card => <article className="public-collection-card" key={card.userCardId}>
        <img src={card.imageUrl} alt={card.name} />
        <strong>{card.name}</strong>
        <span>{card.rarity ?? 'CARD'} · {card.tradable ? '거래 가능' : '거래 제한'}</span>
      </article>)}
    </section>
  </main>
}
