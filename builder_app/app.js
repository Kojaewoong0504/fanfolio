import {
  buildCardPayload,
  cardDraftErrors,
  cardEditorStage,
  navigationState,
  normalizeCardEffects,
  normalizeCatalogSelection,
  normalizeCreativeLayer,
  responsiveStudioMode,
  reviewReadiness,
  studioDashboard,
} from './studio-core.js?v=effects-contract-20260826'

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const localApiQuery = isLocalHost
  ? new URLSearchParams(window.location.search).get('api')
  : ''

const API_BASE = isLocalHost
  ? localApiQuery ||
    localStorage.getItem('fanfolio_api_base') ||
    'http://localhost:8000/api'
  : '/api'

const DRAFT_KEY = 'fanfolio_artist_special_card_draft_v2'
const SIDEBAR_KEY = 'fanfolio_artist_studio_sidebar_collapsed'
const app = document.querySelector('#app')
let ACCESS_TOKEN = ''
let refreshInFlight = null
let autosaveTimer = null
let mediaRecorder = null
let mediaStream = null
let recordedChunks = []
let deviceMotionListenerAttached = false

const sampleAssets = {
  aurora: './assets/card-aurora-portrait.jpg',
  motion: './assets/card-motion-stage.jpg',
  stardust: './assets/card-stardust-backstage.jpg',
}

const builtInStickers = [
  {
    id: 'opal-heart',
    name: '오팔 하트',
    source: './assets/stickers/sticker-opal-heart.png',
  },
  {
    id: 'shooting-star',
    name: '슈팅 스타',
    source: './assets/stickers/sticker-shooting-star.png',
  },
  {
    id: 'opal-butterfly',
    name: '오팔 버터플라이',
    source: './assets/stickers/sticker-opal-butterfly.png',
  },
  {
    id: 'moon-tiara',
    name: '문 티아라',
    source: './assets/stickers/sticker-moon-tiara.png',
  },
]

const materialOptions = [
  ['matte', '무광', '빛을 눌러 사진에 집중'],
  ['pearl', '펄', '은은한 진주광'],
  ['chrome', '크롬', '선명한 금속 반사'],
]

const foilPatternOptions = [
  ['aurora-wave', '오로라 웨이브'],
  ['prism', '프리즘'],
  ['cracked-ice', '크랙드 아이스'],
  ['micro-star', '마이크로 스타'],
]

const foilCoverageOptions = [
  ['full', '전체'],
  ['background', '배경'],
  ['frame', '프레임'],
  ['signature', '로고·사인'],
]

const interactionOptions = [
  ['static', '정적'],
  ['tilt', '기울임'],
  ['lenticular', '렌티큘러'],
]

const backMaterialOptions = [
  ['matte', '무광'],
  ['pearl', '펄'],
  ['chrome', '크롬'],
]

const backEdgeFoilOptions = [
  ['none', '없음'],
  ['silver', '실버'],
  ['gold', '골드'],
]

const backSpotUvOptions = [
  ['none', '없음'],
  ['logo', '로고'],
  ['symbol', '심볼'],
  ['serial', '시리얼'],
]

const recipes = [
  {
    id: 'voice',
    eyebrow: 'VOICE MOMENT',
    name: '보이스 메시지 카드',
    description: '사진과 함께 팬에게만 들려주는 음성 메시지를 담아요.',
    image: sampleAssets.aurora,
    icon: 'graphic_eq',
    accent: 'violet',
  },
  {
    id: 'motion',
    eyebrow: 'LIVE MOTION',
    name: '모션 스테이지 카드',
    description: '짧은 무대 영상을 연결해 살아 움직이는 카드를 만들어요.',
    image: sampleAssets.motion,
    icon: 'movie',
    accent: 'blue',
  },
  {
    id: 'hologram',
    eyebrow: 'PRISM EDITION',
    name: '홀로그램 리미티드',
    description: '빛의 각도와 강도를 조절해 한정판 광택을 완성해요.',
    image: sampleAssets.stardust,
    icon: 'auto_awesome',
    accent: 'pink',
  },
  {
    id: 'signature',
    eyebrow: 'HANDWRITTEN',
    name: '손글씨 시그니처',
    description: '직접 쓴 메시지나 사인을 투명 레이어로 올려요.',
    image: sampleAssets.stardust,
    icon: 'draw',
    accent: 'navy',
  },
]

function initialForm() {
  return {
    templateId: 'template_signature_v1',
    name: '오로라 스페셜 카드',
    seasonName: '2026 SUMMER',
    rarity: 'SR',
    artistId: null,
    memberId: null,
    signatureText: '오늘도 우리와 함께해 줘서 고마워요.',
    imageAssetId: null,
    handwritingAssetId: null,
    voiceAssetId: null,
    videoAssetId: null,
    hasVoice: false,
    issueLimit: 300,
    designConfig: null,
  }
}

function initialEditor() {
  return {
    tool: 'photo',
    side: 'front',
    imageSrc: '',
    imageName: '',
    imageFile: null,
    imageAssetId: null,
    material: 'pearl',
    foilPattern: 'aurora-wave',
    foilCoverage: 'full',
    interaction: 'tilt',
    lenticularSrc: '',
    lenticularFile: null,
    lenticularAssetId: null,
    videoSrc: '',
    videoName: '',
    videoFile: null,
    videoAssetId: null,
    videoEnabled: false,
    videoLoop: true,
    videoPosterTime: 0,
    voiceSrc: '',
    voiceName: '',
    voiceFile: null,
    voiceAssetId: null,
    voiceEnabled: false,
    voiceTrimStart: 0,
    voiceTrimEnd: 0,
    handwritingSrc: '',
    handwritingFile: null,
    handwritingAssetId: null,
    handwritingEnabled: false,
    handwritingNeedsRemoval: false,
    handwritingTransform: { x: 96, y: 1010, width: 520, rotation: -4 },
    layers: [],
    selectedLayerId: null,
    inspectorOpen: false,
    drawingColor: '#6b58ef',
    drawingSize: 7,
    drawingDraftSrc: '',
    effect: 'holographic',
    effectPreset: 'aurora',
    effectIntensity: 0.58,
    effectAngle: 135,
    effectMotion: true,
    effectSpread: 0.64,
    effectGrain: 0.38,
    effectFinish: 'glass',
    backEffect: 'sparkle',
    backMaterial: 'matte',
    backEdgeFoil: 'silver',
    backSpotUv: 'logo',
    backHiddenMessage: '',
    background: '#0b1033',
    backTemplateId: 'agency_back_v1',
    previewOpened: false,
  }
}

function draftStorageKey(userId = state.profile?.id) {
  if (!userId) return ''
  return `${DRAFT_KEY}:${userId}`
}

function readDraft(userId) {
  const key = draftStorageKey(userId)
  if (!key) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const savedSidebarPreference = localStorage.getItem(SIDEBAR_KEY)
const initialViewportMode = responsiveStudioMode(window.innerWidth)
const state = {
  loading: true,
  authenticated: false,
  mustChangePassword: false,
  loginError: '',
  view: 'home',
  stage: 'design',
  cards: [],
  catalog: { items: [], artists: [], members: [], backTemplates: [] },
  insights: null,
  profile: null,
  cardId: null,
  effectVersionId: null,
  editingCardId: null,
  selectedRecipe: 'voice',
  form: initialForm(),
  editor: initialEditor(),
  viewportMode: initialViewportMode,
  sidebarCollapsed:
    savedSidebarPreference === null
      ? initialViewportMode === 'tablet'
      : savedSidebarPreference === 'true',
  reviewNote: '',
  saveStatus: 'saved',
  busy: false,
  recording: false,
  deviceMotionStatus: 'idle',
  deviceMotionEnabled: false,
  jobStatus: '',
  reviewError: '',
  submissionMessage: '',
  collaborationComments: [],
  collaborationCommentError: '',
}

function icon(name, className = '') {
  return `<span class="material-symbols-rounded ${className}" aria-hidden="true">${name}</span>`
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function absoluteApiUrl(path) {
  if (!path) return ''
  if (/^(https?:|blob:|data:)/.test(path)) return path
  return `${API_BASE.replace(/\/api$/, '')}${path}`
}

function normalizedMediaType(type, kind) {
  if (kind === 'voice' && type.startsWith('audio/webm')) return 'audio/webm'
  if (kind === 'voice' && type.startsWith('audio/mp4')) return 'audio/mp4'
  return type
}

function persistDraft() {
  const key = draftStorageKey()
  if (!key) return
  const editor = Object.fromEntries(
    Object.entries(state.editor).filter(
      ([key, value]) =>
        !key.endsWith('File') &&
        !(key.endsWith('Src') && typeof value === 'string' && value.startsWith('blob:')),
    ),
  )
  editor.layers = (state.editor.layers || []).map(({ file, ...layer }) => ({
    ...layer,
    src: layer.src?.startsWith('blob:') ? undefined : layer.src,
  }))
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        cardId: state.cardId,
        editingCardId: state.editingCardId,
        selectedRecipe: state.selectedRecipe,
        form: state.form,
        editor,
      }),
    )
  } catch {
    // Local draft persistence is a convenience. API saving remains authoritative.
  }
}

function clearDraft(userId = state.profile?.id) {
  const key = draftStorageKey(userId)
  if (key) localStorage.removeItem(key)
  localStorage.removeItem(DRAFT_KEY)
}

function restoreDraftForUser(userId, cards = []) {
  const draft = readDraft(userId)
  localStorage.removeItem(DRAFT_KEY)
  if (!draft) return
  const card = draft.cardId ? cards.find((item) => item.id === draft.cardId) : null
  const cardExists = Boolean(card && cardEditorStage(card) === 'design')
  if (draft.cardId && card && !cardExists) {
    localStorage.removeItem(draftStorageKey(userId))
    return
  }
  state.cardId = cardExists ? draft.cardId : null
  state.editingCardId = cardExists ? draft.editingCardId || draft.cardId : null
  state.effectVersionId = draft.effectVersionId || null
  state.selectedRecipe = draft.selectedRecipe || 'voice'
  state.form = { ...initialForm(), ...(draft.form || {}) }
  state.editor = { ...initialEditor(), ...(draft.editor || {}) }
  state.saveStatus = 'saved'
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Fanfolio-Client': 'artist' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('AUTH_REQUIRED')
      const body = await response.json()
      ACCESS_TOKEN = body.data.accessToken
      return ACCESS_TOKEN
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

async function authorizedFetch(path, options = {}, allowRefresh = true) {
  const hasBody = options.body !== undefined && !(options.body instanceof FormData)
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      'X-Fanfolio-Client': 'artist',
      ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    await refreshAccessToken()
    return authorizedFetch(path, options, false)
  }
  if (!response.ok) {
    let body = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    const error = new Error(body?.error?.message || `API 요청에 실패했습니다. (${response.status})`)
    error.status = response.status
    error.code = body?.error?.code
    throw error
  }
  return response
}

async function api(path, options = {}) {
  const response = await authorizedFetch(path, options)
  return response.status === 204 ? null : response.json()
}

async function fetchProtectedBlob(path) {
  if (!path) return ''
  const apiPath = path.replace(/^\/api/, '')
  const response = await authorizedFetch(apiPath)
  return URL.createObjectURL(await response.blob())
}

function notify(message, tone = 'default') {
  let toast = document.querySelector('#studio-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'studio-toast'
    toast.className = 'studio-toast'
    toast.setAttribute('role', 'status')
    document.body.append(toast)
  }
  toast.textContent = message
  toast.dataset.tone = tone
  toast.classList.add('show')
  window.clearTimeout(notify.timer)
  notify.timer = window.setTimeout(() => toast.classList.remove('show'), 3400)
}

function statusLabel(status, releaseStatus = '') {
  if (releaseStatus) return releaseStatusLabel(releaseStatus)
  return (
    {
      draft: '초안',
      pending_review: '검수 중',
      changes_requested: '수정 요청',
      published: '공개됨',
    }[status] || status
  )
}

function releaseStatusLabel(releaseStatus) {
  return (
    {
      draft: '초안',
      pending_partner_review: '소속사 검수 대기',
      pending_platform_review: 'Fanfolio 운영 검수 대기',
      changes_requested: '수정 요청',
      approved: '승인 완료 · 드롭 연결 대기',
      drop_ready: '드롭 공개 대기',
      published: '팬앱 공개 중',
    }[releaseStatus] || releaseStatus
  )
}

function releaseStatusCopy(card = {}) {
  const status = card.releaseStatus || card.status || 'draft'
  const copy = {
    draft: ['edit_note', '초안 작업 중', '디자인과 카드 정보를 저장한 뒤 검수를 요청해 주세요.'],
    pending_partner_review: ['schedule', '소속사 담당자 검수 중', '담당 관리자에게 검수 요청이 전달됐어요.'],
    pending_platform_review: ['verified_user', 'Fanfolio 운영 검수 중', '특별 카드 공개를 위한 운영 검수가 진행 중이에요.'],
    changes_requested: ['edit_note', '수정 요청이 도착했어요', card.reviewNote || '관리자 피드백을 반영한 뒤 다시 검수를 요청해 주세요.'],
    approved: ['task_alt', '승인 완료', '담당 관리자가 드롭에 연결하면 공개 일정을 준비할 수 있어요.'],
    drop_ready: ['rocket_launch', '드롭 공개 대기', '드롭이 라이브되는 순간 팬앱 카탈로그에 자동으로 표시돼요.'],
    published: ['public', '팬앱 공개 중', '팬이 탐색하고 코드로 컬렉션에 등록할 수 있어요.'],
  }[status] || ['info', '상태 확인 중', '카드 상태를 불러오고 있어요.']
  return { status, iconName: copy[0], title: copy[1], description: copy[2] }
}

function releaseStatusBanner(card, { compact = false } = {}) {
  const release = releaseStatusCopy(card)
  return `<div class="release-status-banner ${esc(release.status)} ${compact ? 'compact' : ''}">
    ${icon(release.iconName)}
    <span><strong>${esc(release.title)}</strong><small>${esc(release.description)}</small></span>
  </div>`
}

function saveLabel() {
  return {
    saved: '저장됨',
    dirty: '변경사항 있음',
    saving: '저장 중',
    error: '저장 필요',
  }[state.saveStatus]
}

function brand() {
  return `<div class="studio-brand">
    <img src="./assets/fanfolio-studio-mark-512.png" alt="" />
    <div><strong>FANFOLIO</strong><span>ARTIST STUDIO</span></div>
  </div>`
}

function loadingView() {
  return `<main class="loading-page">
    <img src="./assets/fanfolio-studio-mark-512.png" alt="" />
    <span class="loading-line" aria-hidden="true"></span>
    <p>안전한 스튜디오 세션을 불러오고 있어요.</p>
  </main>`
}

