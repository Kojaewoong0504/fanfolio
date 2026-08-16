import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import './reference.css'
import cardExample from './assets/card-example.svg'
import cardExampleBlue from './assets/card-example-blue.svg'
import cardExamplePink from './assets/card-example-pink.svg'
import { ApiError, apiFetch, claimPassTier, claimReward, clearAccessToken, getFanEvent, getFanEvents, getFanHome, getFanPass, getProgression, notificationStreamUrl, oauthStartUrl, resolveApiUrl, setAccessToken, updateProfileEquipment, type CatalogArtist, type CatalogCard, type CatalogMember, type CollectionBenefit, type CollectionCard, type CollectionSummary, type CurrentUser, type FanEvent, type FanEventStatus, type FanHomeResponse, type FanProgression, type NotificationItem, type ProfileEquipment, type RewardGrant, type UserCardDetail } from './api/client'
import { QrRedeemModal, RedeemIcon } from './components/QrRedeemModal'
import { CardDetail } from './components/CardDetail'
import { Settings } from './components/Settings'
import { ProfileAvatar } from './components/ProfileAvatar'
import { FanGrowth } from './components/FanGrowth'
import { EventDetail } from './components/EventDetail'
import { EventList } from './components/EventList'
import type { Card } from './types'
import { demoCardImage, demoMemberImage, keepCardVisual } from './utils/cardVisual'
import cardYunaImage from './assets/card-yuna-lavender.jpg'
import cardMinhoImage from './assets/card-minho-midnight.jpg'
import cardJayImage from './assets/card-jay-rosegold.jpg'
import collectionCardHarinGenerated from './assets/collection-card-harin-generated.png'
import collectionCardDoyunGenerated from './assets/collection-card-doyun-generated.png'
import collectionCardMinjaeGenerated from './assets/collection-card-minjae-generated.png'
import collectionCardJayGenerated from './assets/collection-card-jay-generated.png'
import eventSigningReference from './assets/event-signing-reference.png'
import dreamscapeHero from './assets/dreamscape-hero-v2.png'
import fanWeekNightStage from './assets/fan-week-night-stage.png'
import fanWeekLavenderMeet from './assets/fan-week-lavender-meet.png'
import loginDreamscapeGroup from './assets/login/dreamscape-group.png'
import appleLoginIcon from './assets/login/apple.svg'
import googleLoginIcon from './assets/login/google.svg'
import kakaoLoginIcon from './assets/login/kakao.svg'
import naverLoginIcon from './assets/login/naver.svg'

type Tab = 'home' | 'discover' | 'collection' | 'growth' | 'settings' | 'alerts' | 'events'

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

function toCollectionCard(card: CollectionCard): Card {
  return {
    id: `#${String(card.serialNumber).padStart(3, '0')}`,
    userCardId: card.userCardId,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: demoCardImage(resolveApiUrl(card.imageUrl), `member:${card.memberName ?? card.memberId ?? card.userCardId}`),
  }
}

