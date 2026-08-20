import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import './App.css'
import './reference.css'
import { ApiError, apiFetch, applyToFanEvent, claimPassTier, claimReward, clearAccessToken, connectNotificationStream, getCardPacks, getCardPackOdds, getFanEvent, getFanEventComments, getFanEvents, getFanHome, getMyEventApplications, getFanPass, getNotificationPreferences, getProgression, oauthStartUrl, openCardPack, postFanEventComment, reconcilePassRewards, resolveApiUrl, setAccessToken, updateNotificationPreferences, updateProfileEquipment, type CardDesignConfig, type CardPack, type CatalogArtist, type CatalogCard, type CatalogMember, type CollectionBenefit, type CollectionCard, type CollectionSummary, type CurrentUser, type EventPagination, type FanEvent, type FanEventApplication, type FanEventComment, type FanEventStatus, type FanHomeResponse, type FanProgression, type NotificationItem, type ProfileEquipment, type RewardGrant, type UserCardDetail } from './api/client'
import { QrRedeemModal, RedeemIcon } from './components/QrRedeemModal'
import { CardDetail } from './components/CardDetail'
import { InteractiveCollectibleCard } from './components/InteractiveCollectibleCard'
import { Settings } from './components/Settings'
import { ProfileAvatar } from './components/ProfileAvatar'
import { FanGrowth, rewardArtworkUrl } from './components/FanGrowth'
import { FanPassPage } from './components/FanPassPage'
import { EventDetail } from './components/EventDetail'
import { EventList } from './components/EventList'
import { AuthenticatedImage } from './components/AuthenticatedImage'
import type { Card } from './types'
import { demoCardImage, demoMemberImage, keepCardVisual } from './utils/cardVisual'
import cardYunaImage from './assets/card-yuna-lavender.jpg'
import cardMinhoImage from './assets/card-minho-midnight.jpg'
import cardJayImage from './assets/card-jay-rosegold.jpg'
import collectionCardHarinGenerated from './assets/collection-card-harin-generated.png'
import collectionCardDoyunGenerated from './assets/collection-card-doyun-generated.png'
import collectionCardMinjaeGenerated from './assets/collection-card-minjae-generated.png'
import collectionCardJayGenerated from './assets/collection-card-jay-generated.png'
import dreamscapeHero from './assets/dreamscape-hero-v2.png'
import fanWeekNightStage from './assets/fan-week-night-stage.png'
import fanWeekLavenderMeet from './assets/fan-week-lavender-meet.png'
import loginDreamscapeGroup from './assets/login/dreamscape-group.png'
import appleLoginIcon from './assets/login/apple.svg'
import googleLoginIcon from './assets/login/google.svg'
import kakaoLoginIcon from './assets/login/kakao.svg'
import naverLoginIcon from './assets/login/naver.svg'
import registrationCardImage from './assets/card-registration-idol-generated.png'
import mysteryCardImage from './assets/card-reveal-mystery-generated.png'
import dreamscapeCardPack from './assets/card-pack-dreamscape-generated.png'
import registrationCompleteCelebration from './assets/registration-complete-celebration-v2.png'
import fanLevelStar from './assets/fan-level-star-v2.png'

type Tab = 'home' | 'discover' | 'collection' | 'growth' | 'settings' | 'alerts' | 'events'

const cardRoutePreviewKey = 'fanfolio.card-route-preview'

function mergeProgressionsForInventory(...progressions: Array<FanProgression | null>): FanProgression | null {
  const available = progressions.filter((progression): progression is FanProgression => progression !== null)
  if (available.length === 0) return null

  const mergeById = <T extends { id: string }>(items: T[][]) => {
    const merged = new Map<string, T>()
    for (const group of items) {
      for (const item of group) merged.set(item.id, item)
    }
    return [...merged.values()]
  }

  return {
    ...available[0],
    claimableRewards: mergeById(available.map(progression => progression.claimableRewards)),
    claimedRewards: mergeById(available.map(progression => progression.claimedRewards)),
    pass: {
      ...available[0].pass,
      seasons: mergeById(available.map(progression => progression.pass.seasons)),
    },
  }
}

const fanGrowthPreviewProgression: FanProgression = {
  level: { level: 1, totalXp: 0, nextLevelXp: 100 },
  achievements: [{ id: 'preview-mission', title: '미션 1개 진행 중', description: '팬 활동을 계속해 보세요.', conditionType: 'activity', targetValue: 1, currentValue: 0, completedAt: null }],
  claimableRewards: [],
  claimedRewards: [
    { id: 'preview-grant-1', rewardId: 'preview-badge-1', type: 'badge', name: '드림스케이프 시즌 배지', metadata: { artistName: '드림스케이프', imagePreset: 'vip', description: '드림스케이프 시즌 활동을 완료한 팬에게 주는 배지예요.' }, grantedAt: '2026-08-18T10:00:00Z', claimedAt: '2026-08-18T10:00:00Z' },
    { id: 'preview-grant-2', rewardId: 'preview-frame-1', type: 'profile_frame', name: '별빛 프로필 프레임', metadata: { artistName: '드림스케이프', imagePreset: 'crystal', durationDays: 30, remainingDays: 12, description: '프로필에 별빛 프레임을 적용할 수 있어요.' }, grantedAt: '2026-08-18T10:00:00Z', claimedAt: '2026-08-18T10:00:00Z' },
    { id: 'preview-grant-3', rewardId: 'preview-ticket-1', type: 'digital_bonus', name: '랜덤 카드 뽑기권', metadata: { scope: 'global', imagePreset: 'ticket', consumable: true, quantity: 2, unit: '장', description: '전체 팬 레벨에서 받은 랜덤 카드 뽑기권이에요.' }, grantedAt: '2026-08-18T10:00:00Z', claimedAt: '2026-08-18T10:00:00Z' },
    { id: 'preview-grant-4', rewardId: 'preview-theme-1', type: 'collection_theme', name: '응원 메시지 배경', metadata: { artistName: '드림스케이프', imagePreset: 'music', description: '응원 메시지에 사용할 수 있는 영구 배경이에요.' }, grantedAt: '2026-08-18T10:00:00Z', claimedAt: '2026-08-18T10:00:00Z' },
  ],
  pass: { seasons: [{
    id: 'preview-season', title: '드림스케이프 팬 레벨', organizationId: null, artistId: 'dreamscape', status: 'active', isPaid: false, startsAt: null, endsAt: null,
    progress: { currentXp: 0, claimedTierIds: ['preview-tier-1'] },
    tiers: [
      { id: 'preview-tier-1', tier: 1, requiredXp: 0, rewardId: 'preview-badge-1', claimed: true, claimable: false, reward: { id: 'preview-badge-1', type: 'badge', name: '팬 시작 배지', metadata: {} } },
      { id: 'preview-tier-2', tier: 2, requiredXp: 100, rewardId: 'preview-badge-2', claimed: false, claimable: false, reward: { id: 'preview-badge-2', type: 'digital_bonus', name: '미공개 콘텐츠', metadata: { imagePreset: 'ticket' } } },
      { id: 'preview-tier-3', tier: 3, requiredXp: 200, rewardId: 'preview-badge-3', claimed: false, claimable: false, reward: { id: 'preview-badge-3', type: 'badge', name: '팬 전용 배지', metadata: {} } },
      { id: 'preview-tier-4', tier: 4, requiredXp: 300, rewardId: 'preview-badge-4', claimed: false, claimable: false, reward: { id: 'preview-badge-4', type: 'digital_bonus', name: '디지털 포토카드', metadata: { imagePreset: 'music' } } },
    ],
  }] },
  equipment: { titleRewardId: null, badgeRewardIds: ['preview-grant-1'], frameRewardId: null, themeRewardId: null, publicProfileEnabled: true },
}

function FanGrowthPreview() {
  const previewMode = new URLSearchParams(window.location.search).get('preview')
  const [showPass, setShowPass] = useState(() => previewMode === 'fan-pass' || previewMode === 'fan-global-pass')
  const [passScope, setPassScope] = useState<'artist' | 'global'>(() => previewMode === 'fan-global-pass' ? 'global' : 'artist')
  const [passTargetTierId, setPassTargetTierId] = useState<string | undefined>()
  if (showPass) return <FanPassPage progression={fanGrowthPreviewProgression} loading={false} error="" onRetry={() => {}} onBack={() => { setShowPass(false); setPassScope('artist'); setPassTargetTierId(undefined); window.history.pushState({}, '', '/?preview=fan-growth') }} onClaimPassTier={async () => ({})} onNavigate={tab => window.location.assign(pathForTab(tab))} initialTierId={passTargetTierId} isGlobal={passScope === 'global'} />
  const onViewPass = (tierId?: string) => { setPassTargetTierId(tierId); setShowPass(true); window.history.pushState({}, '', '/?preview=fan-pass') }
  const onViewGlobalPass = (tierId?: string) => { setPassScope('global'); setPassTargetTierId(tierId); setShowPass(true); window.history.pushState({}, '', '/?preview=fan-global-pass') }
  const artistScopes = [{ id: 'dreamscape', name: '드림스케이프', imageUrl: loginDreamscapeGroup }]
  const previewCallbacks = {
    onRetry: () => {},
    onClaim: async () => ({ id: 'preview', rewardId: 'preview', type: 'badge' as const, name: '미리보기', grantedAt: null, claimedAt: null }),
    onClaimPassTier: async () => ({ seasonId: 'preview-season', tierId: 'preview-tier-1', claimedAt: null, rewardGrant: null }),
    onEquip: async () => {},
  }
  return <main className="app-shell growth-shell">
    <div className="app-header">
      <div className="app-header-copy"><span className="eyebrow">FANFOLIO</span><h1>팬 레벨</h1><p className="app-header-description">팬 활동을 통해 레벨을 올리고 특별한 혜택을 받아보세요!</p></div>
      <div className="header-actions"><button className="header-alert-button" aria-label="알림"><NavIcon name="alerts" /></button><button className="header-profile-button" aria-label="프로필 및 설정"><ProfileAvatar imageUrl={null} fallback="테" alt="프로필 이미지" /></button></div>
    </div>
    <section className="screen"><FanGrowth progression={fanGrowthPreviewProgression} globalProgression={{ ...fanGrowthPreviewProgression, level: { level: 2, totalXp: 120, nextLevelXp: 300 }, pass: { ...fanGrowthPreviewProgression.pass, seasons: fanGrowthPreviewProgression.pass.seasons.map(season => ({ ...season, id: 'preview-global-season', title: '전체 팬 레벨', artistId: null })) } }} artistScopes={artistScopes} selectedArtistId="dreamscape" onArtistChange={() => {}} loading={false} error="" mode="full" {...previewCallbacks} onViewPass={onViewPass} onViewGlobalPass={onViewGlobalPass} fanGrowthMode="full" /></section>
    <div className="bottom-nav" aria-label="주요 메뉴">{[
      ['탐색', 'discover'], ['보관함', 'collection'], ['홈', 'home'], ['팬 레벨', 'growth'], ['마이', 'settings'],
    ].map(([label, icon]) => <button key={label} type="button" className={`nav-item ${label === '팬 레벨' ? 'active' : ''}`}><NavIcon name={icon as 'discover' | 'collection' | 'home' | 'growth' | 'settings'} /><span>{label}</span></button>)}</div>
  </main>
}