function loginView() {
  const changePassword = state.mustChangePassword
  return `<main class="login-page">
    <section class="login-visual" aria-label="Fanfolio 특별 카드 소개">
      <div class="login-visual-copy">${brand()}<span>OFFICIAL CARD EXPERIENCE</span><h1>팬에게 오래 남을<br />한 장을 만드세요.</h1><p>보이스, 모션, 홀로그램과 손글씨를 하나의 특별 카드에 담을 수 있어요.</p></div>
      <div class="login-card-stack" aria-hidden="true">
        <img src="${sampleAssets.aurora}" alt="" />
        <img src="${sampleAssets.motion}" alt="" />
      </div>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <span class="login-kicker">${changePassword ? 'FIRST SIGN IN' : 'WELCOME BACK'}</span>
        <h2>${changePassword ? '새 비밀번호를 설정해 주세요' : '아티스트 스튜디오 로그인'}</h2>
        <p>${changePassword ? '처음 받은 임시 비밀번호를 나만의 비밀번호로 변경합니다.' : '운영팀에서 발급한 전용 아이디와 비밀번호를 사용해 주세요.'}</p>
        <form id="${changePassword ? 'change-password-form' : 'login-form'}" class="login-form">
          ${
            changePassword
              ? `<label>현재 비밀번호<div class="input-shell">${icon('lock')}<input name="currentPassword" type="password" autocomplete="current-password" required /></div></label>
                 <label>새 비밀번호<div class="input-shell">${icon('key')}<input name="newPassword" type="password" minlength="12" autocomplete="new-password" placeholder="12자 이상" required /></div></label>
                 <button class="primary-button full" type="submit">비밀번호 저장 후 입장</button>`
              : `<label>스튜디오 아이디<div class="input-shell">${icon('person')}<input name="username" autocomplete="username" placeholder="발급받은 아이디" required /></div></label>
                 <label>비밀번호<div class="input-shell">${icon('lock')}<input name="password" type="password" autocomplete="current-password" placeholder="비밀번호" required /></div></label>
                 <button class="primary-button full" type="submit">스튜디오 입장</button>`
          }
        </form>
        ${state.loginError ? `<p class="form-error" role="alert">${esc(state.loginError)}</p>` : ''}
        <div class="security-note">${icon('verified_user')}<span>로그인 세션은 HttpOnly 갱신 쿠키와 짧은 수명의 메모리 토큰으로 보호됩니다.</span></div>
      </div>
    </section>
  </main>`
}

function shell(content, title, activeView = state.view) {
  const navigation = [
    ['home', 'dashboard', '스튜디오 홈'],
    ['create', 'add_box', '카드 만들기'],
    ['cards', 'style', '내 카드'],
    ['feedback', 'monitoring', '팬 반응'],
    ['settings', 'settings', '설정'],
  ]
  const sidebarCollapsed = state.viewportMode !== 'phone' && state.sidebarCollapsed
  const editorFocused = state.view === 'editor'
  return `<div class="studio-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${editorFocused ? 'editor-focused' : ''}" data-viewport-mode="${state.viewportMode}">
    <aside class="studio-sidebar">
      <div class="sidebar-head">${brand()}<button type="button" class="sidebar-toggle" data-action="toggle-sidebar" aria-label="${sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}" aria-expanded="${!sidebarCollapsed}">${icon(sidebarCollapsed ? 'right_panel_open' : 'left_panel_close')}</button></div>
      <nav aria-label="스튜디오 주요 메뉴">
        ${navigation
          .map(
            ([view, symbol, label]) => `<button type="button" data-nav="${view}" class="${activeView === view ? 'active' : ''}" aria-label="${label}" title="${label}" ${activeView === view ? 'aria-current="page"' : ''}>
              ${icon(symbol)}<span class="nav-label">${label}</span>
            </button>`,
          )
          .join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="studio-sidebar-note">${icon('campaign')}<div><strong>콘텐츠 가이드</strong><span>팬에게 공개되기 전 운영팀 검수를 거쳐요.</span></div></div>
        <button type="button" class="profile-chip" data-nav="settings" aria-label="프로필과 설정" title="프로필과 설정">
          <span class="profile-avatar">${esc((state.profile?.nickname || '아').slice(0, 1))}</span>
          <span><strong>${esc(state.profile?.nickname || '아티스트')}</strong><small>${esc(state.profile?.username || 'ARTIST')}</small></span>
          ${icon('chevron_right')}
        </button>
      </div>
    </aside>
    <main class="studio-main">
      <header class="studio-topbar">
        <div><span class="topbar-kicker">FANFOLIO ARTIST STUDIO</span><h1>${esc(title)}</h1></div>
        <div class="topbar-actions">
          <span class="save-indicator ${state.saveStatus}"><i></i>${saveLabel()}</span>
          <button type="button" class="icon-button" data-action="help" aria-label="도움말">${icon('help')}</button>
          <button type="button" class="secondary-button compact" data-action="logout">로그아웃</button>
        </div>
      </header>
      <div class="studio-content">${content}</div>
    </main>
  </div>`
}

function metricCard(iconName, label, value, tone) {
  return `<article class="metric-card ${tone}"><span class="metric-icon">${icon(iconName)}</span><div><small>${label}</small><strong>${value}</strong></div></article>`
}

function homeView() {
  const dashboard = studioDashboard(state.cards)
  const actionable = dashboard.actionable.slice(0, 3)
  return `<section class="dashboard-view">
    <div class="dashboard-hero">
      <div class="dashboard-hero-copy"><span class="hero-kicker">SPECIAL CARD LAB</span><h2>이번 컴백의 순간을<br />특별 카드로 남겨보세요.</h2><p>보이스, 모션, 홀로그램을 조합하고 팬 화면까지 바로 미리볼 수 있어요.</p><div class="hero-actions"><button type="button" class="hero-button" data-nav="create">새 카드 만들기 ${icon('arrow_forward')}</button><button type="button" class="hero-link" data-nav="cards">초안 이어서 작업</button></div></div>
      <div class="hero-art" aria-hidden="true"><img src="${sampleAssets.aurora}" alt="" /><img src="./assets/hologram-aurora-texture.jpg" alt="" /></div>
    </div>
    <div class="metric-grid">
      ${metricCard('edit_note', '초안', dashboard.counts.draft, 'slate')}
      ${metricCard('rate_review', '검수 중', dashboard.counts.pendingReview, 'violet')}
      ${metricCard('notification_important', '수정 요청', dashboard.counts.changesRequested, 'pink')}
      ${metricCard('public', '공개 카드', dashboard.counts.published, 'blue')}
    </div>
    <div class="dashboard-columns">
      <section class="dashboard-panel">
        <div class="section-heading"><div><span>TO DO</span><h3>지금 확인할 카드</h3></div><button type="button" class="text-button" data-nav="cards">전체 보기 ${icon('arrow_forward')}</button></div>
        <div class="task-list">
          ${
            actionable.length
              ? actionable
                  .map(
                    (card, index) => `<button type="button" class="task-row" data-action="edit-card" data-card-id="${esc(card.id)}">
                      <img src="${index % 2 ? sampleAssets.motion : sampleAssets.stardust}" data-card-image="${esc(card.id)}" alt="" />
                      <span class="task-copy"><strong>${esc(card.name)}</strong><small>${esc(card.seasonName || '시즌 미정')} · ${esc(card.rarity || '등급 미정')}</small></span>
                      <span class="status-badge ${esc(card.status)}">${statusLabel(card.status)}</span>${icon('chevron_right')}
                    </button>`,
                  )
                  .join('')
              : `<div class="empty-inline">${icon('task_alt')}<div><strong>바로 처리할 카드가 없어요.</strong><span>새 카드 초안을 만들거나 검수 결과를 기다려 주세요.</span></div></div>`
          }
        </div>
      </section>
      <section class="dashboard-panel shortcut-panel">
        <div class="section-heading"><div><span>QUICK START</span><h3>특별 기능 바로 시작</h3></div></div>
        <div class="quick-recipes">
          ${recipes
            .slice(0, 3)
            .map(
              (recipe) => `<button type="button" data-recipe="${recipe.id}" class="quick-recipe"><span class="quick-recipe-icon ${recipe.accent}">${icon(recipe.icon)}</span><span><strong>${recipe.name}</strong><small>${recipe.description}</small></span>${icon('arrow_outward')}</button>`,
            )
            .join('')}
        </div>
      </section>
    </div>
  </section>`
}

function createView() {
  return `<section class="create-view">
    <div class="create-intro"><span class="page-kicker">CHOOSE A RECIPE</span><h2>어떤 특별함부터 담아볼까요?</h2><p>기능별 레시피를 선택하면 필요한 도구만 먼저 열어드려요. 편집 중 언제든 다른 기능을 더할 수 있습니다.</p></div>
    <div class="recipe-grid">
      ${recipes
        .map(
          (recipe) => `<article class="recipe-card ${recipe.accent}">
            <div class="recipe-image"><img src="${recipe.image}" alt="${esc(recipe.name)} 예시" /><span>${icon(recipe.icon)} ${recipe.eyebrow}</span></div>
            <div class="recipe-copy"><h3>${recipe.name}</h3><p>${recipe.description}</p><button type="button" data-recipe="${recipe.id}">이 레시피로 시작 ${icon('arrow_forward')}</button></div>
          </article>`,
        )
        .join('')}
    </div>
    <button type="button" class="blank-start" data-recipe="blank">${icon('add')}<span><strong>빈 카드에서 자유롭게 시작</strong><small>사진부터 선택하고 필요한 특별 기능을 직접 조합해요.</small></span>${icon('arrow_forward')}</button>
  </section>`
}

function selectedCreativeLayer() {
  return (state.editor.layers || []).find((layer) => layer.id === state.editor.selectedLayerId) || null
}

function builtInStickerSource(stickerId) {
  return builtInStickers.find((sticker) => sticker.id === stickerId)?.source || ''
}

function creativeLayerLabel(layer) {
  if (layer?.type === 'sticker') return '스티커'
  if (layer?.type === 'drawing') return '그림'
  return '손글씨'
}

function deleteSelectedLayer() {
  const selected = selectedCreativeLayer()
  if (!selected) return false
  if (selected.src?.startsWith('blob:')) URL.revokeObjectURL(selected.src)
  state.editor.layers = (state.editor.layers || []).filter((layer) => layer.id !== selected.id)
  if (selected.type === 'handwriting') {
    state.editor.handwritingSrc = ''
    state.editor.handwritingAssetId = null
    state.form.handwritingAssetId = null
  }
  state.editor.selectedLayerId = null
  markDirty()
  render()
  return true
}

function upsertCreativeLayer(type, values = {}) {
  const layers = state.editor.layers || []
  const existingIndex = values.id
    ? layers.findIndex((layer) => layer.id === values.id)
    : type === 'handwriting'
      ? layers.findIndex((layer) => layer.type === 'handwriting')
      : -1
  const current = existingIndex >= 0 ? layers[existingIndex] : null
  const layer = {
    ...(current || {}),
    id: current?.id || values.id || `${type}-${Date.now()}`,
    type,
    side: values.side || current?.side || state.editor.side || 'front',
    x: values.x ?? current?.x ?? 62,
    y: values.y ?? current?.y ?? 58,
    width: values.width ?? current?.width ?? (type === 'sticker' ? 26 : 42),
    rotation: values.rotation ?? current?.rotation ?? 0,
    opacity: values.opacity ?? current?.opacity ?? 1,
    color: values.color || current?.color || state.editor.drawingColor || '#ffffff',
    zIndex: values.zIndex ?? current?.zIndex ?? layers.length + 1,
    src: values.src || current?.src || '',
    file: values.file ?? current?.file ?? null,
    assetId: values.assetId ?? current?.assetId ?? null,
    builtinId: values.builtinId ?? current?.builtinId ?? null,
  }
  const nextLayers = [...layers]
  if (existingIndex >= 0) nextLayers.splice(existingIndex, 1, layer)
  else nextLayers.push(layer)
  state.editor.layers = nextLayers
  state.editor.selectedLayerId = layer.id
  return layer
}

function creativeLayerMarkup(layer) {
  if (!layer.src) return ''
  const normalized = normalizeCreativeLayer(layer)
  const selected = state.editor.selectedLayerId === layer.id
  const style = `--layer-x:${normalized.x}%;--layer-y:${normalized.y}%;--layer-width:${normalized.width}%;--layer-rotation:${normalized.rotation}deg;--layer-opacity:${normalized.opacity};--layer-color:${normalized.color};--layer-image:url('${esc(layer.src)}');--layer-z:${normalized.zIndex || 4}`
  const content = layer.type === 'sticker'
    ? `<img src="${esc(layer.src)}" alt="" draggable="false" />`
    : '<span class="creative-layer-mask" aria-hidden="true"></span>'
  return `<button type="button" class="creative-layer layer-${esc(layer.type)} ${selected ? 'selected' : ''}" data-layer-id="${esc(layer.id)}" style="${style}" aria-label="${creativeLayerLabel(layer)} 레이어${selected ? ' 선택됨' : ''}">${content}<span class="layer-selection" aria-hidden="true"></span><span class="layer-handle layer-resize-handle" data-layer-handle="resize" aria-hidden="true"></span><span class="layer-handle layer-rotate-handle" data-layer-handle="rotate" aria-hidden="true">${icon('rotate_right')}</span></button>`
}

function creativeLayersMarkup(side) {
  return (state.editor.layers || [])
    .filter((layer) => layer.side === side)
    .sort((left, right) => Number(left.zIndex || 0) - Number(right.zIndex || 0))
    .map(creativeLayerMarkup)
    .join('')
}

function creativeLayerToolbar(side) {
  const layer = selectedCreativeLayer()
  if (!layer || layer.side !== side) return ''
  return `<div class="layer-context-toolbar" role="toolbar" aria-label="선택한 ${creativeLayerLabel(layer)} 레이어 작업">
    <span>${icon(layer.type === 'sticker' ? 'interests' : layer.type === 'drawing' ? 'gesture' : 'draw')} ${creativeLayerLabel(layer)} 선택</span>
    <button type="button" data-action="duplicate-layer" aria-label="선택 레이어 복제">${icon('content_copy')}<span>복제</span></button>
    <button type="button" class="delete" data-action="delete-layer" aria-label="선택 레이어 삭제">${icon('delete')}<span>삭제</span></button>
  </div>`
}

