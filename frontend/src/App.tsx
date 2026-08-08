import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import cardExample from './assets/card-example.svg'
import cardExampleBlue from './assets/card-example-blue.svg'
import cardExamplePink from './assets/card-example-pink.svg'
import { ApiError, apiFetch, clearAccessToken, notificationStreamUrl, oauthStartUrl, resolveApiUrl, setAccessToken, type CatalogArtist, type CatalogCard, type CatalogMember, type CatalogSort, type CollectionBenefit, type CollectionCard, type CollectionSummary, type CurrentUser, type NotificationItem, type UserCardDetail } from './api/client'
import { QrRedeemModal } from './components/QrRedeemModal'
import { CardDetail } from './components/CardDetail'
import { Settings } from './components/Settings'
import { ProfileAvatar } from './components/ProfileAvatar'
import type { Card } from './types'
import { demoCardImage, demoMemberImage, keepCardVisual } from './utils/cardVisual'

type Tab = 'home' | 'collection' | 'discover' | 'alerts' | 'settings'

const cardRoutePreviewKey = 'fanfolio.card-route-preview'

function readCardRoutePreview(pathname: string): Card | null {
  const match = pathname.match(/^\/cards\/(.+)$/)
  if (!match) return null
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(cardRoutePreviewKey) ?? 'null')
    if (!isSavedCard(value)) return null
    // Owned-card routes must always be restored from the authenticated API so
    // a previous fan's card metadata cannot survive a logout in sessionStorage.
    if (value.userCardId) return null
    return (value.userCardId ?? value.id) === decodeURIComponent(match[1]) ? value : null
  } catch {
    return null
  }
}

function isSavedCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false
  return 'id' in value && 'title' in value && 'image' in value
}

function savedCardsStorageKey(userId: string): string {
  return `fanfolio.saved-card-data:${userId}`
}

function readSavedCards(userId: string): Card[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(savedCardsStorageKey(userId)) ?? '[]')
    return Array.isArray(value) ? value.filter(isSavedCard) : []
  } catch {
    return []
  }
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
    image: demoCardImage(resolveApiUrl(card.imageUrl), card.userCardId),
  }
}

function toCatalogCard(card: CatalogCard): Card {
  return {
    id: card.id,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: demoCardImage(resolveApiUrl(card.imageUrl), card.id),
  }
}


function cardTypeLabel(cardType: string | null): string {
  if (!cardType) return '디지털 카드'
  const labels: Record<string, string> = {
    template_signature_v1: '사인 스페셜 카드',
    template_basic_v1: '기본 디지털 카드',
    special: '스페셜 카드',
    basic: '기본 디지털 카드',
  }
  return labels[cardType] ?? cardType.replaceAll('_', ' ')
}

function isErrorMessage(message: string): boolean {
  return /실패|오류|연결할 수|늦어지고|불러오지 못/.test(message)
}

function revealStorageKey(userCardId: string): string {
  return `fanfolio.revealed-card:${userCardId}`
}

type OnboardingDraft = {
  step?: number
  group?: string
  member?: string
  nickname?: string
  artistQuery?: string
}

function onboardingDraftKey(userId: string): string {
  return `fanfolio.onboarding-draft:${userId}`
}

