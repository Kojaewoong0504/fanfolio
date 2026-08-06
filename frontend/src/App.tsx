import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { apiFetch, notificationStreamUrl, type CatalogArtist, type CatalogCard, type CatalogMember, type CatalogSort, type CollectionBenefit, type CollectionCard, type CollectionSummary, type CurrentUser, type NotificationItem, type UserCardDetail } from './api/client'
import { QrRedeemModal } from './components/QrRedeemModal'

type Tab = 'collection' | 'discover' | 'alerts' | 'settings'

type Card = {
  id: string
  userCardId?: string
  title: string
  artist: string
  member: string
  image: string
}

// Magic-link tokens are one-time credentials. React StrictMode can mount a
// component more than once in development, so a component ref is not enough
// to protect the request. Keep the guard at module scope so remounted Login
// instances share the same in-flight request and successful token state.
const autoVerifyInFlight = new Map<string, Promise<boolean>>()
const autoVerifiedTokens = new Set<string>()

function toCollectionCard(card: CollectionCard): Card {
  return {
    id: `#${String(card.serialNumber).padStart(3, '0')}`,
    userCardId: card.userCardId,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: card.imageUrl,
  }
}

function toCatalogCard(card: CatalogCard): Card {
  return {
    id: card.id,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: card.imageUrl,
  }
}