function cardVisual({ fan = false } = {}) {
  const editor = state.editor
  const isBack = editor.side === 'back' && !fan
  const isLenticular = editor.interaction === 'lenticular' && editor.lenticularSrc
  const effectMotion = editor.interaction !== 'static'
  const photoMedia = editor.imageSrc
    ? `<img class="card-photo" src="${esc(editor.imageSrc)}" alt="${esc(state.form.name)} 카드 이미지" />`
    : `<div class="card-photo card-photo-empty" aria-label="카드 사진 없음">${icon('add_photo_alternate')}<span>사진 업로드</span></div>`
  const media = editor.videoEnabled && editor.videoSrc
    ? `<video src="${esc(editor.videoSrc)}" muted loop playsinline preload="metadata" ${fan ? 'controls' : 'autoplay'}></video>`
    : `${photoMedia}${isLenticular ? `<img class="lenticular-photo" src="${esc(editor.lenticularSrc)}" alt="" />` : ''}`
  const effectOpacity = Number(editor.effectIntensity || 0)
  const tiltStyle = '--tilt-x:0deg;--tilt-y:0deg;--light-x:50%;--light-y:42%;--lenticular-reveal:0%'
  const reducedMotionControls =
    isLenticular && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    ? `<div class="lenticular-motion-controls" aria-label="렌티큘러 장면 선택"><button type="button" data-action="set-lenticular-scene" data-reveal="0">첫 장면</button><button type="button" data-action="set-lenticular-scene" data-reveal="100">두 번째 장면</button></div>`
    : ''
  if (isBack) {
    const issueNumber = String(1).padStart(4, '0')
    const issueLimit = String(state.form.issueLimit || 0).padStart(4, '0')
    const hiddenMessage = String(editor.backHiddenMessage || '')
    return `<div class="editor-card back-card material-${esc(editor.backMaterial)} edge-foil-${esc(editor.backEdgeFoil)} spot-uv-${esc(editor.backSpotUv)} effect-motion" data-hologram-card style="${tiltStyle};--back-color:${esc(editor.background || '#0b1033')}"><img src="./agency-back-template-v1.png" alt="Fanfolio 공식 카드 뒷면" /><div class="back-surface" aria-hidden="true"></div><div class="back-spot-uv" aria-hidden="true"></div>${creativeLayersMarkup('back')}${creativeLayerToolbar('back')}<div class="back-authenticity"><span>FANFOLIO OFFICIAL</span><strong>No. ${issueNumber} / ${issueLimit}</strong></div>${hiddenMessage ? `<p class="back-hidden-message">${esc(hiddenMessage)}</p>` : ''}</div>`
  }
  return `<div class="editor-card material-${esc(editor.material)} pattern-${esc(editor.foilPattern)} coverage-${esc(editor.foilCoverage)} ${effectMotion ? 'effect-motion' : ''} ${isLenticular ? 'interaction-lenticular' : ''}" data-hologram-card style="${tiltStyle};--effect-opacity:${effectOpacity};--effect-angle:${Number(editor.effectAngle || 135)}deg;--effect-spread:${Math.round(Number(editor.effectSpread ?? 0.64) * 100)}%;--effect-grain:${Number(editor.effectGrain ?? 0.38)}">
    ${media}
    ${editor.effect !== 'none' ? `<div class="card-material material-${esc(editor.material)}" aria-hidden="true"></div><div class="hologram-layer pattern-${esc(editor.foilPattern)} coverage-${esc(editor.foilCoverage)} material-${esc(editor.material)}" aria-hidden="true"></div>` : ''}
    <div class="card-vignette" aria-hidden="true"></div>
    ${creativeLayersMarkup('front')}
    ${fan ? '' : creativeLayerToolbar('front')}
    <div class="card-caption"><span>${esc(state.form.seasonName || 'FANFOLIO EDITION')}</span><strong>${esc(state.form.name || '새 특별 카드')}</strong><small>${esc(state.form.rarity || 'SR')} · OFFICIAL</small></div>
    ${reducedMotionControls}
  </div>`
}

const editorTools = [
  ['photo', 'image', '사진'],
  ['handwriting', 'draw', '손글씨'],
  ['drawing', 'gesture', '그림'],
  ['sticker', 'interests', '스티커'],
  ['voice', 'graphic_eq', '보이스'],
  ['motion', 'movie', '모션'],
  ['hologram', 'auto_awesome', '홀로그램'],
  ['back', 'flip', '뒷면'],
]

function uploadBox(kind, accept, title, description) {
  return `<label class="upload-box"><input type="file" data-upload="${kind}" accept="${accept}" /><span class="upload-icon">${icon('upload_file')}</span><strong>${title}</strong><small>${description}</small></label>`
}

function layerControls() {
  const layer = selectedCreativeLayer()
  if (!layer) {
    return `<div class="layer-empty">${icon('select')}<span><strong>카드 위 레이어를 선택해 주세요.</strong><small>선택한 손글씨·그림·스티커의 위치와 크기를 조절할 수 있어요.</small></span></div>`
  }
  const normalized = normalizeCreativeLayer(layer)
  return `<div class="layer-controls">
    <div class="layer-controls-heading"><span><strong>${creativeLayerLabel(layer)} 레이어</strong><small>카드 위에서 직접 끌어 이동할 수도 있어요.</small></span><button type="button" class="layer-delete-button" data-action="delete-layer" aria-label="선택 레이어 삭제">${icon('delete')} 삭제</button></div>
    <label class="compact-field">표시 면<select data-layer-field="side"><option value="front" ${normalized.side === 'front' ? 'selected' : ''}>앞면</option><option value="back" ${normalized.side === 'back' ? 'selected' : ''}>뒷면</option></select></label>
    ${layer.type === 'sticker' ? '' : `<label class="compact-field">색상<input type="color" value="${normalized.color}" data-layer-field="color" /></label>`}
    <div class="range-group"><label>가로 위치 <output>${Math.round(normalized.x)}%</output></label><input type="range" min="0" max="100" step="1" value="${normalized.x}" data-layer-field="x" /></div>
    <div class="range-group"><label>세로 위치 <output>${Math.round(normalized.y)}%</output></label><input type="range" min="0" max="100" step="1" value="${normalized.y}" data-layer-field="y" /></div>
    <div class="range-group"><label>크기 <output>${Math.round(normalized.width)}%</output></label><input type="range" min="8" max="100" step="1" value="${normalized.width}" data-layer-field="width" /></div>
    <div class="range-group"><label>회전 <output>${Math.round(normalized.rotation)}°</output></label><input type="range" min="-180" max="180" step="1" value="${normalized.rotation}" data-layer-field="rotation" /></div>
    <div class="range-group"><label>투명도 <output>${Math.round(normalized.opacity * 100)}%</output></label><input type="range" min="0.1" max="1" step="0.01" value="${normalized.opacity}" data-layer-field="opacity" /></div>
    <div class="inline-actions layer-actions"><button type="button" class="secondary-button compact" data-action="duplicate-layer">${icon('content_copy')} 복제</button><button type="button" class="secondary-button compact" data-action="bring-layer-front">${icon('flip_to_front')} 맨 앞으로</button></div>
  </div>`
}

function photoInspector() {
  const hasCurrentPhoto = Boolean(state.editor.imageFile || state.editor.imageAssetId || state.editor.imageName)
  return `<div class="photo-upload-panel">${uploadBox('image', 'image/png,image/jpeg,image/webp', hasCurrentPhoto ? '사진 교체 업로드' : '사진 업로드', 'JPG, PNG, WebP · 세로 2:3 권장')}${hasCurrentPhoto ? `<div class="current-photo-file">${icon('image')}<span><strong>${esc(state.editor.imageName || '업로드된 사진')}</strong><small>현재 카드에 연결된 이미지</small></span><button type="button" class="text-button danger" data-action="remove-photo">삭제</button></div>` : `<div class="media-empty">${icon('add_photo_alternate')}<span>사진을 올리면 카드 캔버스에 바로 표시됩니다.</span></div>`}</div>
  <div class="info-card">${icon('crop_portrait')}<span><strong>카드 안전 영역</strong><small>얼굴과 핵심 요소는 중앙 80% 안에 배치해 주세요.</small></span></div>`
}

function handwritingInspector() {
  const hasWriting = Boolean(state.editor.handwritingSrc)
  return `<div class="feature-toggle"><span>${icon('draw')}<span><strong>손글씨 레이어</strong><small>직접 쓰거나 이미지를 올릴 수 있어요.</small></span></span><button type="button" class="switch ${state.editor.handwritingEnabled ? 'on' : ''}" data-action="toggle-handwriting" aria-pressed="${state.editor.handwritingEnabled}" aria-label="손글씨 레이어 켜기"></button></div>
  <div class="inspector-section"><span class="inspector-label">직접 쓰기</span><canvas id="handwriting-pad" width="560" height="250" aria-label="손글씨 입력 영역"></canvas><div class="inline-actions"><button type="button" class="secondary-button compact" data-action="clear-handwriting">${icon('ink_eraser')} 지우기</button><span>마우스나 펜으로 작성</span></div></div>
  <div class="inspector-divider"><span>또는</span></div>
  ${uploadBox('handwriting', 'image/png,image/jpeg,image/webp', '손글씨 이미지 업로드', '투명 PNG는 바로 사용, 사진은 배경 제거')}
  ${hasWriting && state.editor.handwritingNeedsRemoval ? `<button type="button" class="secondary-button full" data-action="remove-background">${icon('background_replace')} 배경 제거 요청</button>` : ''}
  ${state.jobStatus ? `<p class="job-status">${icon('progress_activity')} ${esc(state.jobStatus)}</p>` : ''}
  ${layerControls()}`
}

function drawingInspector() {
  return `<div class="inspector-section"><span class="inspector-label">아티스트 드로잉</span><p class="inspector-description">펜, 손가락, 마우스로 자유롭게 그리고 투명 레이어로 올려보세요.</p>
    <div class="drawing-options"><label>펜 색상<input type="color" value="${esc(state.editor.drawingColor)}" data-editor="drawingColor" /></label><label>굵기<input type="range" min="2" max="24" step="1" value="${Number(state.editor.drawingSize)}" data-editor="drawingSize" /></label></div>
    <canvas id="drawing-pad" width="560" height="420" aria-label="아티스트 그림 입력 영역"></canvas>
    <div class="inline-actions"><button type="button" class="secondary-button compact" data-action="clear-drawing">${icon('ink_eraser')} 비우기</button><button type="button" class="primary-button compact" data-action="add-drawing-layer">${icon('add_photo_alternate')} 그림 레이어 추가</button></div>
  </div>${layerControls()}`
}

function stickerInspector() {
  return `<div class="inspector-section"><span class="inspector-label">기본 스티커</span><p class="inspector-description">Fanfolio 전용 오팔 참을 선택하면 카드에 바로 추가돼요.</p><div class="built-in-sticker-grid">${builtInStickers.map((sticker) => `<button type="button" data-built-in-sticker="${esc(sticker.id)}" aria-label="${esc(sticker.name)} 스티커 추가"><span class="sticker-tile-preview"><img src="${esc(sticker.source)}" alt="" /></span><span class="sticker-tile-name">${esc(sticker.name)}</span></button>`).join('')}</div></div>
  <div class="inspector-divider"><span>또는 직접 만들기</span></div>
  <div class="inspector-section"><span class="inspector-label">나만의 스티커</span><p class="inspector-description">직접 만든 투명 PNG나 WebP도 카드 양면에 자유롭게 배치할 수 있어요.</p>${uploadBox('sticker', 'image/png,image/webp', '스티커 이미지 업로드', '투명 PNG 또는 WebP 권장')}</div>${layerControls()}`
}

function voiceInspector() {
  return `<div class="feature-toggle"><span>${icon('graphic_eq')}<span><strong>보이스 카드</strong><small>재생은 팬이 직접 선택해요.</small></span></span><button type="button" class="switch ${state.editor.voiceEnabled ? 'on' : ''}" data-action="toggle-voice" aria-pressed="${state.editor.voiceEnabled}" aria-label="보이스 카드 켜기"></button></div>
  <div class="voice-recorder ${state.recording ? 'recording' : ''}">
    <span class="record-orb">${icon(state.recording ? 'mic' : 'mic_none')}</span>
    <div><strong>${state.recording ? '보이스를 녹음하고 있어요' : state.editor.voiceName || '브라우저에서 바로 녹음'}</strong><small>${state.recording ? '완료되면 정지 버튼을 눌러 주세요.' : '마이크 권한은 녹음하는 동안에만 사용됩니다.'}</small></div>
    <button type="button" class="${state.recording ? 'danger-button' : 'primary-button'} compact" data-action="${state.recording ? 'stop-recording' : 'start-recording'}">${state.recording ? '녹음 정지' : '녹음 시작'}</button>
  </div>
  <div class="inspector-divider"><span>또는</span></div>
  ${uploadBox('voice', 'audio/mpeg,audio/mp4,audio/wav,audio/webm', '음성 파일 업로드', 'MP3, M4A, WAV, WebM')}
  ${state.editor.voiceSrc ? `<div class="media-preview"><div>${icon('headphones')}<span><strong>${esc(state.editor.voiceName || '보이스 메시지')}</strong><small>팬 화면에서는 직접 재생 버튼을 눌러요.</small></span></div><audio controls preload="metadata" src="${esc(state.editor.voiceSrc)}"></audio></div>` : `<div class="media-empty">${icon('volume_off')}<span>아직 연결된 보이스가 없어요.</span></div>`}
  <div class="privacy-card">${icon('shield_lock')}<span>보이스는 카드 소유자에게만 보호된 URL로 전달됩니다.</span></div>`
}

function motionInspector() {
  return `<div class="feature-toggle"><span>${icon('movie')}<span><strong>모션 카드</strong><small>짧은 영상 레이어를 연결해요.</small></span></span><button type="button" class="switch ${state.editor.videoEnabled ? 'on' : ''}" data-action="toggle-motion" aria-pressed="${state.editor.videoEnabled}" aria-label="모션 카드 켜기"></button></div>
  ${uploadBox('video', 'video/mp4,video/webm', '모션 영상 업로드', 'MP4, WebM · 15초 이하 권장')}
  ${state.editor.videoSrc ? `<div class="video-preview"><video src="${esc(state.editor.videoSrc)}" muted loop controls playsinline preload="metadata"></video><div><strong>${esc(state.editor.videoName || '모션 영상')}</strong><button type="button" class="text-button danger" data-action="remove-video">삭제</button></div></div>` : `<div class="media-empty tall">${icon('video_library')}<span>영상을 올리면 카드 화면에서 바로 확인할 수 있어요.</span></div>`}
  <label class="check-row"><input type="checkbox" data-editor="videoLoop" ${state.editor.videoLoop ? 'checked' : ''} /><span><strong>반복 재생</strong><small>팬이 영상을 연 뒤 자연스럽게 반복합니다.</small></span></label>
  <div class="info-card">${icon('motion_photos_on')}<span><strong>안전한 재생 방식</strong><small>음성은 자동 재생하지 않고 모든 미디어에 제어 버튼을 제공합니다.</small></span></div>`
}