function readOnboardingDraft(userId: string): OnboardingDraft {
  try {
    const raw = window.sessionStorage.getItem(onboardingDraftKey(userId))
    if (!raw) return {}
    const value = JSON.parse(raw) as OnboardingDraft
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname))
  const [selectedCard, setSelectedCard] = useState<Card | null>(() => readCardRoutePreview(window.location.pathname))
  const [showRedeem, setShowRedeem] = useState(() => window.location.pathname === '/redeem')
  const [signedIn, setSignedIn] = useState(false)
  const [sessionChecking, setSessionChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [collectionCards, setCollectionCards] = useState<Card[]>([])
  // The MVP contract defines a nine-card collection. Keep the loading
  // fallback aligned with the API so the first paint does not briefly show
  // an incorrect “0 / 80” state while the request is in flight.
  const [collectionSummary, setCollectionSummary] = useState<CollectionSummary>({ ownedCount: 0, totalSlots: 9, completionRate: 0 })
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionError, setCollectionError] = useState('')
  const [collectionBenefits, setCollectionBenefits] = useState<CollectionBenefit[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationError, setNotificationError] = useState('')
  const [notificationActionError, setNotificationActionError] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [revealedCardId, setRevealedCardId] = useState<string | null>(() => revealIdFromPath(window.location.pathname))
  const [savedCards, setSavedCards] = useState<Card[]>([])
  const savedCardsOwnerRef = useRef<string | null>(null)
  const savedCardIds = savedCards.map(card => card.userCardId ?? card.id)

  useEffect(() => {
    const userId = currentUser?.id
    if (!userId) {
      savedCardsOwnerRef.current = null
      setSavedCards([])
      return
    }
    savedCardsOwnerRef.current = userId
    setSavedCards(readSavedCards(userId))
  }, [currentUser?.id])

  useEffect(() => {
    // 관심 카드는 서버 컬렉션과 별개인 팬의 개인 북마크입니다. MVP에서는
    // 브라우저 저장소에 보관해 상세 화면을 새로고침해도 상태를 잃지 않게 합니다.
    const userId = currentUser?.id
    if (!userId || savedCardsOwnerRef.current !== userId) return
    try {
      window.localStorage.setItem(savedCardsStorageKey(userId), JSON.stringify(savedCards))
    } catch {
      // 저장소가 차단된 환경에서도 카드 상세와 컬렉션 자체는 계속 사용할 수 있습니다.
    }
  }, [currentUser?.id, savedCards])

  useEffect(() => {
    document.title = !signedIn
      ? sessionChecking ? 'Fanfolio · 연결 중' : 'Fanfolio · 내 손안의 팬 컬렉션'
      : showOnboarding
        ? 'Fanfolio · 최초 설정'
        : showRedeem
          ? 'Fanfolio · 카드 등록'
          : revealedCardId
            ? 'Fanfolio · 카드 공개'
        : `Fanfolio · ${tabTitle(tab)}`
  }, [revealedCardId, sessionChecking, showOnboarding, showRedeem, signedIn, tab])

  const navigateTab = (nextTab: Tab) => {
    setTab(nextTab)
    setSelectedCard(null)
    setShowRedeem(false)
    setRevealedCardId(null)
    const nextPath = pathForTab(nextTab)
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const openRedeem = () => {
    setShowRedeem(true)
    if (window.location.pathname !== '/redeem') window.history.pushState({}, '', '/redeem')
  }

  const closeRedeem = () => {
    setShowRedeem(false)
    if (window.location.pathname === '/redeem') window.history.replaceState({}, '', pathForTab(tab))
  }

  const openReveal = (userCardId: string) => {
    setRevealedCardId(userCardId)
    const nextPath = `/reveal/${encodeURIComponent(userCardId)}`
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const closeReveal = () => {
    setRevealedCardId(null)
    if (window.location.pathname.startsWith('/reveal/')) window.history.replaceState({}, '', pathForTab(tab))
  }

  const openCard = (card: Card) => {
    setSelectedCard(card)
    try {
      if (card.userCardId) window.sessionStorage.removeItem(cardRoutePreviewKey)
      else window.sessionStorage.setItem(cardRoutePreviewKey, JSON.stringify(card))
    } catch { /* optional route preview cache */ }
    const cardKey = encodeURIComponent(card.userCardId ?? card.id)
    if (window.location.pathname !== `/cards/${cardKey}`) window.history.pushState({}, '', `/cards/${cardKey}`)
  }

  const closeCard = () => {
    setSelectedCard(null)
    try { window.sessionStorage.removeItem(cardRoutePreviewKey) } catch { /* optional route preview cache */ }
    if (window.location.pathname.startsWith('/cards/')) window.history.replaceState({}, '', pathForTab(tab))
  }

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname
      setTab(tabFromPath(path))
      setShowRedeem(path === '/redeem')
      setRevealedCardId(revealIdFromPath(path))
      setSelectedCard(path.startsWith('/cards/') ? readCardRoutePreview(path) : null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const match = window.location.pathname.match(/^\/cards\/(.+)$/)
    if (!match || collectionCards.length === 0) return
    const key = decodeURIComponent(match[1])
    const card = collectionCards.find(item => (item.userCardId ?? item.id) === key)
    if (card) setSelectedCard(card)
  }, [collectionCards])

  const clearLocalSession = useCallback(() => {
    clearAccessToken()
    setSignedIn(false)
    setCurrentUser(null)
    setShowOnboarding(false)
    setSelectedCard(null)
    setShowRedeem(false)
    setRevealedCardId(null)
    setCollectionCards([])
    setCollectionSummary({ ownedCount: 0, totalSlots: 9, completionRate: 0 })
    setCollectionBenefits([])
    setCollectionError('')
    setNotifications([])
    setUnreadCount(0)
    setNotificationError('')
    setNotificationActionError('')
    if (window.location.pathname !== '/') window.history.replaceState({}, '', '/')
  }, [])

  const refreshCollection = useCallback(async () => {
    setCollectionLoading(true)
    setCollectionError('')
    try {
      const [collection, benefits] = await Promise.all([
        apiFetch<{ ok: true, data: { summary: CollectionSummary, cards: CollectionCard[] } }>('/me/collection'),
        apiFetch<{ ok: true, data: { items: CollectionBenefit[] } }>('/me/collection/benefits'),
      ])
      setCollectionCards(collection.data.cards.map(toCollectionCard))
      setCollectionSummary(collection.data.summary)
      setCollectionBenefits(benefits.data.items)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearLocalSession()
      setCollectionError('컬렉션을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.')
    } finally {
      setCollectionLoading(false)
    }
  }, [clearLocalSession])

  const refreshUser = async () => {
    const result = await apiFetch<{ ok: true, data: CurrentUser }>('/me')
    setCurrentUser(result.data)
    setShowOnboarding(!result.data.onboardingCompleted)
    return result.data
  }

  const completeLogin = async () => {
    // Do not rely on the initial anonymous /me request to decide whether a
    // newly authenticated fan needs onboarding. That request may finish after
    // magic-link verification on a slow connection and overwrite the new
    // session's state. Read the authenticated user as part of this transition.
    const user = await refreshUser()
    setSignedIn(true)
    if (user.onboardingCompleted) await refreshCollection()
  }

  useEffect(() => {
    void refreshUser()
      .then(() => { setSignedIn(true); void refreshCollection() })
      .catch(() => {
        // The login screen may complete a magic-link request while this
        // initial session probe is still in flight. The app starts signed
        // out, so a late 401 must not overwrite that successful login.
      })
      .finally(() => {
        setSessionChecking(false)
      })
  }, [refreshCollection])

  useEffect(() => {
    if (!signedIn) return
    void refreshUser()
      .catch(error => {
        if (error instanceof ApiError && error.status === 401) clearLocalSession()
        else setShowOnboarding(false)
      })
  }, [clearLocalSession, signedIn])

  useEffect(() => {
    if (!signedIn) {
      setNotifications([])
      setUnreadCount(0)
      setNotificationError('')
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
          setNotificationError('')
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clearLocalSession()
        else if (!cancelled) setNotificationError('알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      }
    }
    void refreshNotifications()
    const interval = window.setInterval(() => void refreshNotifications(), 30_000)
    const retryHandler = () => { void refreshNotifications() }
    window.addEventListener('fanfolio:refresh-notifications', retryHandler)
    let stream: EventSource | null = null
    try {
      stream = new EventSource(notificationStreamUrl(), { withCredentials: true })
      stream.addEventListener('notification', (event: MessageEvent<string>) => {
        try {
          const item = JSON.parse(event.data) as NotificationItem
          setNotifications(items => {
            if (items.some(existing => existing.id === item.id)) return items
            setUnreadCount(count => count + 1)
            return [item, ...items]
          })
        } catch {
          // A malformed push must not stop the regular polling fallback.
        }
      })
      stream.onerror = () => stream?.close()
    } catch {
      // EventSource can be unavailable or rejected by a browser policy. The
      // 30-second polling loop above remains the source of truth in that case.
    }
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('fanfolio:refresh-notifications', retryHandler); stream?.close() }
  }, [clearLocalSession, signedIn])

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }) } finally {
      if (currentUser) {
        try { window.sessionStorage.removeItem(onboardingDraftKey(currentUser.id)) } catch { /* optional draft cleanup */ }
      }
      clearLocalSession()
    }
  }

  const markNotificationRead = async (id: string) => {
    setNotificationActionError('')
    try {
      const result = await apiFetch<{ ok: true, data: Pick<NotificationItem, 'id' | 'isRead' | 'readAt'> }>(`/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      })
      // The read endpoint intentionally returns only the changed fields.
      // Merge them into the existing item so title/body/kind are not lost.
      setNotifications(items => items.map(item => item.id === id ? { ...item, ...result.data } : item))
      setUnreadCount(count => Math.max(0, count - 1))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearLocalSession()
      else setNotificationActionError('알림 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  const markAllNotificationsRead = async () => {
    setNotificationActionError('')
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      setNotifications(items => items.map(item => ({ ...item, isRead: true, readAt: new Date().toISOString() })))
      setUnreadCount(0)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearLocalSession()
      else setNotificationActionError('알림을 모두 읽음으로 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  const claimBenefit = async (campaignId: string) => {
    await apiFetch(`/me/collection/benefits/${encodeURIComponent(campaignId)}/claim`, { method: 'POST' })
    await refreshCollection()
  }

  if (sessionChecking) {
    return <SessionLoading />
  }

  if (!signedIn) {
    return <Login onLogin={completeLogin} />
  }

  if (showOnboarding) {
    return <Onboarding userId={currentUser?.id ?? 'fan'} profileImageUrl={currentUser?.profileImageUrl ?? null} onComplete={() => { setShowOnboarding(false); void refreshUser(); void refreshCollection() }} onBack={logout} />
  }

  if (revealedCardId) {
    return <RevealCard userCardId={revealedCardId} onClose={closeReveal} />
  }

  return (
    <main className={`app-shell ${tab}-shell ${tab === 'collection' && collectionCards.length === 0 ? 'empty-collection-shell' : ''} ${tab === 'home' && collectionCards.length === 0 ? 'empty-home-shell' : ''}`}>
      <header className="app-header">
        <div><span className="eyebrow">FANFOLIO</span><h1>{tabTitle(tab)}</h1></div>
        <div className="header-actions">
          <button className="header-alert-button" onClick={() => navigateTab('alerts')} aria-label="알림">
            <NavIcon name="alerts" />{unreadCount > 0 && <b className="header-alert-badge">{unreadCount > 99 ? '99+' : unreadCount}</b>}
          </button>
          <button className="header-profile-button" onClick={() => navigateTab('settings')} aria-label="프로필 및 설정">
            <ProfileAvatar imageUrl={resolveApiUrl(currentUser?.profileImageUrl)} fallback={currentUser?.nickname ?? '팬'} alt="프로필 이미지" />
          </button>
        </div>
      </header>

      <section className="screen">
        {collectionError && <div className="service-notice" role="alert"><span>{collectionError}</span><button onClick={() => void refreshCollection()} disabled={collectionLoading}>{collectionLoading ? '확인 중...' : '다시 시도'}</button></div>}
        {tab === 'home' && <Home cards={collectionCards} savedCards={savedCards} summary={collectionSummary} loading={collectionLoading} onSelect={openCard} onDiscover={() => navigateTab('discover')} onRedeem={openRedeem} />}
        {tab === 'collection' && <Collection cards={collectionCards} summary={collectionSummary} benefits={collectionBenefits} loading={collectionLoading} onSelect={openCard} onRedeem={openRedeem} onDiscover={() => navigateTab('discover')} onClaim={claimBenefit} />}
        {tab === 'discover' && <Discover onSelect={openCard} />}
        {tab === 'alerts' && <Alerts items={notifications} error={notificationError} actionError={notificationActionError} onDismissActionError={() => setNotificationActionError('')} onRetry={() => window.dispatchEvent(new Event('fanfolio:refresh-notifications'))} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} onNavigate={navigateTab} />}
        {tab === 'settings' && currentUser && <Settings user={currentUser} onUserUpdated={setCurrentUser} onLogout={logout} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavItem active={tab === 'home'} label="홈" icon="home" onClick={() => navigateTab('home')} />
        <NavItem active={tab === 'discover'} label="탐색" onClick={() => navigateTab('discover')} />
        <NavItem active={tab === 'collection'} label="컬렉션" icon="collection" onClick={() => navigateTab('collection')} />
        <NavItem active={tab === 'alerts'} label="알림" onClick={() => navigateTab('alerts')} />
        <NavItem active={tab === 'settings'} label="설정" onClick={() => navigateTab('settings')} />
      </nav>

      {showRedeem && <QrRedeemModal onClose={closeRedeem} onRedeemed={(id) => { closeRedeem(); openReveal(id); void refreshCollection() }} />}
      <button className="floating-register" aria-label="카드 등록" onClick={openRedeem}><span className="floating-register-icon" aria-hidden="true"><InlineIcon name="plus" /></span><span>카드 등록</span></button>
      {selectedCard && <CardDetail card={selectedCard} isSaved={savedCardIds.includes(selectedCard.userCardId ?? selectedCard.id)} onClose={closeCard} onToggleSaved={() => { const id = selectedCard.userCardId ?? selectedCard.id; setSavedCards(cards => cards.some(item => (item.userCardId ?? item.id) === id) ? cards.filter(item => (item.userCardId ?? item.id) !== id) : [...cards, selectedCard]) }} onRedeem={() => { closeCard(); openRedeem() }} imageFor={demoCardImage} onImageError={keepCardVisual} cardTypeLabel={cardTypeLabel} />}
    </main>
  )
}

function tabFromPath(pathname: string): Tab {
  if (pathname === '/home') return 'home'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/notifications') return 'alerts'
  if (pathname === '/settings') return 'settings'
  return 'collection'
}

function SessionLoading() {
  return <main className="session-loading" role="status" aria-live="polite"><span className="session-loading-mark">F</span><span className="loading-orbit" aria-hidden="true" /><b>Fanfolio를 준비하고 있어요</b><small>컬렉션을 안전하게 확인하는 중입니다.</small></main>
}

function pathForTab(tab: Tab): string {
  return { home: '/home', collection: '/collection', discover: '/discover', alerts: '/notifications', settings: '/settings' }[tab]
}

function revealIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/reveal\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function tabTitle(tab: Tab) { return { home: '오늘의 순간', collection: '내 컬렉션', discover: '탐색', alerts: '알림', settings: '설정' }[tab] }

function Login({ onLogin }: { onLogin: () => void | Promise<void> }) {
  const [purpose, setPurpose] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (window.location.pathname !== '/oauth/callback') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    if (!code) {
      if (error) setMessage('소셜 로그인에 실패했습니다. 다시 시도해 주세요.')
      return
    }
    let cancelled = false
    setBusy(true)
    void apiFetch<{ ok: true, data: { accessToken: string } }>('/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, client: 'fan' }),
    }).then(async result => {
      if (cancelled) return
      setAccessToken(result.data.accessToken)
      window.history.replaceState({}, '', '/')
      await onLogin()
    }).catch(errorValue => {
      if (!cancelled) setMessage(errorValue instanceof Error ? errorValue.message : '소셜 로그인에 실패했습니다.')
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [onLogin])

  const requestLink = async () => {
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/auth/magic-link/request', {
        method: 'POST',
        body: JSON.stringify({ email, purpose }),
      })
      setRequested(true)
      setMessage(`${email}로 ${purpose === 'signup' ? '가입' : '로그인'} 링크를 보냈습니다.`)
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
      const result = await apiFetch<{ ok: true, data: { accessToken: string } }>('/auth/magic-link/verify', {
        method: 'POST',
        body: JSON.stringify({ token: tokenToVerify }),
      })
      setAccessToken(result.data.accessToken)
      await onLogin()
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

  const messageIsError = isErrorMessage(message)
  return <main className="login-screen"><img className="brand-lockup" src="/fanfolio-logo-lockup.png" alt="FANFOLIO" /><h1>내 손안의<br />팬 컬렉션</h1><p className="muted">좋아하는 아티스트의 순간을<br />디지털 카드로 간직하세요.</p><div className="social-login"><button className="social-button kakao" onClick={() => { window.location.href = oauthStartUrl('kakao') }} disabled={busy}><span aria-hidden="true">K</span>카카오로 계속하기</button><button className="social-button google" onClick={() => { window.location.href = oauthStartUrl('google') }} disabled={busy}><span aria-hidden="true">G</span>Google로 계속하기</button></div><div className="login-divider"><span>또는 이메일로 로그인</span></div>{!requested && <div className="auth-mode" role="tablist" aria-label="인증 방식"><button className={purpose === 'login' ? 'active' : ''} role="tab" aria-selected={purpose === 'login'} onClick={() => setPurpose('login')}>로그인</button><button className={purpose === 'signup' ? 'active' : ''} role="tab" aria-selected={purpose === 'signup'} onClick={() => setPurpose('signup')}>회원가입</button></div>}<label className="field-label" htmlFor="login-email">이메일</label><input id="login-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일을 입력하세요" type="email" disabled={requested} />{!requested ? <button className="primary" onClick={() => void requestLink()} disabled={!email.includes('@') || busy}>{busy ? '보내는 중...' : purpose === 'signup' ? '이메일로 가입하기' : '이메일로 계속하기'}</button> : <><label className="field-label" htmlFor="login-token">인증 토큰</label><input id="login-token" value={token} onChange={e => setToken(e.target.value)} placeholder="이메일의 인증 토큰을 입력하세요" /><button className="primary" onClick={() => void verifyLink()} disabled={!token || busy}>{busy ? '확인 중...' : purpose === 'signup' ? '회원가입하기' : '로그인하기'}</button></>}<p role={messageIsError ? 'alert' : 'status'} className={messageIsError ? 'form-message error-message' : 'form-message'}>{message}</p><p className="login-note">소셜 로그인은 빠르게 시작할 수 있고, 이메일 로그인도 계속 사용할 수 있어요.</p></main>
}

function Onboarding({ userId, profileImageUrl, onComplete, onBack }: { userId: string, profileImageUrl: string | null, onComplete: () => void, onBack: () => Promise<void> }) {
  const initialDraft = readOnboardingDraft(userId)
  const [draftRestored] = useState(Boolean(initialDraft.step && (initialDraft.step > 1 || initialDraft.group || initialDraft.member || initialDraft.nickname || initialDraft.artistQuery)))
  const [step, setStep] = useState(initialDraft.step && initialDraft.step >= 1 && initialDraft.step <= 3 ? initialDraft.step : 1)
  const [group, setGroup] = useState(initialDraft.group ?? '')
  const [member, setMember] = useState(initialDraft.member ?? '')
  const [nickname, setNickname] = useState(initialDraft.nickname ?? '')
  const [busy, setBusy] = useState(false)
  const [backBusy, setBackBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])
  const [artistQuery, setArtistQuery] = useState(initialDraft.artistQuery ?? '')
  const [artistLoading, setArtistLoading] = useState(true)
  const [artistError, setArtistError] = useState(false)
  const [artistAttempt, setArtistAttempt] = useState(0)
  const [memberLoading, setMemberLoading] = useState(false)
  const [memberError, setMemberError] = useState(false)
  const [memberAttempt, setMemberAttempt] = useState(0)

  useEffect(() => {
    // Each step is a new screen on mobile. Reset the document scroll so a
    // user who advanced from the bottom of step 1 can immediately see the
    // new step title and its back action.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(onboardingDraftKey(userId), JSON.stringify({ step, group, member, nickname, artistQuery }))
    } catch {
      // Session storage is optional; onboarding remains usable when storage
      // is blocked by a browser privacy policy.
    }
  }, [artistQuery, group, member, nickname, step, userId])

  useEffect(() => {
    setArtistLoading(true)
    setArtistError(false)
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => {
        setArtists(result.data.items)
        setGroup(current => result.data.items.some(item => item.id === current) ? current : (result.data.items[0]?.id ?? ''))
        setMessage('')
      })
      .catch(() => {
        setArtistError(true)
        setMessage('아티스트 목록을 불러오지 못했습니다.')
      })
      .finally(() => setArtistLoading(false))
  }, [artistAttempt])

  useEffect(() => {
    if (!group) { setMembers([]); setMember(''); return }
    let cancelled = false
    setMemberLoading(true)
    setMemberError(false)
    void apiFetch<{ ok: true, data: { items: CatalogMember[] } }>(`/catalog/members?artistId=${encodeURIComponent(group)}`)
      .then(result => {
        if (cancelled) return
        setMembers(result.data.items)
        setMember(current => result.data.items.some(item => item.id === current) ? current : (result.data.items[0]?.id ?? ''))
        setMessage('')
      })
      .catch(() => {
        if (cancelled) return
        setMemberError(true)
        setMessage('멤버 목록을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setMemberLoading(false) })
    return () => { cancelled = true }
  }, [group, memberAttempt])

  const save = async () => {
    if (!group || !member) { setMessage('아티스트와 멤버를 선택해 주세요.'); return }
    if (!nickname.trim()) { setMessage('닉네임을 입력해 주세요.'); return }
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/me/profile', { method: 'PATCH', body: JSON.stringify({ nickname: nickname.trim(), favoriteArtistIds: [group], favoriteMemberIds: [member] }) })
      try { window.sessionStorage.removeItem(onboardingDraftKey(userId)) } catch { /* optional draft cleanup */ }
      onComplete()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '최초 설정을 저장하지 못했습니다.')
    } finally { setBusy(false) }
  }
  const goBack = async () => {
    if (backBusy || busy) return
    if (step > 1) { setMessage(''); setStep(current => current - 1); return }
    setBackBusy(true)
    try {
      try { window.sessionStorage.removeItem(onboardingDraftKey(userId)) } catch { /* optional draft cleanup */ }
      await onBack()
    } finally { setBackBusy(false) }
  }
  const next = () => {
    setMessage('')
    if (step === 1 && (!group || artistLoading)) { setMessage('좋아하는 아티스트를 선택해 주세요.'); return }
    if (step === 2 && (!member || memberLoading)) { setMessage('좋아하는 멤버를 선택해 주세요.'); return }
    setStep(current => Math.min(3, current + 1))
  }
  const filteredArtists = artists.filter(artist => artist.name.toLowerCase().includes(artistQuery.trim().toLowerCase()))
  const selectedArtist = artists.find(artist => artist.id === group)
  return <main className="onboarding-screen">
    <div className="onboarding-top"><button type="button" className="back-button" onClick={() => void goBack()} disabled={backBusy || busy} aria-label={step > 1 ? '이전 단계로 돌아가기' : '로그인으로 돌아가기'}>{backBusy ? '…' : <InlineIcon name="back" />}</button><b>최초 설정</b><small>{step} / 3</small></div>
    <div className="progress" role="progressbar" aria-label="최초 설정 진행률" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}><span style={{ width: `${step / 3 * 100}%` }} /></div>
    {draftRestored && <p className="onboarding-draft-notice" role="status">이전에 진행하던 설정을 복원했어요.</p>}
    {step === 1 && <><p className="eyebrow">팬포리오에 오신 것을 환영해요</p><h1>좋아하는 아티스트를<br />선택해 주세요</h1><p className="muted">관심 있는 카드를 가장 먼저 알려드릴게요.</p><label className="field-label" htmlFor="artist-search">좋아하는 그룹</label><div className="artist-search-wrap"><InlineIcon name="search" /><input id="artist-search" value={artistQuery} onChange={e => setArtistQuery(e.target.value)} placeholder="아티스트 검색" disabled={artistLoading} /></div>{artistLoading && <div className="catalog-loading" role="status">아티스트를 불러오는 중이에요…</div>}{!artistLoading && <div className="artist-grid">{filteredArtists.map(artist => <button type="button" className={group === artist.id ? 'artist-choice selected' : 'artist-choice'} key={artist.id} onClick={() => setGroup(artist.id)}><img src={demoCardImage(resolveApiUrl(artist.imageUrl), artist.id)} alt="" onError={event => keepCardVisual(event, artist.id)} /><span>{artist.name}</span>{group === artist.id && <b aria-hidden="true">✓</b>}</button>)}</div>}{selectedArtist && !artistLoading && <div className="onboarding-preview" aria-live="polite"><img src={demoCardImage(resolveApiUrl(selectedArtist.imageUrl), selectedArtist.id)} alt="" onError={event => keepCardVisual(event, selectedArtist.id)} /><div><span>맞춤 추천</span><b>{selectedArtist.name} 카드 소식을 먼저 알려드려요</b><small>새 카드와 드롭이 공개되면 알림으로 알려드릴게요.</small></div><strong aria-hidden="true">✦</strong></div>}{artistError && <div className="inline-retry" role="alert"><span>아티스트 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setArtistAttempt(value => value + 1)}>다시 시도</button></div>}{!artistLoading && filteredArtists.length === 0 && !artistError && <p className="muted empty-search">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>}<button type="button" className="primary" onClick={next} disabled={artistLoading || !group}>다음: 멤버 선택</button></>}
    {step === 2 && <><p className="eyebrow">좋아하는 멤버</p><h1>{selectedArtist?.name ?? '아티스트'}의<br />멤버를 선택해 주세요</h1><p className="muted">가장 좋아하는 멤버를 선택하면 맞춤 카드 소식을 알려드릴게요.</p><div className="selection-caption">멤버 목록</div>{memberLoading && <div className="catalog-loading" role="status">멤버를 불러오는 중이에요…</div>}{!memberLoading && <div className="member-grid">{members.map(item => <button type="button" className={member === item.id ? 'member-card selected' : 'member-card'} key={item.id} onClick={() => setMember(item.id)}><img src={demoMemberImage(item.id)} alt="" onError={event => keepCardVisual(event, `member:${item.id}`)} /><span>{item.name}</span>{member === item.id && <b aria-hidden="true">✓</b>}</button>)}</div>}{memberError && <div className="inline-retry" role="alert"><span>멤버 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setMemberAttempt(value => value + 1)}>다시 시도</button></div>}<button type="button" className="primary" onClick={next} disabled={memberLoading || !member}>다음: 닉네임 설정</button></>}
    {step === 3 && <><p className="eyebrow">나만의 컬렉션</p><h1>팬포리오에서 사용할<br />닉네임을 정해 주세요</h1><p className="muted">{selectedArtist?.name ?? '좋아하는 아티스트'} · {members.find(item => item.id === member)?.name ?? '선택한 멤버'}의 카드를 모아볼게요.</p><div className="nickname-preview" aria-live="polite"><ProfileAvatar imageUrl={resolveApiUrl(profileImageUrl)} fallback={nickname || '팬'} alt="내 프로필 이미지" /><div><span>컬렉션 프로필</span><b>{nickname.trim() || '나의 팬 닉네임'}</b><small>{selectedArtist?.name ?? '좋아하는 아티스트'} · {members.find(item => item.id === member)?.name ?? '선택한 멤버'}</small></div></div><div className="nickname-field-card"><div className="nickname-field-heading"><div><label className="field-label" htmlFor="onboarding-nickname">닉네임</label><p>컬렉션에서 사용할 이름을 정해 주세요.</p></div><span className="nickname-field-icon" aria-hidden="true">✦</span></div><div className="nickname-input-wrap"><input id="onboarding-nickname" className="nickname-input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="예: 유나의 작은 우주" maxLength={40} aria-describedby="nickname-help" /><small>{nickname.length}/40</small></div><p id="nickname-help" className="field-help">나중에 설정에서 언제든 바꿀 수 있어요.</p></div><button type="button" className="primary" onClick={() => void save()} disabled={!nickname.trim() || busy || backBusy}>{busy ? '저장 중...' : '나만의 컬렉션 시작하기'}</button></>}
    {message && !artistError && !memberError && <p className="form-message error-message" role="alert">{message}</p>}
  </main>
}

type HomeProps = { cards: Card[], savedCards: Card[], summary: CollectionSummary, loading: boolean, onSelect: (card: Card) => void, onDiscover: () => void, onRedeem: () => void }

function Home(props: HomeProps) {
  const [recommendations, setRecommendations] = useState<Card[]>([])

  useEffect(() => {
    if (props.cards.length > 0) {
      setRecommendations([])
      return
    }
    let cancelled = false
    void apiFetch<{ ok: true, data: { items: CatalogCard[] } }>('/catalog/cards?sort=recommended')
      .then(result => { if (!cancelled) setRecommendations(result.data.items.slice(0, 4).map(toCatalogCard)) })
      .catch(() => { if (!cancelled) setRecommendations([]) })
    return () => { cancelled = true }
  }, [props.cards.length])

  return <><HomeContent {...props} />{props.cards.length === 0 && recommendations.length > 0 && <HomeRecommendations cards={recommendations} onSelect={props.onSelect} onDiscover={props.onDiscover} />}</>
}

function HomeRecommendations({ cards, onSelect, onDiscover }: { cards: Card[], onSelect: (card: Card) => void, onDiscover: () => void }) {
  return <section className="home-recommendations" aria-labelledby="home-recommendations-title"><div className="section-heading"><h2 id="home-recommendations-title">지금 탐색해 볼 카드</h2><button type="button" onClick={onDiscover}>전체 보기</button></div><div className="home-recommendation-row">{cards.map(card => <button type="button" className="home-recommendation-card" key={card.id} onClick={() => onSelect(card)} aria-label={`${card.title} 카드 · ${card.artist} · ${card.member}`}><img src={card.image} alt={`${card.title} 카드`} onError={event => keepCardVisual(event, card.id)} /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span></button>)}</div></section>
}

function HomeContent({ cards, savedCards, summary, loading, onSelect, onDiscover, onRedeem }: HomeProps) {
  const featured = cards[0]
  return <div className="home-screen"><section className="home-hero"><div><span className="eyebrow">오늘의 팬 모먼트</span><h2>오늘의 순간을<br /><em>카드로 간직해요.</em></h2><p>새로운 카드와 아티스트 소식을<br />가장 먼저 만나보세요.</p><button className="hero-button" onClick={onDiscover}>카드 둘러보기 <span aria-hidden="true">→</span></button></div><div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div></section><div className="home-stats"><div><strong>{summary.ownedCount}</strong><span>보유 카드</span></div><div><strong>{summary.completionRate}%</strong><span>컬렉션 완성</span></div><div><strong>{summary.totalSlots}</strong><span>전체 카드</span></div></div><div className="section-heading"><h2>최근 카드</h2><div className="home-heading-actions"><button type="button" className="home-register" onClick={onRedeem}><InlineIcon name="plus" />카드 등록</button><button onClick={onDiscover}>전체 보기</button></div></div>{loading && !featured ? <div className="home-loading" role="status" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><b>컬렉션을 준비하고 있어요</b></div> : featured ? <button className="featured-card" onClick={() => onSelect(featured)}><img src={featured.image} alt={`${featured.title} 카드`} onError={event => keepCardVisual(event, featured.id)} /><span><small>{featured.artist}</small><b>{featured.title}</b><em>{featured.member} · {featured.id}</em></span><strong aria-hidden="true">↗</strong></button> : <div className="home-empty"><b>첫 카드를 만나보세요</b><span>QR 또는 카드 코드로 등록하거나, 새로운 카드를 먼저 둘러보세요.</span><div className="home-empty-actions"><button type="button" className="primary" onClick={onRedeem}>카드 등록하기</button><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div></div>}{savedCards.length > 0 && <section className="saved-section"><div className="section-heading"><h2>관심 카드</h2><span className="section-count">{savedCards.length}장</span></div><div className="saved-card-row">{savedCards.slice(0, 4).map(card => <button className="saved-card" key={card.userCardId ?? card.id} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드`} onError={event => keepCardVisual(event, card.id)} /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span></button>)}</div></section>}</div>
}