function App() {
  const [tab, setTab] = useState<Tab>('collection')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [showRedeem, setShowRedeem] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [collectionCards, setCollectionCards] = useState<Card[]>([])
  const [collectionSummary, setCollectionSummary] = useState<CollectionSummary>({ ownedCount: 0, totalSlots: 80, completionRate: 0 })
  const [collectionBenefits, setCollectionBenefits] = useState<CollectionBenefit[]>([])
  const [apiConnected, setApiConnected] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null)

  const refreshCollection = async () => {
    try {
      const [collection, benefits] = await Promise.all([
        apiFetch<{ ok: true, data: { summary: CollectionSummary, cards: CollectionCard[] } }>('/me/collection'),
        apiFetch<{ ok: true, data: { items: CollectionBenefit[] } }>('/me/collection/benefits'),
      ])
      setCollectionCards(collection.data.cards.map(toCollectionCard))
      setCollectionSummary(collection.data.summary)
      setCollectionBenefits(benefits.data.items)
      setApiConnected(true)
    } catch { setApiConnected(false) }
  }

  const refreshUser = async () => {
    const result = await apiFetch<{ ok: true, data: CurrentUser }>('/me')
    setCurrentUser(result.data)
    setShowOnboarding(!result.data.onboardingCompleted)
    return result.data
  }

  useEffect(() => {
    void refreshUser()
      .then(() => { setSignedIn(true); void refreshCollection() })
      .catch(() => {
        // The login screen may complete a magic-link request while this
        // initial session probe is still in flight. The app starts signed
        // out, so a late 401 must not overwrite that successful login.
      })
  }, [])

  useEffect(() => {
    if (!signedIn) return
    void refreshUser()
      .catch(() => setShowOnboarding(false))
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    let cancelled = false
    const refreshNotifications = async () => {
      try {
        const [list, count] = await Promise.all([
          apiFetch<{ ok: true, data: { items: NotificationItem[] } }>('/notifications'),
          apiFetch<{ ok: true, data: { unreadCount: number } }>('/notifications/unread-count'),
        ])
        if (!cancelled) {
          setNotifications(list.data.items)
          setUnreadCount(count.data.unreadCount)
        }
      } catch {
        if (!cancelled) setNotifications([])
      }
    }
    void refreshNotifications()
    const interval = window.setInterval(() => void refreshNotifications(), 30_000)
    const stream = new EventSource(notificationStreamUrl(), { withCredentials: true })
    stream.addEventListener('notification', (event: MessageEvent<string>) => {
      const item = JSON.parse(event.data) as NotificationItem
      setNotifications(items => {
        if (items.some(existing => existing.id === item.id)) return items
        setUnreadCount(count => count + 1)
        return [item, ...items]
      })
    })
    stream.onerror = () => stream.close()
    return () => { cancelled = true; window.clearInterval(interval); stream.close() }
  }, [signedIn])

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }) } finally { setSignedIn(false) }
  }

  const markNotificationRead = async (id: string) => {
    try {
      const result = await apiFetch<{ ok: true, data: NotificationItem }>(`/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      })
      setNotifications(items => items.map(item => item.id === id ? result.data : item))
      setUnreadCount(count => Math.max(0, count - 1))
    } catch {
      // Keep the notification visible if the API is unavailable during UI review.
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      setNotifications(items => items.map(item => ({ ...item, isRead: true, readAt: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Keep the current state when the API is temporarily unavailable.
    }
  }

  const claimBenefit = async (campaignId: string) => {
    await apiFetch(`/me/collection/benefits/${encodeURIComponent(campaignId)}/claim`, { method: 'POST' })
    await refreshCollection()
  }

  if (!signedIn) {
    return <Login onLogin={() => { setSignedIn(true); void refreshCollection() }} />
  }

  if (showOnboarding) {
    return <Onboarding onComplete={() => { setShowOnboarding(false); void refreshUser(); void refreshCollection() }} />
  }

  if (revealedCardId) {
    return <RevealCard userCardId={revealedCardId} onClose={() => setRevealedCardId(null)} />
  }

  return (
    <main className="app-shell">
      <div className="phone-bar"><span>9:41</span><span>● ● ▰</span></div>
      <header className="app-header">
        <div><span className="eyebrow">FANFOLIO</span><h1>{tabTitle(tab)}</h1></div>
        <button className="icon-button" onClick={() => setShowRedeem(true)} aria-label="카드 등록">+</button>
      </header>

      <section className="screen">
        {tab === 'collection' && <Collection cards={collectionCards} summary={collectionSummary} benefits={collectionBenefits} onSelect={setSelectedCard} onRedeem={() => setShowRedeem(true)} onClaim={claimBenefit} />}
        {tab === 'discover' && <Discover onSelect={setSelectedCard} />}
        {tab === 'alerts' && <Alerts items={notifications} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} />}
        {tab === 'settings' && currentUser && <Settings user={currentUser} onUserUpdated={setCurrentUser} onLogout={logout} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavItem active={tab === 'collection'} label="컬렉션" onClick={() => setTab('collection')} />
        <NavItem active={tab === 'discover'} label="탐색" onClick={() => setTab('discover')} />
        <NavItem active={tab === 'alerts'} label="알림" badge={unreadCount} onClick={() => setTab('alerts')} />
        <NavItem active={tab === 'settings'} label="설정" onClick={() => setTab('settings')} />
      </nav>

      {showRedeem && <QrRedeemModal onClose={() => setShowRedeem(false)} onRedeemed={(id) => { setShowRedeem(false); setRevealedCardId(id); void refreshCollection() }} />}
      <span className={apiConnected ? 'connection-status connected' : 'connection-status'}>{apiConnected ? '실시간 컬렉션' : '컬렉션 연결 대기'}</span>
      <button className="floating-register" onClick={() => setShowRedeem(true)}>카드 등록</button>
      {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </main>
  )
}

function tabTitle(tab: Tab) { return { collection: '내 컬렉션', discover: '탐색', alerts: '알림', settings: '설정' }[tab] }

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const requestLink = async () => {
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/auth/magic-link/request', {
        method: 'POST',
        body: JSON.stringify({ email, purpose: 'login' }),
      })
      setRequested(true)
      setMessage(`${email}로 로그인 링크를 보냈습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인 링크 요청에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const verifyLink = useCallback(async (tokenOverride?: string): Promise<boolean> => {
    const tokenToVerify = tokenOverride ?? token
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/auth/magic-link/verify', {
        method: 'POST',
        body: JSON.stringify({ token: tokenToVerify }),
      })
      onLogin()
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인 링크 검증에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }, [onLogin, token])

  useEffect(() => {
    const linkToken = new URLSearchParams(window.location.search).get('token')
    if (!linkToken || autoVerifiedTokens.has(linkToken)) return
    setToken(linkToken)
    setRequested(true)
    // Reserve the one-time token before starting the network request. This
    // closes the small gap between a fast response and a StrictMode rerender.
    autoVerifiedTokens.add(linkToken)
    let request = autoVerifyInFlight.get(linkToken)
    if (!request) {
      request = verifyLink(linkToken).then(success => {
        if (!success) autoVerifiedTokens.delete(linkToken)
        return success
      }).finally(() => {
        autoVerifyInFlight.delete(linkToken)
      })
      autoVerifyInFlight.set(linkToken, request)
    }
    void request
  }, [verifyLink])

  return <main className="login-screen"><span className="brand-mark">F</span><p className="eyebrow">FANFOLIO</p><h1>내 손안의<br />팬 컬렉션</h1><p className="muted">좋아하는 아티스트의 순간을<br />디지털 카드로 간직하세요.</p><label className="field-label">이메일</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일을 입력하세요" type="email" disabled={requested} />{!requested ? <button className="primary" onClick={() => void requestLink()} disabled={!email.includes('@') || busy}>{busy ? '보내는 중...' : '로그인 링크 받기'}</button> : <><label className="field-label">로그인 토큰</label><input value={token} onChange={e => setToken(e.target.value)} placeholder="이메일의 로그인 토큰을 입력하세요" /><button className="primary" onClick={() => void verifyLink()} disabled={!token || busy}>{busy ? '확인 중...' : '로그인하기'}</button></>}<p className={message.includes('실패') ? 'form-message error-message' : 'form-message'}>{message}</p><p className="login-note">비밀번호 없이 이메일 링크로 안전하게 로그인합니다.</p></main>
}