function toCatalogCard(card: CatalogCard): Card {
  return {
    id: card.id,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: demoCardImage(resolveApiUrl(card.imageUrl), `member:${card.memberName ?? card.memberId ?? card.id}`),
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
  const [eventId, setEventId] = useState<string | null>(() => eventIdFromPath(window.location.pathname))
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
  const [fanProgression, setFanProgression] = useState<FanProgression | null>(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [growthError, setGrowthError] = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationError, setNotificationError] = useState('')
  const [notificationActionError, setNotificationActionError] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [revealedCardId, setRevealedCardId] = useState<string | null>(() => revealIdFromPath(window.location.pathname))
  const [savedCards, setSavedCards] = useState<Card[]>([])
  const [fanHome, setFanHome] = useState<FanHomeResponse | null>(null)
  const [fanEvents, setFanEvents] = useState<FanEvent[]>([])
  const [fanEventsLoading, setFanEventsLoading] = useState(false)
  const [fanEventsError, setFanEventsError] = useState('')
  const [fanEventStatus, setFanEventStatus] = useState<'all' | FanEventStatus>('all')
  const [selectedEvent, setSelectedEvent] = useState<FanEvent | null>(null)
  const [eventDetailLoading, setEventDetailLoading] = useState(false)
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
    setEventId(null)
    const nextPath = pathForTab(nextTab)
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const openEvents = () => {
    setTab('events')
    setEventId(null)
    setSelectedEvent(null)
    window.history.pushState({}, '', '/events')
  }

  const openEvent = (event: FanEvent) => {
    setTab('events')
    setSelectedEvent(event)
    setEventId(event.id)
    window.history.pushState({}, '', `/events/${encodeURIComponent(event.id)}`)
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
      setEventId(eventIdFromPath(path))
      setShowRedeem(path === '/redeem')
      setRevealedCardId(revealIdFromPath(path))
      setSelectedCard(path.startsWith('/cards/') ? readCardRoutePreview(path) : null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!signedIn || showOnboarding) return
    let cancelled = false
    void getFanHome().then(result => { if (!cancelled) setFanHome(result.data) }).catch(() => { if (!cancelled) setFanHome(null) })
    return () => { cancelled = true }
  }, [signedIn, showOnboarding])

  useEffect(() => {
    if (!signedIn || tab !== 'events' || eventId) return
    setFanEventsLoading(true)
    setFanEventsError('')
    void getFanEvents({ status: fanEventStatus === 'all' ? undefined : fanEventStatus }).then(result => setFanEvents(result.data.items)).catch(() => setFanEventsError('이벤트를 불러오지 못했어요.')).finally(() => setFanEventsLoading(false))
  }, [eventId, fanEventStatus, signedIn, tab])

  useEffect(() => {
    if (!signedIn || tab !== 'events' || !eventId) return
    const fallbackEvent = fallbackEventList.find(item => item.id === eventId)
    if (fallbackEvent) {
      setSelectedEvent(fallbackEvent)
      setEventDetailLoading(false)
      return
    }
    setEventDetailLoading(true)
    void getFanEvent(eventId).then(result => setSelectedEvent(result.data)).catch(() => setSelectedEvent(null)).finally(() => setEventDetailLoading(false))
  }, [eventId, signedIn, tab])

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
    setFanProgression(null)
    setGrowthError('')
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

  const refreshGrowth = useCallback(async () => {
    setGrowthLoading(true)
    setGrowthError('')
    try {
      const [progression, pass] = await Promise.all([
        getProgression(),
        getFanPass(),
      ])
      setFanProgression({
        ...progression.data,
        pass: pass.data,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearLocalSession()
      else setGrowthError('성장 정보를 불러오지 못했어요.')
    } finally {
      setGrowthLoading(false)
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
    if (!user.onboardingCompleted) return
    navigateTab('home')
    await Promise.allSettled([
      refreshCollection(),
      refreshGrowth(),
    ])
  }

  useEffect(() => {
    void refreshUser()
      .then(() => { setSignedIn(true); void Promise.allSettled([refreshCollection(), refreshGrowth()]) })
      .catch(() => {
        // The login screen may complete a magic-link request while this
        // initial session probe is still in flight. The app starts signed
        // out, so a late 401 must not overwrite that successful login.
      })
      .finally(() => {
        setSessionChecking(false)
      })
  }, [refreshCollection, refreshGrowth])

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

  const claimGrowthReward = async (grantId: string): Promise<RewardGrant> => {
    const result = await claimReward(grantId)
    await refreshGrowth()
    return result.data
  }

  const claimGrowthPassTier = async (tierId: string) => {
    const result = await claimPassTier(tierId)
    await refreshGrowth()
    return result.data
  }

  const saveGrowthEquipment = async (equipment: ProfileEquipment) => {
    const result = await updateProfileEquipment(equipment)
    setFanProgression(current => current ? { ...current, equipment: result.data } : current)
  }

  if (sessionChecking) {
    return <SessionLoading />
  }

  if (!signedIn) {
    return <Login onLogin={completeLogin} />
  }

  if (showOnboarding) {
    return <Onboarding userId={currentUser?.id ?? 'fan'} profileImageUrl={currentUser?.profileImageUrl ?? null} onComplete={() => { setShowOnboarding(false); void refreshUser(); void Promise.allSettled([refreshCollection(), refreshGrowth()]) }} onBack={logout} />
  }

  if (revealedCardId) {
    return <RevealCard userCardId={revealedCardId} onClose={closeReveal} />
  }

  return (
    <main className={`app-shell ${tab}-shell ${tab === 'events' && eventId ? 'event-detail-shell' : ''} ${tab === 'collection' && collectionCards.length === 0 ? 'empty-collection-shell' : ''} ${tab === 'home' && collectionCards.length === 0 ? 'empty-home-shell' : ''}`}>
      <header className="app-header">
        <div className="app-header-copy"><span className="eyebrow">FANFOLIO</span>{tab !== 'home' && <><h1>{tabTitle(tab)}</h1>{tabDescription(tab) && <p className="app-header-description">{tabDescription(tab)}</p>}</>}</div>
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
        {tab === 'home' && <Home nickname={currentUser?.nickname ?? '팬'} cards={collectionCards} savedCards={savedCards} summary={collectionSummary} loading={collectionLoading} eventHome={fanHome} onSelect={openCard} onDiscover={() => navigateTab('discover')} onCollection={() => navigateTab('collection')} onRedeem={openRedeem} onEvents={openEvents} onEvent={openEvent} />}
        {tab === 'events' && (eventId ? <EventDetail event={selectedEvent} loading={eventDetailLoading} onBack={openEvents} onOpenTarget={target => { if (target.startsWith('/events/')) { const id = decodeURIComponent(target.split('/').pop() ?? ''); const item = [...fanEvents, ...fallbackEventList].find(event => event.id === id); if (item) openEvent(item) } else if (target.startsWith('https://')) window.open(target, '_blank', 'noopener,noreferrer') }} /> : <EventList events={fanEvents.length > 0 ? fanEvents : fallbackEventList} status={fanEventStatus} loading={fanEventsLoading} error={fanEventsError} onStatusChange={setFanEventStatus} onOpen={openEvent} />)}
        {tab === 'collection' && <Collection cards={collectionCards} summary={collectionSummary} benefits={collectionBenefits} loading={collectionLoading} onSelect={openCard} onRedeem={openRedeem} onDiscover={() => navigateTab('discover')} onClaim={claimBenefit} />}
        {tab === 'discover' && <Discover />}
        {tab === 'alerts' && <Alerts items={notifications} error={notificationError} actionError={notificationActionError} onDismissActionError={() => setNotificationActionError('')} onRetry={() => window.dispatchEvent(new Event('fanfolio:refresh-notifications'))} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} onNavigate={navigateTab} />}
        {/* Embedded surfaces stay compact; the dedicated tab uses the full progression view. */}
        {tab === 'growth' && <FanGrowth progression={fanProgression} loading={growthLoading} error={growthError} mode="full" onRetry={refreshGrowth} onClaim={claimGrowthReward} onClaimPassTier={claimGrowthPassTier} onEquip={saveGrowthEquipment} fanGrowthMode="full" />}
        {tab === 'settings' && currentUser && <Settings user={currentUser} onUserUpdated={setCurrentUser} onLogout={logout} onEvents={openEvents} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavItem active={tab === 'discover'} label="탐색" onClick={() => navigateTab('discover')} />
        <NavItem active={tab === 'collection'} label="보관함" icon="collection" onClick={() => navigateTab('collection')} />
        <NavItem active={tab === 'home'} label="홈" icon="home" onClick={() => navigateTab('home')} />
        <NavItem active={tab === 'growth'} label="팬 레벨" icon="growth" onClick={() => navigateTab('growth')} />
        <NavItem active={tab === 'settings'} label="마이" icon="settings" onClick={() => navigateTab('settings')} />
      </nav>

      {showRedeem && <QrRedeemModal onClose={closeRedeem} onRedeemed={(id) => { closeRedeem(); openReveal(id); void Promise.allSettled([refreshCollection(), refreshGrowth()]) }} />}
      {selectedCard && <CardDetail card={selectedCard} isSaved={savedCardIds.includes(selectedCard.userCardId ?? selectedCard.id)} onClose={closeCard} onToggleSaved={() => { const id = selectedCard.userCardId ?? selectedCard.id; setSavedCards(cards => cards.some(item => (item.userCardId ?? item.id) === id) ? cards.filter(item => (item.userCardId ?? item.id) !== id) : [...cards, selectedCard]) }} onRedeem={() => { closeCard(); openRedeem() }} imageFor={demoCardImage} onImageError={keepCardVisual} cardTypeLabel={cardTypeLabel} />}
    </main>
  )
}

function tabFromPath(pathname: string): Tab {
  // The authenticated entry point is the home feed. Keep `/` equivalent to
  // `/home` so OAuth/magic-link completion never drops fans into the archive.
  if (pathname === '/' || pathname === '') return 'home'
  if (pathname === '/home') return 'home'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/collection') return 'collection'
  if (pathname === '/growth') return 'growth'
  if (pathname === '/notifications') return 'alerts'
  if (pathname === '/events' || pathname.startsWith('/events/')) return 'events'
  if (pathname === '/settings') return 'settings'
  return 'home'
}

function SessionLoading() {
  return <main className="session-loading" role="status" aria-live="polite"><span className="session-loading-mark">F</span><span className="loading-orbit" aria-hidden="true" /><b>Fanfolio를 준비하고 있어요</b><small>컬렉션을 안전하게 확인하는 중입니다.</small></main>
}

function pathForTab(tab: Tab): string {
  return { home: '/home', discover: '/discover', collection: '/collection', growth: '/growth', settings: '/settings', alerts: '/notifications', events: '/events' }[tab]
}

function eventIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/events\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function revealIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/reveal\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function tabTitle(tab: Tab) { return { home: '내 컬렉션', discover: '탐색', collection: '보관함', growth: '팬 레벨', settings: '마이', alerts: '알림', events: '이벤트' }[tab] }
function tabDescription(tab: Tab) { return { home: '', discover: '', collection: '내가 수집한 모든 카드와 컬렉션을 관리해요.', growth: '팬 활동을 통해 레벨을 올리고 특별한 혜택을 받아보세요!', settings: '', alerts: '', events: '드림스케이프의 다양한 이벤트에 참여해보세요.' }[tab] }

type LoginProvider = 'apple' | 'google' | 'kakao' | 'naver'

const loginProviderIcons: Record<LoginProvider, string> = {
  apple: appleLoginIcon,
  google: googleLoginIcon,
  kakao: kakaoLoginIcon,
  naver: naverLoginIcon,
}

function LoginProviderIcon({ provider }: { provider: LoginProvider }) {
  return <span className="login-provider-icon" data-provider={provider} aria-hidden="true">
    <img src={loginProviderIcons[provider]} alt="" />
  </span>
}

function Login({ onLogin }: { onLogin: () => void | Promise<void> }) {
  const [purpose, setPurpose] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailLoginOpen, setEmailLoginOpen] = useState(false)
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

  const submitPassword = async () => {
    setBusy(true)
    setMessage('')
    try {
      const endpoint = purpose === 'signup' ? '/auth/fan/signup' : '/auth/fan/login'
      const result = await apiFetch<{ ok: true, data: { accessToken: string } }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setAccessToken(result.data.accessToken)
      await onLogin()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : purpose === 'signup' ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const messageIsError = isErrorMessage(message)
  const showPendingProvider = (provider: 'Apple' | '네이버') => {
    setMessage(`${provider} 로그인은 준비 중입니다. Google, 카카오 또는 이메일 로그인을 이용해 주세요.`)
  }

  return <main className={`login-screen${emailLoginOpen ? ' email-login-open' : ''}`}>
    <header className="login-intro">
      <div className="login-wordmark">FANFOLIO</div>
      <h1>내 손안의 팬 컬렉션</h1>
      <p>좋아하는 아티스트의 순간을 모으고,<br />특별한 경험을 만드세요.</p>
    </header>
    <div className="login-hero-stage" aria-hidden="true">
      <img className="login-hero" src={loginDreamscapeGroup} alt="" />
    </div>
    <div className="social-login" aria-label="소셜 로그인">
      <button type="button" className="social-button apple" onClick={() => showPendingProvider('Apple')} disabled={busy}><LoginProviderIcon provider="apple" /><span className="login-provider-label">Apple로 계속하기</span></button>
      <button type="button" className="social-button google" onClick={() => { window.location.href = oauthStartUrl('google') }} disabled={busy}><LoginProviderIcon provider="google" /><span className="login-provider-label">Google로 계속하기</span></button>
      <button type="button" className="social-button kakao" onClick={() => { window.location.href = oauthStartUrl('kakao') }} disabled={busy}><LoginProviderIcon provider="kakao" /><span className="login-provider-label">카카오로 계속하기</span></button>
      <button type="button" className="social-button naver" onClick={() => showPendingProvider('네이버')} disabled={busy}><LoginProviderIcon provider="naver" /><span className="login-provider-label">네이버로 계속하기</span></button>
    </div>
    <div className="login-divider"><span>또는</span></div>
    {!emailLoginOpen && <button type="button" className="email-login-trigger" aria-expanded="false" aria-controls="email-login-panel" onClick={() => { setEmailLoginOpen(true); setMessage('') }}><svg className="login-email-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4.5 7 7.5 6 7.5-6" /></svg>이메일로 로그인</button>}
    {emailLoginOpen && <section id="email-login-panel" className="email-login-panel" aria-label="이메일 로그인">
      <div className="auth-mode" role="tablist" aria-label="인증 방식"><button className={purpose === 'login' ? 'active' : ''} role="tab" aria-selected={purpose === 'login'} onClick={() => { setPurpose('login'); setMessage('') }}>로그인</button><button className={purpose === 'signup' ? 'active' : ''} role="tab" aria-selected={purpose === 'signup'} onClick={() => { setPurpose('signup'); setMessage('') }}>회원가입</button></div>
      <label className="field-label" htmlFor="login-email">이메일</label>
      <input id="login-email" className="login-email-input" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="이메일을 입력하세요" type="email" />
      <label className="field-label" htmlFor="login-password">비밀번호</label>
      <input id="login-password" name="password" autoComplete={purpose === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="비밀번호를 입력하세요" type="password" onKeyDown={event => { if (event.key === 'Enter' && email.includes('@') && password.length >= 8 && !busy) void submitPassword() }} />
      <button className="primary" onClick={() => void submitPassword()} disabled={!email.includes('@') || password.length < 8 || busy}>{busy ? purpose === 'signup' ? '가입 중...' : '로그인 중...' : purpose === 'signup' ? '회원가입' : '로그인'}</button>
    </section>}
    <p role={messageIsError ? 'alert' : 'status'} className={messageIsError ? 'form-message error-message' : 'form-message'}>{message}</p>
  </main>
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

type HomeProps = { nickname: string, cards: Card[], savedCards: Card[], summary: CollectionSummary, loading: boolean, eventHome: FanHomeResponse | null, onSelect: (card: Card) => void, onDiscover: () => void, onCollection: () => void, onRedeem: () => void, onEvents: () => void, onEvent: (event: FanEvent) => void }

const fallbackHomeEvent: FanEvent = {
  id: 'demo-fan-week',
  artistId: 'artist_nova3',
  title: '2026 SUMMER FAN WEEK',
  summary: '드림스케이프와 함께하는 한정 이벤트',
  description: '좋아하는 아티스트의 새로운 순간을 만나보세요.',
  eventType: 'external',
  status: 'active',
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: null,
  // Use the same artist image treatment as the approved home reference when
  // the API has no featured event yet; the generic envelope placeholder reads
  // like a broken asset in the fan-facing feed.
  heroUrl: dreamscapeHero,
  
  artistName: '드림스케이프',
  ctaLabel: '이벤트 보기',
  ctaTarget: '/events',
}

const fallbackEventList: FanEvent[] = [
  { ...fallbackHomeEvent, id: 'demo-event-signing', title: '드림스케이프 팬 사인회', summary: '드림스케이프', description: '드림스케이프와 함께하는 특별한 팬 사인회에 참여해 보세요.', eventType: 'external', status: 'active', startsAt: '2026-06-28T17:00:00+09:00', heroUrl: eventSigningReference, ctaLabel: '참여하기', ctaTarget: '/events/demo-event-signing' },
  { ...fallbackHomeEvent, id: 'demo-event-live', title: 'DREAMSCAPE LIVE in SEOUL', summary: '드림스케이프', description: '드림스케이프의 라이브 무대를 만나보세요.', eventType: 'card', status: 'upcoming', startsAt: '2026-07-12T18:00:00+09:00', heroUrl: fanWeekNightStage, ctaLabel: '자세히 보기', ctaTarget: '/events/demo-event-live' },
  { ...fallbackHomeEvent, id: 'demo-event-hi-touch', title: '드림스케이프 하이터치 이벤트', summary: '드림스케이프', description: '가까이에서 아티스트를 만나는 하이터치 이벤트입니다.', eventType: 'fan_mission', status: 'active', startsAt: '2026-07-25T15:00:00+09:00', heroUrl: fanWeekLavenderMeet, ctaLabel: '참여하기', ctaTarget: '/events/demo-event-hi-touch' },
  { ...fallbackHomeEvent, id: 'demo-event-fan-meeting', title: '드림스케이프 스페셜 팬 미팅', summary: '드림스케이프', description: '드림스케이프와 함께한 특별한 팬 미팅 기록입니다.', eventType: 'external', status: 'ended', startsAt: '2026-08-08T14:00:00+09:00', heroUrl: dreamscapeHero, ctaLabel: '기록 보기', ctaTarget: '/events/demo-event-fan-meeting' },
]

type HomeHeroSlide = {
  event: FanEvent
  eyebrow: string
  titleLines: string[]
  image: string
}

const fallbackHeroSlides: HomeHeroSlide[] = [
  {
    event: fallbackHomeEvent,
    eyebrow: '팬 이벤트',
    titleLines: ['2026', 'SUMMER', 'FAN WEEK'],
    image: dreamscapeHero,
  },
  {
    event: {
      ...fallbackHomeEvent,
      id: 'demo-live-night',
      title: 'DREAMSCAPE LIVE NIGHT',
      summary: '보랏빛 무대에서 만나는 특별한 라이브',
      description: '드림스케이프의 여름 라이브를 가장 먼저 만나보세요.',
      ctaLabel: '라이브 보기',
      heroUrl: fanWeekNightStage,
    },
    eyebrow: '라이브 스페셜',
    titleLines: ['DREAMSCAPE', 'LIVE NIGHT'],
    image: fanWeekNightStage,
  },
  {
    event: {
      ...fallbackHomeEvent,
      id: 'demo-sign-meet',
      title: 'SIGN & MEET DAY',
      summary: '가까이에서 만나는 여름 팬미팅',
      description: '팬과 아티스트가 함께하는 하루를 신청해 보세요.',
      ctaLabel: '신청하기',
      heroUrl: fanWeekLavenderMeet,
    },
    eyebrow: '팬미팅',
    titleLines: ['SIGN &', 'MEET DAY'],
    image: fanWeekLavenderMeet,
  },
]

function homeHeroTitleLines(title: string): string[] {
  if (title === fallbackHomeEvent.title) return fallbackHeroSlides[0].titleLines
  const words = title.trim().split(/\s+/)
  if (words.length < 3) return [title]
  return [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
}
const fallbackHomeCards: Card[] = [
  { id: 'home-stardust-hologram', title: 'Nebula Ver.', artist: '드림스케이프', member: '하린', image: cardMinhoImage },
  { id: 'home-stardust-photo', title: 'Nebula Ver.', artist: '드림스케이프', member: '도윤', image: cardJayImage },
  { id: 'home-dream-moment', title: 'Nebula Ver.', artist: '드림스케이프', member: '제이', image: cardYunaImage },
]
const fallbackCollectionCards: Card[] = [
  { id: 'collection-generated-harin-nebula', title: 'Nebula Ver.', artist: '드림스케이프', member: '하린', image: collectionCardHarinGenerated },
  { id: 'collection-generated-doyun-nebula', title: 'Nebula Ver.', artist: '드림스케이프', member: '도윤', image: collectionCardDoyunGenerated },
  { id: 'collection-generated-minjae-nebula', title: 'Nebula Ver.', artist: '드림스케이프', member: '민재', image: collectionCardMinjaeGenerated },
  { id: 'collection-generated-jay-nebula', title: 'Nebula Ver.', artist: '드림스케이프', member: '제이', image: collectionCardJayGenerated },
  { id: 'collection-generated-harin-starlight', title: 'Starlight Ver.', artist: '드림스케이프', member: '하린', image: collectionCardHarinGenerated },
  { id: 'collection-generated-doyun-starlight', title: 'Starlight Ver.', artist: '드림스케이프', member: '도윤', image: collectionCardDoyunGenerated },
  { id: 'collection-generated-minjae-starlight', title: 'Starlight Ver.', artist: '드림스케이프', member: '민재', image: collectionCardMinjaeGenerated },
  { id: 'collection-generated-jay-starlight', title: 'Starlight Ver.', artist: '드림스케이프', member: '제이', image: collectionCardJayGenerated },
]
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

function HomeContent({ nickname, cards, savedCards, summary, loading, eventHome, onSelect, onDiscover, onCollection, onRedeem, onEvents, onEvent }: HomeProps) {
  const featured = cards[0]
  const featuredEvent = eventHome?.featuredEvent ?? fallbackHomeEvent
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [heroInteractionVersion, setHeroInteractionVersion] = useState(0)
  const [artistFavorite, setArtistFavorite] = useState(false)
  const [newCardFavorites, setNewCardFavorites] = useState<Set<string>>(() => new Set())
  const heroDrag = useRef<{ pointerId: number, startX: number, currentX: number } | null>(null)
  const heroDidSwipe = useRef(false)
  const heroSlides: HomeHeroSlide[] = [
    {
      event: featuredEvent,
      eyebrow: '팬 이벤트',
      titleLines: homeHeroTitleLines(featuredEvent.title),
      image: resolveApiUrl(featuredEvent.heroUrl) || dreamscapeHero,
    },
    ...fallbackHeroSlides.slice(1),
  ]
  const artist = eventHome?.favoriteArtist ?? { id: 'dreamscape', name: '드림스케이프', imageUrl: cardYunaImage }
  const newCards = eventHome?.newCards?.length ? eventHome.newCards.map(toCatalogCard) : fallbackHomeCards
  const completionRate = Math.min(100, Math.max(0, summary.completionRate))
  const artistImage = artist.imageUrl ? (resolveApiUrl(artist.imageUrl) || cardYunaImage) : cardYunaImage

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroIndex(current => (current + 1) % heroSlides.length)
    }, 5800)
    return () => window.clearInterval(timer)
  }, [heroInteractionVersion, heroSlides.length])

  const resetHeroAutoplay = () => setHeroInteractionVersion(current => current + 1)
  const moveHero = (direction: -1 | 1) => {
    resetHeroAutoplay()
    setActiveHeroIndex(current => (current + direction + heroSlides.length) % heroSlides.length)
  }
  const handleHeroPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary) return
    heroDrag.current = { pointerId: event.pointerId, startX: event.clientX, currentX: event.clientX }
    heroDidSwipe.current = false
    resetHeroAutoplay()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleHeroPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!heroDrag.current || heroDrag.current.pointerId !== event.pointerId) return
    heroDrag.current.currentX = event.clientX
    if (Math.abs(event.clientX - heroDrag.current.startX) > 8) event.preventDefault()
  }
  const finishHeroPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = heroDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const distance = drag.currentX - drag.startX
    heroDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (Math.abs(distance) < 30) return
    heroDidSwipe.current = true
    moveHero(distance < 0 ? 1 : -1)
  }
  const cancelHeroPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!heroDrag.current || heroDrag.current.pointerId !== event.pointerId) return
    heroDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const openHeroEvent = (slide: HomeHeroSlide) => {
    if (heroDidSwipe.current) {
      heroDidSwipe.current = false
      return
    }
    if (slide.event.id.startsWith('demo-')) onEvents()
    else onEvent(slide.event)
  }
  const toggleNewCardFavorite = (cardId: string) => {
    setNewCardFavorites(current => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  return <div className="home-screen collection-home">
    <h1 className="home-page-title">오늘, 좋아하는 아티스트의<br /><em>새로운 순간</em></h1>
    <p className="collection-greeting"><strong>{nickname}</strong>님, 새 카드가 도착했어요</p>
    <section
      className="home-event-spotlight"
      aria-label="추천 이벤트"
      aria-roledescription="carousel"
      onPointerDown={handleHeroPointerDown}
      onPointerMove={handleHeroPointerMove}
      onPointerUp={finishHeroPointer}
      onPointerCancel={cancelHeroPointer}
      onLostPointerCapture={event => {
        if (heroDrag.current?.pointerId === event.pointerId) heroDrag.current = null
      }}
    >
      <div className="home-event-track" style={{ '--hero-index': activeHeroIndex } as CSSProperties}>
        {heroSlides.map((slide, index) => <button
          type="button"
          className="home-event-slide"
          key={slide.event.id}
          aria-label={`${slide.event.title} · ${index + 1}/${heroSlides.length}`}
          aria-hidden={index !== activeHeroIndex}
          tabIndex={index === activeHeroIndex ? 0 : -1}
          onClick={() => openHeroEvent(slide)}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              moveHero(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}
        >
          <img draggable={false} src={slide.image} alt="" onError={event => { event.currentTarget.src = dreamscapeHero }} />
          <span className="home-event-spotlight-copy">
            <small>{slide.eyebrow}</small>
            <b>{slide.titleLines.map(line => <span key={line}>{line}</span>)}</b>
            <em>{slide.event.summary}</em>
            <strong>{slide.event.ctaLabel ?? '이벤트 보기'} <InlineIcon name="chevron" /></strong>
          </span>
          <FavoriteControl className="home-favorite-button" />
        </button>)}
      </div>
      <div className="home-event-dots" aria-label="이벤트 배너 선택">
        {heroSlides.map((slide, index) => <button
          type="button"
          key={slide.event.id}
          className={index === activeHeroIndex ? 'home-event-dot active' : 'home-event-dot'}
          aria-label={`${index + 1}번 이벤트 보기`}
          aria-current={index === activeHeroIndex ? 'true' : undefined}
          onClick={() => {
            resetHeroAutoplay()
            setActiveHeroIndex(index)
          }}
        />)}
      </div>
    </section>
    <section className="home-artist-section" aria-labelledby="home-artist-title">
      <div className="section-heading"><h2 id="home-artist-title">관심 아티스트</h2><button type="button" onClick={onDiscover}>전체 보기 <InlineIcon name="chevron" /></button></div>
      <article className="home-artist-card">
        <button type="button" className="home-artist-primary" onClick={onDiscover} aria-label={`${artist.name} 아티스트 홈 보기`}>
          <img className="home-artist-backdrop" src={dreamscapeHero} alt="" />
          <span className="home-artist-copy">
            <small className="home-artist-badge">추천 아티스트</small>
            <b>{artist.name} <span className="home-artist-verified" aria-label="공식 인증"><VerifiedIcon /></span></b>
            <em>4명의 멤버</em>
            <span className="home-artist-members">{[artistImage, cardMinhoImage, cardJayImage, cardYunaImage].map((image, index) => <img key={`${image}-${index}`} src={image} alt="" />)}</span>
          </span>
        </button>
        <FavoriteControl
          className="home-artist-favorite"
          active={artistFavorite}
          ariaLabel={artistFavorite ? `${artist.name} 관심 해제` : `${artist.name} 관심 등록`}
          interactive
          onClick={() => setArtistFavorite(favorite => !favorite)}
        />
      </article>
    </section>
    <section className="home-new-cards" aria-labelledby="home-new-cards-title">
      <div className="section-heading"><h2 id="home-new-cards-title">새로 공개된 카드</h2><button type="button" onClick={onDiscover}>전체 보기 <InlineIcon name="chevron" /></button></div>
      <div className="home-new-card-row">{newCards.slice(0, 3).map((card, index) => {
        const rarity = index === 0 ? 'UR' : 'SR'
        const isFavorite = newCardFavorites.has(card.id)
        return <article className="home-new-card" key={card.id}>
          <button type="button" className="home-new-card-primary" onClick={() => onSelect(card)} aria-label={`${card.title} 카드 상세 보기`}>
            <img src={card.image} alt="" onError={event => keepCardVisual(event, card.id)} />
            <small className={`home-new-card-rarity rarity-${rarity.toLowerCase()}`}>{rarity}</small>
            <span className="home-new-card-copy"><b>{card.member}</b><em>{card.title}</em></span>
          </button>
          <FavoriteControl
            className="home-new-card-favorite"
            active={isFavorite}
            ariaLabel={isFavorite ? `${card.member} 카드 관심 해제` : `${card.member} 카드 관심 등록`}
            interactive
            onClick={() => toggleNewCardFavorite(card.id)}
          />
        </article>
      })}</div>
    </section>
    <section className="home-active-event-section" aria-labelledby="home-active-event-title">
      <div className="section-heading"><h2 id="home-active-event-title">진행 중인 이벤트</h2></div>
      <button type="button" className="home-active-event" onClick={onEvents}>
        <img src={dreamscapeHero} alt="" />
        <span><small className="home-active-event-status">참여 중</small><b>드림스케이프 사인 폴라로이드 이벤트</b><em>참여하고 사인 폴라로이드를 받아보세요!</em></span>
        <strong>D-5</strong><InlineIcon name="chevron" />
      </button>
    </section>
    {loading && !featured ? <div className="home-loading" role="status" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><b>컬렉션을 준비하고 있어요</b></div> : featured ? <button className="collection-spotlight" onClick={() => onSelect(featured)} aria-label={`${featured.title} 카드 상세 보기`}>
      <img src={featured.image} alt={`${featured.title} 카드`} onError={event => keepCardVisual(event, featured.id)} />
      <span className="collection-spotlight-copy"><small>FANFOLIO COLLECTION</small><b>{featured.title}</b><em>{featured.artist} · {featured.member}</em><strong>NEW <i>·</i> MY COLLECTION</strong></span>
    </button> : <div className="home-empty"><b>첫 카드를 만나보세요</b><span>QR 또는 카드 코드로 등록하거나, 새로운 카드를 먼저 둘러보세요.</span><div className="home-empty-actions"><button type="button" className="primary" onClick={onRedeem}>카드 등록하기</button><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div></div>}

    <section className="collection-progress" aria-labelledby="collection-progress-title">
      <div><span id="collection-progress-title">컬렉션 진행도</span><strong><em>{summary.ownedCount}</em> / {summary.totalSlots}</strong></div>
      <div className="collection-progress-track" role="progressbar" aria-label="컬렉션 완성도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionRate}><span style={{ width: `${completionRate}%` }} /></div>
      <small>완료율 {completionRate}%</small>
    </section>

    {cards.length > 0 && <section className="recent-collection" aria-labelledby="recent-collection-title">
      <div className="section-heading"><h2 id="recent-collection-title">최근 수집</h2><button type="button" onClick={onCollection}>전체 보기 <span aria-hidden="true">›</span></button></div>
      <div className="recent-collection-row">{cards.slice(0, 4).map(card => <button type="button" className="recent-collection-card" key={card.userCardId ?? card.id} onClick={() => onSelect(card)} aria-label={`${card.title} 카드 상세 보기`}><img src={card.image} alt="" onError={event => keepCardVisual(event, card.id)} /><span><b>{card.title}</b><small>보유</small></span></button>)}</div>
    </section>}

    <button type="button" className="collection-register-cta" onClick={onRedeem}><RedeemIcon name="scan" /><span>카드 등록</span></button>
    {savedCards.length > 0 && <section className="saved-section"><div className="section-heading"><h2>관심 카드</h2><span className="section-count">{savedCards.length}장</span></div><div className="saved-card-row">{savedCards.slice(0, 4).map(card => <button className="saved-card" key={card.userCardId ?? card.id} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드`} onError={event => keepCardVisual(event, card.id)} /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span></button>)}</div></section>}
  </div>
}

function Collection({ cards: collectionCards, summary, benefits, loading, onSelect, onRedeem, onDiscover, onClaim }: { cards: Card[], summary: CollectionSummary, benefits: CollectionBenefit[], loading: boolean, onSelect: (card: Card) => void, onRedeem: () => void, onDiscover: () => void, onClaim: (campaignId: string) => Promise<void> }) {
  const [showAll, setShowAll] = useState(false)
  const [artistFilter, setArtistFilter] = useState('전체')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState('')
  const artists = Array.from(new Set(collectionCards.map(card => card.artist)))
  const filteredCards = artistFilter === '전체' ? collectionCards : collectionCards.filter(card => card.artist === artistFilter)
  const recentCards = (collectionCards.length > 0 ? collectionCards : fallbackCollectionCards).slice(0, 8)
  const duplicateCounts = recentCards.reduce<Record<string, number>>((counts, card) => {
    counts[card.title] = (counts[card.title] ?? 0) + 1
    return counts
  }, {})
  const completedCollections = benefits.filter(benefit => benefit.status === 'unlocked').length
  const inProgressCollections = benefits.filter(benefit => benefit.status === 'locked').length
  const rareCards = collectionCards.filter(card => /ur|rare/i.test(`${card.id} ${card.title}`)).length
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
  return <>
    <section className="collection-reference" aria-label="보관함 요약">
      <section className="collection-progress-card" aria-label="컬렉션 진행률">
        <span className="collection-progress-label">컬렉션 진행률</span>
        <div className="collection-progress-value"><strong>{summary.completionRate}%</strong><b>{summary.ownedCount} / {summary.totalSlots}</b></div>
        <div className="collection-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.completionRate} aria-label={`컬렉션 ${summary.completionRate}% 완료`}><span style={{ width: `${Math.min(100, Math.max(0, summary.completionRate))}%` }} /></div>
      </section>
      <section className="collection-recent-section" aria-labelledby="collection-recent-title">
        <div className="section-heading"><h2 id="collection-recent-title">최근 수집 카드</h2><button type="button" onClick={() => setShowAll(true)}>전체 보기 <InlineIcon name="chevron" /></button></div>
        <div className="collection-recent-grid">{recentCards.map((card, index) => {
          const copies = duplicateCounts[card.title] ?? 1
          const previousCopies = recentCards.slice(0, index).filter(item => item.title === card.title).length
          const rarity = index === 0 ? 'UR' : index < 3 ? 'SR' : index === 3 ? 'R' : 'N'
          return <button type="button" className="collection-reference-card" key={card.userCardId ?? card.id} onClick={() => onSelect(card)} aria-label={`${card.title} ${card.member} 카드 상세 보기`}>
            <span className={`collection-card-rarity rarity-${rarity.toLowerCase()}`}>{rarity}</span>
            <img src={card.image} alt={`${card.title} 카드 · ${card.member}`} onError={event => keepCardVisual(event, card.id)} />
            <span className="collection-card-favorite" aria-hidden="true"><InlineIcon name="heart" /></span>
            <span className="collection-card-copy"><b>{card.member}</b><em>{card.title}</em></span>
            <span className={`collection-card-status ${previousCopies > 0 ? 'duplicate' : 'new'}`}>{previousCopies > 0 ? `중복 ${copies}` : '신규'}</span>
          </button>
        })}</div>
      </section>
      <button type="button" className="collection-manage-card" onClick={onRedeem}><span className="collection-manage-icon"><InlineIcon name="card" /></span><span><b>카드 상세 관리</b><small>보유 카드 정렬, 잠금, 판매 설정</small></span><InlineIcon name="chevron" /></button>
      <section className="collection-summary-section" aria-labelledby="collection-summary-title">
        <div className="section-heading"><h2 id="collection-summary-title">컬렉션 요약</h2><button type="button" onClick={() => setShowAll(true)}>전체 보기 <InlineIcon name="chevron" /></button></div>
        <div className="collection-summary-grid">
          <article><InlineIcon name="card" /><span>총 카드</span><strong>{summary.ownedCount}장</strong></article>
          <article><InlineIcon name="sparkle" /><span>완료 컬렉션</span><strong>{completedCollections}개</strong></article>
          <article><InlineIcon name="dot" /><span>진행 중</span><strong>{inProgressCollections}개</strong></article>
          <article><InlineIcon name="sparkle" /><span>희귀 카드</span><strong>{rareCards}장</strong></article>
        </div>
      </section>
    </section>
    {showAll && <section className="collection-details" aria-label="전체 컬렉션">
      <div className="section-heading collection-heading"><h2>내 컬렉션</h2><div className="collection-heading-actions">{filteredCards.length > 0 && <button type="button" className="collection-register" onClick={onRedeem}><InlineIcon name="plus" />카드 등록</button>}{filteredCards.length > 4 && <button type="button" onClick={() => setShowAll(false)}>최근 카드만 보기</button>}</div></div>
      {artists.length > 0 && <div className="collection-filters" role="tablist" aria-label="컬렉션 아티스트 필터"><button role="tab" aria-selected={artistFilter === '전체'} className={artistFilter === '전체' ? 'active' : ''} onClick={() => setArtistFilter('전체')}>전체</button>{artists.map(artist => <button role="tab" aria-selected={artistFilter === artist} className={artistFilter === artist ? 'active' : ''} key={artist} onClick={() => setArtistFilter(artist)}>{artist}</button>)}</div>}
      {filteredCards.length > 0 ? <div className="card-grid collection-grid">{filteredCards.map(card => <button className="card-tile" key={card.id} aria-label={`카드 이미지 ${card.id} ${card.member}`} onClick={() => onSelect(card)}><img src={card.image} alt={`${card.title} 카드 · ${card.member}`} onError={event => keepCardVisual(event, card.id)} /><span>{card.id}</span><b>{card.member}</b></button>)}</div> : <div className="empty-collection"><div className="empty-collection-copy"><InlineIcon name="plus" /><b>아직 카드가 없어요</b><small>카드를 등록하거나 탐색해서 컬렉션을 시작해 보세요.</small></div><div className="empty-collection-actions"><button type="button" className="primary" onClick={onRedeem}>카드 등록하기</button><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div></div>}
    </section>}
    {benefits.length > 0 && <section className="benefit-section"><div className="section-heading"><h2>컬렉션 완성 특전</h2></div><div className="benefit-list">{benefits.map(benefit => <article className={`benefit-card ${benefit.status}`} key={`${benefit.campaignId ?? benefit.artistId ?? 'fanfolio'}-${benefit.seasonName}`}><div><span className="detail-badge">{benefit.claimed ? '수령 완료' : benefit.status === 'unlocked' ? '해금 완료' : '진행 중'}</span><h3>{benefit.benefit.title}</h3><p>{benefit.benefit.description}</p></div><div><strong>{benefit.ownedCount}/{benefit.requiredCount}</strong>{benefit.claimable && benefit.campaignId && <button className="outline" onClick={() => void claim(benefit)} disabled={claimingId === benefit.campaignId}>{claimingId === benefit.campaignId ? '수령 중...' : '특전 받기'}</button>}{benefit.claimed && benefit.downloadUrl && <a className="outline benefit-download" href={resolveApiUrl(benefit.downloadUrl)} download>특전 다운로드</a>}</div></article>)}</div>{claimMessage && <p className="form-message">{claimMessage}</p>}</section>}
  </>
}

function Discover() {
  return <section className="artist-hub"><div className="artist-hub-heading"><p>좋아하는 아티스트의 모든 정보를 한눈에</p></div><section className="artist-hub-hero"><img src={dreamscapeHero} alt="드림스케이프" /><div className="artist-hub-hero-overlay"><span>추천 아티스트</span><h3>드림스케이프 <VerifiedIcon /></h3><p>4명의 멤버 · 공식 아티스트 공간</p><div className="hub-members">{[cardYunaImage, cardMinhoImage, cardJayImage, cardYunaImage].map((image, index) => <img key={index} src={image} alt="" />)}</div><button type="button">+ 팔로우</button></div></section><nav className="hub-tabs" aria-label="아티스트 정보"><a className="active" href="#artist-home">아티스트 홈</a><a href="#artist-schedule">일정</a><a href="#artist-news">뉴스</a><a href="#artist-cards">카드</a><a href="#artist-events">이벤트</a></nav><section id="artist-schedule" className="hub-section"><div className="section-heading"><h3>다가오는 일정</h3><button type="button">전체 보기 ›</button></div><div className="hub-schedule-grid"><article><b>JUN<br /><strong>28</strong></b><div><span>팬미팅</span><h4>드림스케이프 팬미팅</h4><p>2026.06.28 (일) 17:00</p><small><InlineIcon name="pin" />올림픽공원 올림픽홀</small></div><i className="hub-schedule-bell"><NavIcon name="alerts" /></i></article><article><b>JUL<br /><strong>12</strong></b><div><span>콘서트</span><h4>2026 SUMMER FAN WEEK</h4><p>2026.07.12 (일) 18:00</p><small><InlineIcon name="pin" />KSPO DOME</small></div><i className="hub-schedule-bell"><NavIcon name="alerts" /></i></article></div></section><section id="artist-news" className="hub-section"><div className="section-heading"><h3>드림스케이프 뉴스</h3><button type="button">전체 보기 ›</button></div><div className="hub-news-list"><article><img src={dreamscapeHero} alt="" /><div><b>드림스케이프, 새 앨범 트랙리스트 공개</b><p>타이틀곡 ‘Nebula’ 포함 총 6곡 수록</p><small>1시간 전</small></div><strong>›</strong></article><article><img src={fanWeekLavenderMeet} alt="" /><div><b>드림스케이프, 글로벌 차트 1위!</b><p>신곡 ‘Nebula’ 글로벌 인기 상승</p><small>1일 전</small></div><strong>›</strong></article></div></section><section id="artist-cards" className="hub-section"><div className="section-heading"><h3>새 카드</h3><button type="button">전체 보기 ›</button></div><div className="hub-card-row">{[cardYunaImage, cardMinhoImage, cardJayImage].map((image, index) => <button type="button" key={image} onClick={() => undefined}><img src={image} alt="새 카드" /><b>{['하린', '도윤', '제이'][index]}<br />Nebula Ver.</b><span>{index === 0 ? 'UR' : 'SR'}</span></button>)}</div><div className="hub-card-dots" aria-hidden="true"><b /><i /><i /></div><a className="hub-event-promo" href="/events"><span className="hub-event-promo-icon" aria-hidden="true"><InlineIcon name="gift" /></span><b><small>팬 이벤트</small>드림스케이프 사인 폴라로이드 이벤트<em>참여하고 사인 폴라로이드를 받아보세요!</em></b><strong>참여하기</strong><i>›</i></a></section></section>
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
function NavItem({ active, label, icon = label === '탐색' ? 'discover' : label === '알림' ? 'alerts' : label === '팬 레벨' ? 'growth' : label === '설정' ? 'settings' : 'collection', badge, onClick }: { active: boolean, label: string, icon?: 'home' | 'collection' | 'discover' | 'growth' | 'alerts' | 'settings', badge?: number, onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined} onClick={onClick}><NavIcon name={icon} />{label}{badge ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}</button> }

function NavIcon({ name }: { name: 'home' | 'collection' | 'discover' | 'growth' | 'alerts' | 'settings' }) {
  const paths = { home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6', collection: 'M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z', discover: 'm21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z', growth: 'M4 19V5M4 19h16M8 15l3-3 3 2 5-7M18 7h1v5', alerts: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4' } as const
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
}

type FavoriteControlProps = {
  active?: boolean
  ariaLabel?: string
  className: string
  interactive?: boolean
  onClick?: () => void
}

function FavoriteControl({ active = false, ariaLabel, className, interactive = false, onClick }: FavoriteControlProps) {
  const classes = `favorite-control ${className}${active ? ' is-active' : ''}`
  if (!interactive) return <span className={classes} aria-hidden="true"><InlineIcon name="heart" /></span>
  return <button type="button" className={classes} aria-label={ariaLabel} aria-pressed={active} onClick={onClick}><InlineIcon name="heart" /></button>
}

export function InlineIcon({ name }: { name: 'search' | 'sparkle' | 'card' | 'system' | 'dot' | 'plus' | 'list' | 'grid' | 'back' | 'heart' | 'chevron' | 'gift' | 'clock' | 'pin' | 'share' | 'calendar' | 'users' }) {
  const paths = {
    search: 'm20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z',
    sparkle: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
    card: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM8 9h8M8 13h5',
    system: 'M12 8v4M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    dot: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    plus: 'M12 5v14M5 12h14',
    list: 'M5 6h14M5 12h14M5 18h14',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    back: 'm15 18-6-6 6-6M9 12h11',
    heart: 'M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z',
    chevron: 'm9 18 6-6-6-6',
    gift: 'M4 9h16v11H4zM3 6.5h18v2.5H3zM12 6.5V20M12 6.5C10 6.5 7.5 5.3 7.5 3.8A2.3 2.3 0 0 1 12 5v1.5ZM12 6.5c2 0 4.5-1.2 4.5-2.7A2.3 2.3 0 0 0 12 5v1.5Z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    pin: 'M19 10.2c0 4.2-7 10.3-7 10.3S5 14.4 5 10.2a7 7 0 1 1 14 0ZM12 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    share: 'M12 15V3m0 0 4 4m-4-4L8 7M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
    calendar: 'M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2ZM8 2v4M16 2v4M3 9h18',
    users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 1 0-1-5.8M21 20v-1.4a4 4 0 0 0-3-3.9',
  } as const
  return <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
}

export function VerifiedIcon() {
  return <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#3897f0" />
    <path d="m7.8 12.2 2.7 2.7 5.8-5.8" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
  </svg>
}


export default App