function hologramInspector() {
  const needsSecondScene = state.editor.interaction === 'lenticular' && !state.editor.lenticularSrc
  return `<div class="feature-toggle"><span>${icon('auto_awesome')}<span><strong>홀로그램 포일</strong><small>소재, 패턴, 적용 범위와 팬의 상호작용을 따로 조정해요.</small></span></span><button type="button" class="switch ${state.editor.effect !== 'none' ? 'on' : ''}" data-action="toggle-hologram" aria-pressed="${state.editor.effect !== 'none'}" aria-label="홀로그램 켜기"></button></div>
  <div class="inspector-section"><span class="inspector-label">전면 소재</span><div class="preset-grid premium surface-grid">${materialOptions.map(([value, label, description]) => `<button type="button" data-effect-material="${value}" class="${state.editor.material === value ? 'active' : ''}" aria-pressed="${state.editor.material === value}"><span><strong>${label}</strong><small>${description}</small></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <div class="inspector-section"><span class="inspector-label">포일 패턴</span><div class="finish-selector option-row">${foilPatternOptions.map(([value, label]) => `<button type="button" data-foil-pattern="${value}" class="${state.editor.foilPattern === value ? 'active' : ''}" aria-pressed="${state.editor.foilPattern === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <div class="inspector-section"><span class="inspector-label">적용 범위</span><div class="finish-selector option-row">${foilCoverageOptions.map(([value, label]) => `<button type="button" data-foil-coverage="${value}" class="${state.editor.foilCoverage === value ? 'active' : ''}" aria-pressed="${state.editor.foilCoverage === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <div class="inspector-section"><span class="inspector-label">상호작용</span><div class="finish-selector option-row">${interactionOptions.map(([value, label]) => `<button type="button" data-effect-interaction="${value}" class="${state.editor.interaction === value ? 'active' : ''}" aria-pressed="${state.editor.interaction === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  ${state.editor.interaction === 'lenticular' ? `<div class="inspector-section"><label class="upload-box"><input type="file" data-upload="lenticular" accept="image/png,image/jpeg,image/webp" /><span class="upload-icon">${icon('upload_file')}</span><strong>두 번째 장면 추가</strong><small>기울일 때 전환될 사진</small></label>${state.editor.lenticularSrc ? `<div class="lenticular-source"><img src="${esc(state.editor.lenticularSrc)}" alt="" /><div><strong>두 번째 장면</strong><button type="button" class="text-button danger" data-action="remove-lenticular">삭제</button></div></div>` : `<div class="media-empty">${icon('compare')}<span>${needsSecondScene ? '검수를 위해 전환될 두 번째 장면이 필요해요.' : '렌티큘러 장면을 추가할 수 있어요.'}</span></div>`}</div>` : ''}
  <div class="range-group"><label>광택 강도 <output>${Math.round(Number(state.editor.effectIntensity) * 100)}%</output></label><input type="range" min="0" max="1" step="0.01" value="${Number(state.editor.effectIntensity)}" data-editor="effectIntensity" /></div>
  <div class="range-group"><label>빛 번짐 <output>${Math.round(Number(state.editor.effectSpread ?? 0.64) * 100)}%</output></label><input type="range" min="0.3" max="0.9" step="0.01" value="${Number(state.editor.effectSpread ?? 0.64)}" data-editor="effectSpread" /></div>
  <div class="range-group"><label>입자 디테일 <output>${Math.round(Number(state.editor.effectGrain ?? 0.38) * 100)}%</output></label><input type="range" min="0" max="1" step="0.01" value="${Number(state.editor.effectGrain ?? 0.38)}" data-editor="effectGrain" /></div>
  <div class="range-group"><label>빛의 각도 <output>${Number(state.editor.effectAngle)}°</output></label><input type="range" min="0" max="360" step="5" value="${Number(state.editor.effectAngle)}" data-editor="effectAngle" /></div>`
}

function backInspector() {
  const hiddenMessageLength = Array.from(String(state.editor.backHiddenMessage || '')).length
  return `<div class="inspector-section"><span class="inspector-label">공식 뒷면 템플릿</span><button type="button" class="back-template active"><img src="./agency-back-template-v1.png" alt="Fanfolio 공식 뒷면 템플릿" /><span>${icon('verified')}<strong>소속사 공식 템플릿</strong><small>로고와 인증 영역이 보호됩니다.</small></span></button></div>
  <div class="inspector-section"><span class="inspector-label">뒷면 소재</span><div class="finish-selector option-row">${backMaterialOptions.map(([value, label]) => `<button type="button" data-back-material="${value}" class="${state.editor.backMaterial === value ? 'active' : ''}" aria-pressed="${state.editor.backMaterial === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <div class="inspector-section"><span class="inspector-label">엣지 포일</span><div class="finish-selector option-row">${backEdgeFoilOptions.map(([value, label]) => `<button type="button" data-edge-foil="${value}" class="${state.editor.backEdgeFoil === value ? 'active' : ''}" aria-pressed="${state.editor.backEdgeFoil === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <div class="inspector-section"><span class="inspector-label">스팟 UV</span><div class="finish-selector option-row">${backSpotUvOptions.map(([value, label]) => `<button type="button" data-spot-uv="${value}" class="${state.editor.backSpotUv === value ? 'active' : ''}" aria-pressed="${state.editor.backSpotUv === value}"><span><strong>${label}</strong></span>${icon('check_circle')}</button>`).join('')}</div></div>
  <label class="compact-field">뒷면 바탕색<input type="color" value="${esc(state.editor.background || '#0b1033')}" data-editor="background" /></label>
  <label class="compact-field">
    숨은 메시지
    <input type="text" maxlength="80" data-editor="backHiddenMessage" value="${esc(state.editor.backHiddenMessage || '')}" />
    <small><span data-hidden-message-count>${hiddenMessageLength}</span>/40 · 기울이면 선명해져요.</small>
  </label>
  <div class="info-card">${icon('lock')}<span><strong>브랜드 보호 영역</strong><small>뒷면 인증 마크와 발행 정보는 공개 시 자동으로 생성됩니다.</small></span></div>${layerControls()}`
}

function editorInspector() {
  return {
    photo: photoInspector,
    handwriting: handwritingInspector,
    drawing: drawingInspector,
    sticker: stickerInspector,
    voice: voiceInspector,
    motion: motionInspector,
    hologram: hologramInspector,
    back: backInspector,
  }[state.editor.tool]?.() || photoInspector()
}

function editorProgress() {
  const stages = [
    ['design', '1', '디자인'],
    ['details', '2', '카드 정보'],
    ['preview', '3', '팬 미리보기'],
    ['review', '4', '검수 요청'],
  ]
  const current = stages.findIndex(([value]) => value === state.stage)
  return `<nav class="editor-progress" aria-label="카드 제작 단계">${stages.map(([value, number, label], index) => `<button type="button" data-editor-stage="${value}" class="${index === current ? 'active' : index < current ? 'complete' : ''}"><span>${index < current ? icon('check') : number}</span><strong>${label}</strong></button>${index < stages.length - 1 ? '<i></i>' : ''}`).join('')}</nav>`
}

function designStage() {
  const inspectorOpen = Boolean(state.editor.inspectorOpen)
  return `<section class="editor-workbench editor-design ${inspectorOpen ? 'inspector-open' : ''}">
    <aside class="tool-rail" aria-label="카드 편집 도구">${editorTools.map(([tool, symbol, label]) => `<button type="button" data-tool="${tool}" class="${state.editor.tool === tool ? 'active' : ''}" aria-pressed="${state.editor.tool === tool}" title="${label}">${icon(symbol)}<span>${label}</span></button>`).join('')}</aside>
    <div class="editor-canvas-area">
      <div class="editor-canvas-shell">
        <div class="canvas-toolbar"><div class="side-switch"><button type="button" data-side="front" class="${state.editor.side === 'front' ? 'active' : ''}">앞면</button><button type="button" data-side="back" class="${state.editor.side === 'back' ? 'active' : ''}">뒷면</button></div><span>${icon('zoom_in')} 100% · 카드 캔버스</span></div>
        <div class="editor-stage">${cardVisual()}<span class="stage-shadow" aria-hidden="true"></span></div>
        <div class="canvas-caption"><span>${icon('touch_app')} 카드를 기울이거나 레이어를 직접 움직여 보세요.</span><div><button type="button" class="text-button mobile-tool-settings" data-action="open-inspector">${icon('tune')} 도구 설정</button><button type="button" class="text-button" data-action="open-fan-preview">전체 화면 미리보기 ${icon('open_in_full')}</button></div></div>
      </div>
      <div class="editor-actions-strip"><button type="button" class="secondary-button" data-action="save-draft" ${state.busy ? 'disabled' : ''}>${icon('save')} ${state.busy ? '저장 중' : '초안 저장'}</button><button type="button" class="primary-button" data-action="go-details">다음 단계 ${icon('arrow_forward')}</button></div>
    </div>
    <button type="button" class="mobile-inspector-backdrop" data-action="close-inspector" aria-label="도구 설정 닫기"></button>
    <aside class="editor-inspector editor-inspector-panel ${inspectorOpen ? 'open' : ''}" aria-label="선택한 편집 도구 설정"><div class="inspector-heading"><div><span>EDIT TOOL</span><h3>${editorTools.find(([tool]) => tool === state.editor.tool)?.[2] || '사진'}</h3></div><div><span class="inspector-side">${state.editor.side === 'front' ? '앞면' : '뒷면'}</span><button type="button" class="inspector-close" data-action="close-inspector" aria-label="도구 설정 닫기">${icon('close')}</button></div></div><div class="inspector-body">${editorInspector()}</div></aside>
    <div class="mobile-editor-actions"><button type="button" class="secondary-button" data-action="save-draft">${icon('save')} 저장</button><button type="button" class="primary-button" data-action="go-details">다음 ${icon('arrow_forward')}</button></div>
  </section>`
}

function optionList(items, selected) {
  return items.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)}</option>`).join('')
}

function detailsStage() {
  const artists = state.catalog.artists || []
  const members = (state.catalog.members || []).filter(
    (member) => !state.form.artistId || member.artistId === state.form.artistId,
  )
  return `<section class="details-stage">
    <div class="form-card"><span class="page-kicker">CARD INFORMATION</span><h2>팬에게 보일 카드 정보를 입력해 주세요.</h2><p>발행 수량과 카드명은 검수 전까지 언제든 수정할 수 있어요.</p>
      <form id="card-details-form" class="details-form">
        <label class="wide">카드명<input data-form="name" name="name" maxlength="120" value="${esc(state.form.name)}" placeholder="카드 이름" required /></label>
        <label>그룹<select data-form="artistId" name="artistId" required><option value="">그룹 선택</option>${optionList(artists, state.form.artistId)}</select></label>
        <label>멤버<select data-form="memberId" name="memberId" required><option value="">멤버 선택</option>${optionList(members, state.form.memberId)}</select></label>
        <label>시즌<input data-form="seasonName" name="seasonName" value="${esc(state.form.seasonName)}" placeholder="예: 2026 SUMMER" required /></label>
        <label>희귀도<select data-form="rarity" name="rarity"><option value="R" ${state.form.rarity === 'R' ? 'selected' : ''}>R · Rare</option><option value="SR" ${state.form.rarity === 'SR' ? 'selected' : ''}>SR · Super Rare</option><option value="UR" ${state.form.rarity === 'UR' ? 'selected' : ''}>UR · Ultra Rare</option><option value="Special" ${state.form.rarity === 'Special' ? 'selected' : ''}>Special</option></select></label>
        <label>발행 수량<input data-form="issueLimit" name="issueLimit" type="number" min="1" max="100000" value="${Number(state.form.issueLimit)}" required /></label>
        <label class="wide">팬 메시지<textarea data-form="signatureText" name="signatureText" maxlength="200" rows="4" placeholder="팬에게 전할 메시지">${esc(state.form.signatureText || '')}</textarea><small>${String(state.form.signatureText || '').length}/200</small></label>
        <div class="form-actions wide"><button type="button" class="secondary-button" data-editor-stage="design">이전</button><button type="submit" class="primary-button">저장하고 팬 화면 보기 ${icon('arrow_forward')}</button></div>
      </form>
      ${artists.length ? '' : `<div class="catalog-warning">${icon('domain_verification')}<span><strong>연결된 아티스트 카탈로그가 없어요.</strong><small>관리자가 소속 그룹을 인증하면 그룹과 멤버를 선택할 수 있습니다.</small></span></div>`}
    </div>
    <aside class="details-preview"><span>LIVE PREVIEW</span>${cardVisual()}<div class="feature-chips">${state.editor.voiceEnabled ? `<span>${icon('graphic_eq')} 보이스</span>` : ''}${state.editor.videoEnabled ? `<span>${icon('movie')} 모션</span>` : ''}${state.editor.effect !== 'none' ? `<span>${icon('auto_awesome')} 홀로그램</span>` : ''}${state.editor.handwritingEnabled ? `<span>${icon('draw')} 손글씨</span>` : ''}</div></aside>
  </section>`
}

function fanPreviewStage() {
  state.editor.previewOpened = true
  persistDraft()
  const canOfferDeviceMotion =
    window.isSecureContext === true && typeof window.DeviceOrientationEvent !== 'undefined'
  const motionStatus =
    state.deviceMotionStatus === 'granted'
      ? '<p class="motion-permission-status" role="status">기기 움직임 미리보기가 켜졌어요.</p>'
      : state.deviceMotionStatus === 'reduced'
        ? '<p class="motion-permission-status" role="status">움직임 효과를 줄이는 설정입니다. 카드 터치로 소재를 확인할 수 있어요.</p>'
      : state.deviceMotionStatus === 'denied'
        ? '<p class="motion-permission-status denied" role="status">센서 접근이 꺼져 있어요. 카드 터치로 같은 효과를 볼 수 있어요.</p>'
        : ''
  const motionPermission =
    canOfferDeviceMotion
      ? `<div class="motion-permission-panel">${state.deviceMotionEnabled || state.deviceMotionStatus === 'reduced' ? '' : '<button type="button" class="motion-permission-button" data-action="enable-device-motion">기기 움직임으로 보기</button>'}${motionStatus}</div>`
      : ''
  return `<section class="fan-preview-stage">
    <div class="fan-preview-copy"><span class="page-kicker">FAN EXPERIENCE</span><h2>팬이 카드를 열었을 때의 경험입니다.</h2><p>보이스와 영상은 자동 재생되지 않으며 팬이 직접 선택할 수 있어요.</p><div class="preview-checks"><span>${icon('touch_app')} 사용자 제어 재생</span><span>${icon('shield_lock')} 소유자 전용 미디어</span><span>${icon('accessibility_new')} 움직임 감소 대응</span></div></div>
    <div class="fan-phone">
      <div class="fan-phone-bar"><span>FANFOLIO</span>${icon('close')}</div>
      <div class="fan-card-wrap">${cardVisual({ fan: true })}</div>
      ${motionPermission}
      <div class="fan-card-info"><span class="fan-rarity">${esc(state.form.rarity)}</span><h3>${esc(state.form.name)}</h3><p>${esc(state.form.signatureText || '팬을 위한 특별 메시지가 도착했어요.')}</p>
        ${state.editor.voiceEnabled ? `<section class="fan-media-card"><span class="fan-media-icon">${icon('graphic_eq')}</span><div><strong>아티스트 보이스</strong><small>${state.editor.voiceSrc ? '재생 버튼을 눌러 메시지를 들어보세요.' : '검수 전 보이스 파일을 추가해 주세요.'}</small></div>${state.editor.voiceSrc ? `<audio controls preload="metadata" src="${esc(state.editor.voiceSrc)}"></audio>` : ''}</section>` : ''}
        ${state.editor.videoEnabled ? `<section class="fan-media-card"><span class="fan-media-icon">${icon('movie')}</span><div><strong>모션 스테이지</strong><small>${state.editor.videoSrc ? '영상을 직접 재생하고 전체 화면으로 볼 수 있어요.' : '검수 전 모션 영상을 추가해 주세요.'}</small></div></section>` : ''}
      </div>
    </div>
    <div class="preview-actions"><button type="button" class="secondary-button" data-editor-stage="details">정보 수정</button><button type="button" class="primary-button" data-action="go-review">검수 준비 확인 ${icon('arrow_forward')}</button></div>
  </section>`
}

const readinessLabels = {
  image: '카드 이미지',
  catalog: '그룹과 멤버',
  handwriting: '손글씨 레이어',
  voice: '보이스 파일',
  video: '모션 영상',
  lenticular: '렌티큘러 이미지',
  issueLimit: '발행 수량',
  preview: '팬 화면 미리보기',
}

function currentReadiness() {
  return reviewReadiness({
    ...buildCardPayload({ form: state.form, editor: state.editor }),
    previewOpened: state.editor.previewOpened,
  })
}

function collaborationCommentsPanel() {
  const comments = state.collaborationComments || []
  const rows = comments.length
    ? comments.map((comment) => `<article class="card-comment ${comment.status === 'resolved' ? 'resolved' : ''}"><div><strong>${esc(comment.authorUserId)}</strong><span class="comment-status">${comment.status === 'resolved' ? '해결됨' : '미해결'}</span></div><p>${esc(comment.body)}</p><small>${comment.reviewVersion ? `검수 버전 v${comment.reviewVersion} · ` : ''}${esc(comment.createdAt || '')}</small>${comment.status !== 'resolved' ? `<button type="button" class="text-button" data-collaboration-comment="${esc(comment.id)}">해결 처리</button>` : ''}</article>`).join('')
    : `<div class="empty-inline"><div><strong>아직 협업 코멘트가 없어요.</strong><span>운영팀과 확인할 내용을 남기면 이 카드의 검수 버전에 연결됩니다.</span></div></div>`
  return `<section class="card-comments-panel"><div class="review-panel-heading"><div><span>COLLABORATION</span><h3>협업 코멘트</h3></div><span class="readiness-score">${comments.filter((item) => item.status !== 'resolved').length}</span></div><div class="card-comment-list">${rows}</div><form class="card-comment-form" data-collaboration-comment-form><textarea name="body" maxlength="500" rows="3" placeholder="운영팀에 전달할 피드백을 남겨 주세요." required></textarea><input name="mentionUserId" type="text" maxlength="80" placeholder="멘션할 운영자 ID (선택)" /><button type="submit" class="secondary-button" ${state.busy ? 'disabled' : ''}>코멘트 남기기</button></form>${state.collaborationCommentError ? `<p class="review-error" role="alert">${esc(state.collaborationCommentError)}</p>` : ''}</section>`
}

function reviewStage() {
  const currentCard = state.cards.find((item) => item.id === state.cardId) || {
    status: state.form.status,
    releaseStatus: state.form.releaseStatus,
    reviewNote: state.form.reviewNote,
  }
  const releaseStatus = currentCard.releaseStatus || currentCard.status || 'draft'
  if (!['draft', 'changes_requested'].includes(releaseStatus)) {
    return `<section class="review-stage review-status-stage">
      <div class="review-card-preview"><span class="page-kicker">RELEASE STATUS</span><h2>${esc(state.form.name)}</h2><p>제작한 특별 카드의 공개 진행 상황을 확인하세요.</p>${cardVisual()}<div class="review-summary"><strong>${esc(state.form.seasonName)} · ${esc(state.form.rarity)}</strong><span>검수와 드롭 공개는 담당 운영자가 순서대로 진행합니다.</span></div></div>
      <div class="review-panel release-panel">${releaseStatusBanner(currentCard)}${state.submissionMessage ? `<p class="submission-message">${icon('check_circle')} ${esc(state.submissionMessage)}</p>` : ''}<div class="review-actions"><button type="button" class="secondary-button" data-editor-stage="preview">팬 화면 미리보기</button><button type="button" class="primary-button" data-action="exit-editor">내 카드로 돌아가기</button></div></div>
    </section>`
  }
  const readiness = currentReadiness()
  const readinessItems = Object.values(readiness.items)
  const completedReadinessCount = readinessItems.filter((item) => item.status !== 'missing').length
  const totalReadinessCount = Object.values(readiness.items).length
  return `<section class="review-stage">
    <div class="review-card-preview"><span class="page-kicker">FINAL CHECK</span><h2>운영팀에 보내기 전 마지막 확인</h2><p>필수 항목이 모두 준비되면 검수 요청을 보낼 수 있어요.</p>${cardVisual()}<div class="review-summary"><strong>${esc(state.form.name)}</strong><span>${esc(state.form.seasonName)} · ${esc(state.form.rarity)} · ${Number(state.form.issueLimit).toLocaleString('ko-KR')}장</span></div></div>
    <div class="review-panel"><div class="review-panel-heading"><div><span>REVIEW READINESS</span><h3>${readiness.ready ? '검수 준비가 완료됐어요.' : '추가로 준비할 항목이 있어요.'}</h3></div><span class="readiness-score ${readiness.ready ? 'ready' : ''}">${completedReadinessCount}/${totalReadinessCount}</span></div>
      <div class="readiness-list">${Object.entries(readiness.items).map(([key, item]) => `<div class="readiness-row ${item.status}"><span>${icon(item.status === 'missing' ? 'error' : item.status === 'optional' ? 'remove_circle' : 'check_circle')}<strong>${readinessLabels[key]}</strong></span><small>${item.label}</small></div>`).join('')}</div>
      ${releaseStatus === 'changes_requested' ? releaseStatusBanner(currentCard) : ''}
      <label class="review-note">운영팀에 전달할 메모<textarea data-review-note maxlength="500" rows="4" placeholder="공개 희망일, 미디어 확인 포인트 등을 적어 주세요.">${esc(state.reviewNote)}</textarea><small>${state.reviewNote.length}/500</small></label>
      ${state.reviewError ? `<p class="review-error" role="alert">${esc(state.reviewError)}</p>` : ''}
      <div class="review-actions"><button type="button" class="secondary-button" data-editor-stage="preview">팬 화면 다시 보기</button><button type="button" class="primary-button" data-action="submit-review" ${!readiness.ready || state.busy ? 'disabled' : ''}>${state.busy ? '요청 중...' : `검수 요청 보내기 ${icon('send')}`}</button></div>
      ${collaborationCommentsPanel()}
    </div>
  </section>`
}

function editorView() {
  const stageContent = {
    design: designStage,
    details: detailsStage,
    preview: fanPreviewStage,
    review: reviewStage,
  }[state.stage]?.() || designStage()
  const activeCard = state.cards.find((item) => item.id === state.cardId)
  return `<section class="editor-view"><div class="editor-title-row"><div><button type="button" class="back-link" data-action="exit-editor">${icon('arrow_back')} 내 카드</button><h2>${esc(state.form.name || '새 특별 카드')}</h2>${activeCard ? releaseStatusBanner(activeCard, { compact: true }) : ''}</div><div>${state.stage === 'design' ? `<button type="button" class="secondary-button" data-action="save-draft" ${state.busy ? 'disabled' : ''}>${icon('save')} ${state.busy ? '저장 중' : '초안 저장'}</button><button type="button" class="primary-button" data-action="go-details">카드 정보 입력 ${icon('arrow_forward')}</button>` : ''}</div></div>${editorProgress()}${stageContent}</section>`
}

function cardsView() {
  return `<section class="cards-view"><div class="section-heading page"><div><span>MY CARDS</span><h2>내 카드</h2><p>초안부터 팬앱 공개까지 제작 상태를 한눈에 확인하세요.</p></div><button type="button" class="primary-button" data-nav="create">${icon('add')} 새 카드 만들기</button></div>
    ${state.cards.length ? `<div class="card-library">${state.cards.map((card, index) => `<article class="library-card"><button type="button" class="library-image" data-action="edit-card" data-card-id="${esc(card.id)}"><img src="${[sampleAssets.aurora, sampleAssets.motion, sampleAssets.stardust][index % 3]}" data-card-image="${esc(card.id)}" alt="${esc(card.name)}" /><span class="status-badge ${esc(card.status)}">${statusLabel(card.status, card.releaseStatus)}</span></button><div><span>${esc(card.seasonName || '시즌 미정')}</span><h3>${esc(card.name)}</h3><p>${esc(card.rarity || '등급 미정')} · ${Number(card.issueLimit || 0).toLocaleString('ko-KR')}장</p>${releaseStatusBanner(card, { compact: true })}<button type="button" class="secondary-button full" data-action="edit-card" data-card-id="${esc(card.id)}">${card.releaseStatus === 'published' ? '공개 카드 보기' : ['pending_partner_review', 'pending_platform_review', 'approved', 'drop_ready'].includes(card.releaseStatus) ? '공개 진행 상황 보기' : '편집 이어서 하기'}</button></div></article>`).join('')}</div>` : `<div class="large-empty">${icon('style')}<h3>아직 만든 카드가 없어요.</h3><p>특별 기능 레시피를 골라 첫 번째 디지털 포토카드를 만들어 보세요.</p><button type="button" class="primary-button" data-nav="create">첫 카드 만들기</button></div>`}
  </section>`
}

function feedbackView() {
  const summary = state.insights?.summary || {}
  const items = state.insights?.items || []
  return `<section class="feedback-view"><div class="section-heading page"><div><span>FAN RESPONSE</span><h2>팬 반응</h2><p>공개된 카드의 수집 현황을 확인할 수 있어요.</p></div></div>
    <div class="metric-grid feedback">${metricCard('style', '전체 카드', summary.totalCards || 0, 'slate')}${metricCard('redeem', '총 수집', summary.redeemedCount || 0, 'violet')}${metricCard('rate_review', '검수 중', summary.pendingReviewCards || 0, 'pink')}${metricCard('public', '공개 카드', summary.publishedCards || 0, 'blue')}</div>
    <section class="dashboard-panel"><div class="section-heading"><div><span>COLLECTION</span><h3>카드별 수집 현황</h3></div></div>${items.length ? `<div class="insight-table"><div class="insight-head"><span>카드</span><span>상태</span><span>수집</span><span>달성률</span></div>${items.map((item) => { const percent = item.issueLimit ? Math.min(100, Math.round((item.redeemedCount / item.issueLimit) * 100)) : 0; return `<div class="insight-row"><strong>${esc(item.name)}</strong><span class="status-badge ${esc(item.status)}">${statusLabel(item.status)}</span><span>${Number(item.redeemedCount).toLocaleString('ko-KR')} / ${Number(item.issueLimit).toLocaleString('ko-KR')}</span><span class="progress"><i style="--progress:${percent}%"></i><small>${percent}%</small></span></div>` }).join('')}</div>` : `<div class="empty-inline">${icon('monitoring')}<div><strong>아직 집계할 카드가 없어요.</strong><span>카드를 공개하면 팬 수집 현황이 표시됩니다.</span></div></div>`}</section>
  </section>`
}

function settingsView() {
  return `<section class="settings-view"><div class="section-heading page"><div><span>STUDIO ACCOUNT</span><h2>설정</h2><p>아티스트 정보와 알림 수신 여부를 관리합니다.</p></div></div>
    <div class="settings-grid"><form id="profile-form" class="settings-card"><div class="settings-card-heading">${icon('badge')}<div><h3>스튜디오 프로필</h3><p>운영팀과 협업할 때 표시되는 정보입니다.</p></div></div><label>표시 이름<input name="nickname" maxlength="40" value="${esc(state.profile?.nickname || '')}" required /></label><label>로그인 아이디<input value="${esc(state.profile?.username || '')}" disabled /></label><label>연결 이메일<input value="${esc(state.profile?.email || '등록되지 않음')}" disabled /></label><label class="check-row settings"><input name="emailEnabled" type="checkbox" ${state.profile?.emailEnabled ? 'checked' : ''} /><span><strong>이메일 알림 받기</strong><small>검수 결과와 카드 상태 변경을 이메일로 알려드려요.</small></span></label><button type="submit" class="primary-button">변경사항 저장</button></form>
    <div class="settings-card"><div class="settings-card-heading">${icon('security')}<div><h3>보안과 세션</h3><p>스튜디오 로그인은 운영팀이 발급한 계정으로 관리됩니다.</p></div></div><div class="security-list"><span>${icon('memory')}<span><strong>Access Token</strong><small>브라우저 메모리에만 보관 · 짧은 수명</small></span></span><span>${icon('cookie')}<span><strong>Refresh Token</strong><small>HttpOnly · Secure 쿠키 · 서버 RTR</small></span></span><span>${icon('logout')}<span><strong>세션 종료</strong><small>로그아웃 시 서버 세션과 쿠키가 함께 폐기됩니다.</small></span></span></div><button type="button" class="danger-button full" data-action="logout">현재 기기에서 로그아웃</button></div></div>
  </section>`
}

function render() {
  syncDeviceMotionLifecycle()
  if (state.loading) {
    app.innerHTML = loadingView()
    return
  }
  if (!state.authenticated || state.mustChangePassword) {
    app.innerHTML = loginView()
    return
  }
  if (state.view === 'editor') {
    app.innerHTML = shell(editorView(), '특별 카드 만들기', 'create')
  } else if (state.view === 'create') {
    app.innerHTML = shell(createView(), '카드 만들기')
  } else if (state.view === 'cards') {
    app.innerHTML = shell(cardsView(), '내 카드')
  } else if (state.view === 'feedback') {
    app.innerHTML = shell(feedbackView(), '팬 반응')
  } else if (state.view === 'settings') {
    app.innerHTML = shell(settingsView(), '설정')
  } else {
    app.innerHTML = shell(homeView(), '스튜디오 홈', 'home')
  }
  window.requestAnimationFrame(afterRender)
}

function afterRender() {
  hydrateCardImages()
  if (state.view === 'editor' && state.stage === 'design' && state.editor.tool === 'handwriting') {
    initHandwritingPad()
  }
  if (state.view === 'editor' && state.stage === 'design' && state.editor.tool === 'drawing') {
    initDrawingPad()
  }
  if (state.view === 'editor' && ['design', 'preview'].includes(state.stage)) {
    initInteractiveCards()
    if (state.stage === 'design') initCreativeLayerInteractions()
  }
}

function markDirty() {
  state.saveStatus = 'dirty'
  persistDraft()
  const indicator = document.querySelector('.save-indicator')
  if (indicator) {
    indicator.className = 'save-indicator dirty'
    indicator.innerHTML = '<i></i>변경사항 있음'
  }
  if (state.cardId) {
    window.clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(() => saveDraft({ quiet: true }), 1200)
  }
}

function cancelAutosave() {
  window.clearTimeout(autosaveTimer)
  autosaveTimer = null
}

function setRecipe(recipeId) {
  const form = initialForm()
  const editor = initialEditor()
  if (recipeId === 'voice') {
    form.name = '오로라 보이스 메시지'
    form.hasVoice = true
    editor.voiceEnabled = true
    editor.tool = 'voice'
    editor.imageSrc = sampleAssets.aurora
  } else if (recipeId === 'motion') {
    form.name = '네온 모션 스테이지'
    form.rarity = 'UR'
    editor.videoEnabled = true
    editor.tool = 'motion'
    editor.effectIntensity = 0.42
    editor.imageSrc = sampleAssets.motion
  } else if (recipeId === 'hologram') {
    form.name = '스타더스트 홀로그램'
    form.rarity = 'UR'
    editor.tool = 'hologram'
    editor.effectPreset = 'stardust'
    editor.foilPattern = 'micro-star'
    editor.effectIntensity = 0.72
    editor.imageSrc = sampleAssets.stardust
  } else if (recipeId === 'signature') {
    form.name = '손글씨 시그니처 카드'
    editor.handwritingEnabled = true
    editor.tool = 'handwriting'
    editor.imageSrc = sampleAssets.stardust
  } else {
    form.name = '새 특별 카드'
    editor.effect = 'none'
    editor.effectMotion = false
    editor.interaction = 'static'
  }
  const firstArtist = state.catalog.artists?.[0]
  const firstMember = state.catalog.members?.find((member) => member.artistId === firstArtist?.id)
  form.artistId = firstArtist?.id || null
  form.memberId = firstMember?.id || null
  state.selectedRecipe = recipeId
  state.form = form
  state.editor = editor
  state.cardId = null
  state.editingCardId = null
  state.reviewNote = ''
  state.reviewError = ''
  state.stage = 'design'
  state.view = 'editor'
  state.saveStatus = 'dirty'
  persistDraft()
  render()
}

function navigate(destination) {
  const next = navigationState(destination)
  state.view = next.view
  if (destination === 'create') state.stage = 'design'
  render()
  if (destination === 'feedback') loadInsights()
}

async function loginArtist(formElement) {
  const form = new FormData(formElement)
  state.loginError = ''
  try {
    const result = await api('/auth/artist/login', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username')?.toString().trim(),
        password: form.get('password')?.toString(),
      }),
    })
    ACCESS_TOKEN = result.data.accessToken
    state.authenticated = true
    state.mustChangePassword = Boolean(result.data.mustChangePassword)
    state.profile = result.data.user
    if (!state.mustChangePassword) await loadStudioData()
  } catch (error) {
    ACCESS_TOKEN = ''
    state.authenticated = false
    state.loginError = error.message
  }
  render()
}

async function changePassword(formElement) {
  const form = new FormData(formElement)
  try {
    await api('/auth/artist/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: form.get('currentPassword')?.toString(),
        newPassword: form.get('newPassword')?.toString(),
      }),
    })
    state.mustChangePassword = false
    await loadStudioData()
    notify('새 비밀번호가 저장되었습니다.', 'success')
  } catch (error) {
    state.loginError = error.message
  }
  render()
}