function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [group, setGroup] = useState('')
  const [member, setMember] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])

  useEffect(() => {
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => {
        setArtists(result.data.items)
        setGroup(result.data.items[0]?.id ?? '')
      })
      .catch(() => setMessage('아티스트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))
  }, [])

  useEffect(() => {
    if (!group) { setMembers([]); setMember(''); return }
    void apiFetch<{ ok: true, data: { items: CatalogMember[] } }>(`/catalog/members?artistId=${encodeURIComponent(group)}`)
      .then(result => {
        setMembers(result.data.items)
        setMember(result.data.items[0]?.id ?? '')
      })
      .catch(() => setMessage('멤버 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))
  }, [group])

  const save = async () => {
    if (!group || !member) { setMessage('아티스트와 멤버를 선택해 주세요.'); return }
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/me/profile', { method: 'PATCH', body: JSON.stringify({ nickname, favoriteArtistIds: [group], favoriteMemberIds: [member] }) })
      onComplete()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '최초 설정을 저장하지 못했습니다.')
    } finally { setBusy(false) }
  }
  return <main className="onboarding-screen"><div className="onboarding-top"><span>‹</span><b>최초 설정</b><small>1 / 1</small></div><div className="progress"><span /></div><p className="eyebrow">WELCOME TO FANFOLIO</p><h1>좋아하는 아티스트를<br />선택해 주세요</h1><p className="muted">관심 있는 카드를 가장 먼저 알려드릴게요.</p><label className="field-label">좋아하는 그룹</label><div className="choice-row">{artists.map(artist => <button className={group === artist.id ? 'choice selected' : 'choice'} key={artist.id} onClick={() => setGroup(artist.id)}>{artist.name}</button>)}</div><label className="field-label">좋아하는 멤버</label><div className="member-row">{members.map(item => <button className={member === item.id ? 'member selected' : 'member'} key={item.id} onClick={() => setMember(item.id)}>{item.name}</button>)}</div><label className="field-label">닉네임</label><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="닉네임을 입력하세요" maxLength={40} /><button className="primary" onClick={() => void save()} disabled={!nickname.trim() || !group || !member || busy}>{busy ? '저장 중...' : '시작하기'}</button>{message && <p className="form-message error-message">{message}</p>}</main>
}

