import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, blockFan, followFan, getPublicCollection, reportFan, resolveApiUrl, unfollowFan, type PublicCollection, type PublicWantedCard } from '../api/client'
import avatarFallback from '../assets/profile-avatar-generated.png'
import { InlineIcon, VerifiedIcon } from '../App'
import { DetailTopBar } from './DetailTopBar'

type Props = { userId: string; onBack: () => void; onOpenArtist: (artistId: string) => void; onOpenCollection: () => void; onTrade: (requestedUserCardId?: string) => void; initialCollection?: PublicCollection }

export function FanPublicProfile({ userId, onBack, onOpenArtist, onOpenCollection, onTrade, initialCollection }: Props) {
  const [collection, setCollection] = useState<PublicCollection | null>(initialCollection ?? null)
  const [following, setFollowing] = useState(initialCollection?.isFollowing ?? false)
  const [followPending, setFollowPending] = useState(false)
  const [error, setError] = useState('')
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyPending, setSafetyPending] = useState(false)
  const [safetyMessage, setSafetyMessage] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [reportReason, setReportReason] = useState('불쾌하거나 부적절한 내용')
  const [reportBody, setReportBody] = useState('')
  useEffect(() => { if (initialCollection) return; let active = true; void getPublicCollection(userId).then(r => { if (active) { setCollection(r.data); setFollowing(r.data.isFollowing) } }).catch(e => { if (active) setError(e instanceof ApiError ? e.message : '팬 프로필을 불러오지 못했어요.') }); return () => { active = false } }, [initialCollection, userId])
  const applyFollowing = (nextFollowing: boolean) => { setFollowing(nextFollowing); setCollection(current => current ? { ...current, isFollowing: nextFollowing, summary: { ...current.summary, followerCount: Math.max(0, current.summary.followerCount + (nextFollowing ? 1 : -1)) } } : current) }
  const toggleFollow = async () => {
    if (followPending) return
    setFollowPending(true)
    try {
      if (initialCollection) { applyFollowing(!following); return }
      const r = following ? await unfollowFan(userId) : await followFan(userId)
      applyFollowing(r.data.following)
    } catch {
      setError('팔로우 상태를 변경하지 못했어요.')
    } finally {
      setFollowPending(false)
    }
  }
  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (safetyPending || reportBody.trim().length < 2) return
    setSafetyPending(true)
    setSafetyMessage('')
    try {
      if (!initialCollection) await reportFan({ targetType: 'user', targetId: userId, reason: reportReason, body: reportBody.trim() })
      setReportBody('')
      setSafetyMessage('신고가 접수되었어요. 운영팀이 확인할게요.')
    } catch { setSafetyMessage('신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.') } finally { setSafetyPending(false) }
  }
  const submitBlock = async () => {
    if (safetyPending) return
    setSafetyPending(true)
    try {
      if (!initialCollection) await blockFan(userId)
      setBlocked(true)
    } catch { setSafetyMessage('차단하지 못했어요. 잠시 후 다시 시도해 주세요.') } finally { setSafetyPending(false) }
  }
  if (error) return <main className="app-shell fan-profile-shell"><p role="alert">{error}</p></main>
  if (!collection) return <main className="app-shell fan-profile-shell"><p role="status">팬 프로필을 불러오는 중...</p></main>
  if (blocked) return <main className="app-shell fan-profile-shell fan-profile-reference"><DetailTopBar title="팬 프로필" onBack={onBack} backLabel="팬 찾기로 돌아가기" /><section className="fan-profile-content"><div className="fan-profile-safety-result"><span aria-hidden="true">✓</span><h2>이 팬을 차단했어요</h2><p>앞으로 이 팬의 활동과 거래 제안을 보지 않게 됩니다.</p><button type="button" onClick={onBack}>팬 찾기로 돌아가기</button></div></section></main>
  const cards = collection.cards
  const tradableCards = cards.filter(card => card.tradable)
  const wantedCards: PublicWantedCard[] = collection.wantedCards ?? (initialCollection ? cards.slice(0, 3).map(card => ({ cardId: card.cardId, name: card.name, imageUrl: card.imageUrl, isOfficial: card.isOfficial, artistId: card.artistId, artistName: card.artistName, memberId: card.memberId, memberName: card.memberName, rarity: card.rarity, seasonName: card.seasonName })) : [])
  const displayName = collection.nickname ?? userId
  const representativeCard = cards.find(card => card.artistId || card.artistName || card.seasonName) ?? cards[0]
  const primaryArtistId = representativeCard?.artistId ?? ''
  const primaryArtistName = representativeCard?.artistName ?? '아티스트'
  const primaryPackLabel = representativeCard?.seasonName ?? representativeCard?.name ?? '컬렉션'
  const representativeImage = resolveApiUrl(representativeCard?.imageUrl) || avatarFallback
  const favoriteArtists = collection.favoriteArtists ?? []
  const primaryPackCount = representativeCard
    ? cards.filter(card => representativeCard.seasonName ? card.seasonName === representativeCard.seasonName : card.name === representativeCard.name).length
    : 0
  const collectionCount = Math.max(1, collection.summary.ownedCount)
  const level = Math.max(1, Math.ceil(collection.summary.ownedCount / 4))
  const imageAt = (index: number) => resolveApiUrl(cards[index % Math.max(1, cards.length)]?.imageUrl) || avatarFallback
  return <main className="app-shell fan-profile-shell fan-profile-reference">
    <DetailTopBar title="팬 프로필" onBack={onBack} backLabel="팬 찾기로 돌아가기" />
    <section className="fan-profile-content">
      {favoriteArtists.length > 0 && <section className="fan-profile-panel fan-profile-favorites"><h3>관심 아티스트</h3><div className="fan-profile-favorite-list">{favoriteArtists.map(artist => <button type="button" key={artist.id} onClick={() => onOpenArtist(artist.id)}><img src={resolveApiUrl(artist.imageUrl)} alt="" /><span>{artist.name}</span><InlineIcon name="chevron" /></button>)}</div></section>}
      <section className="fan-profile-hero"><div className="fan-profile-identity"><img src={resolveApiUrl(collection.profileImageUrl) || avatarFallback} alt={`${displayName} 프로필`} /><div><h2>{displayName}</h2><p>{primaryArtistName}의 모든 순간을 모으고 있어요.</p><span><InlineIcon name="sparkles" /> Lv.{level}</span><small>팔로잉 {collection.summary.followingCount} <i /> 팔로워 {collection.summary.followerCount}</small></div></div><div className="fan-profile-actions"><button type="button" className={`follow-state-button${following ? ' following' : ''}`} aria-pressed={following} aria-busy={followPending} disabled={followPending} onClick={() => void toggleFollow()}>{followPending ? '처리 중…' : <>{following && <InlineIcon name="check" />}{following ? '팔로잉' : '팔로우'}</>}</button><button type="button" disabled={tradableCards.length === 0} onClick={() => onTrade()}>거래 제안</button></div><div className="fan-profile-artist"><span>팔로우 중인 아티스트</span><button type="button" disabled={!primaryArtistId} onClick={() => onOpenArtist(primaryArtistId)}><img src={representativeImage} alt="" /><b>{primaryArtistName} <VerifiedIcon /></b><em><InlineIcon name="chevron" /></em></button></div><button type="button" className="fan-profile-safety-trigger" aria-expanded={safetyOpen} onClick={() => setSafetyOpen(open => !open)}>⋯ 안전 및 신고</button>{safetyOpen && <div className="fan-profile-safety-panel"><button type="button" className="fan-profile-block-button" disabled={safetyPending} onClick={() => void submitBlock()}>이 팬 차단</button><form onSubmit={submitReport}><label>신고 사유<select value={reportReason} onChange={event => setReportReason(event.target.value)}><option>불쾌하거나 부적절한 내용</option><option>사칭 또는 도용</option><option>거래 관련 문제</option><option>스팸 또는 광고</option></select></label><label>상황 설명<textarea value={reportBody} onChange={event => setReportBody(event.target.value)} placeholder="상황을 설명해 주세요." minLength={2} maxLength={4000} required /></label><button type="submit" disabled={safetyPending || reportBody.trim().length < 2}>신고 접수</button></form>{safetyMessage && <p role="status">{safetyMessage}</p>}</div>}</section>
      <section className="fan-profile-panel"><div className="section-heading"><h3>대표 컬렉션</h3><button type="button" onClick={onOpenCollection}>전체 보기 <InlineIcon name="chevron" /></button></div><div className="fan-profile-featured-cards">{[0,1,2,3].map(index => <button type="button" key={index} onClick={onOpenCollection}><img src={imageAt(index)} alt="대표 카드" /><span>{cards[index % Math.max(1, cards.length)]?.rarity ?? 'N'}</span><em><InlineIcon name="star" /> 1</em></button>)}</div></section>
      <section className="fan-profile-panel"><h3>컬렉션 진행률</h3><div className="fan-profile-progress-row"><img src={representativeImage} alt="" /><span><b>{primaryPackLabel}</b><i><em style={{ width: `${Math.min(100, Math.round((primaryPackCount / collectionCount) * 100))}%` }} /></i></span><strong>{primaryPackCount}/{collection.summary.ownedCount}</strong><button type="button" onClick={onOpenCollection}><InlineIcon name="chevron" /></button></div><div className="fan-profile-progress-row"><img src={resolveApiUrl(collection.profileImageUrl) || representativeImage} alt="" /><span><b>공개 카드</b><i><em style={{ width: `${Math.min(100, Math.round((tradableCards.length / collectionCount) * 100))}%` }} /></i></span><strong>{tradableCards.length}/{collection.summary.ownedCount}</strong><button type="button" onClick={onOpenCollection}><InlineIcon name="chevron" /></button></div></section>
      <section className="fan-profile-panel fan-profile-wanted-panel"><div className="section-heading"><div><h3>이 팬이 원하는 카드</h3><p>보유 중인 카드라면 거래 제안에 등록할 수 있어요</p></div><strong>{wantedCards.length}장</strong></div>{wantedCards.length > 0 ? <div className="fan-profile-wanted-cards">{wantedCards.slice(0, 3).map(card => <button type="button" key={card.cardId} onClick={onOpenCollection}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><span><b>{card.rarity ?? 'N'}</b><small>{card.memberName ?? card.name}</small></span><em><InlineIcon name="heart" /></em><label>원하는 카드</label></button>)}</div> : <p className="fan-profile-empty-wanted">아직 원하는 카드를 등록하지 않았어요.</p>}</section>
      <section className="fan-profile-panel"><div className="section-heading"><h3>교환 가능한 카드</h3><button type="button" onClick={onOpenCollection}>전체 보기 <InlineIcon name="chevron" /></button></div><div className="fan-profile-tradable-cards">{tradableCards.slice(0, 3).map(card => <button type="button" key={card.userCardId} onClick={() => onTrade(card.userCardId)}><img src={resolveApiUrl(card.imageUrl)} alt={card.name} /><b>{card.rarity ?? 'N'}</b><em><InlineIcon name="star" /> 1</em></button>)}<button type="button" className="more" onClick={onOpenCollection}><InlineIcon name="grid" /><small>더 많은 카드를<br />확인해보세요</small></button></div></section>
      <button type="button" className="fan-profile-trade-ready" onClick={() => onTrade()} disabled={tradableCards.length === 0}><span><InlineIcon name="rotate" /></span><div><h3>거래 제안 준비</h3><p>상대방이 원하는 카드를 가지고 있다면 거래 제안에서 먼저 표시됩니다.</p></div><InlineIcon name="chevron" /></button>
    </section>
  </main>
}