async function logoutArtist() {
  cancelAutosave()
  const userId = state.profile?.id
  try {
    await api('/auth/logout', { method: 'POST' })
  } catch {
    // Local sign-out still completes when the server session already expired.
  }
  ACCESS_TOKEN = ''
  state.authenticated = false
  state.mustChangePassword = false
  state.profile = null
  state.deviceMotionStatus = 'idle'
  state.deviceMotionEnabled = false
  clearDraft(userId)
  render()
}

async function loadStudioData() {
  // Studio startup is intentionally sequential. Some privacy-focused and
  // embedded browsers aggressively cancel parallel credentialed requests to
  // a freshly authenticated origin, which made an otherwise successful login
  // appear to fail. The four small payloads are cheap, and predictable startup
  // is more important than shaving a few milliseconds here.
  const cards = await api('/artist/cards')
  const catalog = await api('/artist/templates')
  const profile = await api('/artist/profile')
  const insights = await api('/artist/insights')
  state.cards = cards.data.items
  state.catalog = catalog.data
  state.profile = profile.data
  state.insights = insights.data
  restoreDraftForUser(state.profile.id, state.cards)
  state.authenticated = true
  const selection = normalizeCatalogSelection(state.form, state.catalog)
  state.form.artistId = selection.artistId
  state.form.memberId = selection.memberId
}