function Collection({ cards: collectionCards, summary, benefits, onSelect, onRedeem, onClaim }: { cards: Card[], summary: CollectionSummary, benefits: CollectionBenefit[], onSelect: (card: Card) => void, onRedeem: () => void, onClaim: (campaignId: string) => Promise<void> }) {
  const [showAll, setShowAll] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState('')
  const visibleCards = showAll ? collectionCards : collectionCards.slice(0, 4)
  const claim = async (benefit: CollectionBenefit) => {
    if (!benefit.campaignId) return
    setClaimingId(benefit.campaignId)
    setClaimMessage('')
    try {
      await onClaim(benefit.campaignId)
      setClaimMessage('특전을 수령했어요.')
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : '특전을 수령하지 못했습니다.')
    } finally { setClaimingId(null) }
  }
  return <><div className="summary"><div><span className="muted">보유 카드 수</span><strong>{summary.ownedCount} <small>/ {summary.totalSlots}</small></strong><small className="completion-rate">컬렉션 {summary.completionRate}% 완료</small></div><button onClick={onRedeem} className="outline">+ 카드 등록</button></div>{benefits.length > 0 && <section className="benefit-section"><div className="section-heading"><h2>컬렉션 완성 특전</h2></div><div className="benefit-list">{benefits.map(benefit => <article className={`benefit-card ${benefit.status}`} key={`${benefit.campaignId ?? benefit.artistId ?? 'fanfolio'}-${benefit.seasonName}`}><div><span className="detail-badge">{benefit.claimed ? '수령 완료' : benefit.status === 'unlocked' ? '해금 완료' : '진행 중'}</span><h3>{benefit.benefit.title}</h3><p>{benefit.benefit.description}</p></div><div><strong>{benefit.ownedCount}/{benefit.requiredCount}</strong>{benefit.claimable && benefit.campaignId && <button className="outline" onClick={() => void claim(benefit)} disabled={claimingId === benefit.campaignId}>{claimingId === benefit.campaignId ? '수령 중...' : '특전 받기'}</button>}</div></article>)}</div>{claimMessage && <p className="form-message">{claimMessage}</p>}</section>}<div className="section-heading"><h2>{showAll ? '내 컬렉션' : '최근 수집한 카드'}</h2>{collectionCards.length > 4 && <button onClick={() => setShowAll(value => !value)}>{showAll ? '최근 카드만 보기' : `전체 보기 (${collectionCards.length})`}</button>}</div>{visibleCards.length > 0 ? <div className="card-grid">{visibleCards.map(card => <button className="card-tile" key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="카드 이미지" /><span>{card.id}</span><b>{card.member}</b></button>)}</div> : null}<div className="empty-slot" onClick={onRedeem}><span>+</span><b>새 카드를 등록하세요</b><small>QR 또는 카드 코드를 사용합니다.</small></div></>
}