const qaRevealDesignConfig = {
  version: 3,
  front: {
    material: 'pearl',
    foilPattern: 'prism',
    foilCoverage: 'full',
    interaction: 'tilt',
    intensity: 0.72,
    angle: 135,
  },
  back: {
    material: 'matte',
    edgeFoil: 'silver',
    spotUv: 'serial',
    hiddenMessage: '드림스케이프 공식 컬렉션 카드',
  },
} satisfies CardDesignConfig

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
    id: card.cardId,
    userCardId: card.userCardId,
    title: card.name,
    artist: card.artistName ?? 'Fanfolio 아티스트',
    member: card.memberName ?? '공식 카드',
    image: demoCardImage(resolveApiUrl(card.imageUrl), `member:${card.memberName ?? card.memberId ?? card.userCardId}`),
    rarity: card.rarity ?? undefined,
    seasonName: card.seasonName ?? undefined,
    cardType: card.cardType ?? undefined,
    acquisitionSource: card.acquisitionSource ?? undefined,
    acquiredAt: card.acquiredAt,
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
    photo: '포토카드',
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
  const [showFanPassPage, setShowFanPassPage] = useState(() => window.location.pathname === '/growth/pass' || window.location.pathname === '/growth/global-pass')
  const [showRewardInventory, setShowRewardInventory] = useState(() => window.location.pathname === '/collection/rewards')
  const [showCardCollection, setShowCardCollection] = useState(() => window.location.pathname === '/collection/cards')
  const [passScope, setPassScope] = useState<'artist' | 'global'>(() => window.location.pathname === '/growth/global-pass' ? 'global' : 'artist')
  const [passTargetTierId, setPassTargetTierId] = useState<string | undefined>()
  const [signedIn, setSignedIn] = useState(false)
  const [sessionChecking, setSessionChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [catalogArtists, setCatalogArtists] = useState<CatalogArtist[]>([])
  const [growthArtistId, setGrowthArtistId] = useState<string | null>(null)
  const [collectionCards, setCollectionCards] = useState<Card[]>([])
  const [collectionDataReady, setCollectionDataReady] = useState(false)
  // The MVP contract defines a nine-card collection. Keep the loading
  // fallback aligned with the API so the first paint does not briefly show
  // an incorrect “0 / 80” state while the request is in flight.
  const [collectionSummary, setCollectionSummary] = useState<CollectionSummary>({ ownedCount: 0, totalSlots: 9, completionRate: 0 })
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionError, setCollectionError] = useState('')
  const [collectionBenefits, setCollectionBenefits] = useState<CollectionBenefit[]>([])
  const [fanProgression, setFanProgression] = useState<FanProgression | null>(null)
  const [globalFanProgression, setGlobalFanProgression] = useState<FanProgression | null>(null)
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
  const [fanEventPage, setFanEventPage] = useState(1)
  const [fanEventPagination, setFanEventPagination] = useState<EventPagination>({ page: 1, pageSize: 12, total: 0, totalPages: 1 })
  const [selectedEvent, setSelectedEvent] = useState<FanEvent | null>(null)
  const [eventDetailLoading, setEventDetailLoading] = useState(false)
  const [eventComments, setEventComments] = useState<FanEventComment[]>([])
  const [eventCommentsLoading, setEventCommentsLoading] = useState(false)
  const [eventCommentSubmitting, setEventCommentSubmitting] = useState(false)
  const [showApplicationComplete, setShowApplicationComplete] = useState(false)
  const [showMyApplications, setShowMyApplications] = useState(false)
  const [myApplications, setMyApplications] = useState<FanEventApplication[]>([])
  const [myApplicationsLoading, setMyApplicationsLoading] = useState(false)
  const [myApplicationsError, setMyApplicationsError] = useState('')
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const alertsReturnPathRef = useRef<string | null>(null)
  const cardReturnPathRef = useRef<string | null>(null)
  const savedCardsOwnerRef = useRef<string | null>(null)
  const savedCardIds = savedCards.map(card => card.userCardId ?? card.id)

  useEffect(() => {
    const favoriteArtistIds = currentUser?.favoriteArtistIds ?? []
    setGrowthArtistId(current => current && favoriteArtistIds.includes(current) ? current : favoriteArtistIds[0] ?? null)
  }, [currentUser?.favoriteArtistIds])

  useEffect(() => {
    if (!signedIn) return
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => setCatalogArtists(result.data.items))
      .catch(() => setCatalogArtists([]))
  }, [signedIn])

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
        : showCardCollection
          ? 'Fanfolio · 카드 컬렉션'
        : showRewardInventory
          ? 'Fanfolio · 패스 보상'
        : showRedeem
          ? 'Fanfolio · 카드 등록'
          : revealedCardId
            ? 'Fanfolio · 카드 공개'
        : `Fanfolio · ${tabTitle(tab)}`
  }, [revealedCardId, sessionChecking, showCardCollection, showOnboarding, showRedeem, showRewardInventory, signedIn, tab])

  const navigateTab = (nextTab: Tab) => {
    setTab(nextTab)
    setSelectedCard(null)
    setShowRedeem(false)
    setShowFanPassPage(false)
    setShowRewardInventory(false)
    setShowCardCollection(false)
    setRevealedCardId(null)
    setEventId(null)
    const nextPath = pathForTab(nextTab)
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const openAlerts = () => {
    const currentPath = window.location.pathname
    if (currentPath !== '/notifications') alertsReturnPathRef.current = currentPath
    navigateTab('alerts')
  }

  const closeAlerts = () => {
    const returnPath = alertsReturnPathRef.current
    alertsReturnPathRef.current = null
    if (!returnPath || returnPath === '/notifications') {
      navigateTab('home')
      return
    }
    window.history.pushState({}, '', returnPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const openEvents = () => {
    setShowMyApplications(false)
    setTab('events')
    setEventId(null)
    setSelectedEvent(null)
    window.history.pushState({}, '', '/events')
  }

  const openMyApplications = () => {
    setShowMyApplications(true)
    setShowApplicationComplete(false)
    setMyApplicationsLoading(true)
    setMyApplicationsError('')
    void getMyEventApplications()
      .then(result => setMyApplications(result.data.items))
      .catch(error => {
        if (error instanceof ApiError && error.status === 401) clearLocalSession()
        else setMyApplicationsError('신청 내역을 불러오지 못했어요.')
      })
      .finally(() => setMyApplicationsLoading(false))
  }

  const openEvent = (event: FanEvent) => {
    setTab('events')
    setSelectedEvent(event)
    setEventId(event.id)
    window.history.pushState({}, '', `/events/${encodeURIComponent(event.id)}`)
  }

  const handleEventApply = async () => {
    if (!selectedEvent) return
    setFanEventsError('')
    try {
      await applyToFanEvent(selectedEvent.id)
      const refreshed = await getFanEvent(selectedEvent.id)
      setSelectedEvent(refreshed.data)
      setShowApplicationComplete(true)
      window.dispatchEvent(new Event('fanfolio:refresh-notifications'))
      void getFanEvents({ status: fanEventStatus, page: fanEventPage })
        .then(result => { setFanEvents(result.data.items); setFanEventPagination(result.data.pagination) })
        .catch(() => undefined)
    } catch (error) {
      setFanEventsError(error instanceof ApiError ? error.message : '이벤트 신청에 실패했어요.')
    }
  }

  const loadEventComments = async () => {
    if (!selectedEvent || selectedEvent.eventType !== 'comment') return
    setEventCommentsLoading(true)
    try {
      const result = await getFanEventComments(selectedEvent.id)
      setEventComments(result.data.items)
    } catch {
      setFanEventsError('댓글을 불러오지 못했어요.')
    } finally {
      setEventCommentsLoading(false)
    }
  }

  const handleEventComment = async (body: string) => {
    if (!selectedEvent) return
    setEventCommentSubmitting(true)
    try {
      await postFanEventComment(selectedEvent.id, body)
      await loadEventComments()
    } catch (error) {
      setFanEventsError(error instanceof ApiError ? error.message : '댓글 등록에 실패했어요.')
    } finally {
      setEventCommentSubmitting(false)
    }
  }

  const handleFanEventStatusChange = (status: 'all' | FanEventStatus) => {
    setFanEventStatus(status)
    setFanEventPage(1)
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
    cardReturnPathRef.current = window.location.pathname
    if (window.location.pathname === '/collection/cards') setShowCardCollection(false)
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
    const returnPath = cardReturnPathRef.current ?? pathForTab(tab)
    if (window.location.pathname.startsWith('/cards/')) window.history.replaceState({}, '', returnPath)
    if (returnPath === '/collection/cards') setShowCardCollection(true)
    cardReturnPathRef.current = null
  }

  const openFanPassPage = (tierId?: string, scope: 'artist' | 'global' = 'artist') => {
    setPassScope(scope)
    setPassTargetTierId(tierId)
    setShowFanPassPage(true)
    window.history.pushState({}, '', scope === 'global' ? '/growth/global-pass' : '/growth/pass')
  }

  const closeFanPassPage = () => {
    setShowFanPassPage(false)
    setPassScope('artist')
    setPassTargetTierId(undefined)
    window.history.replaceState({}, '', '/growth')
    setTab('growth')
  }

  const openRewardInventory = () => {
    setTab('collection')
    setShowRewardInventory(true)
    window.history.pushState({}, '', '/collection/rewards')
  }

  const closeRewardInventory = () => {
    setShowRewardInventory(false)
    window.history.replaceState({}, '', '/collection')
    setTab('collection')
  }

  const openCardCollection = () => {
    setTab('collection')
    setShowCardCollection(true)
    window.history.pushState({}, '', '/collection/cards')
  }

  const closeCardCollection = () => {
    setShowCardCollection(false)
    window.history.replaceState({}, '', '/collection')
    setTab('collection')
  }

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname
      setTab(tabFromPath(path))
      setEventId(eventIdFromPath(path))
      setShowRedeem(path === '/redeem')
      setShowFanPassPage(path === '/growth/pass' || path === '/growth/global-pass')
      setShowRewardInventory(path === '/collection/rewards')
      setShowCardCollection(path === '/collection/cards')
      setPassScope(path === '/growth/global-pass' ? 'global' : 'artist')
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
    void getFanEvents({ status: fanEventStatus, page: fanEventPage }).then(result => { setFanEvents(result.data.items); setFanEventPagination(result.data.pagination) }).catch(() => setFanEventsError('이벤트를 불러오지 못했어요.')).finally(() => setFanEventsLoading(false))
  }, [eventId, fanEventPage, fanEventStatus, signedIn, tab])

  useEffect(() => {
    if (!signedIn || tab !== 'events' || !eventId) return
    setEventComments([])
    setEventDetailLoading(true)
    void getFanEvent(eventId)
      .then(result => {
        setSelectedEvent(result.data)
        if (result.data.eventType === 'comment') {
          setEventCommentsLoading(true)
          void getFanEventComments(result.data.id).then(comments => setEventComments(comments.data.items)).catch(() => undefined).finally(() => setEventCommentsLoading(false))
        }
      })
      .catch(() => setSelectedEvent(null))
      .finally(() => setEventDetailLoading(false))
  }, [eventId, fanEvents, signedIn, tab])

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
    setShowRewardInventory(false)
    setRevealedCardId(null)
    setCollectionCards([])
    setCollectionDataReady(false)
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
      setCollectionDataReady(true)
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
      const [progression, pass, globalProgression] = await Promise.all([
        getProgression(growthArtistId),
        getFanPass(growthArtistId),
        growthArtistId ? getProgression(null) : Promise.resolve(null),
      ])
      setFanProgression({
        ...progression.data,
        pass: pass.data,
      })
      setGlobalFanProgression(globalProgression?.data ?? (growthArtistId ? null : { ...progression.data, pass: pass.data }))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearLocalSession()
      else setGrowthError('성장 정보를 불러오지 못했어요.')
    } finally {
      setGrowthLoading(false)
    }
  }, [clearLocalSession, growthArtistId])

  const handleCardPackOpened = async (userCardId: string) => {
    await Promise.allSettled([refreshCollection(), refreshGrowth()])
    openReveal(userCardId)
  }

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
    if (!signedIn || new URLSearchParams(window.location.search).get('repair') !== 'pass-rewards') return
    void reconcilePassRewards()
      .then(() => {
        const url = new URL(window.location.href)
        url.searchParams.delete('repair')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        void refreshGrowth()
      })
      .catch(() => {})
  }, [refreshGrowth, signedIn])

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
    const streamController = new AbortController()
    void connectNotificationStream(item => {
      setNotifications(items => {
        if (items.some(existing => existing.id === item.id)) return items
        setUnreadCount(count => count + 1)
        return [item, ...items]
      })
    }, streamController.signal).catch(() => {
      // The 30-second polling loop remains the source of truth if streaming is unavailable.
    })
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('fanfolio:refresh-notifications', retryHandler); streamController.abort() }
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
    const rewardGrant = result.data.rewardGrant
    if (rewardGrant && !rewardGrant.claimedAt) await claimReward(rewardGrant.id)
    await refreshGrowth()
    window.dispatchEvent(new Event('fanfolio:refresh-notifications'))
    return result.data
  }

  const saveGrowthEquipment = async (equipment: ProfileEquipment) => {
    const result = await updateProfileEquipment(equipment)
    setFanProgression(current => current ? { ...current, equipment: result.data } : current)
  }

  if (sessionChecking) {
    return <SessionLoading />
  }

  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get('preview')
    if (preview === 'fan-pass' || preview === 'fan-global-pass') return <FanPassPage progression={fanGrowthPreviewProgression} loading={false} error="" onRetry={() => {}} onBack={() => { window.history.pushState({}, '', '/?preview=fan-growth'); window.dispatchEvent(new PopStateEvent('popstate')) }} onClaimPassTier={async () => ({})} onNavigate={tab => window.location.assign(pathForTab(tab))} isGlobal={preview === 'fan-global-pass'} />
    if (preview === 'fan-growth') return <FanGrowthPreview />
    if (preview === 'reward-inventory') return <RewardInventoryPreview />
    if (preview === 'card-collection') return <CardCollectionRepository onBack={() => window.location.assign('/?preview=collection-inventory-entry')} onNavigate={tab => window.location.assign(pathForTab(tab))} />
    if (preview === 'collection-inventory-entry') return <main className="app-shell collection-shell"><header className={'app-header'}><div className="app-header-copy"><span className="eyebrow">FANFOLIO</span><h1>보관함</h1><p className="app-header-description">내가 수집한 모든 카드와 컬렉션을 관리해요.</p></div><div className="header-actions"><button className="header-alert-button" aria-label="알림"><NavIcon name="alerts" /></button><button className="header-profile-button" aria-label="프로필 및 설정"><ProfileAvatar imageUrl={null} fallback="테" alt="프로필 이미지" /></button></div></header><section className="screen"><Collection cards={fallbackCollectionCards} collectionDataReady summary={{ ownedCount: 5, totalSlots: 9, completionRate: 56 }} benefits={[]} rewards={fanGrowthPreviewProgression.claimedRewards} loading={false} onSelect={() => {}} onRedeem={() => {}} onDiscover={() => {}} onRewards={() => window.location.assign('/?preview=reward-inventory')} onCards={() => window.location.assign('/?preview=card-collection')} onClaim={async () => {}} /></section><BottomNavigation active="collection" onNavigate={() => {}} /></main>
  }

  if (!signedIn) {
    return <Login onLogin={completeLogin} />
  }

  const inventoryProgression = mergeProgressionsForInventory(fanProgression, globalFanProgression)

  if (showOnboarding) {
    return <Onboarding userId={currentUser?.id ?? 'fan'} profileImageUrl={currentUser?.profileImageUrl ?? null} onComplete={() => { setShowOnboarding(false); void refreshUser(); void Promise.allSettled([refreshCollection(), refreshGrowth()]) }} onBack={logout} />
  }

  if (showFanPassPage) {
    return <FanPassPage progression={passScope === 'global' ? globalFanProgression : fanProgression} loading={growthLoading} error={growthError} onRetry={refreshGrowth} onBack={closeFanPassPage} onClaimPassTier={claimGrowthPassTier} onNavigate={navigateTab} initialTierId={passTargetTierId} isGlobal={passScope === 'global'} />
  }

  if (showRewardInventory) {
    return <RewardInventory progression={inventoryProgression} loading={growthLoading} error={growthError} onRetry={refreshGrowth} onBack={closeRewardInventory} onEquip={saveGrowthEquipment} onNavigate={navigateTab} />
  }

  if (showCardCollection) {
    return <CardCollectionRepository onBack={closeCardCollection} onNavigate={navigateTab} onOpenCard={handleCardPackOpened} />
  }

  if (revealedCardId) {
    return <RevealCard
      userCardId={revealedCardId}
      collectionSummary={collectionSummary}
      fanProgression={fanProgression}
      onClose={closeReveal}
      onViewCollection={() => { closeReveal(); navigateTab('collection') }}
      onRegisterAnother={() => { closeReveal(); openRedeem() }}
      onStart={() => { closeReveal(); navigateTab('home') }}
    />
  }

  if (showApplicationComplete) {
    return <EventApplicationComplete event={selectedEvent} onBack={() => setShowApplicationComplete(false)} onEvents={() => { setShowApplicationComplete(false); openEvents() }} onApplications={openMyApplications} />
  }

  if (showMyApplications) {
    return <MyEventApplications items={myApplications} loading={myApplicationsLoading} error={myApplicationsError} onBack={() => { setShowMyApplications(false); navigateTab('settings') }} onEvents={() => { setShowMyApplications(false); openEvents() }} onRetry={openMyApplications} onOpen={async eventId => { try { const result = await getFanEvent(eventId); setShowMyApplications(false); openEvent(result.data) } catch { setMyApplicationsError('이벤트 상세를 불러오지 못했어요.') } }} />
  }

  if (showNotificationSettings) {
    return <NotificationSettings onBack={() => setShowNotificationSettings(false)} />
  }

  // Card routes are full-screen destinations. Keep the detail view outside
  // the collection shell so `/cards/:id` is not rendered as a backdrop dialog.
  if (selectedCard) {
    return <CardDetail card={selectedCard} isSaved={savedCardIds.includes(selectedCard.userCardId ?? selectedCard.id)} onClose={closeCard} onToggleSaved={() => { const id = selectedCard.userCardId ?? selectedCard.id; setSavedCards(cards => cards.some(item => (item.userCardId ?? item.id) === id) ? cards.filter(item => (item.userCardId ?? item.id) !== id) : [...cards, selectedCard]) }} onRedeem={() => { closeCard(); openRedeem() }} imageFor={demoCardImage} onImageError={keepCardVisual} cardTypeLabel={cardTypeLabel} />
  }

  return (
    <main className={`app-shell ${tab}-shell ${tab === 'events' && eventId ? 'event-detail-shell' : ''} ${tab === 'collection' && collectionCards.length === 0 ? 'empty-collection-shell' : ''} ${tab === 'home' && collectionCards.length === 0 ? 'empty-home-shell' : ''}`}>
      <header className="app-header">
        <div className="app-header-copy"><span className="eyebrow">FANFOLIO</span>{tab !== 'home' && <><h1>{tabTitle(tab)}</h1>{tabDescription(tab) && <p className="app-header-description">{tabDescription(tab)}</p>}</>}</div>
        <div className="header-actions">
          <button className="header-alert-button" onClick={openAlerts} aria-label="알림">
            <NavIcon name="alerts" />{unreadCount > 0 && <b className="header-alert-badge">{unreadCount > 99 ? '99+' : unreadCount}</b>}
          </button>
          <button className="header-profile-button" onClick={() => navigateTab('settings')} aria-label="프로필 및 설정">
            <ProfileAvatar imageUrl={resolveApiUrl(currentUser?.profileImageUrl)} fallback={currentUser?.nickname ?? '팬'} alt="프로필 이미지" />
          </button>
        </div>
      </header>

      <section className="screen">
        {collectionError && <div className="service-notice" role="alert"><span>{collectionError}</span><button onClick={() => void refreshCollection()} disabled={collectionLoading}>{collectionLoading ? '확인 중...' : '다시 시도'}</button></div>}
        {tab === 'home' && <Home nickname={currentUser?.nickname ?? '팬'} cards={collectionCards} collectionDataReady={collectionDataReady} savedCards={savedCards} summary={collectionSummary} loading={collectionLoading} eventHome={fanHome} onSelect={openCard} onDiscover={() => navigateTab('discover')} onCollection={() => navigateTab('collection')} onRedeem={openRedeem} onEvents={openEvents} onEvent={openEvent} />}
        {tab === 'events' && (eventId ? <EventDetail event={selectedEvent} loading={eventDetailLoading} onBack={openEvents} onApply={handleEventApply} comments={eventComments} commentsLoading={eventCommentsLoading} commentSubmitting={eventCommentSubmitting} onLoadComments={loadEventComments} onSubmitComment={handleEventComment} onOpenTarget={target => { if (target.startsWith('/events/')) { const id = decodeURIComponent(target.split('/')[1]?.split('#')[0] ?? ''); const item = fanEvents.find(event => event.id === id); if (item) openEvent(item) } else if (target.startsWith('https://')) window.open(target, '_blank', 'noopener,noreferrer') }} /> : <EventList events={fanEvents} status={fanEventStatus} loading={fanEventsLoading} error={fanEventsError} pagination={fanEventPagination} onStatusChange={handleFanEventStatusChange} onPageChange={setFanEventPage} onOpen={openEvent} />)}
        {tab === 'collection' && <Collection cards={collectionCards} collectionDataReady={collectionDataReady} summary={collectionSummary} benefits={collectionBenefits} rewards={inventoryProgression?.claimedRewards ?? []} loading={collectionLoading} onSelect={openCard} onRedeem={openRedeem} onDiscover={() => navigateTab('discover')} onRewards={openRewardInventory} onCards={openCardCollection} onClaim={claimBenefit} />}
        {tab === 'discover' && <Discover />}
        {tab === 'alerts' && <Alerts items={notifications} error={notificationError} actionError={notificationActionError} onDismissActionError={() => setNotificationActionError('')} onRetry={() => window.dispatchEvent(new Event('fanfolio:refresh-notifications'))} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} onBack={closeAlerts} onNavigate={navigateTab} />}
        {/* Embedded surfaces stay compact; the dedicated tab uses the full progression view. */}
        {tab === 'growth' && <FanGrowth progression={fanProgression} globalProgression={globalFanProgression} artistScopes={catalogArtists.filter(artist => currentUser?.favoriteArtistIds.includes(artist.id)).map(artist => ({ id: artist.id, name: artist.name, imageUrl: artist.name === '드림스케이프' ? loginDreamscapeGroup : artist.imageUrl }))} selectedArtistId={growthArtistId} onArtistChange={setGrowthArtistId} loading={growthLoading} error={growthError} mode="full" onRetry={refreshGrowth} onClaim={claimGrowthReward} onClaimPassTier={claimGrowthPassTier} onEquip={saveGrowthEquipment} onViewPass={openFanPassPage} onViewGlobalPass={(tierId) => openFanPassPage(tierId, 'global')} fanGrowthMode="full" />}
        {tab === 'settings' && currentUser && <Settings user={currentUser} progression={fanProgression} onUserUpdated={setCurrentUser} onLogout={logout} onEvents={openMyApplications} onNotificationSettings={() => setShowNotificationSettings(true)} />}
      </section>

      <BottomNavigation active={tab} onNavigate={navigateTab} />

      {showRedeem && <QrRedeemModal onClose={closeRedeem} onRedeemed={(id) => { closeRedeem(); openReveal(id); void Promise.allSettled([refreshCollection(), refreshGrowth()]) }} />}
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
  if (pathname === '/collection/rewards') return 'collection'
  if (pathname === '/collection/cards') return 'collection'
  if (pathname === '/growth') return 'growth'
  if (pathname === '/growth/pass' || pathname === '/growth/global-pass') return 'growth'
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
  const [selectedProfileImage, setSelectedProfileImage] = useState(profileImageUrl)
  const profileImageInputRef = useRef<HTMLInputElement>(null)
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
    if (group && !member) { setMessage('멤버를 선택해 주세요.'); return }
    if (!nickname.trim()) { setMessage('닉네임을 입력해 주세요.'); return }
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/me/profile', { method: 'PATCH', body: JSON.stringify({ nickname: nickname.trim(), favoriteArtistIds: group ? [group] : [], favoriteMemberIds: member ? [member] : [], profileImageUrl: selectedProfileImage }) })
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
  const skipArtist = () => {
    setGroup('')
    setMember('')
    setMessage('')
    setStep(3)
  }
  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage('PNG, JPG, WEBP 이미지만 등록할 수 있어요.')
      return
    }
    if (file.size > 1_500_000) {
      setMessage('프로필 이미지는 1.5MB 이하로 등록해 주세요.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedProfileImage(reader.result)
        setMessage('프로필 이미지를 선택했어요. 아래 버튼을 눌러 저장해 주세요.')
      }
    }
    reader.onerror = () => setMessage('프로필 이미지를 읽지 못했어요.')
    reader.readAsDataURL(file)
  }
  const filteredArtists = artists.filter(artist => artist.name.toLowerCase().includes(artistQuery.trim().toLowerCase()))
  const selectedArtist = artists.find(artist => artist.id === group)
  const selectedMember = members.find(item => item.id === member)
  return <main className="onboarding-screen">
    <div className="onboarding-top"><button type="button" className="back-button" onClick={() => void goBack()} disabled={backBusy || busy} aria-label={step > 1 ? '이전 단계로 돌아가기' : '로그인으로 돌아가기'}>{backBusy ? '…' : <InlineIcon name="back" />}</button><b>최초 설정</b><small>{step} / 3</small></div>
    <div className="onboarding-progress-segments" role="progressbar" aria-label="최초 설정 진행률" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>{Array.from({ length: 3 }, (_, index) => <span key={index} className={index < step ? 'is-complete' : ''} aria-current={index + 1 === step ? 'step' : undefined} />)}</div>
    {draftRestored && <p className="onboarding-draft-notice" role="status">이전에 진행하던 설정을 복원했어요.</p>}
    {step === 1 && <section className="onboarding-step onboarding-artist-step">
      <header className="onboarding-step-copy"><span>STEP 1</span><h1>좋아하는 아티스트를<br />선택해 주세요</h1><p>선택한 아티스트를 중심으로 새로운 카드와 이벤트를 추천해 드릴게요.</p></header>
      <div className="artist-search-wrap"><InlineIcon name="search" /><input id="artist-search" value={artistQuery} onChange={e => setArtistQuery(e.target.value)} placeholder="아티스트 이름을 검색해 보세요" aria-label="아티스트 검색" disabled={artistLoading} /></div>
      {artistLoading && <div className="catalog-loading" role="status">아티스트를 불러오는 중이에요…</div>}
      {!artistLoading && <div className="artist-grid">{filteredArtists.map(artist => <button type="button" aria-pressed={group === artist.id} className={group === artist.id ? 'artist-choice selected' : 'artist-choice'} key={artist.id} onClick={() => setGroup(artist.id)}><span className="choice-visual"><img src={demoCardImage(resolveApiUrl(artist.imageUrl), `artist:${artist.id}`)} alt="" onError={event => keepCardVisual(event, `artist:${artist.id}`)} />{group === artist.id && <span className="choice-check" aria-hidden="true"><InlineIcon name="check" /></span>}</span><span className="choice-copy"><b>{artist.name}</b><small>공식 아티스트</small></span></button>)}</div>}
      {artistError && <div className="inline-retry" role="alert"><span>아티스트 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setArtistAttempt(value => value + 1)}>다시 시도</button></div>}
      {!artistLoading && filteredArtists.length === 0 && !artistError && <p className="muted empty-search">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>}
      <div className="onboarding-action"><button type="button" className="primary" onClick={next} disabled={artistLoading || !group}>다음: 멤버 선택 <InlineIcon name="chevron" /></button><button type="button" className="onboarding-skip" onClick={skipArtist}>관심 아티스트 없이 시작하기</button></div>
    </section>}
    {step === 2 && <section className="onboarding-step onboarding-member-step">
      <header className="onboarding-step-copy"><span>STEP 2</span><h1>{selectedArtist?.name ?? '아티스트'}의<br />최애 멤버를 선택해 주세요</h1><p>가장 좋아하는 멤버의 카드와 새로운 소식을 먼저 만나보세요.</p></header>
      {selectedArtist && <div className="selected-artist-summary"><img src={demoCardImage(resolveApiUrl(selectedArtist.imageUrl), `artist:${selectedArtist.id}`)} alt="" onError={event => keepCardVisual(event, `artist:${selectedArtist.id}`)} /><div><small>선택한 아티스트</small><b>{selectedArtist.name}</b></div><span><InlineIcon name="check" /> 선택 완료</span></div>}
      {memberLoading && <div className="catalog-loading" role="status">멤버를 불러오는 중이에요…</div>}
      {!memberLoading && <div className="member-grid">{members.map(item => <button type="button" aria-pressed={member === item.id} className={member === item.id ? 'member-card selected' : 'member-card'} key={item.id} onClick={() => setMember(item.id)}><span className="choice-visual"><img src={demoMemberImage(item.id)} alt="" onError={event => keepCardVisual(event, `member:${item.id}`)} />{member === item.id && <span className="choice-check" aria-hidden="true"><InlineIcon name="check" /></span>}</span><span className="choice-copy"><b>{item.name}</b><small>{selectedArtist?.name ?? '아티스트'} 멤버</small></span></button>)}</div>}
      {memberError && <div className="inline-retry" role="alert"><span>멤버 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setMemberAttempt(value => value + 1)}>다시 시도</button></div>}
      <div className="onboarding-action"><button type="button" className="primary" onClick={next} disabled={memberLoading || !member}>다음: 닉네임 설정 <InlineIcon name="chevron" /></button></div>
    </section>}
    {step === 3 && <section className="onboarding-step onboarding-profile-step">
      <header className="onboarding-step-copy"><span>STEP 3</span><h1>팬폴리오에서 사용할<br />닉네임을 정해 주세요</h1><p>나만의 팬 컬렉션에 표시될 프로필을 완성해 주세요.</p></header>
      <div className="nickname-preview" aria-live="polite"><div className="profile-photo"><ProfileAvatar imageUrl={resolveApiUrl(selectedProfileImage)} fallback={nickname || '팬'} alt="내 프로필 이미지" /><button type="button" className="profile-photo-edit" aria-label="프로필 이미지 변경" onClick={() => profileImageInputRef.current?.click()}><InlineIcon name="camera" /></button><input ref={profileImageInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="프로필 이미지 파일" onChange={handleProfileImageChange} /></div><div><span>컬렉션 프로필</span><b>{nickname.trim() || '나의 팬 닉네임'}</b><small>{selectedArtist?.name ? `${selectedArtist.name} · ${selectedMember?.name ?? '선택한 멤버'}` : '전체 아티스트 팬으로 시작'}</small></div></div>
      <div className="nickname-field-card"><div className="nickname-field-heading"><div><label className="field-label" htmlFor="onboarding-nickname">닉네임</label><p>컬렉션에서 사용할 이름을 정해 주세요.</p></div><span className="nickname-field-icon" aria-hidden="true"><InlineIcon name="users" /></span></div><div className="nickname-input-wrap"><input id="onboarding-nickname" className="nickname-input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="예: 유나의 작은 우주" maxLength={40} aria-describedby="nickname-help" /><small>{nickname.length}/40</small></div><p id="nickname-help" className="field-help">나중에 마이 페이지에서 언제든 바꿀 수 있어요.</p></div>
      <div className="onboarding-action"><button type="button" className="primary" onClick={() => void save()} disabled={!nickname.trim() || busy || backBusy}>{busy ? '저장 중...' : <>나만의 컬렉션 시작하기 <InlineIcon name="chevron" /></>}</button></div>
    </section>}
    {message && !artistError && !memberError && <p className="form-message error-message" role="alert">{message}</p>}
  </main>
}

