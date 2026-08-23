import { useEffect, useState } from 'react'
import { ApiError, followFan, getPublicCollection, resolveApiUrl, unfollowFan, type PublicCollection } from '../api/client'
import avatarFallback from '../assets/profile-avatar-generated.png'
import artistImage from '../assets/login/dreamscape-group.png'
import packImage from '../assets/card-pack-dreamscape-generated.png'
import { InlineIcon, VerifiedIcon } from '../App'

type Props = { userId: string; onBack: () => void; onOpenArtist: (artistId: string) => void; onOpenCollection: () => void; onTrade: (requestedUserCardId?: string) => void; initialCollection?: PublicCollection }

export function FanPublicProfile({ userId, onBack, onOpenArtist, onOpenCollection, onTrade, initialCollection }: Props) {
  const [collection, setCollection] = useState<PublicCollection | null>(initialCollection ?? null)
  const [following, setFollowing] = useState(initialCollection?.isFollowing ?? false)
  const [error, setError] = useState('')
  useEffect(() => { if (initialCollection) return; let active = true; void getPublicCollection(userId).then(r => { if (active) { setCollection(r.data); setFollowing(r.data.isFollowing) } }).catch(e => { if (active) setError(e instanceof ApiError ? e.message : '팬 프로필을 불러오지 못했어요.') }); return () => { active = false } }, [initialCollection, userId])
  const toggleFollow = async () => { if (initialCollection) { setFollowing(v => !v); return } try { const r = following ? await unfollowFan(userId) : await followFan(userId); setFollowing(r.data.following) } catch { setError('팔로우 상태를 변경하지 못했어요.') } }
  if (error) return <main className="app-shell fan-profile-shell"><p role="alert">{error}</p></main>
  if (!collection) return <main className="app-shell fan-profile-shell"><p role="status">팬 프로필을 불러오는 중...</p></main>
  const cards = collection.cards
  const tradableCards = cards.filter(card => card.tradable)
  const displayName = collection.nickname ?? userId
  const primaryArtist = cards.find(card => card.artistId && card.artistName)
  const primaryArtistId = primaryArtist?.artistId ?? ''
  const primaryArtistName = primaryArtist?.artistName ?? '아티스트'
  const level = Math.max(1, Math.ceil(collection.summary.ownedCount / 4))
  const imageAt = (index: number) => resolveApiUrl(cards[index % Math.max(1, cards.length)]?.imageUrl) || avatarFallback
  return <main className="app-shell fan-profile-shell fan-profile-reference">
    <header className="social-reference-topbar"><button type="button" onClick={onBack} aria-label="팬 찾기로 돌아가기"><InlineIcon name="back" /></button><h1>팬 프로필</h1><span /></header>
    <section className="fan-profile-content">
      <section className="fan-profile-hero"><div className="fan-profile-identity"><img src={resolveApiUrl(collection.profileImageUrl) || avatarFallback} alt={`${displayName} 프로필`} /><div><h2>{displayName}</h2><p>{primaryArtistName}의 모든 순간을 모으고 있어요.</p><span><InlineIcon name="sparkles" /> Lv.{level}</span><small>팔로잉 {collection.summary.followingCount} <i /> 팔로워 {collection.summary.followerCount}</small></div></div><div className="fan-profile-actions"><button type="button" className={following ? 'following' : ''} onClick={() => void toggleFollow()}>{following ? '팔로잉' : '팔로우'}</button><button type="button" disabled={tradableCards.length === 0} onClick={() => onTrade(tradableCards[0]?.userCardId)}>거래 제안</button></div><div className="fan-profile-artist"><span>팔로우 중인 아티스트</span><button type="button" disabled={!primaryArtistId} onClick={() => onOpenArtist(primaryArtistId)}><img src={artistImage} alt="" /><b>{primaryArtistName} <VerifiedIcon /></b><em><InlineIcon name="chevron" /></em></button></div></section>
      <section className="fan-profile-panel"><div className="section-heading"><h3>대표 컬렉션</h3><button type="button" onClick={onOpenCollection}>전체 보기 <InlineIcon name="chevron" /></button></div><div className="fan-profile-featured-cards">{[0,1,2,3].map(index => <button type="button" key={index} onClick={onOpenCollection}><img src={imageAt(index)} alt="대표 카드" /><span>{cards[index % Math.max(1, cards.length)]?.rarity ?? 'N'}</span><em><InlineIcon name="star" /> 1</em></button>)}</div></section>
      <section className="fan-profile-panel"><h3>컬렉션 진행률</h3><div className="fan-profile-progress-row"><img src={packImage} alt="" /><span><b>정규 1집 · DREAMSCAPE</b><i><em style={{ width: `${Math.min(100, Math.round((collection.summary.ownedCount / 40) * 100))}%` }} /></i></span><strong>{collection.summary.ownedCount}/40</strong><button type="button" onClick={onOpenCollection}><InlineIcon name="chevron" /></button></div><div className="fan-profile-progress-row"><img src={artistImage} alt="" /><span><b>공개 카드</b><i><em style={{ width: `${Math.min(100, Math.round((tradableCards.length / Math.max(1, collection.summary.ownedCount)) * 100))}%` }} /></i></span><strong>{tradableCards.length}/{collection.summary.ownedCount}</strong><button type="button" onClick={onOpenCollection}><InlineIcon name="chevron" /></button></div></section>
      <section className="fan-profile-panel"><div className="section-heading"><h3>교환 가능한 카드</h3><button type="button" onClick={onOpenCollection}>전체 보기 <InlineIcon name="chevron" /></button></div><div className="fan-profile-tradable-cards">{tradableCards.slice(0, 3).map(card => <button type="button" key={card.userCardId} onClick={() => onTrade(card.userCardId)}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><b>{card.rarity ?? 'N'}</b><em><InlineIcon name="star" /> 1</em></button>)}<button type="button" className="more" onClick={onOpenCollection}><InlineIcon name="grid" /><small>더 많은 카드를<br />확인해보세요</small></button></div></section>
      <section className="fan-profile-summary"><div><span><InlineIcon name="rotate" /></span><small>팔로워<strong>{collection.summary.followerCount}명</strong></small></div><div><span><InlineIcon name="grid" /></span><small>공개 카드<strong>{collection.summary.ownedCount}장</strong></small></div></section>
    </section>
  </main>
}