function Discover({ onSelect }: { onSelect: (card: Card) => void }) {
  const [query, setQuery] = useState('')
  const [artistId, setArtistId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [sort, setSort] = useState<CatalogSort>('recommended')
  const [showAll, setShowAll] = useState(false)
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])
  const [results, setResults] = useState<Card[]>([])

  useEffect(() => {
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => setArtists(result.data.items))
      .catch(() => setArtists([]))
  }, [])

  useEffect(() => {
    const suffix = artistId ? `?artistId=${encodeURIComponent(artistId)}` : ''
    void apiFetch<{ ok: true, data: { items: CatalogMember[] } }>(`/catalog/members${suffix}`)
      .then(result => setMembers(result.data.items))
      .catch(() => setMembers([]))
  }, [artistId])

  useEffect(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '20' })
    if (query.trim()) params.set('q', query.trim())
    if (artistId) params.set('artistId', artistId)
    if (memberId) params.set('memberId', memberId)
    params.set('sort', sort)
    let cancelled = false
    const timer = window.setTimeout(() => {
      void apiFetch<{ ok: true, data: { items: CatalogCard[] } }>(`/catalog/cards?${params}`)
        .then(result => { if (!cancelled) setResults(result.data.items.map(toCatalogCard)) })
        .catch(() => { if (!cancelled) setResults([]) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [artistId, memberId, query, sort])

  const visibleResults = showAll ? results : results.slice(0, 6)
  const showAllResults = () => {
    setShowAll(true)
    requestAnimationFrame(() => document.getElementById('discover-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const featuredTitle = sort === 'recommended' ? '추천 카드' : sort === 'rarity' ? '희귀도 높은 카드' : '이름순 카드'
  return <><input className="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="카드, 아티스트 검색" /><div className="filter-row"><select aria-label="아티스트 필터" value={artistId} onChange={event => { setArtistId(event.target.value); setMemberId(''); setShowAll(false) }}><option value="">전체 아티스트</option>{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select><select aria-label="멤버 필터" value={memberId} onChange={event => { setMemberId(event.target.value); setShowAll(false) }}><option value="">전체 멤버</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select><select aria-label="정렬" value={sort} onChange={event => { setSort(event.target.value as CatalogSort); setShowAll(false) }}><option value="recommended">추천순</option><option value="name">이름순</option><option value="rarity">희귀도순</option></select></div>{results.length > 0 ? <><div className="section-heading"><h2>{featuredTitle}</h2>{results.length > 6 && <button onClick={showAllResults}>전체 보기</button>}</div><div className="horizontal-cards">{results.slice(0, 4).map(card => <button key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="" /><b>{card.member}</b></button>)}</div><div className="section-heading" id="discover-results"><h2>탐색 결과</h2>{results.length > 6 && <button onClick={() => setShowAll(value => !value)}>{showAll ? '간단히 보기' : `전체 보기 (${results.length})`}</button>}</div><div className="discover-list">{visibleResults.map(card => <button key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="" /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span><strong>›</strong></button>)}</div></> : <div className="empty-slot"><b>카드를 찾지 못했어요</b><small>검색어나 필터를 바꿔 보세요.</small></div>}</>
}

function notificationKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    system: '공지',
    card_published: '새 카드',
    card_redeemed: '컬렉션',
    drop_started: '새 드롭',
  }
  return labels[kind] ?? '알림'
}

function Alerts({ items, onRead, onReadAll }: { items: NotificationItem[], onRead: (id: string) => Promise<void>, onReadAll: () => Promise<void> }) { return <><div className="section-heading"><h2>새로운 소식</h2>{items.length > 0 && <button onClick={() => void onReadAll()}>모두 읽음</button>}</div>{items.length > 0 ? <div className="alert-list">{items.map(item => <button className={item.isRead ? 'alert-card read' : 'alert-card'} key={item.id} onClick={() => !item.isRead && void onRead(item.id)}><span className="tag">{notificationKindLabel(item.kind)}</span><h2>{item.title}</h2><p>{item.body ?? 'Fanfolio의 새로운 소식이 도착했습니다.'}</p><small>{item.isRead ? '확인함' : '새 알림'}</small></button>)}</div> : <div className="empty-slot"><b>새로운 알림이 없습니다</b><small>새 카드와 컬렉션 소식이 도착하면 알려드릴게요.</small></div>}</> }

function Settings({ user, onUserUpdated, onLogout }: { user: CurrentUser, onUserUpdated: (user: CurrentUser) => void, onLogout: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [activePanel, setActivePanel] = useState<'profile' | 'account' | 'info' | null>(null)
  const [nickname, setNickname] = useState(user.nickname ?? '')
  const [profileBusy, setProfileBusy] = useState(false)

  useEffect(() => {
    void apiFetch<{ ok: true, data: { emailEnabled: boolean } }>('/me/notification-preferences')
      .then(result => setEmailEnabled(result.data.emailEnabled))
      .catch(() => setMessage('알림 설정을 불러오지 못했습니다.'))
  }, [])

  const logout = async () => { setBusy(true); await onLogout(); setBusy(false) }
  const updateEmailPreference = async (enabled: boolean) => {
    setPreferenceBusy(true)
    setMessage('')
    try {
      const result = await apiFetch<{ ok: true, data: { emailEnabled: boolean } }>('/me/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ emailEnabled: enabled }),
      })
      setEmailEnabled(result.data.emailEnabled)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알림 설정을 저장하지 못했습니다.')
    } finally { setPreferenceBusy(false) }
  }

  const saveProfile = async () => {
    if (!nickname.trim()) { setMessage('닉네임을 입력해 주세요.'); return }
    setProfileBusy(true)
    setMessage('')
    try {
      const result = await apiFetch<{ ok: true, data: { nickname: string, favoriteArtistIds: string[], favoriteMemberIds: string[], onboardingCompleted: boolean } }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname: nickname.trim(), favoriteArtistIds: user.favoriteArtistIds, favoriteMemberIds: user.favoriteMemberIds }),
      })
      onUserUpdated({ ...user, ...result.data })
      setActivePanel(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '프로필을 저장하지 못했습니다.')
    } finally { setProfileBusy(false) }
  }

  const roleLabel = user.role === 'fan' ? '팬' : user.role === 'artist' ? '아티스트' : '관리자'
  return <><button className="profile profile-button" onClick={() => { setNickname(user.nickname ?? ''); setActivePanel('profile') }}><div className="avatar">{(user.nickname ?? '팬').slice(0, 1)}</div><div><b>{user.nickname || '팬포리오'}</b><small>{user.email}</small></div><span>›</span></button><div className="settings-list"><button onClick={() => { setNickname(user.nickname ?? ''); setActivePanel('profile') }}><span>프로필</span><strong>›</strong></button><button onClick={() => setActivePanel('account')}><span>계정</span><strong>›</strong></button><label className="preference-row"><span><b>알림 설정</b><small>새 카드와 드롭 소식을 이메일로 받아요.</small></span><input type="checkbox" checked={emailEnabled} disabled={preferenceBusy} onChange={event => void updateEmailPreference(event.target.checked)} /></label><button onClick={() => setActivePanel('info')}><span>앱 정보</span><strong>›</strong></button></div>{message && <p className="form-message error-message">{message}</p>}<button className="logout" onClick={() => void logout()} disabled={busy}>{busy ? '로그아웃 중...' : '로그아웃'}</button>{activePanel === 'profile' && <div className="modal-backdrop"><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><button className="modal-close" onClick={() => setActivePanel(null)}>×</button><h2 id="profile-title">프로필 수정</h2><p className="muted">컬렉션에 표시될 닉네임을 설정하세요.</p><label className="field-label">닉네임</label><input value={nickname} maxLength={40} onChange={event => setNickname(event.target.value)} /><button className="primary" disabled={!nickname.trim() || profileBusy} onClick={() => void saveProfile()}>{profileBusy ? '저장 중...' : '저장하기'}</button></div></div>}{activePanel === 'account' && <div className="modal-backdrop"><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="modal-close" onClick={() => setActivePanel(null)}>×</button><h2 id="account-title">계정 정보</h2><dl className="account-details"><div><dt>이메일</dt><dd>{user.email}</dd></div><div><dt>권한</dt><dd>{roleLabel}</dd></div><div><dt>계정 ID</dt><dd>{user.id}</dd></div></dl></div></div>}{activePanel === 'info' && <div className="modal-backdrop"><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="app-info-title"><button className="modal-close" onClick={() => setActivePanel(null)}>×</button><h2 id="app-info-title">앱 정보</h2><p className="muted">Fanfolio 디지털 카드 컬렉션</p><dl className="account-details"><div><dt>버전</dt><dd>0.2.0 MVP</dd></div><div><dt>언어</dt><dd>한국어</dd></div></dl></div></div>}</>
}