type HomeProps = { nickname: string, cards: Card[], collectionDataReady: boolean, savedCards: Card[], summary: CollectionSummary, loading: boolean, eventHome: FanHomeResponse | null, onSelect: (card: Card) => void, onDiscover: () => void, onCollection: () => void, onRedeem: () => void, onEvents: () => void, onEvent: (event: FanEvent) => void }

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
  noticeItems: [],
  relatedCards: [],
}

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

type CardCollectionSlot = {
  number: number
  sourcePrefix?: string
  rarity: 'UR' | 'SR' | 'R' | 'N'
  copies: number
  card?: Card
}

type CardCollectionPack = {
  id: string
  name: string
  prefix: string
  owned: number
  total: number
  slots: CardCollectionSlot[]
}

type CardCollectionGroup = {
  id: string
  displayName: string
  owned: number
  total: number
  packs: CardCollectionPack[]
}

type CardCollectionDetailItem = {
  card: Card
  code: string
  rarity: CardCollectionSlot['rarity']
  copies: number
  packName: string
  groupName: string
  artistMessage?: string
  acquiredAt?: string
  cardType?: string
  acquisitionSource?: string
  futureBenefitPreview?: string
}

const collectionPortraits = [collectionCardHarinGenerated, collectionCardDoyunGenerated, collectionCardMinjaeGenerated, collectionCardJayGenerated]
const collectionMembers = ['하린', '도윤', '민재', '제이']
const collectionArtistMessages: Record<string, string> = {
  하린: '우리의 첫 번째 꿈을 함께 기억해 줘서 고마워요.',
  도윤: '이 카드를 볼 때마다 오늘의 무대를 떠올려 주세요.',
  민재: '늘 같은 자리에서 응원해 주는 마음, 잊지 않을게요.',
  제이: '다음 장면에서도 우리 함께 반짝여요.',
}