async function loadInsights() {
  try {
    const result = await api('/artist/insights')
    state.insights = result.data
    if (state.view === 'feedback') render()
  } catch (error) {
    notify(error.message, 'error')
  }
}

async function uploadAsset(file, purpose) {
  const contentType = normalizedMediaType(file.type, purpose)
  const presigned = await api('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType, purpose }),
  })
  const directUpload = presigned.data.uploadMode === 'direct'
  const uploadUrl = directUpload
    ? presigned.data.uploadUrl
    : absoluteApiUrl(presigned.data.uploadUrl)
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    credentials: directUpload ? 'omit' : 'include',
    headers: {
      'Content-Type': contentType,
      ...(directUpload
        ? {}
        : {
            'X-Fanfolio-Client': 'artist',
            ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
          }),
    },
  })
  if (!response.ok) throw new Error(`파일 업로드에 실패했습니다. (${response.status})`)
  if (presigned.data.completeUrl) {
    await api(presigned.data.completeUrl.replace(/^\/api/, ''), { method: 'POST' })
  }
  return presigned.data.assetId
}

async function sourceToFile(source, name, fallbackType = 'image/png') {
  const response = await fetch(source)
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type || fallbackType })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(new Error('파일을 미리 볼 수 없습니다.')))
    reader.readAsDataURL(file)
  })
}

async function ensureAsset(kind) {
  const idKey = `${kind}AssetId`
  const fileKey = `${kind}File`
  const srcKey = `${kind}Src`
  if (state.editor[idKey]) return state.editor[idKey]
  let file = state.editor[fileKey]
  if (!file && state.editor[srcKey]) {
    const extension = ['image', 'handwriting', 'lenticular'].includes(kind)
      ? 'png'
      : kind === 'voice'
        ? 'webm'
        : 'mp4'
    file = await sourceToFile(state.editor[srcKey], `${kind}-${Date.now()}.${extension}`)
  }
  if (!file) return null
  const purpose = kind === 'image' || kind === 'lenticular' ? 'card' : kind
  const assetId = await uploadAsset(file, purpose)
  state.editor[idKey] = assetId
  if (kind !== 'lenticular') state.form[idKey] = assetId
  return assetId
}

async function ensureCreativeLayerAssets() {
  for (const layer of state.editor.layers || []) {
    if (layer.assetId) continue
    if (layer.type === 'handwriting' && state.editor.handwritingAssetId) {
      layer.assetId = state.editor.handwritingAssetId
      continue
    }
    if (!layer.src) continue
    const file = layer.file || await sourceToFile(
      layer.src,
      `${layer.type}-${Date.now()}.png`,
      'image/png',
    )
    layer.assetId = await uploadAsset(file, 'handwriting')
  }
}