function Collection({ cards: collectionCards, summary, benefits, loading, onSelect, onRedeem, onDiscover, onClaim }: { cards: Card[], summary: CollectionSummary, benefits: CollectionBenefit[], loading: boolean, onSelect: (card: Card) => void, onRedeem: () => void, onDiscover: () => void, onClaim: (campaignId: string) => Promise<void> }) {
  const [showAll, setShowAll] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [artistFilter, setArtistFilter] = useState('전체')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState('')
  const artists = Array.from(new Set(collectionCards.map(card => card.artist)))
  const filteredCards = artistFilter === '전체' ? collectionCards : collectionCards.filter(card => card.artist === artistFilter)
  const visibleCards = showAll ? filteredCards : filteredCards.slice(0, 4)
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
  if (loading && collectionCards.length === 0) {
    return <div className="collection-loading" role="status" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><b>컬렉션을 불러오는 중이에요</b><small>잠시만 기다려 주세요.</small></div>
  }
  return <><div className="summary"><div><span className="muted">보유 카드 수</span><strong>{summary.ownedCount} <small>/ {summary.totalSlots}</small></strong><small className="completion-rate">컬렉션 {summary.completionRate}% 완료</small></div><div className="summary-progress" aria-label={`컬렉션 ${summary.completionRate}% 완료`}><span style={{ width: `${Math.min(100, summary.completionRate)}%` }} /></div></div>{benefits.length > 0 && <section className="benefit-section"><div className="section-heading"><h2>컬렉션 완성 특전</h2></div><div className="benefit-list">{benefits.map(benefit => <article className={`benefit-card ${benefit.status}`} key={`${benefit.campaignId ?? benefit.artistId ?? 'fanfolio'}-${benefit.seasonName}`}><div><span className="detail-badge">{benefit.claimed ? '수령 완료' : benefit.status === 'unlocked' ? '해금 완료' : '진행 중'}</span><h3>{benefit.benefit.title}</h3><p>{benefit.benefit.description}</p></div><div><strong>{benefit.ownedCount}/{benefit.requiredCount}</strong>{benefit.claimable && benefit.campaignId && <button className="outline" onClick={() => void claim(benefit)} disabled={claimingId === benefit.campaignId}>{claimingId === benefit.campaignId ? '수령 중...' : '특전 받기'}</button>}{benefit.claimed && benefit.downloadUrl && <a className="outline benefit-download" href={resolveApiUrl(benefit.downloadUrl)} download>특전 다운로드</a>}</div></article>)}</div>{claimMessage && <p className="form-message">{claimMessage}</p>}</section>}<div className="section-heading collection-heading"><h2>{showAll ? '내 컬렉션' : '최근 수집한 카드'}</h2><div className="collection-heading-actions">{filteredCards.length > 0 && <button type="button" className="collection-register" onClick={onRedeem}><InlineIcon name="plus" />카드 등록</button>}{filteredCards.length > 4 && <button onClick={() => setShowAll(value => !value)}>{showAll ? '최근 카드만 보기' : `전체 보기 (${filteredCards.length})`}</button>}<button type="button" className="view-toggle" aria-label={viewMode === 'grid' ? '목록 보기' : '그리드 보기'} aria-pressed={viewMode === 'list'} onClick={() => setViewMode(mode => mode === 'grid' ? 'list' : 'grid')}><InlineIcon name={viewMode === 'grid' ? 'list' : 'grid'} /></button></div></div>{artists.length > 0 && <div className="collection-filters" role="tablist" aria-label="컬렉션 아티스트 필터"><button role="tab" aria-selected={artistFilter === '전체'} className={artistFilter === '전체' ? 'active' : ''} onClick={() => { setArtistFilter('전체'); setShowAll(false) }}>전체</button>{artists.map(artist => <button role="tab" aria-selected={artistFilter === artist} className={artistFilter === artist ? 'active' : ''} key={artist} onClick={() => { setArtistFilter(artist); setShowAll(false) }}>{artist}</button>)}</div>}{visibleCards.length > 0 ? <div className={`card-grid collection-grid ${viewMode === 'list' ? 'list-view' : ''}`}>{visibleCards.map(card => <button className="card-tile" key={card.id} aria-label={`카드 이미지 ${card.id} ${card.member}`} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드 · ${card.member}`} onError={event => keepCardVisual(event, card.id)} /><span>{card.id}</span><b>{card.member}</b></button>)}{!showAll && artistFilter === '전체' && visibleCards.length < 9 && Array.from({ length: Math.min(9 - visibleCards.length, 5) }).map((_, index) => <div className="locked-slot" key={`locked-${index}`}><InlineIcon name="sparkle" /><small>미수집</small></div>)}</div> : <div className="empty-collection"><div className="empty-collection-copy"><InlineIcon name="plus" /><b>아직 카드가 없어요</b><small>카드를 등록하거나 탐색해서 컬렉션을 시작해 보세요.</small></div><div className="empty-collection-actions"><button type="button" className="primary" onClick={onRedeem}>카드 등록하기</button><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div></div>}</>
}

function Discover({ onSelect }: { onSelect: (card: Card) => void }) {
  const [query, setQuery] = useState('')
  const [artistId, setArtistId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [sort, setSort] = useState<CatalogSort>('recommended')
  const [showAll, setShowAll] = useState(false)
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])
  const [artistError, setArtistError] = useState(false)
  const [memberError, setMemberError] = useState(false)
  const [artistAttempt, setArtistAttempt] = useState(0)
  const [memberAttempt, setMemberAttempt] = useState(0)
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setArtistError(false)
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => { if (!cancelled) setArtists(result.data.items) })
      .catch(() => { if (!cancelled) { setArtists([]); setArtistError(true) } })
    return () => { cancelled = true }
  }, [artistAttempt])

  useEffect(() => {
    let cancelled = false
    const suffix = artistId ? `?artistId=${encodeURIComponent(artistId)}` : ''
    setMemberError(false)
    void apiFetch<{ ok: true, data: { items: CatalogMember[] } }>(`/catalog/members${suffix}`)
      .then(result => { if (!cancelled) setMembers(result.data.items) })
      .catch(() => { if (!cancelled) { setMembers([]); setMemberError(true) } })
    return () => { cancelled = true }
  }, [artistId, memberAttempt])

  useEffect(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '20' })
    if (query.trim()) params.set('q', query.trim())
    if (artistId) params.set('artistId', artistId)
    if (memberId) params.set('memberId', memberId)
    params.set('sort', sort)
    let cancelled = false
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void apiFetch<{ ok: true, data: { items: CatalogCard[] } }>(`/catalog/cards?${params}`)
        .then(result => { if (!cancelled) { setResults(result.data.items.map(toCatalogCard)); setError('') } })
        .catch(() => { if (!cancelled) { setResults([]); setError('탐색 카드를 불러오지 못했어요. 연결 상태를 확인해 주세요.') } })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [artistId, memberId, query, requestVersion, sort])

  const visibleResults = showAll ? results : results.slice(0, 6)
  const showAllResults = () => {
    setShowAll(true)
    requestAnimationFrame(() => document.getElementById('discover-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const resetFilters = () => {
    setQuery('')
    setArtistId('')
    setMemberId('')
    setSort('recommended')
    setShowAll(false)
  }

  const featuredTitle = sort === 'recommended' ? '추천 카드' : sort === 'rarity' ? '희귀도 높은 카드' : '이름순 카드'
  if (loading && results.length === 0) return <div className="discover-loading" role="status" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><b>카드를 찾고 있어요</b><small>잠시만 기다려 주세요.</small></div>
  if (error && results.length === 0) return <div className="service-notice discover-error" role="alert"><span>{error}</span><button onClick={() => setRequestVersion(value => value + 1)}>다시 시도</button></div>
  return <><div className="discover-search"><InlineIcon name="search" /><input className="search" type="search" aria-label="카드, 아티스트 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="카드, 아티스트 검색" />{query && <button type="button" className="search-clear" aria-label="검색어 지우기" onClick={() => setQuery("")}>×</button>}</div><div className="discover-section"><div className="section-heading compact-heading"><h2>그룹별 탐색</h2><button onClick={() => { setArtistId(''); setMemberId('') }}>전체 보기</button></div><div className="explore-artist-row">{artists.slice(0, 5).map(artist => <button aria-pressed={artistId === artist.id} className={artistId === artist.id ? 'explore-chip selected' : 'explore-chip'} key={artist.id} onClick={() => { setArtistId(artist.id); setMemberId(''); setShowAll(false) }}><img src={demoCardImage(resolveApiUrl(artist.imageUrl), artist.id)} alt="" onError={event => keepCardVisual(event, artist.id)} /><span>{artist.name}</span></button>)}</div>{artistError && <div className="inline-retry" role="alert"><span>아티스트 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setArtistAttempt(value => value + 1)}>다시 시도</button></div>}<div className="section-heading compact-heading"><h2>멤버별 탐색</h2></div><div className="explore-member-row">{members.slice(0, 6).map(member => <button aria-pressed={memberId === member.id} className={memberId === member.id ? 'explore-member selected' : 'explore-member'} key={member.id} onClick={() => { setMemberId(member.id); setShowAll(false) }}><img src={demoMemberImage(member.id)} alt="" onError={event => keepCardVisual(event, `member:${member.id}`)} /><span>{member.name}</span></button>)}</div>{memberError && <div className="inline-retry" role="alert"><span>멤버 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setMemberAttempt(value => value + 1)}>다시 시도</button></div>}</div><div className="filter-row"><select aria-label="아티스트 필터" value={artistId} onChange={event => { setArtistId(event.target.value); setMemberId(''); setShowAll(false) }}><option value="">전체 아티스트</option>{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select><select aria-label="멤버 필터" value={memberId} onChange={event => { setMemberId(event.target.value); setShowAll(false) }}><option value="">전체 멤버</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select><select aria-label="정렬" value={sort} onChange={event => { setSort(event.target.value as CatalogSort); setShowAll(false) }}><option value="recommended">추천순</option><option value="name">이름순</option><option value="rarity">희귀도순</option></select></div>{results.length > 0 ? <><div className="section-heading"><h2>{featuredTitle}</h2>{results.length > 6 && <button onClick={showAllResults}>전체 보기</button>}</div><div className="horizontal-cards">{results.slice(0, 4).map(card => <button className="discover-feature-card" key={card.id} aria-label={`${card.title} 카드 · ${card.artist} · ${card.member}`} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드`} onError={event => keepCardVisual(event, card.id)} /><span className="discover-feature-copy"><b>{card.title}</b><small>{card.member}</small></span></button>)}</div><div className="section-heading" id="discover-results"><h2>탐색 결과</h2>{results.length > 6 && <button onClick={() => setShowAll(value => !value)}>{showAll ? '간단히 보기' : `전체 보기 (${results.length})`}</button>}</div><div className="discover-list">{visibleResults.map(card => <button key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드`} onError={event => keepCardVisual(event, card.id)} /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span><strong>›</strong></button>)}</div></> : <div className="empty-slot discover-empty" role="status"><b>카드를 찾지 못했어요</b><small>검색어나 필터를 바꿔 보세요.</small><button type="button" className="outline" onClick={resetFilters}>필터 초기화</button></div>}</>
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

function notificationTimeLabel(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return days < 7 ? `${days}일 전` : new Date(createdAt).toLocaleDateString('ko-KR')
}

function notificationImage(kind: string, id: string): string {
  if (kind === 'card_published') return demoCardImage('hero.png', `notification:${id}`)
  if (kind === 'card_redeemed') return cardExampleBlue
  return cardExamplePink
}

function notificationDestination(kind: string): Tab | null {
  if (kind === 'card_redeemed') return 'collection'
  if (kind === 'card_published' || kind === 'drop_started') return 'discover'
  return null
}

function Alerts({ items, error, actionError, onDismissActionError, onRetry, onRead, onReadAll, onNavigate }: { items: NotificationItem[], error: string, actionError: string, onDismissActionError: () => void, onRetry: () => void, onRead: (id: string) => Promise<void>, onReadAll: () => Promise<void>, onNavigate: (tab: Tab) => void }) {
  const [category, setCategory] = useState<'all' | 'card' | 'collection' | 'system'>('all')
  const categories = [
    { value: 'all', label: '전체', matches: () => true },
    { value: 'card', label: '새 카드', matches: (item: NotificationItem) => item.kind === 'card_published' || item.kind === 'drop_started' },
    { value: 'collection', label: '컬렉션', matches: (item: NotificationItem) => item.kind === 'card_redeemed' },
    { value: 'system', label: '공지', matches: (item: NotificationItem) => item.kind === 'system' },
  ] as const
  const selectedCategory = categories.find(item => item.value === category) ?? categories[0]
  const filteredItems = items.filter(selectedCategory.matches)
  const unreadCount = items.filter(item => !item.isRead).length
  const unreadFor = (value: typeof category) => items.filter(item => !item.isRead && (value === 'all' || categories.find(categoryItem => categoryItem.value === value)?.matches(item))).length
  const categoryUnreadCount = unreadFor(category)
  if (error) return <div className="notification-error-panel" role="alert"><span className="notification-error-icon" aria-hidden="true"><NavIcon name="alerts" /></span><div><b>알림을 불러오지 못했어요</b><p>{error}</p></div><button type="button" onClick={onRetry}>다시 시도</button></div>
  const openNotification = (item: NotificationItem) => {
    if (!item.isRead) void onRead(item.id)
    const destination = notificationDestination(item.kind)
    if (destination) onNavigate(destination)
  }
  const categoryTitle = category === 'all' ? '새로운 소식' : category === 'card' ? '새 카드 알림' : category === 'collection' ? '컬렉션 알림' : '공지사항'
  return <>{actionError && <div className="inline-retry notification-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={onDismissActionError}>닫기</button></div>}<div className="alert-tabs" role="tablist" aria-label="알림 종류">{categories.map(item => <button key={item.value} role="tab" aria-selected={category === item.value} className={category === item.value ? 'active' : ''} onClick={() => setCategory(item.value)}><span>{item.label}</span>{unreadFor(item.value) > 0 && <b className="alert-tab-badge">{unreadFor(item.value)}</b>}</button>)}</div><div className="section-heading"><div><h2>{categoryTitle}</h2>{categoryUnreadCount > 0 && <small className="unread-summary">읽지 않은 알림 {categoryUnreadCount}개</small>}</div>{unreadCount > 0 && <button onClick={() => void onReadAll()}>모두 읽음</button>}</div>{filteredItems.length > 0 ? <div className="alert-list">{filteredItems.map(item => { const destination = notificationDestination(item.kind); return <button className={item.isRead ? 'alert-card read' : 'alert-card'} key={item.id} aria-label={`${item.title} 알림${destination ? ' 열기' : ''}`} onClick={() => openNotification(item)}><span className="alert-thumb"><img src={notificationImage(item.kind, item.id)} alt="" /></span><span className={`alert-leading-icon ${item.kind}`} aria-hidden="true"><InlineIcon name={item.kind === 'card_published' || item.kind === 'drop_started' ? 'sparkle' : item.kind === 'card_redeemed' ? 'card' : item.kind === 'system' ? 'system' : 'dot'} /></span><span className="tag">{notificationKindLabel(item.kind)}</span><span className={item.isRead ? 'alert-state read' : 'alert-state'}>{item.isRead ? '확인함' : '새 알림'}</span>{!item.isRead && <span className="unread-dot" aria-label="읽지 않음" />}<h2>{item.title}</h2><p>{item.body ?? 'Fanfolio의 새로운 소식이 도착하면 알려드릴게요.'}</p><small>{notificationTimeLabel(item.createdAt)}</small></button> })}</div> : <div className="empty-slot notification-empty" role="status"><NavIcon name="alerts" /><b>{category === 'all' ? '새로운 알림이 없습니다' : `${categoryTitle}이 없습니다`}</b><small>{category === 'all' ? '새 카드와 컬렉션 소식이 도착하면 알려드릴게요.' : '다른 분류를 선택해 보세요.'}</small>{category === 'all' && <button type="button" className="outline" onClick={() => onNavigate('discover')}>카드 둘러보기</button>}</div>}</>
}


function RevealCard({ userCardId, onClose }: { userCardId: string, onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [revealed, setRevealed] = useState(() => {
    try { return window.sessionStorage.getItem(revealStorageKey(userCardId)) === '1' } catch { return false }
  })
  const [detail, setDetail] = useState<UserCardDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    setDetailError(false)
    void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${userCardId}`)
      .then(result => {
        if (cancelled) return
        setDetail(result.data)
        setDetailLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setDetailLoading(false)
        setDetailError(true)
      })
    return () => { cancelled = true }
  }, [userCardId, detailAttempt])

  useEffect(() => {
    // The reveal screen is a route-level experience rather than a dialog, so
    // explicitly place focus on its first action and make Escape behave like
    // the visible “닫기” control. This keeps keyboard users from landing on
    // a blurred card with no obvious way back to the collection.
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const reveal = () => {
    if (!detail || detailLoading || detailError) return
    setRevealed(true)
    try { window.sessionStorage.setItem(revealStorageKey(userCardId), '1') } catch { /* optional reveal-state cache */ }
  }

  const configuredEffect = detail?.card.designConfig?.front?.effect ?? 'none'
  const revealEffect = ['holographic', 'prismatic', 'foil', 'sparkle'].includes(configuredEffect) ? configuredEffect : 'none'
  const configuredIntensity = Number(detail?.card.designConfig?.front?.effectIntensity ?? 0)
  const revealEffectStyle = { '--reveal-effect-intensity': String(Math.max(0, Math.min(1, configuredIntensity > 1 ? configuredIntensity / 100 : configuredIntensity))) } as CSSProperties

  return <main className="reveal-screen">
    <button ref={closeButtonRef} type="button" className="reveal-close" onClick={onClose}>닫기</button>
    <p className="eyebrow">{revealed ? '카드 공개 완료' : '새 카드 도착'}</p>
    <h1>{revealed ? '새 카드가 컬렉션에 추가됐어요' : '카드가 도착했어요'}</h1>
    <p className="muted">{revealed ? '나만의 디지털 컬렉션에서 확인해 보세요.' : '카드 정보를 확인한 뒤 공개할 수 있어요.'}</p>
    <div className={`reveal-card ${revealed ? 'revealed' : ''} reveal-effect-${revealEffect}`} style={revealEffectStyle}>
      <img src={demoCardImage(resolveApiUrl(detail?.card.imageUrl ?? cardExample))} alt="등록된 공식 카드" onError={event => keepCardVisual(event, userCardId)} />
      {revealed && <span className="official-badge">공식 카드</span>}
    </div>
    {detailLoading && <p className="reveal-status" role="status">카드 정보를 확인하는 중이에요…</p>}
    {detailError && <div className="reveal-error" role="alert"><span>카드 정보를 불러오지 못했어요.</span><button type="button" className="outline" onClick={() => setDetailAttempt(value => value + 1)}>다시 시도</button></div>}
    {revealed && detail && <div className="reveal-meta"><b>{detail.card.name}</b><span>{detail.card.artistName ?? 'Fanfolio 아티스트'} · {detail.card.memberName ?? '공식 카드'}</span><span>카드 유형 · {cardTypeLabel(detail.card.cardType)} · 발행번호 #{String(detail.serialNumber).padStart(3, '0')} · {detail.acquisitionSource === 'qr' ? 'QR 스캔' : detail.acquisitionSource === 'manual' ? '코드 직접 입력' : '콘텐츠 코드'}</span>{detail.card.hasVideo && detail.card.videoUrl && <video className="reveal-video" controls playsInline loop preload="metadata" src={resolveApiUrl(detail.card.videoUrl)} aria-label="카드 모션 레이어 재생" />}{detail.card.handwritingImageUrl && <img className="reveal-handwriting" src={resolveApiUrl(detail.card.handwritingImageUrl)} alt="손글씨 특전" />}{detail.card.hasVoice && <audio controls preload="metadata" src={resolveApiUrl(detail.card.voiceAudioUrl)} aria-label="보이스 특전 재생" />}</div>}
    {!revealed && <button type="button" className="primary" onClick={reveal} disabled={detailLoading || detailError || !detail}>{detailLoading ? '카드 정보 확인 중...' : '카드 공개하기'}</button>}
    {revealed && <button type="button" className="primary" onClick={onClose}>컬렉션으로 이동</button>}
  </main>
}
  function NavItem({ active, label, icon = label === '탐색' ? 'discover' : label === '알림' ? 'alerts' : label === '설정' ? 'settings' : 'collection', badge, onClick }: { active: boolean, label: string, icon?: 'home' | 'collection' | 'discover' | 'alerts' | 'settings', badge?: number, onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined} onClick={onClick}><NavIcon name={icon} />{label}{badge ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}</button> }

function NavIcon({ name }: { name: 'home' | 'collection' | 'discover' | 'alerts' | 'settings' }) {
  const paths = { home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6', collection: 'M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z', discover: 'm21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z', alerts: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4' } as const
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
}

function InlineIcon({ name }: { name: 'search' | 'sparkle' | 'card' | 'system' | 'dot' | 'plus' | 'list' | 'grid' | 'back' }) {
  const paths = {
    search: 'm20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z',
    sparkle: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
    card: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM8 9h8M8 13h5',
    system: 'M12 8v4M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    dot: 'M12 12h.01',
    plus: 'M12 5v14M5 12h14',
    list: 'M5 6h14M5 12h14M5 18h14',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    back: 'm15 18-6-6 6-6M9 12h11',
  } as const
  return <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
}


export default App