function formatCardCopies(copies: number) {
  return copies > 99 ? '99+' : String(Math.max(0, copies))
}

function makeCollectionPack(id: string, name: string, prefix: string, owned: number, total: number, offset = 0): CardCollectionPack {
  return {
    id,
    name,
    prefix,
    owned,
    total,
    slots: Array.from({ length: 16 }, (_, index) => {
      const number = index + 1
      const acquired = number <= owned + (id === 'nebula' ? 1 : 0)
      const memberIndex = (index + offset) % collectionMembers.length
      const rarity = number <= 2 ? 'UR' : number <= 5 ? 'SR' : number <= 8 ? 'R' : 'N'
      return {
        number,
        rarity,
        copies: acquired ? [1, 1, 12, 1, 1, 128, 2, 1, 1, 2, 1][index] ?? 1 : 0,
        card: acquired ? {
          id: `collection-${id}-${number}`,
          title: name,
          artist: '드림스케이프',
          member: collectionMembers[memberIndex],
          image: collectionPortraits[memberIndex],
        } : undefined,
      }
    }),
  }
}

const cardCollectionGroups: CardCollectionGroup[] = [
  {
    id: 'dreamscape-first-album',
    displayName: '정규 1집 · DREAMSCAPE',
    owned: 28,
    total: 40,
    packs: [
      makeCollectionPack('nebula', 'Nebula Ver.', 'N', 10, 14),
      makeCollectionPack('starlight', 'Starlight Ver.', 'S', 8, 12, 1),
      makeCollectionPack('midnight', 'Midnight Ver.', 'M', 10, 14, 2),
    ],
  },
  {
    id: 'dreamscape-anniversary',
    displayName: '데뷔 3주년 · STARLIGHT',
    owned: 11,
    total: 24,
    packs: [
      makeCollectionPack('anniversary-day', 'Daylight Ver.', 'D', 6, 12, 1),
      makeCollectionPack('anniversary-night', 'Nightfall Ver.', 'F', 5, 12, 3),
    ],
  },
]