async function saveDraft({ quiet = false, nextStage = null } = {}) {
  if (state.busy) return null
  state.busy = true
  state.saveStatus = 'saving'
  if (!quiet) render()
  try {
    const draftErrors = cardDraftErrors({ form: state.form, editor: state.editor })
    if (draftErrors.length) throw new Error(draftErrors.join(' '))
    await ensureAsset('image')
    if (state.editor.voiceEnabled && state.editor.voiceSrc) await ensureAsset('voice')
    if (state.editor.videoEnabled && state.editor.videoSrc) await ensureAsset('video')
    if (state.editor.interaction === 'lenticular' && state.editor.lenticularSrc) {
      await ensureAsset('lenticular')
    }
    if (state.editor.handwritingEnabled && state.editor.handwritingSrc) {
      await ensureAsset('handwriting')
    }
    await ensureCreativeLayerAssets()
    state.form.hasVoice = state.editor.voiceEnabled
    const payload = buildCardPayload({ form: state.form, editor: state.editor })
    const result = state.cardId
      ? await api(`/artist/cards/${state.cardId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      : await api('/artist/cards', { method: 'POST', body: JSON.stringify(payload) })
    state.cardId = result.data.id
    state.editingCardId = result.data.id
    state.form = { ...state.form, ...result.data }
    state.editor.imageAssetId = result.data.imageAssetId
    state.editor.voiceAssetId = result.data.voiceAssetId
    state.editor.videoAssetId = result.data.videoAssetId
    state.editor.handwritingAssetId = result.data.handwritingAssetId
    const existingIndex = state.cards.findIndex((card) => card.id === result.data.id)
    if (existingIndex >= 0) state.cards.splice(existingIndex, 1, result.data)
    else state.cards.unshift(result.data)
    state.saveStatus = 'saved'
    persistDraft()
    if (nextStage) state.stage = nextStage
    if (!quiet) notify('카드 초안을 안전하게 저장했습니다.', 'success')
    return result.data
  } catch (error) {
    state.saveStatus = 'error'
    if (!quiet) notify(error.message, 'error')
    return null
  } finally {
    state.busy = false
    if (!quiet) render()
  }
}

async function openCard(cardId) {
  const card = state.cards.find((item) => item.id === cardId)
  if (!card) return
  const effects = normalizeCardEffects(card.designConfig)
  if (state.editor.lenticularSrc?.startsWith('blob:')) {
    URL.revokeObjectURL(state.editor.lenticularSrc)
  }
  state.form = { ...initialForm(), ...card }
  state.editor = {
    ...initialEditor(),
    imageAssetId: card.imageAssetId,
    voiceAssetId: card.voiceAssetId,
    videoAssetId: card.videoAssetId,
    handwritingAssetId: card.handwritingAssetId,
    voiceEnabled: Boolean(card.hasVoice),
    videoEnabled: Boolean(card.designConfig?.video?.enabled),
    handwritingEnabled: Boolean(
      card.designConfig?.handwriting?.enabled || card.handwritingAssetId,
    ),
    effect: card.designConfig?.front?.effect || 'none',
    effectPreset: card.designConfig?.front?.effectPreset || 'aurora',
    effectIntensity: card.designConfig?.front?.effectIntensity ?? 0.58,
    effectAngle: card.designConfig?.front?.effectAngle ?? 135,
    effectMotion: card.designConfig?.front?.effectMotion ?? true,
    effectSpread: card.designConfig?.front?.effectSpread ?? 0.64,
    effectGrain: card.designConfig?.front?.effectGrain ?? 0.38,
    effectFinish: card.designConfig?.front?.effectFinish || 'glass',
    material: effects.front.material,
    foilPattern: effects.front.foilPattern,
    foilCoverage: effects.front.foilCoverage,
    interaction: effects.front.interaction,
    effectMotion: effects.front.interaction !== 'static',
    lenticularAssetId: effects.front.lenticularAssetId,
    backMaterial: effects.back.material,
    backEdgeFoil: effects.back.edgeFoil,
    backSpotUv: effects.back.spotUv,
    backHiddenMessage: effects.back.hiddenMessage,
    videoLoop: card.designConfig?.video?.loop ?? true,
    handwritingTransform: card.handwritingTransform || initialEditor().handwritingTransform,
    layers: Array.isArray(card.designConfig?.creativeLayers)
      ? card.designConfig.creativeLayers.map((layer) => ({
          ...layer,
          src: builtInStickerSource(layer.builtinId),
          file: null,
        }))
      : [],
    selectedLayerId: null,
    inspectorOpen: false,
    background: card.designConfig?.back?.background || '#0b1033',
    backTemplateId: card.designConfig?.back?.templateId || 'agency_back_v1',
  }
  state.cardId = card.id
  state.editingCardId = card.id
  state.reviewNote = card.reviewNote || ''
  state.stage = cardEditorStage(card)
  state.view = 'editor'
  state.saveStatus = 'saved'
  render()
  state.collaborationComments = []
  void loadCollaborationComments(card.id)
  const media = [
    ['imageSrc', card.imageUrl],
    ['voiceSrc', card.voiceUrl],
    ['videoSrc', card.videoUrl],
    ['handwritingSrc', card.handwritingUrl],
  ]
  await Promise.all(
    media.map(async ([key, path]) => {
      if (!path) return
      try {
        state.editor[key] = await fetchProtectedBlob(path)
      } catch {
        // Individual media may still be processing; the rest of the editor remains usable.
      }
    }),
  )
  if (state.editor.lenticularAssetId) {
    try {
      state.editor.lenticularSrc = await fetchProtectedBlob(
        `/assets/${state.editor.lenticularAssetId}/content`,
      )
    } catch {
      state.editor.lenticularSrc = ''
    }
  }
  await Promise.all(
    state.editor.layers.map(async (layer) => {
      if (!layer.assetId) return
      try {
        layer.src = await fetchProtectedBlob(`/assets/${layer.assetId}/content`)
      } catch {
        // A missing layer never prevents the rest of an owned draft from reopening.
      }
    }),
  )
  if (state.editor.handwritingSrc) {
    const handwritingLayer = state.editor.layers.find((layer) => layer.type === 'handwriting')
    if (handwritingLayer) {
      handwritingLayer.src = state.editor.handwritingSrc
      handwritingLayer.assetId = card.handwritingAssetId
    } else {
      upsertCreativeLayer('handwriting', {
        src: state.editor.handwritingSrc,
        assetId: card.handwritingAssetId,
        side: 'front',
        width: Math.min(72, Number(card.handwritingTransform?.width || 520) / 10),
        rotation: Number(card.handwritingTransform?.rotation || 0),
      })
    }
  }
  if (state.stage === 'design') persistDraft()
  else clearDraft()
  render()
}

async function hydrateCardImages() {
  const targets = [...document.querySelectorAll('[data-card-image]')]
  await Promise.all(
    targets.map(async (image) => {
      const card = state.cards.find((item) => item.id === image.dataset.cardImage)
      if (!card?.imageUrl || card._imageBlobUrl) {
        if (card?._imageBlobUrl) image.src = card._imageBlobUrl
        return
      }
      try {
        card._imageBlobUrl = await fetchProtectedBlob(card.imageUrl)
        if (image.isConnected) image.src = card._imageBlobUrl
      } catch {
        // Generated visual remains as a graceful fallback.
      }
    }),
  )
}

function replaceObjectUrl(key, file) {
  const current = state.editor[key]
  if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
  state.editor[key] = URL.createObjectURL(file)
}

async function handleUpload(kind, file) {
  if (!file) return
  if (kind === 'sticker') {
    const src = await fileToDataUrl(file)
    upsertCreativeLayer('sticker', {
      src,
      file,
      assetId: null,
      side: state.editor.side,
      width: 28,
    })
    state.editor.inspectorOpen = true
    markDirty()
    render()
    return
  }
  const srcKey = `${kind}Src`
  const fileKey = `${kind}File`
  const idKey = `${kind}AssetId`
  replaceObjectUrl(srcKey, file)
  state.editor[fileKey] = file
  state.editor[idKey] = null
  if (kind !== 'lenticular') state.form[idKey] = null
  if (kind === 'image') state.editor.imageName = file.name
  if (kind === 'lenticular') {
    state.editor.interaction = 'lenticular'
    state.editor.effectMotion = true
  }
  if (kind === 'voice') {
    state.editor.voiceName = file.name
    state.editor.voiceEnabled = true
    state.form.hasVoice = true
  }
  if (kind === 'video') {
    state.editor.videoName = file.name
    state.editor.videoEnabled = true
  }
  if (kind === 'handwriting') {
    state.editor.handwritingSrc = await fileToDataUrl(file)
    state.editor.handwritingEnabled = true
    state.editor.handwritingNeedsRemoval = file.type !== 'image/png'
    upsertCreativeLayer('handwriting', {
      src: state.editor.handwritingSrc,
      file,
      assetId: null,
      side: state.editor.side,
      color: '#171a3a',
      width: 46,
    })
  }
  markDirty()
  render()
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    notify('이 브라우저에서는 직접 녹음을 사용할 수 없습니다. 음성 파일을 업로드해 주세요.', 'error')
    return
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined)
    recordedChunks = []
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) recordedChunks.push(event.data)
    })
    mediaRecorder.addEventListener('stop', () => {
      const normalizedType = mimeType.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm'
      const extension = normalizedType === 'audio/mp4' ? 'm4a' : 'webm'
      const blob = new Blob(recordedChunks, { type: normalizedType })
      handleUpload(
        'voice',
        new File([blob], `fanfolio-voice-${Date.now()}.${extension}`, { type: normalizedType }),
      )
      mediaStream?.getTracks().forEach((track) => track.stop())
      mediaStream = null
      state.recording = false
      render()
    })
    mediaRecorder.start()
    state.recording = true
    render()
  } catch {
    notify('마이크 권한을 확인해 주세요.', 'error')
  }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
}

function initHandwritingPad() {
  const canvas = document.querySelector('#handwriting-pad')
  if (!canvas) return
  const context = canvas.getContext('2d')
  context.strokeStyle = '#171a3a'
  context.lineWidth = 7
  context.lineCap = 'round'
  context.lineJoin = 'round'
  let drawing = false
  const point = (event) => {
    const box = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    }
  }
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true
    canvas.setPointerCapture?.(event.pointerId)
    const current = point(event)
    context.beginPath()
    context.moveTo(current.x, current.y)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return
    const current = point(event)
    context.lineTo(current.x, current.y)
    context.stroke()
  })
  const finish = () => {
    if (!drawing) return
    drawing = false
    state.editor.handwritingSrc = canvas.toDataURL('image/png')
    state.editor.handwritingFile = null
    state.editor.handwritingAssetId = null
    state.editor.handwritingEnabled = true
    state.editor.handwritingNeedsRemoval = false
    const layer = upsertCreativeLayer('handwriting', {
      src: state.editor.handwritingSrc,
      file: null,
      assetId: null,
      color: '#171a3a',
      width: 46,
    })
    layer.side = state.editor.side
    markDirty()
    render()
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', finish)
}

function initDrawingPad() {
  const canvas = document.querySelector('#drawing-pad')
  if (!canvas) return
  const context = canvas.getContext('2d')
  context.strokeStyle = state.editor.drawingColor || '#6b58ef'
  context.lineWidth = Number(state.editor.drawingSize || 7)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (state.editor.drawingDraftSrc) {
    const image = new Image()
    image.addEventListener('load', () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    })
    image.src = state.editor.drawingDraftSrc
  }
  let drawing = false
  const point = (event) => {
    const box = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    }
  }
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true
    canvas.setPointerCapture?.(event.pointerId)
    const current = point(event)
    context.beginPath()
    context.moveTo(current.x, current.y)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return
    const current = point(event)
    context.lineTo(current.x, current.y)
    context.stroke()
  })
  const finish = () => {
    if (!drawing) return
    drawing = false
    state.editor.drawingDraftSrc = canvas.toDataURL('image/png')
    markDirty()
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', finish)
}

function resetInteractiveCard(card) {
  card.style.setProperty('--tilt-x', '0deg')
  card.style.setProperty('--tilt-y', '0deg')
  card.style.setProperty('--light-x', '50%')
  card.style.setProperty('--light-y', '42%')
  card.classList.remove('is-tilting')
}

function prefersReducedEffects() {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  const deviceMemory =
    typeof navigator !== 'undefined' && Number.isFinite(Number(navigator.deviceMemory))
      ? Number(navigator.deviceMemory)
      : null
  return reducedMotion || (deviceMemory !== null && deviceMemory <= 2)
}

function clampTilt(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(-15, Math.min(15, numeric))
}

function applyDeviceOrientation(event) {
  const card = document.querySelector('.fan-card-wrap [data-hologram-card]')
  if (
    !card ||
    !card.classList.contains('effect-motion') ||
    !state.deviceMotionEnabled ||
    prefersReducedEffects()
  ) {
    return
  }
  const beta = clampTilt(event?.beta)
  const gamma = clampTilt(event?.gamma)
  const lightX = Math.round(((gamma + 15) / 30) * 100)
  const lightY = Math.round(((beta + 15) / 30) * 100)
  card.style.setProperty('--tilt-x', `${(-beta).toFixed(2)}deg`)
  card.style.setProperty('--tilt-y', `${gamma.toFixed(2)}deg`)
  card.style.setProperty('--light-x', `${lightX}%`)
  card.style.setProperty('--light-y', `${lightY}%`)
  card.style.setProperty('--lenticular-reveal', `${lightX}%`)
  card.classList.add('is-tilting')
}

function supportsDeviceMotion() {
  return window.isSecureContext === true && typeof window.DeviceOrientationEvent !== 'undefined'
}

function isDeviceMotionPreviewActive() {
  return (
    state.view === 'editor' &&
    state.stage === 'preview' &&
    state.deviceMotionEnabled === true &&
    supportsDeviceMotion() &&
    !prefersReducedEffects()
  )
}

function syncDeviceMotionLifecycle() {
  if (isDeviceMotionPreviewActive()) {
    if (!deviceMotionListenerAttached) {
      window.addEventListener('deviceorientation', applyDeviceOrientation, { passive: true })
      deviceMotionListenerAttached = true
    }
    return
  }
  if (deviceMotionListenerAttached) {
    window.removeEventListener('deviceorientation', applyDeviceOrientation)
    deviceMotionListenerAttached = false
    const card = document.querySelector('.fan-card-wrap [data-hologram-card]')
    if (card) resetInteractiveCard(card)
  }
}

async function enableDeviceMotion() {
  if (prefersReducedEffects()) {
    state.deviceMotionStatus = 'reduced'
    state.deviceMotionEnabled = false
    notify('움직임 효과를 줄이는 설정입니다. 카드를 터치해 소재를 확인할 수 있어요.')
    render()
    return
  }
  try {
    const permission =
      typeof window.DeviceOrientationEvent?.requestPermission === 'function'
        ? await window.DeviceOrientationEvent.requestPermission()
        : 'granted'
    if (permission !== 'granted') throw new Error('DEVICE_ORIENTATION_DENIED')
    state.deviceMotionStatus = 'granted'
    state.deviceMotionEnabled = true
    syncDeviceMotionLifecycle()
    notify('기기 움직임으로 카드 빛 반사를 볼 수 있어요.')
    render()
  } catch {
    state.deviceMotionStatus = 'denied'
    state.deviceMotionEnabled = false
    notify('센서 접근이 허용되지 않았어요. 카드를 터치해 같은 효과를 볼 수 있어요.', 'warning')
    render()
  }
}

function initInteractiveCards() {
  const reduceMotion = prefersReducedEffects()
  document.querySelectorAll('[data-hologram-card]').forEach((card) => {
    if (reduceMotion || !card.classList.contains('effect-motion')) return
    const move = (event) => {
      if (event.target.closest?.('.creative-layer, .layer-context-toolbar')) return
      if (event.pointerType === 'touch' && !card.hasPointerCapture?.(event.pointerId)) return
      const box = card.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
      const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
      card.style.setProperty('--tilt-x', `${((0.5 - y) * 12).toFixed(2)}deg`)
      card.style.setProperty('--tilt-y', `${((x - 0.5) * 14).toFixed(2)}deg`)
      card.style.setProperty('--light-x', `${Math.round(x * 100)}%`)
      card.style.setProperty('--light-y', `${Math.round(y * 100)}%`)
      card.style.setProperty('--lenticular-reveal', `${Math.round(x * 100)}%`)
      card.classList.add('is-tilting')
    }
    card.addEventListener('pointerdown', (event) => {
      if (event.target.closest?.('.creative-layer, .layer-context-toolbar')) return
      card.setPointerCapture?.(event.pointerId)
      move(event)
    })
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerleave', () => resetInteractiveCard(card))
    card.addEventListener('pointercancel', () => resetInteractiveCard(card))
    card.addEventListener('pointerup', (event) => {
      card.releasePointerCapture?.(event.pointerId)
      if (event.pointerType !== 'mouse') resetInteractiveCard(card)
    })
  })
}

function initCreativeLayerInteractions() {
  document.querySelectorAll('.creative-layer[data-layer-id]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      const handleType = event.target.closest?.('[data-layer-handle]')?.dataset.layerHandle || 'move'
      const layer = (state.editor.layers || []).find(
        (item) => item.id === element.dataset.layerId,
      )
      const card = element.closest('.editor-card')
      if (!layer || !card) return
      state.editor.selectedLayerId = layer.id
      document.querySelectorAll('.creative-layer.selected').forEach((item) => item.classList.remove('selected'))
      element.classList.add('selected')
      element.setPointerCapture?.(event.pointerId)
      const box = card.getBoundingClientRect()
      const start = {
        clientX: event.clientX,
        clientY: event.clientY,
        x: Number(layer.x),
        y: Number(layer.y),
        width: Number(layer.width),
        rotation: Number(layer.rotation),
      }
      const move = (moveEvent) => {
        moveEvent.preventDefault()
        updateLayerFromHandleDrag(handleType, layer, element, box, start, moveEvent)
      }
      const finish = (finishEvent) => {
        element.releasePointerCapture?.(finishEvent.pointerId)
        element.removeEventListener('pointermove', move)
        element.removeEventListener('pointerup', finish)
        element.removeEventListener('pointercancel', finish)
        markDirty()
        render()
      }
      element.addEventListener('pointermove', move)
      element.addEventListener('pointerup', finish)
      element.addEventListener('pointercancel', finish)
    })
  })
}

function shortestSignedAngularDelta(startRadians, nextRadians) {
  return Math.atan2(Math.sin(nextRadians - startRadians), Math.cos(nextRadians - startRadians))
}

function clampLayerRotation(rotation) {
  if (!Number.isFinite(Number(rotation))) return 0
  const normalized = ((Number(rotation) + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function computeLayerResizeWidth(startWidth, startDistance, nextDistance) {
  const safeStartWidth = Number.isFinite(Number(startWidth)) ? Number(startWidth) : 8
  const safeStartDistance = Math.max(1, Number(startDistance) || 1)
  const safeNextDistance = Math.max(0, Number(nextDistance) || 0)
  return Math.max(8, Math.min(100, safeStartWidth * (safeNextDistance / safeStartDistance)))
}

function updateLayerFromHandleDrag(handleType, layer, element, box, start, event) {
  if (handleType === 'resize') {
    const center = {
      x: box.left + (start.x / 100) * box.width,
      y: box.top + (start.y / 100) * box.height,
    }
    const startDistance = Math.hypot(start.clientX - center.x, start.clientY - center.y) || 1
    const nextDistance = Math.hypot(event.clientX - center.x, event.clientY - center.y)
    layer.width = computeLayerResizeWidth(start.width, startDistance, nextDistance)
    element.style.setProperty('--layer-width', `${layer.width}%`)
    return
  }
  if (handleType === 'rotate') {
    const center = {
      x: box.left + (start.x / 100) * box.width,
      y: box.top + (start.y / 100) * box.height,
    }
    const startAngle = Math.atan2(start.clientY - center.y, start.clientX - center.x)
    const nextAngle = Math.atan2(event.clientY - center.y, event.clientX - center.x)
    layer.rotation = clampLayerRotation(
      Math.round(start.rotation + (shortestSignedAngularDelta(startAngle, nextAngle) * 180) / Math.PI),
    )
    element.style.setProperty('--layer-rotation', `${layer.rotation}deg`)
    return
  }
  layer.x = Math.max(0, Math.min(100, start.x + ((event.clientX - start.clientX) / box.width) * 100))
  layer.y = Math.max(0, Math.min(100, start.y + ((event.clientY - start.clientY) / box.height) * 100))
  element.style.setProperty('--layer-x', `${layer.x}%`)
  element.style.setProperty('--layer-y', `${layer.y}%`)
}

async function requestBackgroundRemoval() {
  try {
    state.jobStatus = '손글씨를 업로드하는 중...'
    render()
    const assetId = await ensureAsset('handwriting')
    if (!assetId) throw new Error('배경을 제거할 손글씨 이미지를 먼저 추가해 주세요.')
    const result = await api(`/assets/${assetId}/background-removal`, { method: 'POST' })
    state.jobStatus = '배경을 분리하고 있어요.'
    render()
    await pollBackgroundRemoval(result.data.jobId)
  } catch (error) {
    state.jobStatus = ''
    notify(error.message, 'error')
    render()
  }
}

async function pollBackgroundRemoval(jobId) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const result = await api(`/background-removal-jobs/${jobId}`)
    if (result.data.status === 'completed') {
      state.editor.handwritingSrc = await fetchProtectedBlob(result.data.transparentImageUrl)
      upsertCreativeLayer('handwriting', {
        src: state.editor.handwritingSrc,
        assetId: state.editor.handwritingAssetId,
      })
      state.editor.handwritingNeedsRemoval = false
      state.jobStatus = '투명 손글씨가 준비됐어요.'
      markDirty()
      render()
      return
    }
    if (result.data.status === 'failed') throw new Error('배경 제거에 실패했습니다.')
    await new Promise((resolve) => window.setTimeout(resolve, 800))
  }
  throw new Error('배경 제거가 지연되고 있어요. 잠시 후 다시 확인해 주세요.')
}

async function submitReview() {
  if (state.busy) return
  state.reviewError = ''
  const card = await saveDraft({ quiet: true })
  if (!card) {
    state.reviewError = '초안을 저장하지 못했습니다. 필수 정보와 업로드 상태를 확인해 주세요.'
    render()
    return
  }
  const readiness = currentReadiness()
  if (!readiness.ready) {
    state.reviewError = '추가가 필요한 항목을 먼저 완료해 주세요.'
    render()
    return
  }
  state.busy = true
  render()
  try {
    const effectVersion = await api(`/artist/cards/${state.cardId}/effect-versions`, {
      method: 'POST',
      body: JSON.stringify({ designConfig: card.designConfig || {} }),
    })
    state.effectVersionId = effectVersion.data.id
    await api(`/artist/cards/${state.cardId}/effect-versions/${state.effectVersionId}/submit-review`, {
      method: 'POST',
    })
    const result = await api(`/artist/cards/${state.cardId}/submit-review`, {
      method: 'POST',
      body: JSON.stringify({ reviewNote: state.reviewNote || null }),
    })
    state.cards = state.cards.map((item) =>
      item.id === state.cardId ? { ...item, ...result.data } : item,
    )
    state.form = { ...state.form, ...result.data }
    state.submissionMessage = '검수 요청을 보냈습니다. 담당 운영자에게 알림이 전달됐어요.'
    clearDraft()
    notify('검수 요청을 보냈습니다. 결과가 나오면 이 카드에서 바로 확인할 수 있어요.', 'success')
  } catch (error) {
    state.reviewError = error.message
  } finally {
    state.busy = false
    render()
  }
}

async function loadCollaborationComments(cardId, renderAfter = true) {
  if (!cardId) return
  try {
    const result = await api(`/artist/cards/${encodeURIComponent(cardId)}/comments`)
    state.collaborationComments = result.data.items || []
    state.collaborationCommentError = ''
    if (renderAfter && state.view === 'editor') render()
  } catch (error) {
    state.collaborationCommentError = error.message
    if (renderAfter && state.view === 'editor') render()
  }
}

async function createCollaborationComment(form) {
  if (!state.cardId || state.busy) return
  const values = Object.fromEntries(new FormData(form).entries())
  state.collaborationCommentError = ''
  state.busy = true
  render()
  try {
    await api(`/artist/cards/${encodeURIComponent(state.cardId)}/comments`, {
      method: 'POST',
      body: JSON.stringify(values),
    })
    form.reset()
    await loadCollaborationComments(state.cardId, false)
  } catch (error) {
    state.collaborationCommentError = error.message
  } finally {
    state.busy = false
  }
  render()
}

async function resolveCollaborationComment(commentId) {
  if (!state.cardId || state.busy) return
  state.busy = true
  try {
    await api(`/artist/cards/${encodeURIComponent(state.cardId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    })
    await loadCollaborationComments(state.cardId, false)
  } catch (error) {
    state.collaborationCommentError = error.message
  } finally {
    state.busy = false
  }
  render()
}

async function saveProfile(formElement) {
  const form = new FormData(formElement)
  const nickname = form.get('nickname')?.toString().trim()
  if (!nickname) {
    notify('표시 이름을 입력해주세요.', 'error')
    return
  }
  try {
    const result = await api('/artist/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname,
        emailEnabled: form.get('emailEnabled') === 'on',
      }),
    })
    state.profile = result.data
    notify('프로필 설정을 저장했습니다.', 'success')
    render()
  } catch (error) {
    notify(error.message, 'error')
  }
}

function liveOutput(input, field, value) {
  const output = input.closest('.range-group')?.querySelector('output')
  if (!output) return
  if (['rotation', 'effectAngle'].includes(field)) output.textContent = `${Math.round(value)}°`
  else output.textContent = `${Math.round(Number(value) * (field === 'opacity' || field.startsWith('effect') ? 100 : 1))}%`
}