function CardDetail({ card, onClose }: { card: Card, onClose: () => void }) {
  const [detail, setDetail] = useState<UserCardDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const isOwned = Boolean(card.userCardId)

  useEffect(() => {
    setDetail(null)
    setDetailError(false)
    if (!card.userCardId || card.userCardId.startsWith('user-card-')) return
    void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${card.userCardId}`)
      .then(result => setDetail(result.data))
      .catch(() => setDetailError(true))
  }, [card.userCardId])

  return <aside className="detail-panel"><button onClick={onClose}>닫기</button><img src={detail?.card.imageUrl ?? card.image} alt="카드 상세" /><h2 className="detail-title">{detail?.card.name ?? card.title}</h2><dl><div><dt>아티스트</dt><dd>{detail?.card.artistName ?? card.artist}</dd></div><div><dt>멤버</dt><dd>{detail?.card.memberName ?? card.member}</dd></div>{detail && <><div><dt>발행번호</dt><dd>#{String(detail.serialNumber).padStart(3, '0')}</dd></div><div><dt>획득일</dt><dd>{new Date(detail.acquiredAt).toLocaleDateString('ko-KR')}</dd></div><div><dt>획득 경로</dt><dd>{detail.acquisitionSource === 'qr' ? 'QR 스캔' : detail.acquisitionSource === 'manual' ? '코드 직접 입력' : '콘텐츠 코드'}</dd></div>{detail.drop && <div><dt>드롭</dt><dd>{detail.drop.name}</dd></div>}{detail.card.seasonName && <div><dt>시즌</dt><dd>{detail.card.seasonName}</dd></div>}{detail.card.rarity && <div><dt>등급</dt><dd>{detail.card.rarity}</dd></div>}{detail.card.issueLimit && <div><dt>발행 한도</dt><dd>{detail.card.issueLimit.toLocaleString()}장</dd></div>}</>}</dl>{detail?.card.signatureText && <p className="detail-hint">“{detail.card.signatureText}”</p>}{detail?.futureBenefitPreview && <div className="notice">{detail.futureBenefitPreview}</div>}{detail?.card.handwritingImageUrl && <div className="handwriting-special"><p className="detail-badge">손글씨 특전</p><img src={detail.card.handwritingImageUrl} alt="손글씨 특전" /></div>}{detail?.card.hasVoice && <><p className="detail-badge">보이스 특전 포함</p><audio controls preload="metadata" src={detail.card.voiceAudioUrl ?? undefined} aria-label="보이스 특전 재생" /></>}{detailError && <p className="detail-hint error-message">카드 상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>}{!isOwned && <p className="detail-hint">카드 패키지의 QR 또는 코드를 사용해 컬렉션에 등록할 수 있어요.</p>}</aside>
}

export function LegacyRedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: (userCardId: string) => void }) { const [code, setCode] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false); const redeem = async () => { setSaving(true); setMessage(''); try { const result = await apiFetch<{ ok: true, data: { userCardId: string } }>('/redemptions', { method: 'POST', body: JSON.stringify({ code, source: 'manual' }) }); onRedeemed(result.data.userCardId); } catch (error) { setMessage(error instanceof Error ? error.message : '카드 등록에 실패했습니다.'); } finally { setSaving(false) } }; return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>카드 등록</h2><p className="muted">카드 패키지의 QR을 스캔하거나<br />코드를 직접 입력하세요.</p><div className="qr-box"><span>QR</span><b>QR 스캔</b><small>카메라로 코드를 비춰주세요.</small></div><div className="divider">또는 코드 입력</div><input value={code} onChange={e => setCode(e.target.value)} placeholder="예: NOVA-VALID-01" /><button className="primary" disabled={!code || saving} onClick={() => void redeem()}>{saving ? '등록 중...' : '카드 등록하기'}</button>{message && <p className="form-message error-message">{message}</p>}</div></div> }

function RevealCard({ userCardId, onClose }: { userCardId: string, onClose: () => void }) {
  const [revealed, setRevealed] = useState(false)
  const [detail, setDetail] = useState<UserCardDetail | null>(null)
  useEffect(() => { void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${userCardId}`).then(result => setDetail(result.data)).catch(() => setDetail(null)) }, [userCardId])
  return <main className="reveal-screen"><button className="reveal-close" onClick={onClose}>닫기</button><p className="eyebrow">CARD UNLOCKED</p><h1>{revealed ? '새 카드가 컬렉션에 추가됐어요' : '카드가 도착했어요'}</h1><p className="muted">{revealed ? '나만의 디지털 컬렉션에서 확인해 보세요.' : '버튼을 눌러 카드를 공개하세요.'}</p><div className={revealed ? 'reveal-card revealed' : 'reveal-card'}><img src={detail?.card.imageUrl ?? '/src/assets/hero.png'} alt="등록된 공식 카드" />{revealed && <span className="official-badge">공식 카드</span>}</div>{revealed && detail && <div className="reveal-meta"><b>{detail.card.name}</b><span>{detail.card.artistName ?? 'Fanfolio 아티스트'} · {detail.card.memberName ?? '공식 카드'} · 발행번호 #{String(detail.serialNumber).padStart(3, '0')} · {detail.acquisitionSource === 'qr' ? 'QR 스캔' : detail.acquisitionSource === 'manual' ? '코드 직접 입력' : '콘텐츠 코드'}</span>{detail.card.handwritingImageUrl && <img className="reveal-handwriting" src={detail.card.handwritingImageUrl} alt="손글씨 특전" />}{detail.card.hasVoice && <audio controls preload="metadata" src={detail.card.voiceAudioUrl ?? undefined} aria-label="보이스 특전 재생" />}</div>}{!revealed ? <button className="primary" onClick={() => setRevealed(true)}>카드 공개하기</button> : <button className="primary" onClick={onClose}>컬렉션으로 이동</button>}</main>
}

function NavItem({ active, label, badge, onClick }: { active: boolean, label: string, badge?: number, onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><span className="nav-dot" />{label}{badge ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}</button> }

export default App