function buildRemoteCardCollectionGroups(packs: CardPack[], ownedCards: CollectionCard[]): CardCollectionGroup[] {
  const ownedByCard = new Map<string, CollectionCard[]>()
  for (const card of ownedCards) {
    const list = ownedByCard.get(card.cardId) ?? []
    list.push(card)
    ownedByCard.set(card.cardId, list)
  }
  const grouped = new Map<string, CardCollectionGroup>()
  for (const pack of packs) {
    const groupId = `${pack.artistId}:${pack.seasonName ?? 'default'}`
    const group = grouped.get(groupId) ?? { id: groupId, displayName: pack.seasonName ?? pack.name, owned: 0, total: 0, packs: [] }
    const prefix = pack.name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || 'P'
    const slots = pack.cards.map((packCard, index) => {
      const owned = ownedByCard.get(packCard.cardId) ?? []
      const source = owned[0]
      const copies = owned.length
      const rarityValue = packCard.rarity ?? 'N'
      const rarity = (['UR', 'SR', 'R', 'N'].includes(rarityValue) ? rarityValue : 'N') as CardCollectionSlot['rarity']
      return {
        number: packCard.position || index + 1,
        rarity,
        copies,
        card: copies > 0 ? {
          id: packCard.cardId,
          userCardId: source?.userCardId,
          title: pack.name,
          artist: source?.artistName ?? 'Fanfolio 아티스트',
          member: source?.memberName ?? '공식 카드',
          image: demoCardImage(resolveApiUrl(packCard.imageUrl), `card:${packCard.cardId}`),
        } : undefined,
      }
    })
    const packOwned = slots.filter(slot => Boolean(slot.card)).length
    group.packs.push({ id: pack.id, name: pack.name, prefix, owned: packOwned, total: slots.length, slots })
    group.owned += packOwned
    group.total += slots.length
    grouped.set(groupId, group)
  }
  return [...grouped.values()]
}

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
  const apiHeroEvents = eventHome
    ? [eventHome.featuredEvent, ...eventHome.upcomingEvents].filter((event): event is FanEvent => Boolean(event)).filter((event, index, events) => events.findIndex(item => item.id === event.id) === index)
    : []
  const featuredEvent = eventHome ? eventHome.featuredEvent : import.meta.env.DEV ? fallbackHomeEvent : null
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [heroInteractionVersion, setHeroInteractionVersion] = useState(0)
  const [artistFavorite, setArtistFavorite] = useState(false)
  const [newCardFavorites, setNewCardFavorites] = useState<Set<string>>(() => new Set())
  const heroEvents = eventHome ? apiHeroEvents : featuredEvent ? [featuredEvent] : []
  const heroSlides: HomeHeroSlide[] = heroEvents.map(event => ({
    event,
    eyebrow: '팬 이벤트',
    titleLines: homeHeroTitleLines(event.title),
    image: resolveApiUrl(event.heroUrl) || dreamscapeHero,
  }))
  const artist = eventHome?.favoriteArtist ?? null
  const newCards = eventHome ? eventHome.newCards.map(toCatalogCard) : import.meta.env.DEV ? fallbackHomeCards : []
  const activeEvent = eventHome ? eventHome.upcomingEvents[0] ?? eventHome.featuredEvent : import.meta.env.DEV ? fallbackHomeEvent : null
  const completionRate = Math.min(100, Math.max(0, summary.completionRate))
  const artistImage = artist?.imageUrl ? (resolveApiUrl(artist.imageUrl) || cardYunaImage) : cardYunaImage

  useEffect(() => {
    if (heroSlides.length < 2) return
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
  const openHeroEvent = (slide: HomeHeroSlide) => {
    onEvent(slide.event)
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
    >
      {heroSlides.length > 0 ? <><div className="home-event-track" style={{ '--hero-index': activeHeroIndex } as CSSProperties}>
        {heroSlides.map((slide, index) => <button
          type="button"
          className="home-event-slide"
          key={slide.event.id}
          aria-label={`${slide.event.title} · ${index + 1}/${heroSlides.length}`}
          aria-hidden={index !== activeHeroIndex}
          tabIndex={index === activeHeroIndex ? 0 : -1}
          onClick={event => {
            event.stopPropagation()
            openHeroEvent(slide)
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              moveHero(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}
        >
          <AuthenticatedImage draggable={false} src={slide.event.heroUrl} fallback={slide.image || dreamscapeHero} alt="" />
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
      </div></> : <div className="home-event-empty"><b>새로운 이벤트를 준비하고 있어요</b><span>공개된 이벤트가 있으면 이곳에서 바로 확인할 수 있어요.</span><button type="button" className="outline" onClick={onEvents}>이벤트 둘러보기</button></div>}
    </section>
    {artist ? <section className="home-artist-section" aria-labelledby="home-artist-title">
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
    </section> : <section className="home-artist-section home-artist-empty" aria-labelledby="home-artist-title"><div className="section-heading"><h2 id="home-artist-title">관심 아티스트</h2><button type="button" onClick={onDiscover}>아티스트 찾기 <InlineIcon name="chevron" /></button></div><p>관심 아티스트를 선택하면 맞춤 카드와 이벤트를 보여드려요.</p></section>}
    <section className="home-new-cards" aria-labelledby="home-new-cards-title">
      <div className="section-heading"><h2 id="home-new-cards-title">새로 공개된 카드</h2><button type="button" onClick={onDiscover}>전체 보기 <InlineIcon name="chevron" /></button></div>
      <div className="home-new-card-row">{newCards.length > 0 ? newCards.slice(0, 3).map((card, index) => {
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
      }) : <div className="home-data-empty"><b>공개된 카드가 아직 없어요</b><span>새 카드가 공개되면 이곳에서 확인할 수 있어요.</span><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div>}</div>
    </section>
    {activeEvent && <section className="home-active-event-section" aria-labelledby="home-active-event-title">
      <div className="section-heading"><h2 id="home-active-event-title">진행 중인 이벤트</h2></div>
      <button type="button" className="home-active-event" onClick={() => activeEvent.id.startsWith('demo-') ? onEvents() : onEvent(activeEvent)}>
        <AuthenticatedImage src={activeEvent.heroUrl} fallback={dreamscapeHero} alt="" />
        <span><small className="home-active-event-status">{activeEvent.applicationStatus === 'applied' ? '참여 중' : activeEvent.status === 'upcoming' ? '곧 시작' : '참여 가능'}</small><b>{activeEvent.title}</b><em>{activeEvent.summary}</em></span>
        <strong>{activeEvent.endsAt ? `D-${Math.max(0, Math.ceil((new Date(activeEvent.endsAt).getTime() - Date.now()) / 86400000))}` : '자세히'}</strong><InlineIcon name="chevron" />
      </button>
    </section>}
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

const inventoryRewardFallbacks: Record<RewardGrant['type'], string> = {
  badge: '/rewards/reward-ticket.png',
  title: '/rewards/reward-vip.png',
  profile_frame: '/rewards/reward-crystal.png',
  collection_theme: '/rewards/reward-crystal.png',
  digital_bonus: '/rewards/reward-music.png',
}

function inventoryRewardArtwork(reward: RewardGrant): string {
  return rewardArtworkUrl(reward) ?? inventoryRewardFallbacks[reward.type]
}

function inventoryRewardDescription(reward: RewardGrant): string {
  const description = reward.metadata?.description
  return typeof description === 'string' && description.trim()
    ? description
    : `${reward.name} 보상을 팬 활동에서 획득했어요.`
}

function isRewardEquipped(reward: RewardGrant, equipment: ProfileEquipment): boolean {
  if (reward.type === 'badge') return equipment.badgeRewardIds.includes(reward.id)
  if (reward.type === 'title') return equipment.titleRewardId === reward.id
  if (reward.type === 'profile_frame') return equipment.frameRewardId === reward.id
  if (reward.type === 'collection_theme') return equipment.themeRewardId === reward.id
  return false
}

function nextRewardEquipment(reward: RewardGrant, equipment: ProfileEquipment): ProfileEquipment {
  const equipped = isRewardEquipped(reward, equipment)
  if (reward.type === 'badge') {
    const badgeRewardIds = equipped
      ? equipment.badgeRewardIds.filter(id => id !== reward.id)
      : [...equipment.badgeRewardIds.filter(id => id !== reward.id).slice(0, 2), reward.id]
    return { ...equipment, badgeRewardIds }
  }
  if (reward.type === 'title') return { ...equipment, titleRewardId: equipped ? null : reward.id }
  if (reward.type === 'profile_frame') return { ...equipment, frameRewardId: equipped ? null : reward.id }
  if (reward.type === 'collection_theme') return { ...equipment, themeRewardId: equipped ? null : reward.id }
  return equipment
}

type InventoryLifecycle = 'timed' | 'consumable' | 'owned'
type InventoryFilter = 'all' | 'equipped' | 'timed' | 'consumable'
type InventorySourceKind = 'artist' | 'global' | 'activity'
type InventorySourceIdentity = { id: string; label: string; kind: InventorySourceKind; logoUrl: string | null }
type InventorySource = InventorySourceIdentity & { count: number }

function inventoryMetadataString(reward: RewardGrant, key: string): string | null {
  const value = reward.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function inventoryMetadataNumber(reward: RewardGrant, key: string): number | null {
  const value = reward.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function inventoryRewardSource(reward: RewardGrant, progression: FanProgression | null): InventorySourceIdentity {
  if (reward.metadata?.scope === 'global') return { id: 'global', label: '전체 레벨', kind: 'global', logoUrl: null }

  const metadataLabel = inventoryMetadataString(reward, 'artistName') ?? inventoryMetadataString(reward, 'sourceName')
  const metadataId = inventoryMetadataString(reward, 'artistId') ?? inventoryMetadataString(reward, 'sourceId')
  const logoUrl = inventoryMetadataString(reward, 'artistLogoUrl')
  if (metadataLabel) return { id: metadataId ?? `source:${metadataLabel}`, label: metadataLabel, kind: 'artist', logoUrl }

  const season = progression?.pass.seasons.find(candidate => candidate.tiers.some(tier => tier.rewardId === reward.rewardId))
  if (!season) return { id: 'fan-activity', label: '팬 활동', kind: 'activity', logoUrl: null }
  if (!season.artistId) return { id: 'global', label: '전체 레벨', kind: 'global', logoUrl: null }
  const label = season.title.replace(/\s*(팬\s*레벨|팬\s*패스)$/u, '').trim() || season.artistId
  return { id: season.artistId, label, kind: 'artist', logoUrl }
}

function inventoryRewardLifecycle(reward: RewardGrant): InventoryLifecycle {
  if (inventoryMetadataString(reward, 'expiresAt') || inventoryMetadataNumber(reward, 'durationDays') !== null) return 'timed'
  if (reward.metadata?.consumable === true || inventoryMetadataNumber(reward, 'quantity') !== null) return 'consumable'
  return 'owned'
}

function inventoryRewardStatus(reward: RewardGrant, equipment: ProfileEquipment | null): string {
  const equipped = Boolean(equipment && isRewardEquipped(reward, equipment))
  const lifecycle = inventoryRewardLifecycle(reward)
  if (lifecycle === 'timed') {
    const remainingDays = inventoryMetadataNumber(reward, 'remainingDays')
    const timeLabel = remainingDays === null ? '기간제' : `${Math.max(0, Math.round(remainingDays))}일 남음`
    return equipped ? `적용 중 · ${timeLabel}` : `기간제 · ${timeLabel}`
  }
  if (equipped) return '현재 적용 중'
  if (lifecycle === 'consumable') {
    const quantity = inventoryMetadataNumber(reward, 'quantity') ?? 1
    const unit = inventoryMetadataString(reward, 'unit') ?? '개'
    return `1회성 · ${quantity}${unit}`
  }
  return '영구 보유'
}

function isInventoryRewardEquipable(reward: RewardGrant): boolean {
  return reward.type === 'badge' || reward.type === 'title' || reward.type === 'profile_frame' || reward.type === 'collection_theme'
}

function RewardInventoryPreview() {
  const [progression, setProgression] = useState(fanGrowthPreviewProgression)
  return <RewardInventory
    progression={progression}
    loading={false}
    error=""
    onRetry={() => {}}
    onBack={() => window.location.assign('/?preview=collection-inventory-entry')}
    onEquip={async equipment => setProgression(current => ({ ...current, equipment }))}
    onNavigate={() => {}}
  />
}

function RewardInventory({ progression, loading, error, onRetry, onBack, onEquip, onNavigate }: {
  progression: FanProgression | null
  loading: boolean
  error: string
  onRetry: () => void
  onBack: () => void
  onEquip: (equipment: ProfileEquipment) => Promise<void>
  onNavigate: (tab: Tab) => void
}) {
  const [filter, setFilter] = useState<InventoryFilter>('all')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const claimedRewards = progression?.claimedRewards.filter(reward => reward.claimedAt) ?? []
  const equipment = progression?.equipment ?? null
  const sources = claimedRewards.reduce<InventorySource[]>((items, reward) => {
    const source = inventoryRewardSource(reward, progression)
    const existing = items.find(item => item.id === source.id)
    if (existing) {
      existing.count += 1
      if (!existing.logoUrl && source.logoUrl) existing.logoUrl = source.logoUrl
    } else items.push({ ...source, count: 1 })
    return items
  }, [])
  const activeSourceId = selectedSourceId && sources.some(source => source.id === selectedSourceId) ? selectedSourceId : sources[0]?.id ?? null
  const activeSource = sources.find(source => source.id === activeSourceId) ?? null
  const sourceRewards = claimedRewards.filter(reward => inventoryRewardSource(reward, progression).id === activeSourceId)
  const visibleRewards = sourceRewards.filter(reward => {
    if (filter === 'all') return true
    if (filter === 'equipped') return Boolean(equipment && isRewardEquipped(reward, equipment))
    return inventoryRewardLifecycle(reward) === filter
  })

  const actOnReward = async (reward: RewardGrant) => {
    if (!equipment) return
    const lifecycle = inventoryRewardLifecycle(reward)
    if (!isInventoryRewardEquipable(reward) || lifecycle === 'consumable') {
      setMessage(inventoryRewardDescription(reward))
      return
    }
    const equipped = isRewardEquipped(reward, equipment)
    setSavingId(reward.id)
    setMessage('')
    try {
      await onEquip(nextRewardEquipment(reward, equipment))
      setMessage(equipped ? '장착을 해제했어요.' : '프로필에 장착했어요.')
    } catch (equipError) {
      setMessage(equipError instanceof Error ? equipError.message : '장착 정보를 저장하지 못했어요.')
    } finally {
      setSavingId(null)
    }
  }

  return <main className="app-shell reward-inventory-shell">
    <header className="reward-inventory-header">
      <button type="button" aria-label="보관함으로 돌아가기" onClick={onBack}><InlineIcon name="back" /></button>
      <div><h1>팬 컬렉션</h1></div>
      <span aria-hidden="true" />
    </header>
    <section className="reward-inventory-screen">
      <div className="reward-inventory-kicker"><span>팬 활동으로 모은 아이템</span><strong>총 {claimedRewards.length}개</strong></div>
      {loading && !progression && <div className="reward-inventory-state" role="status"><span className="loading-orbit" /><b>보상 인벤토리를 불러오는 중이에요</b></div>}
      {!loading && error && <div className="reward-inventory-state error" role="alert"><b>보상을 불러오지 못했어요.</b><span>{error}</span><button type="button" className="outline" onClick={onRetry}>다시 시도</button></div>}
      {!loading && !error && claimedRewards.length === 0 && <div className="reward-inventory-state"><span className="reward-inventory-empty-icon"><InlineIcon name="gift" /></span><b>아직 보유한 팬 아이템이 없어요</b><span>팬 활동으로 아이템을 모아 컬렉션을 채워보세요.</span><button type="button" className="outline" onClick={() => onNavigate('growth')}>팬 레벨 보기</button></div>}
      {!loading && !error && claimedRewards.length > 0 && <>
        <div className="reward-inventory-sources" role="tablist" aria-label="아이템 출처">
          {sources.map(source => <button type="button" role="tab" aria-selected={activeSourceId === source.id} className={`${activeSourceId === source.id ? 'active' : ''}${source.kind === 'global' ? ' global-source' : ''}`} key={source.id} onClick={() => { setSelectedSourceId(source.id); setFilter('all'); setMessage('') }}>
            {source.kind !== 'global' && <ProfileAvatar className="reward-inventory-source-logo" imageUrl={source.logoUrl} fallback={source.label.slice(0, 1)} alt={`${source.label} 로고`} />}
            <b>{source.label}</b>
            <em className="reward-inventory-source-count">{source.count}</em>
          </button>)}
        </div>
        <section className="reward-inventory-list" aria-labelledby="reward-inventory-title">
          <div className="reward-inventory-section-heading"><h2 id="reward-inventory-title">{activeSource?.label ?? '팬'} 컬렉션</h2><span>보유 아이템 <b>{sourceRewards.length}개</b></span></div>
          <div className="reward-inventory-tabs" role="tablist" aria-label="아이템 상태">
            {([['all', '전체'], ['equipped', '적용 중'], ['timed', '기간제'], ['consumable', '1회성']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} key={value} onClick={() => { setFilter(value); setMessage('') }}>{label}</button>)}
          </div>
          {message && <p className="reward-inventory-message" role="status">{message}</p>}
          {visibleRewards.length > 0 ? <div className="reward-inventory-grid">{visibleRewards.map(reward => {
            const isEquipped = equipment ? isRewardEquipped(reward, equipment) : false
            const lifecycle = inventoryRewardLifecycle(reward)
            const statusClass = isEquipped ? 'equipped' : lifecycle
            const actionLabel = savingId === reward.id ? '저장 중...' : isEquipped ? '해제' : lifecycle === 'consumable' ? '사용' : isInventoryRewardEquipable(reward) ? '적용' : '확인'
            return <article className="reward-inventory-card" key={reward.id}>
              <span className="reward-inventory-art"><AuthenticatedImage src={inventoryRewardArtwork(reward)} fallback={inventoryRewardFallbacks[reward.type]} alt="" /></span>
              <b>{reward.name}</b>
              <em className={`reward-inventory-status ${statusClass}`}>{isEquipped && <InlineIcon name="check" />}{inventoryRewardStatus(reward, equipment)}</em>
              <button type="button" className="reward-inventory-card-action" onClick={() => void actOnReward(reward)} disabled={savingId === reward.id}>{actionLabel}</button>
            </article>
          })}</div> : <div className="reward-inventory-filter-empty">이 종류의 보상이 아직 없어요.</div>}
        </section>
      </>}
    </section>
    <BottomNavigation active="collection" onNavigate={onNavigate} />
  </main>
}

function CardCollectionDetail({ item, onBack }: { item: CardCollectionDetailItem, onBack: () => void }) {
  const [favorite, setFavorite] = useState(false)
  const [detail, setDetail] = useState<UserCardDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailError(false)
    const hasRemoteDetail = Boolean(item.card.userCardId && !item.card.userCardId.startsWith('user-card-'))
    setDetailLoading(hasRemoteDetail)
    if (!hasRemoteDetail || !item.card.userCardId) return
    void apiFetch<{ ok: true, data: UserCardDetail }>(`/me/cards/${item.card.userCardId}`)
      .then(result => { if (!cancelled) { setDetail(result.data); setDetailLoading(false) } })
      .catch(() => { if (!cancelled) { setDetailError(true); setDetailLoading(false) } })
    return () => { cancelled = true }
  }, [item.card.userCardId, detailAttempt])

  const artistName = detail?.card.artistName ?? item.card.artist
  const memberName = detail?.card.memberName ?? item.card.member
  const cardName = detail?.card.name ?? item.packName
  const cardCode = detail ? `#${String(detail.serialNumber).padStart(3, '0')}` : item.code
  const acquiredAt = detail?.acquiredAt ?? item.acquiredAt
  const cardType = detail?.card.cardType ?? item.cardType
  const acquisitionSource = detail?.acquisitionSource ?? item.acquisitionSource
  const artistMessage = detail?.card.signatureText ?? item.artistMessage
  const futureBenefitPreview = detail?.futureBenefitPreview ?? item.futureBenefitPreview
  const handwritingImageUrl = detail?.card.handwritingImageUrl ? resolveApiUrl(detail.card.handwritingImageUrl) : ''
  const voiceAudioUrl = detail?.card.hasVoice && detail.card.voiceAudioUrl ? resolveApiUrl(detail.card.voiceAudioUrl) : ''
  const videoUrl = detail?.card.hasVideo && detail.card.videoUrl ? resolveApiUrl(detail.card.videoUrl) : ''
  const acquisitionSourceLabel = acquisitionSource === 'qr' ? 'QR 스캔' : acquisitionSource === 'manual' ? '코드 직접 입력' : acquisitionSource === 'card_pack' ? '카드팩' : acquisitionSource || ''

  return <main className="app-shell card-collection-detail-shell">
    <header className="card-collection-detail-topbar">
      <button type="button" onClick={onBack} aria-label="카드 컬렉션으로 돌아가기"><InlineIcon name="back" /></button>
      <h1>카드 상세</h1>
      <button type="button" className={favorite ? 'active' : ''} aria-label={favorite ? '관심 카드에서 제거' : '관심 카드에 추가'} aria-pressed={favorite} onClick={() => setFavorite(value => !value)}><InlineIcon name="heart" /></button>
    </header>
    <section className="card-collection-detail-body">
      {detailLoading && <p className="card-collection-detail-loading" role="status">카드 정보를 불러오는 중이에요…</p>}
      <InteractiveCollectibleCard
        imageUrl={detail?.card.imageUrl ? resolveApiUrl(detail.card.imageUrl) : item.card.image}
        imageAlt={`${memberName} ${cardName} 카드 앞면`}
        identity={detail?.userCardId ?? item.card.id}
        title={cardName}
        artist={artistName}
        member={memberName}
        serialLabel={cardCode}
        limitLabel={detail?.card.issueLimit ? `${detail.card.issueLimit.toLocaleString()}장` : `${item.copies}장 보유`}
        sealLabel={detail?.card.id.slice(-8).toUpperCase() ?? 'FANFOLIO'}
        designConfig={detail?.card.designConfig ?? qaRevealDesignConfig}
        lenticularImageUrl={detail?.card.lenticularImageUrl ? resolveApiUrl(detail.card.lenticularImageUrl) : null}
        hiddenMessage={detail?.card.designConfig?.back?.hiddenMessage ?? `${artistName} 공식 컬렉션 카드`}
        badgeLabel={detail?.card.rarity ?? item.rarity}
        onImageError={event => keepCardVisual(event, item.card.id)}
        presentation="detail"
        enableDeviceMotion
        swipeToFlip
        showControls={false}
      />
      <span className="card-collection-swipe-hint"><InlineIcon name="motion" />카드를 좌우로 밀어 뒷면을 확인해 보세요</span>
      {artistMessage && <section className="card-collection-detail-message" aria-label="아티스트 메시지"><span><InlineIcon name="heart" /></span><div><h2>아티스트 메시지</h2><p>“{artistMessage}”</p></div></section>}
      <section className="card-collection-detail-info" aria-label="카드 정보">
        <div className="card-collection-detail-title">
          <span><strong>{memberName} · {cardName}</strong><small>{detail?.card.rarity ?? item.rarity} · {cardCode}</small></span>
          <em>보유 {item.copies}장</em>
        </div>
        <dl>
          <div><dt>컬렉션</dt><dd>{item.groupName}</dd></div>
          <div><dt>카드팩</dt><dd>{item.packName}</dd></div>
          <div><dt>아티스트</dt><dd>{artistName}</dd></div>
          <div><dt>멤버</dt><dd>{memberName}</dd></div>
          {acquiredAt && <div><dt>획득일</dt><dd>{new Date(acquiredAt).toLocaleDateString('ko-KR')}</dd></div>}
          {cardType && <div><dt>카드 유형</dt><dd>{cardTypeLabel(cardType)}</dd></div>}
          {acquisitionSourceLabel && <div><dt>획득 경로</dt><dd>{acquisitionSourceLabel}</dd></div>}
          {detail?.card.issueLimit && <div><dt>발행 수량</dt><dd>{detail.card.issueLimit.toLocaleString()}장</dd></div>}
        </dl>
      </section>
      {futureBenefitPreview && <p className="card-collection-detail-benefit"><InlineIcon name="sparkles" />{futureBenefitPreview}</p>}
      {handwritingImageUrl && <section className="card-collection-detail-special"><h2>손글씨 특전</h2><img src={handwritingImageUrl} alt={`${memberName} 손글씨 메시지`} /></section>}
      {(voiceAudioUrl || videoUrl) && <section className="card-collection-detail-special" aria-labelledby="collection-special-media-title">
        <h2 id="collection-special-media-title">스페셜 미디어</h2>
        {voiceAudioUrl && <div className="card-collection-detail-player"><b>보이스 메시지</b><audio controls preload="metadata" src={voiceAudioUrl} /></div>}
        {videoUrl && <div className="card-collection-detail-player"><b>스페셜 비디오</b><video controls muted playsInline preload="metadata" src={videoUrl} /></div>}
      </section>}
      {detailError && <div className="card-collection-detail-error"><p>일부 카드 정보를 불러오지 못했어요.</p><button type="button" onClick={() => setDetailAttempt(value => value + 1)}>다시 시도</button></div>}
    </section>
  </main>
}

function CardCollectionRepository({ onBack, onNavigate, onOpenCard }: { onBack: () => void, onNavigate: (tab: Tab) => void, onOpenCard?: (userCardId: string) => Promise<void> | void }) {
  const [remoteGroups, setRemoteGroups] = useState<CardCollectionGroup[] | null>(null)
  const [remotePacks, setRemotePacks] = useState<CardPack[]>([])
  const [groupId, setGroupId] = useState(cardCollectionGroups[0].id)
  const [packId, setPackId] = useState(cardCollectionGroups[0].packs[0].id)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing' | 'duplicate'>('all')
  const [sort, setSort] = useState<'number' | 'rarity' | 'copies'>('number')
  const [selectedItem, setSelectedItem] = useState<CardCollectionDetailItem | null>(null)
  const [packSheetOpen, setPackSheetOpen] = useState(false)
  const [packOdds, setPackOdds] = useState<{ pack: CardPack, items: CardPack['cards'], totalProbability: number } | null>(null)
  const [packOpening, setPackOpening] = useState(false)
  const [packError, setPackError] = useState('')
  const groups = remoteGroups ?? cardCollectionGroups
  const group = groups.find(item => item.id === groupId) ?? groups[0] ?? { id: 'empty', displayName: '카드 컬렉션', owned: 0, total: 0, packs: [] }
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getCardPacks(),
      apiFetch<{ ok: true, data: { cards: CollectionCard[] } }>('/me/collection'),
    ]).then(([packs, collection]) => {
      if (cancelled) return
      setRemotePacks(packs.data.items)
      const nextGroups = buildRemoteCardCollectionGroups(packs.data.items, collection.data.cards)
      setRemoteGroups(nextGroups)
      if (nextGroups[0]) {
        setGroupId(nextGroups[0].id)
        setPackId(nextGroups[0].packs[0]?.id ?? 'all')
      }
    }).catch(() => {
      if (!cancelled) setRemoteGroups([])
    })
    return () => { cancelled = true }
  }, [])
  const allPack: CardCollectionPack = {
    id: 'all',
    name: '전체 팩',
    prefix: '',
    owned: group.owned,
    total: group.total,
    slots: group.packs.flatMap(pack => pack.slots.slice(0, pack.total).map(slot => ({ ...slot, sourcePrefix: pack.prefix }))),
  }
  const activePack = packId === 'all' ? allPack : group.packs.find(item => item.id === packId) ?? group.packs[0]
  const selectedRemotePack = activePack.id === 'all' ? null : remotePacks.find(pack => pack.id === activePack.id) ?? null
  const rarityOrder = { UR: 4, SR: 3, R: 2, N: 1 }
  const visibleSlots = [...activePack.slots]
    .filter(slot => filter === 'all' ? true : filter === 'owned' ? Boolean(slot.card) : filter === 'missing' ? !slot.card : slot.copies > 1)
    .sort((a, b) => sort === 'rarity' ? rarityOrder[b.rarity] - rarityOrder[a.rarity] || a.number - b.number : sort === 'copies' ? b.copies - a.copies || a.number - b.number : a.number - b.number)
  const selectGroup = (nextGroup: CardCollectionGroup) => {
    setGroupId(nextGroup.id)
    setPackId(nextGroup.packs[0].id)
    setGroupMenuOpen(false)
  }
  const openPackSheet = async () => {
    if (!selectedRemotePack || !onOpenCard) return
    setPackError('')
    setPackSheetOpen(true)
    try {
      const result = await getCardPackOdds(selectedRemotePack.id)
      setPackOdds(result.data)
    } catch (error) {
      setPackError(error instanceof Error ? error.message : '확률표를 불러오지 못했어요.')
    }
  }
  const openSelectedPack = async () => {
    if (!selectedRemotePack || !onOpenCard || packOpening) return
    setPackOpening(true)
    setPackError('')
    try {
      const opening = await openCardPack(selectedRemotePack.id)
      setPackSheetOpen(false)
      await onOpenCard(opening.data.userCardId)
    } catch (error) {
      setPackError(error instanceof Error ? error.message : '카드팩을 열지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPackOpening(false)
    }
  }
  if (selectedItem) return <CardCollectionDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
  return <main className="app-shell card-collection-shell">
    <header className="card-collection-topbar">
      <button type="button" onClick={onBack} aria-label="보관함으로 돌아가기"><InlineIcon name="back" /></button>
      <h1>카드 컬렉션</h1>
      <span aria-hidden="true" />
    </header>

    <section className="card-collection-identity">
      <div className="card-collection-artist"><img src={loginDreamscapeGroup} alt="드림스케이프 로고" /><strong>드림스케이프</strong></div>
      <div className="card-collection-group-select">
        <button type="button" aria-haspopup="listbox" aria-expanded={groupMenuOpen} onClick={() => setGroupMenuOpen(open => !open)}>
          <span><b>{group.displayName}</b><i><em style={{ width: `${group.owned / group.total * 100}%` }} /><small>{group.owned} / {group.total}</small></i></span>
          <InlineIcon name="chevron" />
        </button>
        {groupMenuOpen && <div className="card-collection-group-menu" role="listbox" aria-label="컬렉션 그룹">{groups.map(item => <button type="button" role="option" aria-selected={item.id === group.id} key={item.id} onClick={() => selectGroup(item)}><b>{item.displayName}</b><small>{item.owned} / {item.total}</small></button>)}</div>}
      </div>
    </section>

    <nav className="card-collection-pack-rail" aria-label="카드팩">
      <button type="button" className={`card-collection-all-packs ${activePack.id === 'all' ? 'active' : ''}`} aria-current={activePack.id === 'all' ? 'true' : undefined} onClick={() => setPackId('all')}><span><InlineIcon name="grid" /></span><b>전체 팩</b></button>
      {group.packs.map((pack, index) => <button type="button" className={pack.id === activePack.id ? 'active' : ''} aria-current={pack.id === activePack.id ? 'true' : undefined} key={pack.id} onClick={() => setPackId(pack.id)}>
        <img className={`pack-tone-${index + 1}`} src={dreamscapeCardPack} alt="" />
        <span><b>{pack.name}</b><small><strong>{pack.owned}</strong> / {pack.total}</small></span>
      </button>)}
    </nav>

    <section className="card-collection-catalog">
      <div className="card-collection-heading">
        <h2>{activePack.name} 카드 <small>· <strong>{activePack.owned}</strong> / {activePack.total}</small></h2>
        <div>
          {selectedRemotePack && onOpenCard && <button type="button" className="card-collection-open-pack" onClick={() => { void openPackSheet() }}>팩 열기</button>}
          <label><span className="sr-only">카드 정렬</span><select aria-label="카드 정렬" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="number">카드 번호순</option><option value="rarity">희귀도순</option><option value="copies">보유 수량순</option></select></label>
          <button type="button" className={filtersOpen || filter !== 'all' ? 'active' : ''} aria-label="카드 필터" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}><NavIcon name="settings" /></button>
        </div>
      </div>
      {filtersOpen && <div className="card-collection-filters" role="group" aria-label="보유 상태 필터">{[
        ['all', '전체'], ['owned', '보유'], ['missing', '미획득'], ['duplicate', '중복'],
      ].map(([value, label]) => <button type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} key={value} onClick={() => setFilter(value as typeof filter)}>{label}</button>)}</div>}
      <div className="card-collection-grid">{visibleSlots.map(slot => {
        const code = `${slot.sourcePrefix ?? activePack.prefix}-${String(slot.number).padStart(2, '0')}`
        if (!slot.card) return <article className="card-collection-slot missing" key={code} aria-label={`${code} 미획득 카드`}><span className={`card-collection-rarity rarity-${slot.rarity.toLowerCase()}`}>{slot.rarity}</span><img src={mysteryCardImage} alt="" /><b>{code}</b></article>
        const sourcePack = group.packs.find(pack => pack.prefix === (slot.sourcePrefix ?? activePack.prefix)) ?? activePack
        return <button type="button" className="card-collection-slot owned" key={code} onClick={() => setSelectedItem({ card: slot.card!, code, rarity: slot.rarity, copies: slot.copies, packName: sourcePack.name, groupName: group.displayName, artistMessage: collectionArtistMessages[slot.card!.member], acquiredAt: '2026-08-19T04:20:00Z', cardType: 'photo', acquisitionSource: 'card_pack', futureBenefitPreview: '이 카드는 추후 컬렉션 특전 해금 조건에 사용될 수 있어요.' })} aria-label={`${code} ${slot.card.member} 카드 상세 보기`}>
          <span className={`card-collection-rarity rarity-${slot.rarity.toLowerCase()}`}>{slot.rarity}</span>
          <img src={slot.card.image} alt={`${slot.card.member} ${activePack.name} 카드`} />
          <em aria-label={`${slot.copies}장 보유`}>{formatCardCopies(slot.copies)}</em><b>{code}</b>
        </button>
      })}</div>
      {visibleSlots.length === 0 && <p className="card-collection-empty">선택한 조건에 맞는 카드가 없어요.</p>}
    </section>
    {packSheetOpen && selectedRemotePack && <div className="card-pack-opening-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget && !packOpening) setPackSheetOpen(false) }}>
      <section className="card-pack-opening-sheet" role="dialog" aria-modal="true" aria-labelledby="card-pack-opening-title">
        <button type="button" className="card-pack-opening-close" aria-label="팩 열기 닫기" onClick={() => { if (!packOpening) setPackSheetOpen(false) }}>×</button>
        <img src={resolveApiUrl(selectedRemotePack.imageUrl) || dreamscapeCardPack} alt="" />
        <div className="card-pack-opening-copy"><span className="eyebrow">CARD PACK</span><h2 id="card-pack-opening-title">{selectedRemotePack.name}</h2><p>{selectedRemotePack.seasonName ?? '공식 카드팩'} · {selectedRemotePack.version}</p>{selectedRemotePack.description && <small>{selectedRemotePack.description}</small>}</div>
        <div className="card-pack-opening-odds"><div><b>공개 확률표</b><strong>{packOdds?.totalProbability ?? 100}%</strong></div>{packOdds ? packOdds.items.map(item => <div className="card-pack-opening-odds-row" key={item.cardId}><span><em className={`card-collection-rarity rarity-${(item.rarity ?? 'N').toLowerCase()}`}>{item.rarity ?? 'N'}</em>{item.name}</span><strong>{item.probability}%</strong></div>) : <p>{packError || '확률표를 불러오는 중이에요.'}</p>}</div>
        {packError && packOdds && <p className="card-pack-opening-error" role="alert">{packError}</p>}
        <button type="button" className="card-pack-opening-submit" disabled={!packOdds || packOpening} onClick={() => { void openSelectedPack() }}>{packOpening ? '카드를 준비하고 있어요…' : '팩 열기'}</button>
        <small className="card-pack-opening-note">개봉 즉시 카드가 컬렉션에 등록되고 카드 상세 화면에서 확인할 수 있어요.</small>
      </section>
    </div>}
    <BottomNavigation active="collection" onNavigate={onNavigate} />
  </main>
}

function Collection({ cards: collectionCards, collectionDataReady, summary, benefits, rewards, loading, onSelect, onRedeem, onDiscover, onRewards, onCards, onClaim }: { cards: Card[], collectionDataReady: boolean, summary: CollectionSummary, benefits: CollectionBenefit[], rewards: RewardGrant[], loading: boolean, onSelect: (card: Card) => void, onRedeem: () => void, onDiscover: () => void, onRewards: () => void, onCards: () => void, onClaim: (campaignId: string) => Promise<void> }) {
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState('')
  const sourceCards = collectionDataReady ? collectionCards : import.meta.env.DEV ? fallbackCollectionCards : []
  const recentCards = sourceCards.slice(0, 4)
  const duplicateCounts = recentCards.reduce<Record<string, number>>((counts, card) => {
    counts[card.title] = (counts[card.title] ?? 0) + 1
    return counts
  }, {})
  const claimedRewards = rewards.filter(reward => reward.claimedAt)
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
      <button type="button" className="collection-register-entry" onClick={onRedeem}>
        <span className="collection-register-entry-icon"><RedeemIcon name="scan" /></span>
        <span><b>새 카드 등록하기</b><small>QR 코드, 인증 코드 또는 사진으로 컬렉션에 추가해요.</small></span>
        <InlineIcon name="chevron" />
      </button>
      <button type="button" className="collection-reward-inventory-entry" onClick={onRewards}>
        <span className="collection-reward-thumbnails" aria-hidden="true">{claimedRewards.length > 0 ? claimedRewards.slice(0, 4).map(reward => <AuthenticatedImage key={reward.id} src={inventoryRewardArtwork(reward)} fallback={inventoryRewardFallbacks[reward.type]} alt="" />) : <span className="collection-reward-empty"><InlineIcon name="gift" /></span>}</span>
        <span className="collection-reward-entry-copy"><small>보유 아이템 {claimedRewards.length}개</small><b>팬 컬렉션</b><em>팬 활동으로 모은 아이템을 한곳에서 관리해요.</em></span>
        <InlineIcon name="chevron" />
      </button>
      <section className="collection-recent-section" aria-labelledby="collection-recent-title">
        <div className="section-heading"><h2 id="collection-recent-title">최근 수집 카드</h2><button type="button" onClick={onCards}>전체 보기 <InlineIcon name="chevron" /></button></div>
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
    </section>
    {sourceCards.length === 0 && <div className="empty-collection"><div className="empty-collection-copy"><InlineIcon name="plus" /><b>아직 카드가 없어요</b><small>카드를 등록하거나 탐색해서 컬렉션을 시작해 보세요.</small></div><div className="empty-collection-actions"><button type="button" className="primary" onClick={onRedeem}>카드 등록하기</button><button type="button" className="outline" onClick={onDiscover}>카드 탐색하기</button></div></div>}
    {benefits.length > 0 && <section className="benefit-section"><div className="section-heading"><h2>컬렉션 완성 특전</h2></div><div className="benefit-list">{benefits.map(benefit => <article className={`benefit-card ${benefit.status}`} key={`${benefit.campaignId ?? benefit.artistId ?? 'fanfolio'}-${benefit.seasonName}`}><div><span className="detail-badge">{benefit.claimed ? '수령 완료' : benefit.status === 'unlocked' ? '해금 완료' : '진행 중'}</span><h3>{benefit.benefit.title}</h3><p>{benefit.benefit.description}</p></div><div><strong>{benefit.ownedCount}/{benefit.requiredCount}</strong>{benefit.claimable && benefit.campaignId && <button className="outline" onClick={() => void claim(benefit)} disabled={claimingId === benefit.campaignId}>{claimingId === benefit.campaignId ? '수령 중...' : '특전 받기'}</button>}{benefit.claimed && benefit.downloadUrl && <a className="outline benefit-download" href={resolveApiUrl(benefit.downloadUrl)} download>특전 다운로드</a>}</div></article>)}</div>{claimMessage && <p className="form-message">{claimMessage}</p>}</section>}
  </>
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(/\.\s*/g, '.').replace(/\.$/, '')
}

function EventApplicationComplete({ event, onBack, onEvents, onApplications }: { event: FanEvent | null, onBack: () => void, onEvents: () => void, onApplications: () => void }) {
  if (!event) {
    return <main className="event-application-screen"><section className="event-application-content"><h1>신청 정보를 찾을 수 없어요</h1><button type="button" className="event-application-secondary" onClick={onEvents}>이벤트 목록으로</button></section></main>
  }
  return <main className="event-application-screen">
    <header className="event-application-topbar">
      <button type="button" aria-label="뒤로 가기" onClick={onBack}><InlineIcon name="back" /></button>
      <strong>FANFOLIO</strong>
      <button type="button" aria-label="공유하기"><InlineIcon name="share" /></button>
    </header>
    <section className="event-application-content">
      <h1>신청 완료</h1>
      <div className="event-application-success"><img src={registrationCompleteCelebration} alt="신청 완료" /><span>신청 완료</span></div>
      <h2>{event.title}</h2>
      <div className="event-application-meta"><p><InlineIcon name="calendar" />{formatEventDate(event.startsAt)}</p><p><InlineIcon name="pin" />{event.venue ?? '장소가 아직 정해지지 않았어요.'}</p></div>
      <section className="event-application-info"><h3>선택한 참여 정보</h3><p><InlineIcon name="users" /><b>일반 참여 (1인)</b></p><p><InlineIcon name="gift" />사인 앨범 1장</p></section>
      <button type="button" className="event-application-primary" onClick={onApplications}>신청 내역 보기</button>
      <button type="button" className="event-application-secondary" onClick={onEvents}>이벤트 목록으로</button>
      <small>신청 내역은 마이 &gt; 나의 이벤트에서 확인할 수 있어요.</small>
    </section>
  </main>
}

function MyEventApplications({ items, loading, error, onBack, onEvents, onRetry, onOpen }: { items: FanEventApplication[]; loading: boolean; error: string; onBack: () => void; onEvents: () => void; onRetry: () => void; onOpen: (eventId: string) => void }) {
  return <main className="event-application-screen">
    <header className="event-application-topbar"><button type="button" aria-label="마이로 돌아가기" onClick={onBack}><InlineIcon name="back" /></button><strong>나의 이벤트</strong><span aria-hidden="true" /></header>
    <section className="event-application-content">
      <h1>나의 이벤트</h1>
      {loading && <p role="status">신청 내역을 불러오는 중이에요…</p>}
      {!loading && error && <div className="event-empty error" role="alert"><p>{error}</p><button type="button" className="outline" onClick={onRetry}>다시 시도</button></div>}
      {!loading && !error && items.length === 0 && <div className="event-empty"><strong>신청한 이벤트가 없어요</strong><span>이벤트에 신청하면 이곳에서 다시 확인할 수 있어요.</span><button type="button" className="outline" onClick={onEvents}>이벤트 둘러보기</button></div>}
      {!loading && !error && items.length > 0 && <div className="event-application-list">{items.map(item => <button type="button" className="event-application-row" key={item.applicationId} onClick={() => onOpen(item.eventId)}><span><b>{item.event.title}</b><small>{formatEventDate(item.event.startsAt)} · {item.event.venue ?? '장소 미정'}</small></span><em>{item.status === 'submitted' ? '신청 완료' : item.status}</em><InlineIcon name="chevron" /></button>)}</div>}
    </section>
  </main>
}

function NotificationSettings({ onBack }: { onBack: () => void }) {
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void getNotificationPreferences()
      .then(result => setEmailEnabled(result.data.emailEnabled))
      .catch(() => setError('알림 설정을 불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (emailEnabled === null) return
    setSaving(true)
    setError('')
    try {
      const result = await updateNotificationPreferences(emailEnabled)
      setEmailEnabled(result.data.emailEnabled)
      onBack()
    } catch {
      setError('알림 설정을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="notification-settings-screen">
    <header className="notification-settings-topbar"><button type="button" aria-label="뒤로 가기" onClick={onBack}><InlineIcon name="back" /></button><h1>알림 설정</h1></header>
    <section className="notification-settings-content">
      <div className="notification-settings-hero"><span><InlineIcon name="bell" /></span><p>새로운 소식을 놓치지 않도록<br />알림을 관리해보세요.</p></div>
      <section className="notification-settings-panel">
        {loading && <p role="status">알림 설정을 불러오는 중이에요.</p>}
        {!loading && <button type="button" className="notification-setting-row" onClick={() => setEmailEnabled(value => !value)} disabled={emailEnabled === null}>
          <span className="notification-setting-icon"><InlineIcon name="bell" /></span><b>이메일 알림</b><em>{emailEnabled ? '켜짐' : '꺼짐'}</em><span className={`notification-toggle ${emailEnabled ? 'is-on' : ''}`} aria-hidden="true"><i /></span>
        </button>}
      </section>
      {error && <p className="notification-settings-note" role="alert">{error}</p>}
      <p className="notification-settings-note"><InlineIcon name="system" />인앱 알림은 알림함과 실시간 알림으로 제공되며, 이메일 알림 설정과 별도로 동작해요.</p>
      <button type="button" className="notification-save" onClick={() => void save()} disabled={loading || saving || emailEnabled === null}>{saving ? '저장 중…' : '변경사항 저장'}</button>
    </section>
  </main>
}

function Discover() {
  return <section className="artist-hub"><div className="artist-hub-heading"><p>좋아하는 아티스트의 모든 정보를 한눈에</p></div><section className="artist-hub-hero"><img src={dreamscapeHero} alt="드림스케이프" /><div className="artist-hub-hero-overlay"><span>추천 아티스트</span><h3>드림스케이프 <VerifiedIcon /></h3><p>4명의 멤버 · 공식 아티스트 공간</p><div className="hub-members">{[cardYunaImage, cardMinhoImage, cardJayImage, cardYunaImage].map((image, index) => <img key={index} src={image} alt="" />)}</div><button type="button">+ 팔로우</button></div></section><nav className="hub-tabs" aria-label="아티스트 정보"><a className="active" href="#artist-home">아티스트 홈</a><a href="#artist-schedule">일정</a><a href="#artist-news">뉴스</a><a href="#artist-cards">카드</a><a href="#artist-events">이벤트</a></nav><section id="artist-schedule" className="hub-section"><div className="section-heading"><h3>다가오는 일정</h3><button type="button">전체 보기 ›</button></div><div className="hub-schedule-grid"><article><b>JUN<br /><strong>28</strong></b><div><span>팬미팅</span><h4>드림스케이프 팬미팅</h4><p>2026.06.28 (일) 17:00</p><small><InlineIcon name="pin" />올림픽공원 올림픽홀</small></div><i className="hub-schedule-bell"><NavIcon name="alerts" /></i></article><article><b>JUL<br /><strong>12</strong></b><div><span>콘서트</span><h4>2026 SUMMER FAN WEEK</h4><p>2026.07.12 (일) 18:00</p><small><InlineIcon name="pin" />KSPO DOME</small></div><i className="hub-schedule-bell"><NavIcon name="alerts" /></i></article></div></section><section id="artist-news" className="hub-section"><div className="section-heading"><h3>드림스케이프 뉴스</h3><button type="button">전체 보기 ›</button></div><div className="hub-news-list"><article><img src={dreamscapeHero} alt="" /><div><b>드림스케이프, 새 앨범 트랙리스트 공개</b><p>타이틀곡 ‘Nebula’ 포함 총 6곡 수록</p><small>1시간 전</small></div><strong>›</strong></article><article><img src={fanWeekLavenderMeet} alt="" /><div><b>드림스케이프, 글로벌 차트 1위!</b><p>신곡 ‘Nebula’ 글로벌 인기 상승</p><small>1일 전</small></div><strong>›</strong></article></div></section><section id="artist-cards" className="hub-section"><div className="section-heading"><h3>새 카드</h3><button type="button">전체 보기 ›</button></div><div className="hub-card-row">{[cardYunaImage, cardMinhoImage, cardJayImage].map((image, index) => <button type="button" key={image} onClick={() => undefined}><img src={image} alt="새 카드" /><b>{['하린', '도윤', '제이'][index]}<br />Nebula Ver.</b><span>{index === 0 ? 'UR' : 'SR'}</span></button>)}</div><div className="hub-card-dots" aria-hidden="true"><b /><i /><i /></div><a className="hub-event-promo" href="/events"><span className="hub-event-promo-icon" aria-hidden="true"><InlineIcon name="gift" /></span><b><small>팬 이벤트</small>드림스케이프 사인 폴라로이드 이벤트<em>참여하고 사인 폴라로이드를 받아보세요!</em></b><strong>참여하기</strong><i>›</i></a></section></section>
}

function notificationTimeLabel(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days === 1) return '어제'
  return days < 7 ? `${days}일 전` : new Date(createdAt).toLocaleDateString('ko-KR')
}

function notificationDestination(kind: string): Tab | null {
  if (kind === 'card_redeemed') return 'collection'
  if (kind === 'card_published' || kind === 'drop_started') return 'discover'
  return null
}

function Alerts({ items, error, actionError, onDismissActionError, onRetry, onRead, onReadAll, onBack, onNavigate }: { items: NotificationItem[], error: string, actionError: string, onDismissActionError: () => void, onRetry: () => void, onRead: (id: string) => Promise<void>, onReadAll: () => Promise<void>, onBack: () => void, onNavigate: (tab: Tab) => void }) {
  const [category, setCategory] = useState<'all' | 'activity'>('all')
  const categories = [
    { value: 'all', label: '전체', matches: () => true },
    { value: 'activity', label: '활동', matches: (item: NotificationItem) => item.kind !== 'system' },
  ] as const
  const selectedCategory = categories.find(item => item.value === category) ?? categories[0]
  const filteredItems = items.filter(selectedCategory.matches)
  const unreadCount = items.filter(item => !item.isRead).length
  const unreadFor = (value: typeof category) => items.filter(item => !item.isRead && categories.find(categoryItem => categoryItem.value === value)?.matches(item)).length

  const dayLabel = (createdAt: string) => {
    const created = new Date(createdAt)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()
    const dayDiff = Math.round((startOfToday - startOfCreated) / 86_400_000)
    if (dayDiff <= 0) return '오늘'
    if (dayDiff === 1) return '어제'
    return created.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  }

  const groups = filteredItems.reduce<Array<{ label: string, items: NotificationItem[] }>>((acc, item) => {
    const label = dayLabel(item.createdAt)
    const group = acc.find(entry => entry.label === label)
    if (group) group.items.push(item)
    else acc.push({ label, items: [item] })
    return acc
  }, [])

  const openNotification = (item: NotificationItem) => {
    if (!item.isRead) void onRead(item.id)
    const destination = notificationDestination(item.kind)
    if (destination) onNavigate(destination)
  }

  const iconName = (kind: string): 'card' | 'gift' | 'calendar' | 'system' => {
    if (kind === 'card_published' || kind === 'card_redeemed') return 'card'
    if (kind === 'drop_started') return 'gift'
    if (kind === 'system') return 'calendar'
    return 'system'
  }

  return <>
    <div className="alerts-reference-topbar">
      <button type="button" className="alerts-back-button" aria-label="뒤로가기" onClick={onBack}><InlineIcon name="back" /></button>
      <h1>알림</h1>
      <button type="button" className="alerts-settings-button" aria-label="알림 설정" onClick={() => onNavigate('settings')}><InlineIcon name="settings" /></button>
    </div>
    {actionError && <div className="inline-retry notification-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={onDismissActionError}>닫기</button></div>}
    {error ? <div className="notification-error-panel" role="alert"><span className="notification-error-icon" aria-hidden="true"><NavIcon name="alerts" /></span><div><b>알림을 불러오지 못했어요</b><p>{error}</p></div><button type="button" onClick={onRetry}>다시 시도</button></div> : <>
      <div className="alerts-reference-tabs" role="tablist" aria-label="알림 필터">{categories.map(item => <button key={item.value} role="tab" aria-selected={category === item.value} className={category === item.value ? 'active' : ''} onClick={() => setCategory(item.value)}><span>{item.label}</span>{unreadFor(item.value) > 0 && <b>{unreadFor(item.value)}</b>}</button>)}</div>
      {groups.length > 0 ? <>{groups.map(group => <section className="notification-day" key={group.label}><h2>{group.label}</h2><div className="alert-list">{group.items.map(item => { const destination = notificationDestination(item.kind); return <button className={item.isRead ? 'alert-card read' : 'alert-card'} key={item.id} aria-label={`${item.title} 알림${destination ? ' 열기' : ''}`} onClick={() => openNotification(item)}><span className={`alert-leading-icon ${item.kind}`} aria-hidden="true"><InlineIcon name={iconName(item.kind)} /></span><span className="notification-copy"><strong>{item.title}</strong><small>{notificationTimeLabel(item.createdAt).replace(' 전', '')}</small></span>{!item.isRead && <span className="unread-dot" aria-label="읽지 않음" />}</button> })}</div></section>)}<div className="empty-slot notification-empty" role="status"><span className="notification-empty-illustration"><NavIcon name="alerts" /><InlineIcon name="sparkles" /></span><b>새로운 알림이 없어요</b><small>중요한 소식이 여기에 표시돼요.</small></div></> : <div className="empty-slot notification-empty" role="status"><span className="notification-empty-illustration"><NavIcon name="alerts" /><InlineIcon name="sparkles" /></span><b>새로운 알림이 없어요</b><small>중요한 소식이 여기에 표시돼요.</small></div>}
      <button type="button" className="alerts-mark-all" onClick={() => void onReadAll()} disabled={unreadCount === 0}>모두 읽음</button>
    </>}
  </>
}


type RevealCardProps = {
  userCardId: string
  collectionSummary: CollectionSummary
  fanProgression: FanProgression | null
  onClose: () => void
  onViewCollection: () => void
  onRegisterAnother: () => void
  onStart: () => void
}

function RevealCard({ userCardId, collectionSummary, fanProgression, onClose, onViewCollection, onRegisterAnother, onStart }: RevealCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const revealTimerRef = useRef<number | null>(null)
  const isRandomReveal = import.meta.env.DEV && userCardId === 'qa-registration-complete'
  const [phase, setPhase] = useState<'mystery' | 'revealing' | 'revealed' | 'complete'>(() => isRandomReveal ? 'mystery' : 'revealed')
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

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current)
  }, [])

  const reveal = () => {
    if (!isRandomReveal && (!detail || detailLoading || detailError)) return
    if (phase === 'revealing') return
    setPhase('revealing')
    revealTimerRef.current = window.setTimeout(() => setPhase('revealed'), 900)
  }

  const completeRegistration = () => {
    setPhase('complete')
    try { window.sessionStorage.setItem(revealStorageKey(userCardId), '1') } catch { /* optional completion-state cache */ }
  }

  if (phase === 'complete' && (detail || isRandomReveal)) {
    const rarity = isRandomReveal ? 'SR' : (detail?.card.rarity?.toUpperCase() || 'SR')
    const level = fanProgression?.level.level ?? 1
    const totalXp = fanProgression?.level.totalXp ?? 100
    const nextLevelXp = fanProgression?.level.nextLevelXp ?? Math.max(100, level * 100)
    const displayOwnedCount = isRandomReveal ? Math.max(1, collectionSummary.ownedCount) : collectionSummary.ownedCount
    const displayTotalSlots = isRandomReveal ? 40 : collectionSummary.totalSlots
    const displayXpLabel = isRandomReveal ? '100 XP 획득' : `${totalXp} XP 누적`
    const levelProgress = isRandomReveal ? 42 : Math.min(100, Math.max(0, (totalXp / nextLevelXp) * 100))
    const collectionProgress = Math.min(100, Math.max(0, (displayOwnedCount / displayTotalSlots) * 100))
    const artistName = isRandomReveal ? '드림스케이프' : (detail?.card.artistName ?? '드림스케이프')
    const memberName = isRandomReveal ? '하린' : (detail?.card.memberName ?? '공식 카드')
    const cardName = isRandomReveal ? 'Nebula Ver.' : (detail?.card.name ?? '공식 카드')
    const seasonName = isRandomReveal ? '2026 SPRING' : (detail?.card.seasonName ?? 'FANFOLIO COLLECTION')
    const cardImage = isRandomReveal ? registrationCardImage : demoCardImage(resolveApiUrl(detail?.card.imageUrl), `member:${memberName}`)

    return <main className="registration-complete-screen">
      <header className="registration-complete-topbar">
        <button ref={closeButtonRef} type="button" className="registration-complete-back" aria-label="카드 공개 화면으로 돌아가기" onClick={onClose}><InlineIcon name="back" /></button>
        <b>등록 완료</b>
        <strong>4 / 4</strong>
      </header>
      <div className="registration-complete-progress" role="progressbar" aria-label="카드 등록 진행률" aria-valuemin={0} aria-valuemax={4} aria-valuenow={4}><span /></div>

      <section className="registration-complete-hero" aria-labelledby="registration-complete-title">
        <div className="registration-complete-celebration" aria-hidden="true">
          <img className="registration-complete-celebration-art" src={registrationCompleteCelebration} alt="" />
        </div>
        <h1 id="registration-complete-title">첫 카드가 컬렉션에 추가됐어요!</h1>
        <p>{memberName}의 새로운 순간을 보관함에서 만나보세요.</p>
      </section>

      <article className="registration-complete-card-summary">
        <div className="registration-complete-card-art">
          <img src={cardImage} alt={`${cardName} 카드`} onError={event => keepCardVisual(event, userCardId)} />
          <span>{rarity}</span>
        </div>
        <div className="registration-complete-card-copy">
          <h2>{memberName} · {cardName}</h2>
          <p>{artistName} {seasonName}</p>
          <span className="registration-complete-rarity">{rarity}</span>
          <button type="button" className="registration-complete-favorite" aria-label="관심 카드로 저장"><InlineIcon name="heart" /></button>
        </div>
      </article>

      <section className="registration-complete-stats" aria-label="등록 보상 요약">
        <article>
          <span className="registration-complete-stat-icon"><InlineIcon name="card" /></span>
          <b>컬렉션 진행률</b>
          <strong>{displayOwnedCount} <small>/ {displayTotalSlots}</small></strong>
          <span className="registration-complete-stat-progress"><i style={{ width: `${collectionProgress}%` }} /></span>
        </article>
        <article>
          <span className="registration-complete-stat-icon"><InlineIcon name="users" /></span>
          <b>팬 레벨</b>
          <strong>Lv.{level}</strong>
          <small>{displayXpLabel}</small>
          <span className="registration-complete-level-emblem" aria-hidden="true"><img src={fanLevelStar} alt="" /></span>
          <span className="registration-complete-stat-progress"><i style={{ width: `${levelProgress}%` }} /></span>
        </article>
      </section>

      <div className="registration-complete-mission">
        <span><InlineIcon name="calendar" /></span>
        <b>첫 카드 등록하기</b>
        <strong>완료&nbsp; +100 XP</strong>
      </div>

      <section className="registration-complete-next">
        <h2>다음으로 무엇을 할까요?</h2>
        <div className="registration-complete-actions">
          <button type="button" onClick={onViewCollection}>
            <span><NavIcon name="collection" /></span>
            <b>보관함에서 카드 보기</b>
            <small>내가 등록한 카드를 보관함에서 확인해보세요.</small>
            <InlineIcon name="chevron" />
          </button>
          <button type="button" onClick={onRegisterAnother}>
            <span><RedeemIcon name="scan" /></span>
            <b>새 카드 더 등록하기</b>
            <small>다른 카드도 등록하고 컬렉션을 채워보세요.</small>
            <InlineIcon name="chevron" />
          </button>
        </div>
      </section>

      <footer className="registration-complete-footer">
        <button type="button" className="primary" onClick={onStart}>홈으로 이동</button>
        <small>언제든 보관함에서 카드를 관리할 수 있어요.</small>
      </footer>
    </main>
  }

  const rarity = isRandomReveal ? 'SR' : (detail?.card.rarity?.toUpperCase() || 'SR')
  const memberName = isRandomReveal ? '하린' : (detail?.card.memberName ?? '공식 카드')
  const cardName = isRandomReveal ? 'Nebula Ver.' : (detail?.card.name ?? '카드 정보 확인 중')
  const artistName = isRandomReveal ? '드림스케이프' : (detail?.card.artistName ?? 'Fanfolio')
  const seasonName = isRandomReveal ? '2026 SPRING' : (detail?.card.seasonName ?? 'COLLECTION')
  const serialNumber = isRandomReveal ? 'DS-HR-024' : `#${String(detail?.serialNumber ?? 0).padStart(3, '0')}`
  const cardImage = isRandomReveal ? registrationCardImage : demoCardImage(resolveApiUrl(detail?.card.imageUrl), `member:${memberName}`)

  if (phase === 'mystery' || phase === 'revealing') {
    const isRevealing = phase === 'revealing'
    return <main className="reveal-screen reveal-mystery-screen">
      <header className="card-reveal-topbar">
        <button ref={closeButtonRef} type="button" className="card-reveal-close" aria-label="카드 공개 닫기" onClick={onClose}>×</button>
        <b>카드 공개</b>
        <strong>3 / 4</strong>
      </header>
      <div className="card-reveal-progress" role="progressbar" aria-label="카드 등록 진행률" aria-valuemin={0} aria-valuemax={4} aria-valuenow={3}><span /></div>
      <section className="reveal-mystery-copy">
        <span>랜덤 카드 도착</span>
        <h1>랜덤 카드가 도착했어요</h1>
        <p>어떤 카드인지 공개하기 전까지 알 수 없어요.</p>
      </section>
      <div className={isRevealing ? 'reveal-mystery-card is-revealing' : 'reveal-mystery-card'}>
        <img src={mysteryCardImage} alt="아직 공개되지 않은 랜덤 카드" />
        {isRevealing && <span className="reveal-animation-status" role="status" aria-live="polite">카드를 공개하는 중이에요</span>}
      </div>
      <button type="button" className="primary card-reveal-primary" onClick={reveal} disabled={isRevealing}>{isRevealing ? '카드 공개 중…' : '카드 공개하기'}</button>
    </main>
  }

  return <main className="reveal-screen card-reveal-result">
    <header className="card-reveal-topbar">
      <button ref={closeButtonRef} type="button" className="card-reveal-close" aria-label="카드 공개 닫기" onClick={onClose}>×</button>
      <b>카드 공개</b>
      <strong>3 / 4</strong>
    </header>
    <div className="card-reveal-progress" role="progressbar" aria-label="카드 등록 진행률" aria-valuemin={0} aria-valuemax={4} aria-valuenow={3}><span /></div>

    <section className="card-reveal-hero" aria-labelledby="card-reveal-title">
      <h1 id="card-reveal-title">새로운 카드를 발견했어요!</h1>
      <InteractiveCollectibleCard
        imageUrl={cardImage}
        imageAlt={`${memberName} ${cardName} 카드 앞면`}
        identity={userCardId}
        title={cardName}
        artist={artistName}
        member={memberName}
        serialLabel={serialNumber}
        limitLabel={detail?.card.issueLimit ? `${detail.card.issueLimit.toLocaleString()}장` : 'FANFOLIO'}
        sealLabel={detail?.card.id.slice(-8).toUpperCase() ?? 'DSHR024'}
        designConfig={isRandomReveal ? qaRevealDesignConfig : detail?.card.designConfig}
        lenticularImageUrl={detail?.card.lenticularImageUrl ? resolveApiUrl(detail.card.lenticularImageUrl) : null}
        hiddenMessage={isRandomReveal ? '드림스케이프 공식 컬렉션 카드' : undefined}
        badgeLabel={rarity}
        onImageError={event => keepCardVisual(event, userCardId)}
        presentation="reveal"
        enableDeviceMotion={false}
      />
      <span className="card-reveal-new">NEW</span>
      <h2>{memberName} · {cardName}</h2>
      <p>{artistName} {seasonName}</p>
    </section>

    {detailLoading && !isRandomReveal && <p className="reveal-status" role="status">카드 정보를 확인하는 중이에요…</p>}
    {detailError && !isRandomReveal && <div className="reveal-error" role="alert"><span>카드 정보를 불러오지 못했어요.</span><button type="button" className="outline" onClick={() => setDetailAttempt(value => value + 1)}>다시 시도</button></div>}

    <section className="card-reveal-meta" aria-label="공개된 카드 정보">
      <div><span><InlineIcon name="card" /></span><small>등급</small><b>{rarity}</b></div>
      <div><span><InlineIcon name="grid" /></span><small>카드 번호</small><b>{serialNumber}</b></div>
      <div><span><InlineIcon name="gift" /></span><small>획득</small><b>1번째</b></div>
    </section>
    <div className="card-reveal-bonus"><span><InlineIcon name="gift" /></span><b>첫 카드 등록 보너스</b><strong>+100 XP</strong></div>
    <button type="button" className="primary card-reveal-primary" onClick={completeRegistration} disabled={!detail && !isRandomReveal}>컬렉션에 추가</button>
    <button type="button" className="card-reveal-again" onClick={() => setPhase('mystery')}>다시 확인하기</button>
  </main>
}
export function NavItem({ active, label, icon = label === '탐색' ? 'discover' : label === '알림' ? 'alerts' : label === '팬 레벨' ? 'growth' : label === '설정' ? 'settings' : 'collection', badge, onClick }: { active: boolean, label: string, icon?: 'home' | 'collection' | 'discover' | 'alerts' | 'growth' | 'settings', badge?: number, onClick: () => void }) { return <button type="button" className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined} onClick={onClick}><NavIcon name={icon} />{label}{badge ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}</button> }

function BottomNavigation({ active, onNavigate }: { active: Tab; onNavigate: (tab: Tab) => void }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">
    <NavItem active={active === 'discover'} label="탐색" icon="discover" onClick={() => onNavigate('discover')} />
    <NavItem active={active === 'collection'} label="보관함" icon="collection" onClick={() => onNavigate('collection')} />
    <NavItem active={active === 'home'} label="홈" icon="home" onClick={() => onNavigate('home')} />
    <NavItem active={active === 'growth'} label="팬 레벨" icon="growth" onClick={() => onNavigate('growth')} />
    <NavItem active={active === 'settings'} label="마이" icon="settings" onClick={() => onNavigate('settings')} />
  </nav>
}

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

export function InlineIcon({ name }: { name: 'search' | 'card' | 'system' | 'dot' | 'plus' | 'list' | 'grid' | 'back' | 'heart' | 'chevron' | 'gift' | 'clock' | 'pin' | 'share' | 'calendar' | 'users' | 'check' | 'camera' | 'star' | 'rotate' | 'sparkles' | 'motion' | 'settings' | 'bell' }) {
  const paths = {
    search: 'm20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z',
    card: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM8 9h8M8 13h5',
    system: 'M12 8v4M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    dot: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    plus: 'M12 5v14M5 12h14',
    list: 'M5 6h14M5 12h14M5 18h14',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    back: 'm14.5 18-6-6 6-6M8.5 12h9',
    heart: 'M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z',
    chevron: 'm9 18 6-6-6-6',
    gift: 'M4 9h16v11H4zM3 6.5h18v2.5H3zM12 6.5V20M12 6.5C10 6.5 7.5 5.3 7.5 3.8A2.3 2.3 0 0 1 12 5v1.5ZM12 6.5c2 0 4.5-1.2 4.5-2.7A2.3 2.3 0 0 0 12 5v1.5Z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    pin: 'M19 10.2c0 4.2-7 10.3-7 10.3S5 14.4 5 10.2a7 7 0 1 1 14 0ZM12 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    share: 'M12 15V3m0 0 4 4m-4-4L8 7M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
    calendar: 'M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2ZM8 2v4M16 2v4M3 9h18',
    users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 1 0-1-5.8M21 20v-1.4a4 4 0 0 0-3-3.9',
    check: 'm5 12.5 4.2 4.2L19 7',
    camera: 'M4 7.5h3l1.5-2h7l1.5 2h3v11H4v-11ZM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
    rotate: 'M5 9a7.5 7.5 0 0 1 12.8-3.8L20 7.4M20 7.4V3.8M20 7.4h-3.6M19 15a7.5 7.5 0 0 1-12.8 3.8L4 16.6M4 16.6v3.6M4 16.6h3.6',
    sparkles: 'm12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6L5 15Z',
    motion: 'M8 5H5v3M5 8a8 8 0 0 1 13.6-3.6M16 19h3v-3M19 16a8 8 0 0 1-13.6 3.6',
    settings: 'M12 3.5 14 5l2.5-.2 1.1 2.2 2.2 1.1-.2 2.5 1.5 2-1.5 2 .2 2.5-2.2 1.1-1.1 2.2-2.5-.2-2 1.5-2-1.5-2.5.2-1.1-2.2-2.2-1.1.2-2.5-1.5-2 1.5-2-.2-2.5 2.2-1.1 1.1-2.2L10 5l2-1.5ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
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