function applyLayerLivePreview(layer, input) {
  const element = document.querySelector(`[data-layer-id="${CSS.escape(layer.id)}"]`)
  if (!element) return
  const property = {
    x: '--layer-x',
    y: '--layer-y',
    width: '--layer-width',
    rotation: '--layer-rotation',
    opacity: '--layer-opacity',
    color: '--layer-color',
  }[input.dataset.layerField]
  if (!property) return
  const unit = ['x', 'y', 'width'].includes(input.dataset.layerField)
    ? '%'
    : input.dataset.layerField === 'rotation'
      ? 'deg'
      : ''
  element.style.setProperty(property, `${layer[input.dataset.layerField]}${unit}`)
  liveOutput(input, input.dataset.layerField, layer[input.dataset.layerField])
}

function applyEditorLivePreview(field, input) {
  const card = document.querySelector('.editor-card')
  const value = state.editor[field]
  if (field === 'backHiddenMessage') {
    const text = String(value || '')
    let message = card?.querySelector('.back-hidden-message')
    if (!text) {
      message?.remove()
    } else if (card) {
      if (!message) {
        message = document.createElement('p')
        message.className = 'back-hidden-message'
        card.append(message)
      }
      message.textContent = text
    }
  }
  if (field === 'background') card?.style.setProperty('--back-color', value)
  if (field === 'effectIntensity') card?.style.setProperty('--effect-opacity', value)
  if (field === 'effectAngle') card?.style.setProperty('--effect-angle', `${value}deg`)
  if (field === 'effectSpread') card?.style.setProperty('--effect-spread', `${Math.round(value * 100)}%`)
  if (field === 'effectGrain') card?.style.setProperty('--effect-grain', value)
  if (field === 'drawingColor') {
    const context = document.querySelector('#drawing-pad')?.getContext('2d')
    if (context) context.strokeStyle = value
  }
  if (field === 'drawingSize') {
    const context = document.querySelector('#drawing-pad')?.getContext('2d')
    if (context) context.lineWidth = Number(value)
  }
  liveOutput(input, field, value)
}

app.addEventListener('submit', (event) => {
  event.preventDefault()
  if (event.target.id === 'login-form') loginArtist(event.target)
  if (event.target.id === 'change-password-form') changePassword(event.target)
  if (event.target.id === 'profile-form') saveProfile(event.target)
  if (event.target.id === 'card-details-form') saveDraft({ nextStage: 'preview' })
  if (event.target.matches('[data-collaboration-comment-form]')) createCollaborationComment(event.target)
})

app.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-nav]')
  if (nav) {
    navigate(nav.dataset.nav)
    return
  }
  const recipe = event.target.closest('[data-recipe]')
  if (recipe) {
    setRecipe(recipe.dataset.recipe)
    return
  }
  const tool = event.target.closest('[data-tool]')
  if (tool) {
    state.editor.tool = tool.dataset.tool
    if (tool.dataset.tool === 'back') state.editor.side = 'back'
    state.editor.inspectorOpen = true
    render()
    return
  }
  const side = event.target.closest('[data-side]')
  if (side) {
    state.editor.side = side.dataset.side
    if (state.editor.side === 'back') state.editor.tool = 'back'
    if (state.editor.side === 'front' && state.editor.tool === 'back') state.editor.tool = 'photo'
    render()
    return
  }
  const layerElement = event.target.closest('[data-layer-id]')
  if (layerElement) {
    const layer = (state.editor.layers || []).find(
      (item) => item.id === layerElement.dataset.layerId,
    )
    if (layer) {
      state.editor.selectedLayerId = layer.id
      state.editor.side = layer.side
      state.editor.tool = layer.type
      state.editor.inspectorOpen = true
      render()
    }
    return
  }
  const stage = event.target.closest('[data-editor-stage]')
  if (stage) {
    const target = stage.dataset.editorStage
    if (target === 'preview' && !state.cardId) {
      const saved = await saveDraft({ quiet: true })
      if (!saved) {
        notify('먼저 카드 정보와 이미지를 저장해 주세요.', 'error')
        return
      }
    }
    state.stage = target
    render()
    return
  }
  const builtInSticker = event.target.closest('[data-built-in-sticker]')
  if (builtInSticker) {
    const sticker = builtInStickers.find((item) => item.id === builtInSticker.dataset.builtInSticker)
    if (sticker) {
      upsertCreativeLayer('sticker', {
        builtinId: sticker.id,
        src: sticker.source,
        file: null,
        assetId: null,
        side: state.editor.side,
        width: 28,
      })
      state.editor.inspectorOpen = true
      markDirty()
      render()
    }
    return
  }
  const material = event.target.closest('[data-effect-material]')
  if (material) {
    state.editor.material = material.dataset.effectMaterial
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const foilPattern = event.target.closest('[data-foil-pattern]')
  if (foilPattern) {
    state.editor.foilPattern = foilPattern.dataset.foilPattern
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const foilCoverage = event.target.closest('[data-foil-coverage]')
  if (foilCoverage) {
    state.editor.foilCoverage = foilCoverage.dataset.foilCoverage
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const interaction = event.target.closest('[data-effect-interaction]')
  if (interaction) {
    state.editor.interaction = interaction.dataset.effectInteraction
    state.editor.effectMotion = state.editor.interaction !== 'static'
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const backMaterial = event.target.closest('[data-back-material]')
  if (backMaterial) {
    state.editor.backMaterial = backMaterial.dataset.backMaterial
    markDirty()
    render()
    return
  }
  const edgeFoil = event.target.closest('[data-edge-foil]')
  if (edgeFoil) {
    state.editor.backEdgeFoil = edgeFoil.dataset.edgeFoil
    markDirty()
    render()
    return
  }
  const spotUv = event.target.closest('[data-spot-uv]')
  if (spotUv) {
    state.editor.backSpotUv = spotUv.dataset.spotUv
    markDirty()
    render()
    return
  }
  const preset = event.target.closest('[data-preset]')
  if (preset) {
    state.editor.effectPreset = preset.dataset.preset
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const finish = event.target.closest('[data-finish]')
  if (finish) {
    state.editor.effectFinish = finish.dataset.finish
    state.editor.effect = 'holographic'
    markDirty()
    render()
    return
  }
  const card = event.target.closest('[data-card-id]')
  if (card && event.target.closest('[data-action="edit-card"]')) {
    openCard(card.dataset.cardId)
    return
  }
  const action = event.target.closest('[data-action]')?.dataset.action
  const comment = event.target.closest('[data-collaboration-comment]')
  if (comment) {
    resolveCollaborationComment(comment.dataset.collaborationComment)
    return
  }
  if (!action) return
  if (action === 'toggle-sidebar') {
    state.sidebarCollapsed = !state.sidebarCollapsed
    localStorage.setItem(SIDEBAR_KEY, String(state.sidebarCollapsed))
    render()
  }
  if (action === 'logout') logoutArtist()
  if (action === 'help') notify('사진 → 특별 기능 → 카드 정보 → 팬 미리보기 → 검수 순서로 진행해 주세요.')
  if (action === 'exit-editor') navigate('cards')
  if (action === 'save-draft') saveDraft()
  if (action === 'go-details') {
    state.stage = 'details'
    render()
  }
  if (action === 'open-fan-preview') {
    state.stage = 'preview'
    render()
  }
  if (action === 'enable-device-motion') {
    await enableDeviceMotion()
    return
  }
  if (action === 'open-inspector') {
    state.editor.inspectorOpen = true
    render()
  }
  if (action === 'close-inspector') {
    state.editor.inspectorOpen = false
    render()
  }
  if (action === 'remove-photo') {
    if (state.editor.imageSrc?.startsWith('blob:')) URL.revokeObjectURL(state.editor.imageSrc)
    state.editor.imageSrc = ''
    state.editor.imageName = ''
    state.editor.imageFile = null
    state.editor.imageAssetId = null
    state.form.imageAssetId = null
    markDirty()
    render()
  }
  if (action === 'go-review') {
    state.stage = 'review'
    render()
  }
  if (action === 'submit-review') submitReview()
  if (action === 'toggle-voice') {
    state.editor.voiceEnabled = !state.editor.voiceEnabled
    state.form.hasVoice = state.editor.voiceEnabled
    markDirty()
    render()
  }
  if (action === 'toggle-motion') {
    state.editor.videoEnabled = !state.editor.videoEnabled
    markDirty()
    render()
  }
  if (action === 'toggle-handwriting') {
    state.editor.handwritingEnabled = !state.editor.handwritingEnabled
    markDirty()
    render()
  }
  if (action === 'toggle-hologram') {
    state.editor.effect = state.editor.effect === 'none' ? 'holographic' : 'none'
    markDirty()
    render()
  }
  if (action === 'start-recording') startRecording()
  if (action === 'stop-recording') stopRecording()
  if (action === 'remove-video') {
    state.editor.videoSrc = ''
    state.editor.videoFile = null
    state.editor.videoAssetId = null
    state.form.videoAssetId = null
    markDirty()
    render()
  }
  if (action === 'remove-lenticular') {
    if (state.editor.lenticularSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(state.editor.lenticularSrc)
    }
    state.editor.lenticularSrc = ''
    state.editor.lenticularFile = null
    state.editor.lenticularAssetId = null
    markDirty()
    render()
  }
  if (action === 'set-lenticular-scene') {
    const reveal = event.target.closest('[data-action]')?.dataset.reveal === '100' ? '100%' : '0%'
    event.target.closest('[data-hologram-card]')?.style.setProperty('--lenticular-reveal', reveal)
  }
  if (action === 'clear-handwriting') {
    state.editor.handwritingSrc = ''
    state.editor.handwritingFile = null
    state.editor.handwritingAssetId = null
    state.form.handwritingAssetId = null
    state.editor.layers = (state.editor.layers || []).filter((layer) => layer.type !== 'handwriting')
    state.editor.selectedLayerId = null
    markDirty()
    render()
  }
  if (action === 'clear-drawing') {
    const canvas = document.querySelector('#drawing-pad')
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    state.editor.drawingDraftSrc = ''
    markDirty()
  }
  if (action === 'add-drawing-layer') {
    const canvas = document.querySelector('#drawing-pad')
    if (canvas) {
      const src = state.editor.drawingDraftSrc || canvas.toDataURL('image/png')
      upsertCreativeLayer('drawing', {
        src,
        file: null,
        assetId: null,
        side: state.editor.side,
        color: state.editor.drawingColor,
        width: 48,
      })
      markDirty()
      render()
    }
  }
  if (action === 'delete-layer') {
    deleteSelectedLayer()
  }
  if (action === 'duplicate-layer') {
    const selected = selectedCreativeLayer()
    if (selected) {
      upsertCreativeLayer(selected.type, {
        ...selected,
        id: `${selected.type}-${Date.now()}`,
        x: Math.min(100, Number(selected.x) + 6),
        y: Math.min(100, Number(selected.y) + 6),
      })
      markDirty()
      render()
    }
  }
  if (action === 'bring-layer-front') {
    const selected = selectedCreativeLayer()
    if (selected) {
      selected.zIndex = Math.max(0, ...(state.editor.layers || []).map((layer) => Number(layer.zIndex || 0))) + 1
      markDirty()
      render()
    }
  }
  if (action === 'remove-background') requestBackgroundRemoval()
})

app.addEventListener('change', async (event) => {
  const upload = event.target.closest('[data-upload]')
  if (upload) {
    try {
      await handleUpload(upload.dataset.upload, upload.files?.[0])
    } catch (error) {
      notify(error.message || '파일을 불러오지 못했습니다.', 'error')
    }
    return
  }
  const editorField = event.target.dataset.editor
  if (editorField) {
    state.editor[editorField] = event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.type === 'range'
        ? Number(event.target.value)
        : event.target.value
    markDirty()
    if (event.target.type === 'range' || event.target.type === 'color') {
      applyEditorLivePreview(editorField, event.target)
      return
    }
    render()
    return
  }
  const layerField = event.target.dataset.layerField
  if (layerField) {
    const layer = selectedCreativeLayer()
    if (!layer) return
    layer[layerField] = ['x', 'y', 'width', 'rotation', 'opacity', 'zIndex'].includes(layerField)
      ? Number(event.target.value)
      : event.target.value
    if (layerField === 'side') state.editor.side = layer.side
    markDirty()
    if (layerField === 'side') render()
    else applyLayerLivePreview(layer, event.target)
  }
})

app.addEventListener('input', (event) => {
  const formField = event.target.dataset.form
  if (formField) {
    state.form[formField] = event.target.type === 'number' ? Number(event.target.value) : event.target.value
    if (formField === 'artistId') {
      state.form.memberId = state.catalog.members.find(
        (member) => member.artistId === state.form.artistId,
      )?.id || null
      render()
    }
    markDirty()
  }
  const editorField = event.target.dataset.editor
  if (editorField === 'backHiddenMessage') {
    state.editor.backHiddenMessage = Array.from(event.target.value).slice(0, 40).join('')
    if (state.editor.backHiddenMessage !== event.target.value) event.target.value = state.editor.backHiddenMessage
    event.target
      .closest('.compact-field')
      ?.querySelector('[data-hidden-message-count]')?.replaceChildren(
        String(Array.from(state.editor.backHiddenMessage).length),
      )
    applyEditorLivePreview(editorField, event.target)
    markDirty()
    return
  }
  if (editorField && (event.target.type === 'range' || event.target.type === 'color')) {
    state.editor[editorField] = event.target.type === 'range'
      ? Number(event.target.value)
      : event.target.value
    markDirty()
    applyEditorLivePreview(editorField, event.target)
  }
  const layerField = event.target.dataset.layerField
  if (layerField) {
    const layer = selectedCreativeLayer()
    if (layer) {
      layer[layerField] = ['x', 'y', 'width', 'rotation', 'opacity', 'zIndex'].includes(layerField)
        ? Number(event.target.value)
        : event.target.value
      markDirty()
      if (event.target.type === 'color' || event.target.type === 'range') {
        applyLayerLivePreview(layer, event.target)
      }
    }
  }
  const transformField = event.target.dataset.transform
  if (transformField) {
    state.editor.handwritingTransform[transformField] = Number(event.target.value)
    markDirty()
    render()
  }
  if (event.target.matches('[data-review-note]')) {
    state.reviewNote = event.target.value
  }
})

window.addEventListener('keydown', (event) => {
  if (!['Backspace', 'Delete'].includes(event.key) || !state.editor.selectedLayerId) return
  if (event.target.matches?.('input, textarea, select, [contenteditable="true"]')) return
  event.preventDefault()
  deleteSelectedLayer()
})

let responsiveRenderTimer = null
window.addEventListener('resize', () => {
  window.clearTimeout(responsiveRenderTimer)
  responsiveRenderTimer = window.setTimeout(() => {
    const nextMode = responsiveStudioMode(window.innerWidth)
    if (nextMode === state.viewportMode) return
    state.viewportMode = nextMode
    if (savedSidebarPreference === null) state.sidebarCollapsed = nextMode === 'tablet'
    render()
  }, 120)
})

async function bootstrap() {
  render()
  let restoredSession = false
  try {
    await refreshAccessToken()
    restoredSession = true
    await loadStudioData()
  } catch {
    ACCESS_TOKEN = ''
    state.authenticated = false
    if (restoredSession) {
      state.loginError = '스튜디오 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
    }
  } finally {
    state.loading = false
    render()
  }
}

bootstrap()
