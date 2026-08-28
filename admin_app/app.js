const isLocalHost = ["localhost", "127.0.0.1"].includes(
  window.location.hostname,
);
const localApiQuery =
  isLocalHost && typeof URLSearchParams !== "undefined"
    ? new URLSearchParams(window.location.search).get("api")
    : "";
const storedLocalApiBase = isLocalHost
  ? window.localStorage.getItem("fanfolio_api_base") || ""
  : "";
const compatibleStoredApiBase = storedLocalApiBase && !(
  (window.location.hostname === "127.0.0.1" && storedLocalApiBase.includes("localhost")) ||
  (window.location.hostname === "localhost" && storedLocalApiBase.includes("127.0.0.1"))
)
  ? storedLocalApiBase
  : "";
const API_BASE = isLocalHost
  ? localApiQuery ||
    compatibleStoredApiBase ||
    `http://${window.location.hostname}:8000/api`
  : "/api";
let ACCESS_TOKEN = "";
let refreshInFlight = null;
let storedNavSectionsCollapsed = {};
try {
  const rawNavSections = window.localStorage.getItem("fanfolio.admin.navSectionsCollapsed.v2");
  if (rawNavSections) storedNavSectionsCollapsed = JSON.parse(rawNavSections) || {};
} catch {
  storedNavSectionsCollapsed = {};
}
const defaultNavSectionsCollapsed = {
  content: true,
  commerce: true,
  fan: true,
  control: true,
  system: true,
};
const app = document.querySelector("#app");
const initialUrlParams = typeof URLSearchParams !== "undefined"
  ? new URLSearchParams(window.location.search || "")
  : { get: () => null };
const initialDrawer = initialUrlParams.get("drawer") === "event" ? "event" : null;
const isEventDeepLink = () => new URLSearchParams(window.location.search || "").get("drawer") === "event";
function clearEventDeepLink() {
  if (!isEventDeepLink()) return;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("drawer");
  window.history.replaceState({}, "", nextUrl);
}
const state = {
  view: initialDrawer === "event" || initialUrlParams.get("view") === "events" ? "events" : "dashboard",
  authenticated: false,
  restoringSession: true,
  mustChangePassword: false,
  adminContext: null,
  mobileNavOpen: false,
  navCollapsed:
    window.localStorage.getItem("fanfolio.admin.navCollapsed") === "true",
  navSectionsCollapsed: {
    ...defaultNavSectionsCollapsed,
    ...storedNavSectionsCollapsed,
  },
  accountMenuOpen: false,
  drawer: initialDrawer,
  eventEditorOpen: initialDrawer === "event",
  notificationPanelOpen: false,
  metrics: null,
  operationalMetrics: null,
  operationsOverview: null,
  approvals: [],
  selectedApprovalId: "",
  statistics: null,
  statisticsPeriod: "30",
  statisticsCompare: true,
  statisticsOrganization: "all",
  statisticsArtist: "all",
  statisticsPack: "all",
  recentActivity: [],
  notifications: [],
  unreadNotificationCount: 0,
  supportTickets: [],
  supportPagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  supportQuery: "",
  supportStatus: "all",
  supportCategory: "all",
  selectedSupportTicket: null,
  supportActivityDetailIndex: null,
  supportActivityDetailTicketId: "",
  fan360: null,
  deliveryItems: [],
  deliveryPagination: { page: 1, pageSize: 50, total: 0 },
  deliveryStatus: "failed",
  deliveryChannel: "all",
  cards: [],
  cardCatalog: [],
  contentCalendar: [],
  contentCalendarLoading: false,
  contentCalendarMessage: "",
  contentCalendarDraftType: "card",
  cardPacks: [],
  shopProducts: [],
  pointChargePackages: [],
  pointCharges: [],
  shopProductDraft: null,
  shopProductBlocks: [
    { key: "intro", type: "text", title: "상품 소개", body: "DREAMSCAPE의 새로운 비주얼과 이야기를 담은 카드팩입니다.", imageUrl: "", alt: "" },
    { key: "contents", type: "text", title: "구성품 안내", body: "포토카드 5장(랜덤)과 스페셜 포토카드 1장이 포함됩니다.", imageUrl: "", alt: "" },
    { key: "notice", type: "text", title: "구매 안내", body: "구매 후 바로 보관함에서 확인할 수 있습니다.", imageUrl: "", alt: "" },
  ],
  shopProductPreviewMode: "desktop",
  cardPackQuery: "",
  cardPackStatus: "all",
  cardPackArtist: "all",
  cardPackPage: 1,
  cardPackPagination: { page: 1, pageSize: 10, total: 0 },
  selectedCardPack: null,
  selectedCompositionCardId: null,
  cardActionMenuId: null,
  cardThumbnailUrls: {},
  drops: [],
  batches: [],
  issuanceQuery: "",
  issuanceStatus: "all",
  issuanceType: "all",
  issuancePeriod: "all",
  issuancePage: 1,
  selectedBatchId: null,
  events: [],
  eventPagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  eventQuery: "",
  eventStatus: "all",
  eventType: "all",
  eventArtist: "all",
  eventPage: 1,
  selectedEvent: null,
  eventApplicants: [],
  eventApplicantsLoading: false,
  eventApplicantsEventId: "",
  eventApplicantsModalOpen: false,
  eventComments: [],
  eventCommentsLoading: false,
  eventCommentsEventId: "",
  eventCommentsModalOpen: false,
  users: [],
  artistAccounts: [],
  artistProfiles: [],
  artistProfilesLoaded: false,
  auditLogs: [],
  campaigns: [],
  catalog: { artists: [], members: [] },
  engagement: { achievements: [], rewards: [], passSeasons: [], missions: [], levelPolicies: [], failedEvents: [] },
  fanPassQuery: "",
  fanPassStatus: "all",
  fanPassArtist: "all",
  fanPassPage: 1,
  query: "",
  cardArtist: "all",
  status: "all",
  cardPage: 1,
  cardPagination: { page: 1, pageSize: 10, total: 0 },
  userQuery: "",
  userRole: "all",
  userPage: 1,
  userPagination: { page: 1, pageSize: 20, total: 0 },
  auditQuery: "",
  auditAction: "all",
  auditPage: 1,
  auditPagination: { page: 1, pageSize: 50, total: 0 },
  error: "",
  loginError: "",
  loginEmail: "",
  loginPassword: "",
  currentPassword: "",
  newPassword: "",
  batch: null,
  codeBatch: null,
  codeQr: null,
  reviewCard: null,
  cardCollaborationComments: [],
  cardCollaborationCommentsLoading: false,
  cardCollaborationCommentsError: "",
  reviewImageSrc: "",
  reviewImageError: false,
  reviewBackImageSrc: "",
  reviewBackImageError: false,
  reviewSide: "front",
  reviewEffectsEnabled: true,
  artistProvisionedAccount: null,
  adminProvisionedAccount: null,
  organizations: [],
  organizationPagination: { page: 1, pageSize: 100, total: 0 },
  partnerQuery: "",
  partnerStatus: "all",
  selectedOrganizationId: "",
  selectedOrganization: null,
  organizationMembers: [],
  partnerTab: "overview",
  drawerData: null,
  temporaryCredential: null,
  organizationLogoFile: null,
  organizationLogoPreviewUrl: "",
  organizationLogoRemoved: false,
  rewardImageFile: null,
  rewardImagePreviewUrl: "",
  operationFeedback: null,
  globalSearchOpen: false,
  globalSearchQuery: "",
};
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );

const icon = (name, extraClass = "") =>
  `<span class="material-symbols-rounded ${extraClass}" aria-hidden="true">${name}</span>`;
const isRoot = () => state.adminContext?.accessLevel === "root";
const can = (action) => state.adminContext?.allowedActions?.includes(action);
const canManageFanGrowth = () =>
  can("engagement:write") || can("engagement:manage_global");
const canApproveFanGrowth = () =>
  can("engagement:approve") || can("engagement:approve_global");
const canViewFanGrowth = () => canManageFanGrowth() || canApproveFanGrowth();
const fanGrowthEmptyState = { achievements: [], rewards: [], passSeasons: [], missions: [], levelPolicies: [], failedEvents: [] };
const conditionFields = {
  first_card: ["artistId"],
  card_count: ["artistId", "targetValue"],
  member_count: ["artistId", "memberId", "targetValue"],
  specific_card: ["cardId"],
  set_complete: ["campaignId"],
  drop_participation: ["dropId"],
};
const conditionLabels = {
  first_card: "첫 카드 수집",
  card_count: "카드 수집 수",
  member_count: "멤버별 수집 수",
  specific_card: "특정 카드 수집",
  set_complete: "세트 완성",
  drop_participation: "드롭 참여",
};
const maxFanPassTiers = 30;
const fanPassPresets = [
  { id: "season-15", label: "15LV 시즌 세트", description: "앨범 활동 한 시즌에 맞춘 15단계 구성", tiers: Array.from({ length: 15 }, (_, index) => ({ tier: index + 1, requiredXp: index * 100 })) },
  { id: "season-30", label: "30LV 시즌 세트", description: "장기 활동 시즌에 맞춘 30단계 구성", tiers: Array.from({ length: 30 }, (_, index) => ({ tier: index + 1, requiredXp: index * 100 })) },
];

const fanfolioDateTimeLocale = {
  firstDayOfWeek: 1,
  weekdays: {
    shorthand: ["일", "월", "화", "수", "목", "금", "토"],
    longhand: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
  },
  months: {
    shorthand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
    longhand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  },
  rangeSeparator: " ~ ",
  weekAbbreviation: "주",
  scrollTitle: "스크롤하여 변경",
  toggleTitle: "클릭하여 전환",
  amPM: ["오전", "오후"],
  yearAriaLabel: "년",
  monthAriaLabel: "월",
  hourAriaLabel: "시",
  minuteAriaLabel: "분",
};

function enhanceDateTimePickers(root = document) {
  if (typeof window.flatpickr !== "function") return;
  root.querySelectorAll('input[type="datetime-local"]:not([data-native-datetime]), input[data-calendar="datetime"]:not([data-native-datetime])').forEach((input) => {
    if (input._flatpickr) return;
    window.flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      dateFormat: "Y-m-d H:i",
      // Keep the named datetime-local input as the visible control. With
      // altInput, FormData reads the hidden original field and operators can
      // accidentally submit an empty date after typing into the alternate UI.
      altInput: false,
      altFormat: "Y년 m월 d일 H:i",
      allowInput: true,
      minuteIncrement: 5,
      disableMobile: true,
      locale: fanfolioDateTimeLocale,
      onReady: (_, __, instance) => instance.calendarContainer.classList.add("fanfolio-calendar"),
    });
  });
}

function resolvePartnerLogoUrl(logoUrl) {
  if (!logoUrl) return "";
  if (isLocalHost && logoUrl.startsWith("/api/")) {
    return `${API_BASE}${logoUrl.replace(/^\/api/, "")}`;
  }
  return logoUrl;
}

function resolveAdminAssetUrl(assetUrl) {
  if (!assetUrl) return "";
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl;
  return `${API_BASE}${String(assetUrl).replace(/^\/api/, "")}`;
}

function partnerLogoMarkup(organization, size = "default") {
  const name = String(organization?.name || "파트너");
  const fallback = escapeHtml(name.trim().slice(0, 1) || "파");
  const logoUrl = resolvePartnerLogoUrl(organization?.logoUrl);
  const sizeClass = size === "large" ? " large" : "";
  return `<span class="company-avatar${sizeClass}">${
    logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)} 로고" data-partner-logo-image /><span class="company-avatar-fallback" hidden>${fallback}</span>`
      : `<span class="company-avatar-fallback">${fallback}</span>`
  }</span>`;
}

function bindPartnerLogoFallbacks(root = document) {
  root.querySelectorAll("[data-partner-logo-image]").forEach((image) => {
    if (image.dataset.logoFallbackBound === "true") return;
    image.dataset.logoFallbackBound = "true";
    image.addEventListener("error", () => {
      image.hidden = true;
      if (image.nextElementSibling) image.nextElementSibling.hidden = false;
    });
  });
}

function organizationLogoPickerContents(editing) {
  const previewLogoUrl = state.organizationLogoRemoved
    ? ""
    : state.organizationLogoPreviewUrl || editing?.logoUrl || "";
  const hasLogo = Boolean(previewLogoUrl);
  const selectedFileName = state.organizationLogoFile?.name || "";
  const previewMarkup = hasLogo
    ? partnerLogoMarkup(
        { name: editing?.name || "파트너", logoUrl: previewLogoUrl },
        "large",
      )
    : `<span class="company-avatar large organization-logo-empty">${icon("add_photo_alternate")}</span>`;
  return `<div class="organization-logo-preview" id="organization-logo-preview">${previewMarkup}</div><div class="organization-logo-copy"><strong>회사 로고 <span class="optional-label">선택</span></strong><p>PNG, JPG, WebP · 최대 2MB · 원본 비율 유지</p>${selectedFileName ? `<p class="organization-logo-file-name" title="${escapeHtml(selectedFileName)}">${escapeHtml(selectedFileName)}</p>` : ""}<div class="inline-actions"><label class="secondary upload-button" for="organization-logo-input">${hasLogo ? "로고 교체" : "로고 선택"}</label><input id="organization-logo-input" name="logo" type="file" accept="image/png,image/jpeg,image/webp" hidden />${hasLogo ? `<button class="text-button danger-text" id="remove-organization-logo" type="button">로고 제거</button>` : ""}</div></div>`;
}

function bindOrganizationLogoPicker(form) {
  if (!form) return;
  form
    ?.querySelector("#organization-logo-input")
    ?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const errorBox = form.querySelector("#organization-form-error");
      try {
        setOrganizationLogoFile(file, form);
      } catch (error) {
        event.currentTarget.value = "";
        if (errorBox) {
          errorBox.textContent = String(error?.message || error);
          errorBox.hidden = false;
        }
      }
    });
  form
    ?.querySelector("#remove-organization-logo")
    ?.addEventListener("click", () => removeOrganizationLogo(form));
  bindPartnerLogoFallbacks(form);
}

function renderOrganizationLogoPicker(form) {
  const picker = form?.querySelector(".organization-logo-picker");
  if (!picker) return;
  picker.innerHTML = organizationLogoPickerContents(state.drawerData?.organization);
  bindOrganizationLogoPicker(form);
}

function resetOrganizationLogoState() {
  if (state.organizationLogoPreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.organizationLogoPreviewUrl);
  }
  state.organizationLogoFile = null;
  state.organizationLogoPreviewUrl = "";
  state.organizationLogoRemoved = false;
}

function setOrganizationLogoFile(file, form) {
  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("PNG, JPG 또는 WebP 로고만 등록할 수 있습니다.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("회사 로고는 2MB 이하로 등록해 주세요.");
  }
  if (state.organizationLogoPreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.organizationLogoPreviewUrl);
  }
  state.organizationLogoFile = file;
  state.organizationLogoPreviewUrl = URL.createObjectURL(file);
  state.organizationLogoRemoved = false;
  renderOrganizationLogoPicker(form);
}

function removeOrganizationLogo(form) {
  if (state.organizationLogoPreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.organizationLogoPreviewUrl);
  }
  state.organizationLogoFile = null;
  state.organizationLogoPreviewUrl = "";
  state.organizationLogoRemoved = true;
  renderOrganizationLogoPicker(form);
}

function title() {
  return {
    dashboard: "운영 개요",
    partners: "파트너 관리",
    artists: "아티스트 관리",
    cards: "카드 관리",
    "card-packs": "카드팩 관리",
    "card-pack-create": "새 카드팩 만들기",
    "card-pack-composition": "카드 구성 편집",
    "shop-products": "상점 상품 관리",
    "shop-product-create": "상점 상품 등록",
    "point-charge-packages": "포인트 상품·충전 관제",
    batches: "발급·인증번호",
    "issuance-create": "새 발급 배치 만들기",
    events: "이벤트",
    "fan-growth": "팬 성장",
    users: "서비스 사용자",
    audit: "감사 로그",
    guide: "운영 가이드",
    statistics: "통계",
    support: "고객센터",
    deliveries: "전달 실패 큐",
    approvals: "승인 큐",
    settings: "계정 설정",
  }[state.view];
}

function navItems() {
  const companyWorkspace = !isRoot() && state.adminContext?.accessLevel === "company_admin";
  return [
    { id: "dashboard", label: "개요", icon: "space_dashboard", group: "overview" },
    ...(isRoot()
      ? [{ id: "partners", label: "파트너", icon: "domain", group: "system" }]
      : []),
    ...(companyWorkspace
      ? [{ id: "partners", label: "우리 회사", icon: "domain", group: "system" }]
      : []),
    { id: "artists", label: "아티스트", icon: "recent_actors", group: "content" },
    { id: "cards", label: "카드", icon: "style", group: "content" },
    ...(can("cards:read") ? [{ id: "shop-products", label: "상점 상품", icon: "storefront", group: "commerce" }] : []),
    ...(isRoot() && can("engagement:points_adjust") ? [{ id: "point-charge-packages", label: "포인트 충전", icon: "payments", group: "commerce" }] : []),
    ...(can("events:read")
      ? [{ id: "events", label: "이벤트", icon: "campaign", group: "fan" }]
      : []),
    ...(can("statistics:read")
      ? [{ id: "statistics", label: "통계", icon: "monitoring", group: "control" }]
      : []),
    ...(canViewFanGrowth()
      ? [{ id: "fan-growth", label: "팬 성장", icon: "workspace_premium", group: "fan" }]
      : []),
    ...(can("support:read")
      ? [{ id: "support", label: "고객센터", icon: "support_agent", group: "fan" }]
      : []),
    ...(can("engagement:retry")
      ? [{ id: "deliveries", label: "전달 실패 큐", icon: "sync_problem", group: "control" }]
      : []),
    ...(can("audit:read")
      ? [{ id: "approvals", label: "승인 큐", icon: "fact_check", group: "control" }]
      : []),
    ...(isRoot()
      ? [{ id: "users", label: "서비스 사용자", icon: "group", group: "system" }]
      : []),
    { id: "audit", label: "감사 로그", icon: "history", group: "control" },
    { id: "guide", label: "운영 가이드", icon: "help", group: "system" },
  ];
}

function scopeLabel() {
  if (isRoot()) return "ROOT";
  return state.adminContext?.organization?.name || "파트너";
}

function scopeContextChip() {
  const root = isRoot();
  const label = root ? "ROOT 운영 영역" : "기업 운영 영역";
  const detail = root
    ? "전체 파트너와 서비스 운영을 관리합니다."
    : `${scopeLabel()} 범위에서만 운영할 수 있습니다.`;
  return `<span class="scope-chip ${root ? "root-scope" : "company-scope"}" title="${escapeHtml(detail)}">${icon(root ? "shield_person" : "domain")}<span>${label}</span></span>`;
}

function adminBrandMark() {
  return '<img src="./assets/fanfolio-app-icon-192.png" alt="Fanfolio 서비스 아이콘" />';
}

function sessionLoadingView() {
  return `<main class="admin-login"><div class="admin-login-card" role="status" aria-live="polite"><div class="brand-lockup">${adminBrandMark()}<span>FANFOLIO</span></div><div class="session-loader" aria-hidden="true"></div><h1>관리자 세션 확인 중</h1><p class="hint">안전한 운영 환경을 준비하고 있습니다.</p></div></main>`;
}
function loginView() {
  const passwordChange = state.mustChangePassword;
  return `<main class="admin-login"><div class="admin-login-card"><div class="brand-lockup">${adminBrandMark()}<span>FANFOLIO</span></div><p class="eyebrow">OPERATIONS CONSOLE</p><h1>${passwordChange ? "새 비밀번호 설정" : "관리자 로그인"}</h1><p class="login-copy">${passwordChange ? "최초 발급 비밀번호를 본인만의 비밀번호로 변경해 주세요." : "발급받은 관리자 계정으로 운영 범위에 접속합니다."}</p><form id="admin-login-form" class="form login-form">${passwordChange ? `<label class="field"><span>현재 비밀번호</span><div class="input-with-icon">${icon("lock")}<input id="admin-current-password" type="password" autocomplete="current-password" required /></div></label><label class="field"><span>새 비밀번호</span><div class="input-with-icon">${icon("password")}<input id="admin-new-password" type="password" autocomplete="new-password" minlength="12" placeholder="12자 이상" required /></div></label><button class="primary" type="submit">새 비밀번호 저장</button>` : `<label class="field"><span>관리자 이메일</span><div class="input-with-icon">${icon("mail")}<input id="admin-login-email" type="email" autocomplete="email" placeholder="name@company.com" required /></div></label><label class="field"><span>비밀번호</span><div class="input-with-icon">${icon("lock")}<input id="admin-login-password" type="password" autocomplete="current-password" placeholder="비밀번호 입력" required /></div></label><button class="primary" type="submit">운영 센터 들어가기</button>`}</form>${state.loginError ? `<div class="notice error" role="alert">${escapeHtml(state.loginError)}</div>` : ""}<p class="login-support">계정 발급 또는 접근 문제가 있다면 루트 관리자에게 문의하세요.</p></div></main>`;
}

function navigationView() {
  const person = state.adminContext?.user || {};
  const role = isRoot() ? "루트 관리자" : `${state.adminContext?.accessLevel || "viewer"} · ${scopeLabel()}`;
  const navToggleLabel = state.navCollapsed ? "내비게이션 펼치기" : "내비게이션 접기";
  const groupLabels = { overview: "운영 개요", content: "콘텐츠 운영", commerce: "커머스 운영", fan: "팬 운영", control: "검수·관제", system: "시스템 관리" };
  const cardSection = `<div class="nav-section-group"><button type="button" data-view="cards" class="nav-item ${["cards", "card-packs", "card-pack-create", "card-pack-composition", "batches", "issuance-create"].includes(state.view) ? "active" : ""}" aria-label="카드" title="카드">${icon("style")}<span>카드</span>${icon("expand_more", "nav-section-chevron")}</button><div class="nav-subitems"><button type="button" data-view="cards" class="nav-subitem ${state.view === "cards" ? "active" : ""}">카드 관리</button>${can("cards:read") ? `<button type="button" data-view="card-packs" class="nav-subitem ${["card-packs", "card-pack-create", "card-pack-composition"].includes(state.view) ? "active" : ""}">카드팩 관리</button>` : ""}${can("codes:read") ? `<button type="button" data-view="batches" class="nav-subitem ${["batches", "issuance-create"].includes(state.view) ? "active" : ""}">발급·인증번호</button>` : ""}</div></div>`;
  const itemButton = (item) => `<button type="button" data-view="${item.id}" class="nav-item ${state.view === item.id || (item.id === "shop-products" && state.view === "shop-product-create") ? "active" : ""}" aria-current="${state.view === item.id ? "page" : "false"}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span>${item.label}</span>${navigationBadge(item.id)}</button>`;
  const groupedItems = Object.keys(groupLabels).map((group) => {
    const items = navItems().filter((item) => item.group === group);
    if (!items.length) return "";
    const currentGroup = items.some((item) => item.id === state.view || (item.id === "shop-products" && state.view === "shop-product-create")) || (group === "content" && ["cards", "card-packs", "card-pack-create", "card-pack-composition", "batches", "issuance-create"].includes(state.view));
    const collapsed = Boolean(state.navSectionsCollapsed[group]);
    return `<div class="nav-section ${collapsed ? "collapsed" : ""}" data-nav-section="${group}"><button class="nav-section-toggle" type="button" data-nav-section-toggle="${group}" aria-expanded="${!collapsed}" aria-controls="nav-section-content-${group}"><span>${groupLabels[group]}</span>${icon("expand_more")}</button><div class="nav-section-content" id="nav-section-content-${group}">${items.map((item) => item.id === "cards" ? cardSection : itemButton(item)).join("")}</div></div>`;
  }).join("");
  return `<aside class="app-nav ${state.mobileNavOpen ? "open" : ""}" aria-label="관리자 주요 메뉴"><div class="nav-brand"><span class="nav-brand-mark"><img src="./assets/fanfolio-app-icon-192.png" alt="Fanfolio 서비스 아이콘" /></span><span class="nav-brand-copy"><strong>FANFOLIO</strong><small>OPERATIONS</small></span><button class="icon-button nav-toggle" id="desktop-nav-toggle" type="button" aria-label="${navToggleLabel}" title="${navToggleLabel}">${icon(state.navCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left")}</button></div><nav>${groupedItems}</nav><div class="nav-account"><span class="account-avatar">${escapeHtml((person.displayName || person.email || "관").slice(0, 1))}</span><div class="nav-account-copy"><strong>${escapeHtml(person.displayName || "관리자")}</strong><small>${escapeHtml(role)}</small></div><button class="icon-button" id="logout" type="button" aria-label="로그아웃" title="로그아웃">${icon("logout")}</button></div></aside>`;
}

function navigationBadge(id) {
  const count = id === "approvals"
    ? state.approvals.filter((item) => item.status === "pending").length
    : id === "deliveries"
      ? state.deliveryItems.filter((item) => item.status === "failed").length
      : id === "support"
        ? state.supportTickets.filter((item) => !["answered", "closed"].includes(item.status)).length
        : 0;
  return count ? `<span class="nav-badge" data-nav-badge="${id}">${count > 99 ? "99+" : count}</span>` : "";
}

function topbarView() {
  const person = state.adminContext?.user || {};
  const personName = person.displayName || "관리자";
  const personInitial = escapeHtml((person.displayName || person.email || "관").slice(0, 1));
  const unreadBadge = state.unreadNotificationCount
    ? `<span class="notification-badge">${state.unreadNotificationCount}</span>`
    : "";
  return `<header class="topbar"><div class="topbar-title"><button class="icon-button mobile-nav-toggle" id="mobile-nav-toggle" type="button" aria-label="메뉴 열기">${icon("menu")}</button><div><p class="eyebrow">FANFOLIO OPERATIONS</p><h1 class="title">${title()}</h1></div></div><div class="top-actions"><button class="global-search-trigger" type="button" data-global-search-toggle aria-label="운영 데이터 검색">${icon("search")}<span>운영 데이터 검색</span><kbd>⌘K</kbd></button>${scopeContextChip()}<div class="notification-menu ${state.notificationPanelOpen ? "open" : ""}"><button class="icon-button notification-button" type="button" aria-label="알림" aria-expanded="${state.notificationPanelOpen}" data-open-notification="toggle">${icon("notifications")}${unreadBadge}</button>${notificationPanelView()}</div><div class="account-menu ${state.accountMenuOpen ? "open" : ""}"><button class="top-avatar" id="account-menu-toggle" type="button" aria-haspopup="menu" aria-expanded="${state.accountMenuOpen}" aria-label="${escapeHtml(personName)} 계정 메뉴" title="${escapeHtml(person.email || personName)}">${personInitial}</button><div class="account-popover" role="menu" aria-label="계정 메뉴"><button type="button" id="account-settings" role="menuitem">${icon("manage_accounts")}<span>계정 설정</span></button><button type="button" id="account-password-change" role="menuitem">${icon("password")}<span>비밀번호 변경</span></button><button type="button" id="account-logout" role="menuitem">${icon("logout")}<span>로그아웃</span></button></div></div></div></header>`;
}

function notificationPanelView() {
  const visibleNotifications = state.notifications.filter((item) => !item.isRead);
  const items = visibleNotifications.length
    ? visibleNotifications
        .slice(0, 8)
        .map(
          (item) =>
            (() => {
              const destination = notificationDestination(item);
              return `<button class="notification-item ${item.isRead ? "" : "unread"}" type="button" data-open-notification="${escapeHtml(item.id)}" data-notification-view="${escapeHtml(destination.view)}" data-card-id="${escapeHtml(destination.cardId || "")}" data-notification-ticket="${escapeHtml(destination.ticketId || "")}" data-notification-delivery="${escapeHtml(destination.deliveryId || "")}"><strong>${escapeHtml(item.title || notificationKindLabel(item.kind))}</strong><span>${escapeHtml(item.body || notificationKindLabel(item.kind))}</span><small>${formatDate(item.createdAt)}</small></button>`;
            })(),
        )
        .join("")
    : `<div class="notification-empty">${icon("notifications_off")}<span>새 알림이 없습니다.</span></div>`;
  return `<div class="notification-popover" role="menu" aria-label="알림 목록"><div class="notification-popover-heading"><strong>알림</strong><span>읽지 않음 ${state.unreadNotificationCount}개</span></div><div class="notification-list">${items}</div></div>`;
}

function notificationDestination(item) {
  const kind = String(item?.kind || "");
  const entityType = String(item?.entityType || "");
  if (entityType === "card" || kind.startsWith("card_")) return { view: "cards", cardId: item.entityId };
  if (entityType === "support_ticket" || kind.startsWith("support_ticket")) return { view: "support", ticketId: item.entityId };
  if (entityType === "notification_delivery" || entityType === "delivery" || kind.startsWith("notification_delivery")) return { view: "deliveries", deliveryId: item.entityId };
  return { view: "audit" };
}

function notificationKindLabel(kind) {
  return (
    {
      card_partner_review_requested: "회사 검수 요청",
      card_platform_review_requested: "플랫폼 검수 요청",
      "notification_delivery.failed": "알림 전달 실패",
      "notification_delivery.retried": "알림 전달 재시도",
      "support_ticket.created": "고객센터 문의 접수",
      "support_ticket.status_changed": "고객센터 문의 상태 변경",
    }[kind] || "운영 알림"
  );
}

function currentView() {
  return {
    dashboard: dashboardView,
    partners: partnersView,
    artists: artistsView,
    cards: cardsView,
    "card-packs": cardPacksView,
    "card-pack-create": cardPackCreateView,
    "card-pack-composition": cardPackCompositionView,
    "shop-products": shopProductsView,
    "shop-product-create": shopProductCreateView,
    "point-charge-packages": pointChargePackagesView,
    batches: batchesView,
    "issuance-create": issuanceCreationView,
    events: eventsView,
    "fan-growth": fanGrowthView,
    users: usersView,
    audit: auditView,
    statistics: statisticsView,
    support: supportView,
    deliveries: deliveriesView,
    approvals: approvalsView,
    guide: guideView,
    settings: settingsView,
  }[state.view]?.() || dashboardView();
}

function globalSearchRecords() {
  const records = [];
  cardCatalogItems().forEach((item) => records.push({ type: "카드", label: item.name, detail: item.artistName || item.artist || item.id, view: "cards" }));
  state.cardPacks.forEach((item) => records.push({ type: "카드팩", label: item.name || item.title, detail: item.artistName || item.artist || item.id, view: "card-packs" }));
  state.events.forEach((item) => records.push({ type: "이벤트", label: item.title || item.name, detail: item.status || item.id, view: "events" }));
  state.users.forEach((item) => records.push({ type: "사용자", label: item.displayName || item.email, detail: item.email || item.id, view: "users" }));
  state.organizations.forEach((item) => records.push({ type: "파트너", label: item.name, detail: item.code || item.id, view: "partners" }));
  const query = state.globalSearchQuery.trim().toLowerCase();
  return query ? records.filter((item) => `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(query)).slice(0, 12) : [];
}

function globalSearchView() {
  if (!state.globalSearchOpen) return "";
  const records = globalSearchRecords();
  const body = records.length
    ? records.map((item) => `<button class="global-search-result" type="button" data-global-search-result="${escapeHtml(item.view)}"><span class="search-result-type">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.label || "이름 없음")}</strong><small>${escapeHtml(item.detail || "")}</small></span>${icon("arrow_forward")}</button>`).join("")
    : `<div class="global-search-empty">${icon("search_off")}<strong>${state.globalSearchQuery ? "검색 결과가 없습니다" : "카드, 카드팩, 이벤트, 사용자, 파트너를 검색하세요"}</strong><span>${state.globalSearchQuery ? "다른 이름이나 ID로 다시 검색해 보세요." : "운영자가 현재 불러온 데이터 범위에서 검색합니다."}</span></div>`;
  return `<div class="global-search-layer" role="dialog" aria-modal="true" aria-label="운영 데이터 검색"><button class="global-search-backdrop" type="button" data-global-search-toggle aria-label="검색 닫기"></button><div class="global-search-panel"><div class="global-search-heading"><div><p class="eyebrow">COMMAND CENTER</p><h2>운영 데이터 검색</h2></div><button class="icon-button" type="button" data-global-search-toggle aria-label="검색 닫기">${icon("close")}</button></div><label class="global-search-input">${icon("search")}<input data-global-search-input value="${escapeHtml(state.globalSearchQuery)}" placeholder="이름, ID, 상태 검색" autocomplete="off" /></label><div class="global-search-results">${body}</div><footer><span>Esc로 닫기</span><span>현재 로드된 운영 데이터 기준</span></footer></div></div>`;
}

function adminSelect({ id, value, label, options, className = "", name = "", required = false, dataFilter = "", dataSupportFilter = "", dataSupportTicket = "", dataStatisticsFilter = "", dataCalendarStatus = "", dataCalendarContentType = "", dataDeliveryFilter = "", dataPreviewFilter = "" }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return `<div class="admin-select ${className}" data-select-id="${escapeHtml(id)}"${dataFilter ? ` data-issuance-filter="${escapeHtml(dataFilter)}"` : ""}${dataSupportFilter ? ` data-support-filter="${escapeHtml(dataSupportFilter)}"` : ""}${dataSupportTicket ? ` data-support-ticket="${escapeHtml(dataSupportTicket)}"` : ""}${dataStatisticsFilter ? ` data-statistics-filter="${escapeHtml(dataStatisticsFilter)}"` : ""}${dataCalendarStatus ? ` data-calendar-status="${escapeHtml(dataCalendarStatus)}"` : ""}${dataCalendarContentType ? " data-calendar-content-type=\"true\"" : ""}${dataDeliveryFilter ? ` data-delivery-filter="${escapeHtml(dataDeliveryFilter)}"` : ""}${dataPreviewFilter ? ` data-preview-filter="${escapeHtml(dataPreviewFilter)}"` : ""} data-value="${escapeHtml(selected?.value || "")}">${name ? `<input class="admin-select-value" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected?.value || "")}"${required ? " required" : ""} />` : ""}<button class="admin-select-trigger" type="button" role="combobox" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${escapeHtml(id)}-menu">${icon("expand_more")}<span class="admin-select-label">${escapeHtml(selected?.label || "선택")}</span></button><div class="admin-select-menu" id="${escapeHtml(id)}-menu" role="listbox" aria-label="${escapeHtml(label)}">${options.map((option) => `<button class="admin-select-option ${option.value === selected?.value ? "selected" : ""}" type="button" role="option" aria-selected="${option.value === selected?.value}" data-value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}"${option.dataArtistId ? ` data-artist-id="${escapeHtml(option.dataArtistId)}"` : ""}>${escapeHtml(option.label)}${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</button>`).join("")}</div></div>`;
}

function adminMultiSelect({ id, name, values = [], label, options, className = "" }) {
  const selectedValues = new Set(values.filter(Boolean));
  const selectedLabels = options.filter((option) => selectedValues.has(option.value)).map((option) => option.label);
  const triggerLabel = selectedLabels.length ? `${selectedLabels.slice(0, 2).join(", ")}${selectedLabels.length > 2 ? ` 외 ${selectedLabels.length - 2}개` : ""}` : "선택하세요";
  return `<div class="admin-select admin-multi-select ${className}" data-select-id="${escapeHtml(id)}" data-select-name="${escapeHtml(name)}" data-multi-select="true" data-value="${escapeHtml([...selectedValues].join(","))}"><button class="admin-select-trigger" type="button" role="combobox" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${escapeHtml(id)}-menu"><span class="admin-select-label">${escapeHtml(triggerLabel)}</span><small class="admin-multi-select-count">${selectedValues.size ? `${selectedValues.size}개 선택` : "필수 선택"}</small>${icon("expand_more")}</button><div class="admin-select-menu" id="${escapeHtml(id)}-menu" role="listbox" aria-label="${escapeHtml(label)}" aria-multiselectable="true">${options.map((option) => { const selected = selectedValues.has(option.value); return `<button class="admin-select-option ${selected ? "selected" : ""}" type="button" role="option" aria-selected="${selected}" data-value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}"><span class="admin-multi-select-check" aria-hidden="true">${selected ? icon("check") : ""}</span>${escapeHtml(option.label)}${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</button>`; }).join("")}</div>${[...selectedValues].map((value) => `<input class="admin-multi-select-value" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`).join("")}</div>`;
}

const adminTablePageSize = 10;

function pagedItems(items, page, pageSize = adminTablePageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  return {
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    totalPages,
  };
}

function tablePagination(stateKey, page, total, pageSize = adminTablePageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = total ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(safePage * pageSize, total);
  if (totalPages === 1) return `<footer class="preview-table-footer"><strong>${start}-${end} / ${total}</strong></footer>`;
  const pageButtons = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map((number) => `<button class="page-number ${number === safePage ? "active" : ""}" type="button" data-pagination-state="${escapeHtml(stateKey)}" data-pagination-page="${number}" aria-label="${number}페이지" aria-current="${number === safePage ? "page" : "false"}">${number}</button>`)
    .join("");
  return `<footer class="preview-table-footer admin-table-pagination"><strong>${start}-${end} / ${total}</strong><nav class="pagination-control" aria-label="목록 페이지 이동"><button class="icon-button" type="button" data-pagination-state="${escapeHtml(stateKey)}" data-pagination-page="${safePage - 1}" aria-label="이전 페이지" ${safePage <= 1 ? "disabled" : ""}>‹</button>${pageButtons}<button class="icon-button" type="button" data-pagination-state="${escapeHtml(stateKey)}" data-pagination-page="${safePage + 1}" aria-label="다음 페이지" ${safePage >= totalPages ? "disabled" : ""}>›</button></nav></footer>`;
}

function previewTablePagination(stateKey, page, total, pageSize = 5) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = total ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(safePage * pageSize, total);
  if (totalPages === 1) return `<footer class="preview-table-footer"><strong>${start}-${end} / ${total}</strong></footer>`;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map((number) => `<button class="page-number ${number === safePage ? "active" : ""}" type="button" data-preview-issue-page="${number}" aria-label="${number}페이지" aria-current="${number === safePage ? "page" : "false"}">${number}</button>`)
    .join("");
  return `<footer class="preview-table-footer admin-table-pagination"><strong>${start}-${end} / ${total}</strong><nav class="pagination-control" aria-label="발급 배치 페이지 이동"><button class="icon-button" type="button" data-preview-issue-page="${safePage - 1}" aria-label="이전 페이지" ${safePage <= 1 ? "disabled" : ""}>‹</button>${pages}<button class="icon-button" type="button" data-preview-issue-page="${safePage + 1}" aria-label="다음 페이지" ${safePage >= totalPages ? "disabled" : ""}>›</button></nav></footer>`;
}

function applyClientTablePagination() {
  const tables = [
    [".fan-pass-table", "fanPassPage"],
  ];
  tables.forEach(([selector, stateKey]) => {
    const table = document.querySelector(selector);
    const footer = table?.closest(".panel")?.querySelector(".preview-table-footer, .fan-pass-pagination");
    const rows = Array.from(table?.querySelectorAll("tbody tr") || []).filter((row) => !row.querySelector(".empty"));
    if (!table || !footer || !rows.length) return;
    const { page, totalPages } = pagedItems(rows, state[stateKey]);
    state[stateKey] = page;
    rows.forEach((row, index) => {
      row.hidden = index < (page - 1) * adminTablePageSize || index >= page * adminTablePageSize;
    });
    footer.outerHTML = tablePagination(stateKey, page, rows.length);
  });
}

function guideView() {
  return `<div class="page-heading"><div><p class="eyebrow">OPERATIONS PLAYBOOK</p><h2>관리자 웹 운영 가이드</h2><p>조직·아티스트·드롭의 범위를 먼저 정하면 공개 과정에서 권한 충돌을 막을 수 있습니다.</p></div></div><div class="guide-grid"><section class="panel guide-hero"><span class="guide-icon">${icon("route")}</span><div><h3>팬에게 공개되기까지</h3><p>파트너 등록 → 아티스트 연결 → 기업 관리자 발급 → 카드 초안 → 드롭 발행 요청 → 루트 검수·공개 순서로 운영합니다.</p></div></section><section class="panel"><p class="eyebrow">WORKSPACE BOUNDARY</p><h3>운영 카드와 아티스트 스튜디오</h3><div class="guide-compare"><article><span class="guide-icon purple">${icon("inventory_2")}</span><h4>운영 카드·드롭</h4><p>회사 운영진이 담당 아티스트의 카드, 드롭, QR 코드와 공개 요청을 관리합니다. 코드는 공개 카드와 라이브 드롭에만 발행합니다.</p><span class="badge success-badge">운영·발행·공개</span></article><article><span class="guide-icon blue">${icon("design_services")}</span><h4>아티스트 스튜디오</h4><p>아티스트와 소속 스태프가 사진, 손글씨, 그림, 스티커, 보이스·모션·홀로그램 요소를 창작하고 검수를 요청합니다.</p><span class="badge draft">창작·초안·검수 요청</span></article></div></section><section class="panel"><p class="eyebrow">ROLE MAP</p><h3>권한별 책임</h3><div class="guide-steps"><div><strong>ROOT</strong><span>모든 파트너·계약·아티스트·공개 검수와 서비스 사용자를 관리합니다.</span></div><div><strong>기업 슈퍼 관리자</strong><span>자기 회사의 구성원과 연결 아티스트, 카드·드롭·코드를 운영합니다. 다른 회사에는 접근할 수 없습니다.</span></div><div><strong>매니저 / 에디터 / 뷰어</strong><span>매니저는 담당 아티스트의 드롭 발행 요청과 코드 운영, 에디터는 초안 편집, 뷰어는 조회만 할 수 있습니다.</span></div></div></section><section class="panel"><p class="eyebrow">TROUBLESHOOTING</p><h3>문제가 생겼을 때</h3><ul class="guide-list"><li><strong>파트너 등록 실패</strong><span>파트너 코드는 영문 소문자·숫자·하이픈만 사용하며, 이미 등록된 코드는 사용할 수 없습니다.</span></li><li><strong>드롭을 만들 수 없음</strong><span>회사에 연결된 아티스트가 있어야 합니다. 매니저·에디터는 배정된 아티스트만 선택할 수 있습니다.</span></li><li><strong>코드 배치가 비활성화됨</strong><span>공개 카드와 라이브 상태의 같은 아티스트 드롭을 먼저 준비해 주세요.</span></li></ul></section></div>`;
}

function layout() {
  if (state.restoringSession) {
    app.innerHTML = sessionLoadingView();
    return;
  }
  if (!state.authenticated || state.mustChangePassword) {
    app.innerHTML = loginView();
    bind();
    return;
  }
  if (isEventDeepLink()) {
    state.view = "events";
    state.drawer = "event";
    state.eventEditorOpen = true;
  }
  const partnerMode = state.view === "partners" && isRoot();
  const eventEditorOpen = state.eventEditorOpen || state.drawer === "event" || isEventDeepLink();
  const fanPassEditorOpen = state.view === "fan-growth" && state.drawer === "fan-pass";
  const sidecarOpen = eventEditorOpen || fanPassEditorOpen;
  const page = `<section class="page-content">${currentView()}</section>`;
  let eventEditorMarkup = "";
  if (eventEditorOpen) {
    try {
      eventEditorMarkup = eventDrawer();
    } catch (error) {
      console.error("Event editor render failed", error);
      eventEditorMarkup = `<div class="notice error" role="alert">이벤트 편집기를 불러오지 못했습니다. 입력 가능한 이벤트 정보와 권한을 확인해 주세요.</div>`;
    }
  }
  const editorColumn = eventEditorOpen
    ? `<aside class="workspace-sidecar event-sidecar event-drawer" role="dialog" aria-modal="false" aria-label="이벤트 편집">${eventEditorMarkup}</aside>`
    : fanPassEditorOpen
      ? `<aside class="workspace-sidecar fan-pass-sidecar fan-pass-drawer" role="dialog" aria-modal="false" aria-label="레벨 패스 편집">${fanPassDrawer()}</aside>`
      : "";
  const operationFeedback = state.operationFeedback ? `<div class="operation-feedback ${state.operationFeedback.tone === "error" ? "error" : "success"}" role="status" aria-live="polite">${icon(state.operationFeedback.tone === "error" ? "error" : "check_circle")}<span>${escapeHtml(state.operationFeedback.message)}</span></div>` : "";
  const workspaceContent = sidecarOpen ? `<div class="workspace-sidecar-body ${eventEditorOpen ? "workspace-event-body" : "fan-pass-workspace-body"}">${operationFeedback}${state.error ? `<div class="notice error" role="alert">${escapeHtml(state.error)}</div>` : ""}${page}${editorColumn}</div>` : `${operationFeedback}${state.error ? `<div class="notice error" role="alert">${escapeHtml(state.error)}</div>` : ""}${page}`;
  app.innerHTML = `<div class="admin-shell ${state.navCollapsed ? "nav-collapsed" : ""} ${partnerMode ? "partner-layout partner-directory" : ""}">${navigationView()}${partnerMode ? partnerListColumn() : ""}<main class="workspace ${partnerMode ? "partner-detail" : ""}">${topbarView()}${workspaceContent}</main></div>${sidecarOpen ? "" : drawerView()}${eventApplicantsModal()}${eventCommentsModal()}<div class="nav-scrim ${state.mobileNavOpen ? "show" : ""}" id="nav-scrim"></div>${globalSearchView()}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  if (state.view === "dashboard" && state.operationalMetrics) {
    document
      .querySelector(".dashboard-grid")
      ?.insertAdjacentHTML("beforeend", operationalMetricsView(state.operationalMetrics));
  }
  if (state.view === "dashboard" && state.operationsOverview) {
    document
      .querySelector(".dashboard-grid")
      ?.insertAdjacentHTML("beforeend", operationsOverviewView(state.operationsOverview));
  }
  if (state.view === "statistics" && state.statistics?.kpis) {
    document
      .querySelector(".statistics-kpi-grid")
      ?.insertAdjacentHTML("beforeend", statisticsLifecycleKpis(state.statistics.kpis));
  }
  bind();
  document
    .querySelector("#artist-account-form")
    ?.addEventListener("submit", createArtistAccount);
  document
    .querySelectorAll("[data-artist-reset]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void resetArtistPassword(button.dataset.artistReset),
      ),
    );
}

function resetWorkspaceScroll() {
  window.scrollTo({ top: 0, behavior: "instant" });
}

function setOperationFeedback(message, tone = "success") {
  state.operationFeedback = { message, tone };
}

function dashboardView() {
  const metrics = state.metrics;
  if (!metrics)
    return '<div class="panel empty">관리자 API에서 운영 지표를 불러오는 중입니다.</div>';
  const activity = state.recentActivity.length
    ? state.recentActivity
        .map(
          (item) =>
            `<div class="activity"><span class="activity-icon">${icon("history")}</span><div><strong>${escapeHtml(activityLabel(item.action))}</strong><small>${escapeHtml(`${item.entityType}:${item.entityId} · ${item.actorId || "system"}`)}</small></div></div>`,
        )
        .join("")
    : '<div class="empty">최근 활동이 없습니다.</div>';
  const scopeDescription = isRoot()
    ? "전체 파트너와 서비스 운영 현황"
    : `${scopeLabel()} · 배정된 아티스트 운영 현황`;
  const publishedPacks = state.cardPacks.filter((pack) => pack.status === "published").length;
  const draftPacks = state.cardPacks.length - publishedPacks;
  const packRows = state.cardPacks.slice(0, 3).map((pack) => `<li><span><strong>${escapeHtml(pack.name)}</strong><small>${escapeHtml(pack.seasonName || pack.version || "버전 미설정")}</small></span><em class="badge ${pack.status === "published" ? "success-badge" : "draft"}">${pack.status === "published" ? "공개됨" : "초안"}</em></li>`).join("");
  const packSummary = `<section class="panel card-pack-summary"><div class="panel-heading"><div><p class="eyebrow">CARD PACKS</p><h2>카드팩 연동 상태</h2></div><span class="panel-count">${state.cardPacks.length}개</span></div><div class="card-pack-summary-stats"><span><strong>${publishedPacks}</strong> 공개</span><span><strong>${draftPacks}</strong> 편집 중</span></div>${packRows ? `<ul class="card-pack-summary-list">${packRows}</ul>` : `<div class="empty">연결된 카드팩이 없습니다.</div>`}</section>`;
  return `<div class="page-heading"><div><p class="eyebrow">TODAY</p><h2>운영 현황을 한눈에 확인하세요</h2><p>${escapeHtml(scopeDescription)}</p></div></div><div class="metrics"><article class="metric"><span class="metric-icon purple">${icon("style")}</span><div><span class="metric-label">전체 카드</span><strong class="metric-value">${metrics.totalCards}</strong><span class="metric-note">현재 범위 등록 카드</span></div></article><article class="metric"><span class="metric-icon green">${icon("public")}</span><div><span class="metric-label">공개 카드</span><strong class="metric-value">${metrics.publishedCards}</strong><span class="metric-note">팬에게 노출 중</span></div></article><article class="metric"><span class="metric-icon blue">${icon("campaign")}</span><div><span class="metric-label">진행 중 드롭</span><strong class="metric-value">${metrics.activeDrops}</strong><span class="metric-note">현재 라이브</span></div></article><article class="metric"><span class="metric-icon amber">${icon("qr_code_scanner")}</span><div><span class="metric-label">누적 발급</span><strong class="metric-value">${Number(metrics.redeemedCount).toLocaleString()}</strong><span class="metric-note">사용 완료 코드</span></div></article></div><div class="dashboard-grid"><section class="panel action-panel"><div class="panel-heading"><div><p class="eyebrow">QUICK ACTIONS</p><h2>바로 시작하기</h2></div></div><div class="quick-actions">${can("cards:write") ? `<button class="quick-action" id="open-card-drawer" type="button"><span>${icon("add_card")}</span><div><strong>새 카드 등록</strong><small>이미지와 카드 정보를 등록합니다.</small></div>${icon("arrow_forward")}</button>` : ""}${isRoot() ? `<button class="quick-action" data-view="partners" type="button"><span>${icon("domain_add")}</span><div><strong>파트너 관리</strong><small>기업 담당자와 아티스트를 배정합니다.</small></div>${icon("arrow_forward")}</button>` : ""}<button class="quick-action" data-view="artists" type="button"><span>${icon("recent_actors")}</span><div><strong>아티스트 확인</strong><small>소속과 계정 상태를 확인합니다.</small></div>${icon("arrow_forward")}</button></div></section>${packSummary}<section class="panel recent-activity-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT ACTIVITY</p><h2>최근 운영 활동</h2></div><button class="text-button" data-view="audit" type="button">전체 보기 ${icon("arrow_forward")}</button></div><div class="activity-list">${activity}</div></section></div>`;
}
function operationalMetricsView(metrics) {
  const rarity = (metrics.byRarity || [])
    .map((item) => `<span><b>${escapeHtml(item.rarity || "-")}</b> ${Number(item.issued || 0).toLocaleString()}장</span>`)
    .join("");
  const delivery = Object.entries(metrics.notificationDelivery || {})
    .map(([channel, statuses]) => {
      const label = channel === "email" ? "이메일" : channel === "push" ? "푸시" : channel;
      const pending = Number(statuses.pending || 0) + Number(statuses.retry || 0);
      const failed = Number(statuses.failed || 0) + Number(statuses.dead_letter || 0);
      return `<span><small>${escapeHtml(label)}</small><strong>${Number(statuses.delivered || 0).toLocaleString()}건 전달</strong><em class="${failed ? "warning-text" : ""}">${pending ? `${pending}건 대기` : failed ? `${failed}건 확인 필요` : "정상"}</em></span>`;
    })
    .join("");
  return `<section class="panel operational-metrics-panel"><div class="panel-heading"><div><p class="eyebrow">CARD OPERATIONS</p><h2>카드 운영 지표</h2></div><span class="panel-count">범위 내</span></div><div class="operational-metrics-grid"><span><small>카드팩 오픈</small><strong>${Number(metrics.packOpenings || 0).toLocaleString()}</strong></span><span><small>발급 카드</small><strong>${Number(metrics.issuedCards || 0).toLocaleString()}</strong></span><span><small>보유 팬</small><strong>${Number(metrics.cardHolders || 0).toLocaleString()}</strong></span><span><small>인증 성공</small><strong>${Number(metrics.redeem?.success || 0).toLocaleString()}</strong></span><span><small>카드 조합</small><strong>${Number(metrics.combinations || 0).toLocaleString()}</strong></span><span><small>거래 제안</small><strong>${Number(metrics.trades?.total || 0).toLocaleString()}</strong></span></div><div class="operational-rarity"><small>희귀도별 발급</small><div>${rarity || "집계된 카드가 없습니다."}</div></div>${delivery ? `<div class="operational-delivery"><small>알림 전달 상태</small><div>${delivery}</div></div>` : ""}</section>`;
}

function operationsOverviewView(overview) {
  const queues = overview.queues || {};
  const items = [
    ["실패한 전달", queues.failedDeliveries, "deliveries"],
    ["재시도 대기", queues.retryableDeliveries, "deliveries"],
    ["실패한 작업", queues.failedEngagementEvents, "fan-growth"],
    ["미답변 문의", queues.openSupportTickets, "support"],
    ["대기 중 거래", queues.pendingTrades, "audit"],
    ["환불 주문", queues.refundedOrders, "audit"],
    ["미수령 보상", queues.unclaimedRewards, "fan-growth"],
  ];
  const cards = items
    .map(([label, value, view]) => `<button class="ops-queue-card ${Number(value || 0) ? "has-items" : ""}" type="button" data-view="${escapeHtml(view)}"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toLocaleString()}</strong><small>${Number(value || 0) ? "확인 필요" : "정상"}</small></button>`)
    .join("");
  const actions = (overview.recentActions || [])
    .slice(0, 5)
    .map((item) => `<li><strong>${escapeHtml(activityLabel(item.action))}</strong><small>${escapeHtml(`${item.entityType}:${item.entityId} · ${formatDate(item.createdAt)}`)}</small></li>`)
    .join("");
  return `<section class="panel operations-overview-panel"><div class="panel-heading"><div><p class="eyebrow">OPERATIONS HEALTH</p><h2>처리가 필요한 작업</h2><p>실패·대기·분쟁 상태를 한곳에서 확인합니다.</p></div><button class="text-button" data-view="audit" type="button">감사 로그 ${icon("arrow_forward")}</button></div><div class="ops-queue-grid">${cards}</div><div class="ops-recent"><small>최근 조치</small><ul>${actions || "<li class=\"empty\">최근 운영 조치가 없습니다.</li>"}</ul></div></section>`;
}

function activityLabel(action) {
  return (
    {
      "notification_delivery.retried": "알림 전달을 재시도했습니다",
      "notification_delivery.delivered": "알림 전달이 완료되었습니다",
      "notification_delivery.failed": "알림 전달에 실패했습니다",
      "notification_delivery.dead_lettered": "알림 전달이 보류되었습니다",
      "support_ticket.status_changed": "고객센터 문의 상태가 변경되었습니다",
      "support_ticket.replied": "고객센터 문의에 답변했습니다",
      "support_ticket.action_recorded": "고객센터 처리 이력이 기록되었습니다",
      "artist_account.password_reset": "아티스트 계정 임시 비밀번호를 발급했습니다",
      "pass.purchased": "팬 패스를 구매했습니다",
      "card_pack.opened": "카드팩을 개봉했습니다",
      "card.published": "카드가 공개되었습니다",
      "card.created": "카드가 등록되었습니다",
      "card.reviewed": "카드 검수가 처리되었습니다",
      "artist_profile.reviewed": "아티스트 소속 검수가 처리되었습니다",
      "drop.started": "드롭이 시작되었습니다",
      "redeem_code_batch.created": "코드 배치가 생성되었습니다",
      "user.role_changed": "사용자 역할이 변경되었습니다",
      "organization.created": "파트너가 등록되었습니다",
      "organization.updated": "파트너 정보가 변경되었습니다",
      "organization.status_changed": "파트너 운영 상태가 변경되었습니다",
      "organization.artists_updated": "파트너 아티스트 범위가 변경되었습니다",
      "organization.member_created": "기업 관리자 계정이 발급되었습니다",
      "organization.member_updated": "기업 관리자 권한이 변경되었습니다",
      "organization.member_artists_updated":
        "기업 관리자 담당 아티스트가 변경되었습니다",
      "artist.updated": "아티스트 정보가 변경되었습니다",
    }[action] || action
  );
}
async function loadArtistProfiles() {
  if (!state.authenticated || state.artistProfilesLoaded) return;
  state.artistProfilesLoaded = true;
  try {
    const result = await api("/admin/artist-profiles");
    state.artistProfiles = result.data.items;
    if (state.view === "artists") layout();
  } catch {
    state.artistProfilesLoaded = false;
  }
}

async function loadArtistAccounts() {
  const result = await api("/admin/artist-accounts");
  state.artistAccounts = result.data.items || [];
}

async function loadFanGrowth(renderAfter = false) {
  state.error = "";
  if (!canViewFanGrowth()) {
    state.engagement = { ...fanGrowthEmptyState };
    return;
  }
  if (isRoot() && !state.organizations.length) {
    await loadOrganizations(false);
  }
  const [achievements, rewards, passSeasons, missions, levelPolicies, failedEvents] = await Promise.all([
    api("/admin/engagement/achievements"),
    api("/admin/engagement/rewards"),
    api("/admin/engagement/pass-seasons"),
    api("/admin/engagement/missions"),
    isRoot() ? api("/admin/engagement/level-policies") : Promise.resolve({ data: { items: [] } }),
    isRoot() ? api("/admin/engagement/events?status=failed") : Promise.resolve({ data: { items: [] } }),
  ]);
  state.engagement = {
    achievements: achievements.data.items || [],
    rewards: rewards.data.items || [],
    passSeasons: passSeasons.data.items || [],
    missions: missions.data.items || [],
    levelPolicies: levelPolicies.data.items || [],
    failedEvents: failedEvents.data.items || [],
  };
  state.error = "";
  if (renderAfter) layout();
}

async function loadOptionalFanGrowth() {
  try {
    return await loadFanGrowth(false);
  } catch (error) {
    if (error.status === 401) throw error;
    state.engagement = { ...fanGrowthEmptyState };
    console.warn("Optional fan growth data unavailable", error);
    return { data: { items: [] } };
  }
}

async function loadEvents(renderAfter = false) {
  if (!can("events:read")) return;
  const params = new URLSearchParams({ page: String(state.eventPage), pageSize: "20" });
  if (state.eventQuery.trim()) params.set("q", state.eventQuery.trim());
  if (state.eventStatus !== "all") params.set("status", state.eventStatus);
  if (state.eventType !== "all") params.set("type", state.eventType);
  if (state.eventArtist !== "all") params.set("artistId", state.eventArtist);
  try {
    const result = await api(`/admin/events?${params}`);
    state.events = result.data.items || [];
    state.eventPagination = result.data.pagination || { page: state.eventPage, pageSize: 20, total: state.events.length, totalPages: 1 };
    if (state.selectedEvent) state.selectedEvent = state.events.find((item) => item.id === state.selectedEvent.id) || null;
    if (renderAfter) layout();
  } catch { state.events = []; }
}

async function loadEventApplicants(eventId, renderAfter = true) {
  if (!eventId || !can("events:read")) return;
  state.eventApplicantsEventId = eventId;
  state.eventApplicantsLoading = true;
  if (renderAfter) layout();
  try {
    const result = await api(`/admin/events/${encodeURIComponent(eventId)}/applications`);
    if (state.eventApplicantsEventId === eventId) state.eventApplicants = result.data.items || [];
  } catch {
    state.eventApplicants = [];
  } finally {
    if (state.eventApplicantsEventId === eventId) {
      state.eventApplicantsLoading = false;
      if (renderAfter) layout();
    }
  }
}

async function loadEventComments(eventId, renderAfter = true) {
  if (!eventId || !can("events:read")) return;
  state.eventCommentsEventId = eventId;
  state.eventCommentsLoading = true;
  if (renderAfter) layout();
  try {
    const result = await api(`/admin/events/${encodeURIComponent(eventId)}/comments`);
    if (state.eventCommentsEventId === eventId) state.eventComments = result.data.items || [];
  } catch {
    state.eventComments = [];
  } finally {
    if (state.eventCommentsEventId === eventId) {
      state.eventCommentsLoading = false;
      if (renderAfter) layout();
    }
  }
}

async function reviewEventComment(eventId, commentId, status) {
  try {
    await api(`/admin/events/${encodeURIComponent(eventId)}/comments/${encodeURIComponent(commentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadEventComments(eventId, false);
    layout();
    toast(status === "approved" ? "댓글을 승인했습니다." : "댓글을 반려했습니다.");
  } catch {
    toast("댓글 상태 변경에 실패했습니다.");
  }
}

async function drawEventWinners(eventId, requestedWinnerCount) {
  const applicantCount = state.eventApplicants.filter((item) => item.status === "submitted").length;
  if (!applicantCount) {
    toast("추첨할 신청자가 없습니다.");
    return;
  }
  const winnerCount = Number(requestedWinnerCount);
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > applicantCount) {
    toast("당첨자 수를 신청자 수 이내의 정수로 입력해 주세요.");
    return;
  }
  try {
    await api(`/admin/events/${encodeURIComponent(eventId)}/draw`, { method: "POST", body: JSON.stringify({ winnerCount }) });
    await loadEventApplicants(eventId, false);
    await loadEvents(true);
    toast(`${winnerCount}명의 당첨자를 추첨했습니다.`);
  } catch {
    toast("추첨에 실패했습니다. 신청자와 이벤트 상태를 확인해 주세요.");
  }
}

function formatDate(value) {
  if (!value) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatContractDate(value) {
  if (!value) return "미설정";
  const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return formatDate(value);
  const [, year, month, day] = parts;
  return `${Number(year)}년 ${Number(month)}월 ${Number(day)}일`;
}

function partnerListColumn() {
  const query = state.partnerQuery.trim().toLowerCase();
  const organizations = state.organizations.filter(
    (organization) =>
      (!query ||
        `${organization.name}${organization.contactName || ""}${organization.contactEmail || ""}`
          .toLowerCase()
          .includes(query)) &&
      (state.partnerStatus === "all" ||
        organization.status === state.partnerStatus),
  );
  return `<aside class="partner-list-column" aria-label="파트너 목록"><div class="partner-list-header"><div><p class="eyebrow">PARTNERS</p><h2>파트너 디렉터리</h2></div><button class="icon-button primary-icon" id="open-organization-drawer" type="button" aria-label="파트너 추가">${icon("add")}</button></div><label class="search-field">${icon("search")}<input id="partner-search" type="search" placeholder="회사 또는 담당자 검색" value="${escapeHtml(state.partnerQuery)}" /></label><div class="segment-filter" aria-label="파트너 상태 필터"><button type="button" data-partner-status="all" class="${state.partnerStatus === "all" ? "active" : ""}">전체</button><button type="button" data-partner-status="active" class="${state.partnerStatus === "active" ? "active" : ""}">활성</button><button type="button" data-partner-status="suspended" class="${state.partnerStatus === "suspended" ? "active" : ""}">중지</button></div><div class="partner-list">${
    organizations.length
      ? organizations
          .map(
            (organization) =>
              `<button class="partner-list-item ${state.selectedOrganizationId === organization.id ? "active" : ""}" type="button" data-partner-id="${escapeHtml(organization.id)}">${partnerLogoMarkup(organization)}<span class="partner-list-copy"><strong>${escapeHtml(organization.name)}</strong><small>${organization.artistCount} 아티스트 · ${organization.memberCount} 관리자</small></span><span class="status-dot ${organization.status}" aria-label="${organization.status === "active" ? "활성" : "중지"}"></span></button>`,
          )
          .join("")
      : `<div class="compact-empty">${icon("domain_disabled")}<strong>표시할 파트너가 없습니다.</strong><span>검색 조건을 바꾸거나 새 파트너를 등록하세요.</span></div>`
  }</div><div class="partner-list-footer"><span>총 ${state.organizationPagination.total || state.organizations.length}개 파트너</span></div></aside>`;
}

function partnersView() {
  const organization = state.selectedOrganization;
  if (!organization) {
    return `<div class="partner-empty-state">${icon("domain_add")}<h2>첫 파트너를 등록해 보세요</h2><p>계약 기업을 등록한 뒤 담당 관리자와 아티스트를 연결할 수 있습니다.</p><button class="primary" id="empty-add-organization" type="button">파트너 등록</button></div>`;
  }
  const partnerOptions = state.organizations.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const managementActions = isRoot()
    ? `<div class="partner-hero-actions"><button class="secondary" id="edit-organization" type="button">${icon("edit")} 정보 수정</button><button class="secondary danger-button" id="toggle-organization-status" type="button" data-next-status="${organization.status === "active" ? "suspended" : "active"}">${icon(organization.status === "active" ? "pause_circle" : "play_circle")} ${organization.status === "active" ? "운영 중지" : "다시 활성화"}</button></div>`
    : "";
  return `<section class="partner-detail-view"><div class="partner-mobile-selector">${isRoot() ? `<label><span>파트너 선택</span>${adminSelect({ id: "partner-mobile-select", value: organization.id, label: "파트너 선택", className: "partner-mobile-select", options: partnerOptions })}</label>` : ""}</div><header class="partner-hero">${partnerLogoMarkup(organization, "large")}<div class="partner-identity"><div class="partner-name-row"><h2>${escapeHtml(organization.name)}</h2><span class="badge ${organization.status === "active" ? "success-badge" : "danger-badge"}">${organization.status === "active" ? "운영 중" : "운영 중지"}</span></div><p>${escapeHtml(organization.contactEmail || "대표 담당자 이메일 미등록")}</p><div class="partner-meta"><span>${icon("calendar_month")} ${formatContractDate(organization.contractStartsAt)} – ${formatContractDate(organization.contractEndsAt)}</span><span>${icon("update")} ${formatDate(organization.updatedAt)} 업데이트</span></div></div>${managementActions}</header><nav class="detail-tabs" aria-label="파트너 상세 메뉴">${[
    ["overview", "개요"],
    ["members", "관리자"],
    ["artists", "아티스트"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" data-partner-tab="${id}" class="${state.partnerTab === id ? "active" : ""}" aria-selected="${state.partnerTab === id}">${label}${id === "members" ? `<span>${organization.memberCount}</span>` : id === "artists" ? `<span>${organization.artistCount}</span>` : ""}</button>`,
    )
    .join("")}</nav><div class="detail-tab-content">${partnerTabView(organization)}</div></section>`;
}

function partnerTabView(organization) {
  if (state.partnerTab === "members") return partnerMembersView();
  if (state.partnerTab === "artists") return partnerArtistsView(organization);
  return `<div class="detail-summary-grid"><article class="summary-card"><span>${icon("recent_actors")}</span><div><small>연결 아티스트</small><strong>${organization.artistCount}</strong></div></article><article class="summary-card"><span>${icon("shield_person")}</span><div><small>기업 관리자</small><strong>${organization.memberCount}</strong></div></article><article class="summary-card"><span>${icon("style")}</span><div><small>발행 카드</small><strong>${organization.cardCount}</strong></div></article></div><div class="detail-columns"><section class="detail-section"><div class="section-heading"><div><p class="eyebrow">CONTACT</p><h3>계약 및 담당 정보</h3></div></div><dl class="info-list"><div><dt>담당자</dt><dd>${escapeHtml(organization.contactName || "미등록")}</dd></div><div><dt>이메일</dt><dd>${escapeHtml(organization.contactEmail || "미등록")}</dd></div><div><dt>파트너 코드</dt><dd>${escapeHtml(organization.slug)}</dd></div><div><dt>계약 기간</dt><dd>${formatContractDate(organization.contractStartsAt)} – ${formatContractDate(organization.contractEndsAt)}</dd></div></dl></section><section class="detail-section"><div class="section-heading"><div><p class="eyebrow">OPERATIONS</p><h3>운영 준비 상태</h3></div></div><div class="readiness-list"><div class="readiness-item complete">${icon("check_circle")}<div><strong>파트너 계정 등록</strong><small>조직 운영 범위가 생성되었습니다.</small></div></div><div class="readiness-item ${organization.artistCount ? "complete" : "pending"}">${icon(organization.artistCount ? "check_circle" : "pending")}<div><strong>아티스트 연결</strong><small>${organization.artistCount ? `${organization.artistCount}팀이 연결되어 있습니다.` : "운영할 아티스트를 연결해 주세요."}</small></div></div><div class="readiness-item ${organization.memberCount ? "complete" : "pending"}">${icon(organization.memberCount ? "check_circle" : "pending")}<div><strong>관리자 발급</strong><small>${organization.memberCount ? `${organization.memberCount}명이 접근할 수 있습니다.` : "기업 담당자 계정을 발급해 주세요."}</small></div></div></div></section></div>`;
}

function partnerMembersView() {
  const roleOptions = [
    ...(isRoot()
      ? [{ value: "company_admin", label: "기업 슈퍼 관리자", description: "회사 운영과 구성원 관리" }]
      : []),
    { value: "manager", label: "매니저", description: "드롭·코드 운영 및 검수 요청" },
    { value: "editor", label: "에디터", description: "카드·드롭 초안 편집" },
    { value: "viewer", label: "뷰어", description: "읽기 전용" },
  ];
  return `<section class="detail-section full"><div class="section-heading"><div><p class="eyebrow">ACCESS CONTROL</p><h3>기업 관리자</h3><p>담당 범위와 읽기·편집 권한을 계정별로 관리합니다.</p></div><button class="primary" id="open-member-drawer" type="button">${icon("person_add")} 관리자 추가</button></div>${
    state.organizationMembers.length
      ? `<div class="table-wrap member-table-wrap"><table class="table responsive-table member-table"><thead><tr><th>관리자</th><th>권한</th><th>담당 아티스트</th><th>최근 로그인</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${state.organizationMembers
          .map(
            (member) => {
              const protectedMember = member.accessLevel === "company_admin" && !isRoot();
              return `<tr><td data-label="관리자"><div class="person-cell"><span class="person-avatar">${escapeHtml((member.displayName || member.email).slice(0, 1))}</span><div><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(member.email)}</small></div></div></td><td data-label="권한"><div class="table-summary-control">${accessRoleBadge(member.accessLevel)}${protectedMember ? "" : `<button class="summary-edit-button" type="button" data-edit-member-role="${escapeHtml(member.id)}">${icon("edit")} 수정</button>`}</div></td><td data-label="담당 아티스트"><button class="artist-assignment-trigger" type="button" data-assign-member="${escapeHtml(member.id)}"><span class="assignment-label">${member.assignedArtists.length ? member.assignedArtists.map((artist) => escapeHtml(artist.name)).join(", ") : "배정 없음"}</span><span class="assignment-edit">${icon("edit")} 배정</span></button></td><td data-label="최근 로그인">${formatDate(member.lastLoginAt)}</td><td data-label="상태"><span class="badge ${member.status === "active" ? "success-badge" : "danger-badge"}">${member.status === "active" ? "활성" : "중지"}</span></td><td data-label="관리"><div class="row-actions">${protectedMember ? '<span class="muted">보호됨</span>' : `<button class="icon-button row-action" type="button" data-reset-member-password="${escapeHtml(member.id)}" aria-label="${escapeHtml(member.displayName)} 비밀번호 재발급" title="비밀번호 재발급">${icon("key")}</button><button class="icon-button row-action member-status" type="button" data-member-id="${escapeHtml(member.id)}" data-next-status="${member.status === "active" ? "suspended" : "active"}" aria-label="${member.status === "active" ? "계정 중지" : "계정 활성화"}" title="${member.status === "active" ? "계정 중지" : "계정 활성화"}">${icon(member.status === "active" ? "person_off" : "person_check")}</button>`}</div></td></tr>`;
            },
          )
          .join("")}</tbody></table></div>`
      : `<div class="inline-empty">${icon("manage_accounts")}<h4>등록된 기업 관리자가 없습니다.</h4><p>첫 담당자 계정을 발급하고 담당 아티스트를 배정하세요.</p><button class="primary" id="empty-add-member" type="button">관리자 추가</button></div>`
  }</section>`;
}

function partnerArtistsView(organization) {
  const selected = new Set((organization.artists || []).map((artist) => artist.id));
  const canManageScope = isRoot();
  return `<section class="detail-section full"><div class="section-heading"><div><p class="eyebrow">ARTIST SCOPE</p><h3>${canManageScope ? "소속 아티스트 연결" : "운영 가능 아티스트"}</h3><p>${canManageScope ? "이 기업이 운영할 수 있는 전체 아티스트 범위를 설정합니다." : "연결된 아티스트 범위 안에서 카드와 드롭을 운영할 수 있습니다."}</p></div>${canManageScope ? '<button class="primary" id="save-organization-artists" type="button">변경 저장</button>' : ""}</div><div class="artist-assignment-grid ${canManageScope ? "" : "read-only"}">${
    state.catalog.artists.length
      ? state.catalog.artists
          .map(
            (artist) =>
              canManageScope
                ? `<label class="artist-check-card"><input type="checkbox" name="organizationArtist" value="${escapeHtml(artist.id)}" ${selected.has(artist.id) ? "checked" : ""}/><span class="artist-avatar">${artist.imageUrl ? `<img src="${escapeHtml(artist.imageUrl)}" alt="" />` : escapeHtml(artist.name.slice(0, 1))}</span><span><strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.id)}</small></span>${icon("check_circle", "selected-icon")}</label>`
                : selected.has(artist.id)
                  ? `<article class="artist-check-card read-only-card"><span class="artist-avatar">${artist.imageUrl ? `<img src="${escapeHtml(artist.imageUrl)}" alt="" />` : escapeHtml(artist.name.slice(0, 1))}</span><span><strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.id)}</small></span>${icon("verified", "selected-icon")}</article>`
                  : "",
          )
          .filter(Boolean)
          .join("")
      : `<div class="compact-empty">등록 가능한 아티스트가 없습니다.</div>`
  }</div></section>`;
}

function scopedArtists() {
  if (isRoot()) return state.catalog.artists || [];
  const assigned = new Set(
    (state.adminContext?.assignedArtists || []).map((artist) => artist.id),
  );
  return (state.catalog.artists || []).filter((artist) => assigned.has(artist.id));
}

function artistsView() {
  const artists = scopedArtists();
  const root = isRoot();
  return `<div class="page-heading with-actions"><div><p class="eyebrow">${root ? "ROOT ARTIST OPERATIONS" : "COMPANY ARTIST OPERATIONS"}</p><h2>${root ? "루트 전용 아티스트·스튜디오 운영" : "내 회사 아티스트 운영"}</h2><p>${root ? "모든 파트너의 아티스트 소속, 스튜디오 계정과 팬 프로필 검수를 관리합니다." : `${scopeLabel()}에 연결되고 배정된 아티스트의 카드·드롭 운영 상태를 확인합니다.`}</p></div>${scopeContextChip()}</div><div class="artist-overview-grid">${
    artists.length
      ? artists
          .map(
            (artist) =>
              `<article class="artist-overview-card"><span class="artist-avatar large">${artist.imageUrl ? `<img src="${escapeHtml(artist.imageUrl)}" alt="" />` : escapeHtml(artist.name.slice(0, 1))}</span><div><strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.id)}</small></div><div class="artist-card-actions"><span class="badge success-badge">운영 가능</span>${can("artists:write") ? `<button class="icon-button edit-artist" type="button" data-artist-id="${escapeHtml(artist.id)}" aria-label="${escapeHtml(artist.name)} 정보 수정">${icon("edit")}</button>` : ""}</div></article>`,
          )
          .join("")
      : `<div class="inline-empty full-span">${icon("recent_actors")}<h3>담당 아티스트가 아직 배정되지 않았습니다.</h3><p>루트 관리자가 조직과 아티스트 범위를 연결하면 이곳에서 운영할 수 있습니다.</p></div>`
  }</div>${isRoot() ? artistAccountPanel() + artistProfilesPanel() : ""}`;
}

function auditView() {
  const actionOptions = [
    { value: "all", label: "모든 행동" },
    { value: "card.published", label: "카드 공개" },
    { value: "card.created", label: "카드 등록" },
    { value: "organization.updated", label: "파트너 변경" },
    { value: "organization.member_updated", label: "관리자 변경" },
  ];
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SECURITY LOG</p><h2>감사 로그</h2><p>현재 권한 범위에서 발생한 변경 이력을 확인합니다.</p></div><button class="secondary" id="export-audit-csv" type="button">${icon("download")} CSV 내보내기</button></div><div class="toolbar compact-toolbar"><label class="search-field">${icon("search")}<input id="audit-search" placeholder="행동, 실행자, 대상 검색" value="${escapeHtml(state.auditQuery)}" /></label>${adminSelect({ id: "audit-action-filter", value: state.auditAction, label: "감사 로그 행동 필터", className: "filter-select audit-action-filter", options: actionOptions })}<button class="secondary" id="audit-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>시각</th><th>행동</th><th>실행자</th><th>대상</th></tr></thead><tbody>${auditRows()}</tbody></table></div>${auditPagination()}</section>`;
}

function drawerView() {
  if (!state.drawer || state.drawer === "event" || (state.drawer === "fan-pass" && state.view === "fan-growth")) return "";
  const contents = {
    organization: organizationDrawer,
    member: memberDrawer,
    "artist-assignment": artistAssignmentDrawer,
    "artist-edit": artistEditDrawer,
    "card-create": cardCreateDrawer,
    "drop-link": dropLinkDrawer,
    achievement: achievementDrawer,
    mission: missionDrawer,
    reward: rewardDrawer,
    "fan-pass": fanPassDrawer,
    "role-change": roleChangeDrawer,
    "member-password": memberPasswordDrawer,
    "artist-profile-review": artistProfileReviewDrawer,
    event: eventDrawer,
  }[state.drawer]?.();
  if (!contents) return "";
  const cardOperationsNote = state.drawer === "card-create"
    ? `<div class="drawer-context-note">${icon("info")}<span><strong>아티스트 스튜디오와 다른 작업입니다.</strong><br />스튜디오는 창작·검수 요청, 이 화면은 메타데이터·발행량·공개 상태를 관리합니다.</span></div>`
    : "";
  return `<div class="drawer-backdrop ${state.drawer === "event" ? "event-drawer-backdrop" : ""}" id="drawer-backdrop"><aside class="drawer ${state.drawer === "card-create" ? "card-create-drawer" : state.drawer === "event" ? "event-drawer" : state.drawer === "member" ? "member-drawer" : state.drawer === "artist-assignment" ? "artist-assignment-drawer" : state.drawer === "artist-edit" ? "artist-edit-drawer" : state.drawer === "drop-link" ? "drop-link-drawer" : state.drawer === "achievement" ? "achievement-builder" : state.drawer === "mission" ? "mission-builder" : state.drawer === "reward" ? "reward-builder" : state.drawer === "fan-pass" ? "fan-pass-drawer" : ""}" role="dialog" aria-modal="true" aria-label="작업 패널">${cardOperationsNote}${contents}</aside></div>`;
}

function eventDrawer() {
  const event = state.drawerData?.event || {};
  const artists = scopedArtists();
  const type = event.eventType || "announcement";
  const selectedConnection = event.dropId || event.cardId || event.achievementId || event.externalUrl || "";
  const eventTypes = ["announcement", "comment", "card_drop", "card", "fan_mission", "external"]
    .map((value) => ({ value, label: eventTypeLabel(value) }));
  const artistOptions = [{ value: "", label: "전체 서비스" }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  return `${drawerHeader("EDITORIAL EVENT", event.id ? "이벤트 편집" : "새 이벤트 등록", "팬앱 홈과 이벤트 목록에 노출할 콘텐츠를 작성합니다.")}<form class="event-editor-form" id="event-form" data-event-id="${escapeHtml(event.id || "")}\"><div class="drawer-body form event-form-body">
    <section class="event-form-section event-media-section"><div class="event-form-section-heading"><div><p class="eyebrow">MEDIA</p><h3>이벤트 배너</h3><p>홈과 상세 화면에 표시할 대표 이미지를 등록합니다.</p></div><span class="event-section-status">필수</span></div><div class="event-upload-card"><div class="event-upload-dropzone"><div class="event-upload-thumbnail">${event.heroUrl ? `<img data-event-hero data-hero-url="${escapeHtml(event.heroUrl)}" src="${escapeHtml(resolveAdminAssetUrl(event.heroUrl))}" alt="현재 이벤트 배너" />` : icon("image")}</div><div class="event-upload-copy"><strong id="event-banner-file-name">${event.heroAssetId ? "현재 배너 에셋 연결됨" : "배너 이미지를 추가하세요"}</strong><small>권장 1200 × 600px · PNG, JPG, WEBP</small></div><button class="secondary event-upload-select" type="button">${event.heroAssetId ? "교체" : "파일 선택"}</button><input id="event-banner-file" name="bannerFile" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" tabindex="-1" aria-hidden="true" ${event.id ? "" : "required"} /></div><label class="event-asset-field"><span>연결된 에셋</span><input name="heroAssetId" value="${escapeHtml(event.heroAssetId || "")}" placeholder="파일을 선택하면 자동으로 연결됩니다" readonly required /><small>${event.heroAssetId ? "업로드 완료 · 연결 상태 정상" : "업로드 후 에셋 ID가 자동으로 입력됩니다."}</small></label></div></section>
    <section class="event-form-section"><div class="event-form-section-heading"><div><p class="eyebrow">CONTENT</p><h3>기본 정보</h3><p>팬에게 보여줄 제목과 이벤트 설명을 입력합니다.</p></div></div><div class="event-form-fields"><label class="field"><span>이벤트명</span><input name="title" value="${escapeHtml(event.title || "")}" maxlength="100" placeholder="예: 컴백 기념 팬 이벤트" required /></label><label class="field"><span>한 줄 설명</span><input name="summary" value="${escapeHtml(event.summary || "")}" maxlength="180" placeholder="목록과 홈에 표시될 짧은 설명" required /></label><label class="field"><span>상세 설명 <em class="field-optional">선택</em></span><textarea name="description" rows="4" maxlength="5000" placeholder="이벤트 참여 방법과 내용을 입력하세요.">${escapeHtml(event.description || "")}</textarea></label><label class="field"><span>유의사항 <em class="field-optional">선택</em></span><textarea name="noticeItems" rows="5" maxlength="5000" placeholder="한 줄에 한 가지 유의사항을 입력하세요.">${escapeHtml((event.noticeItems || []).join("\n"))}</textarea><small class="field-help">줄바꿈으로 항목을 구분합니다.</small></label></div></section>
    <section class="event-form-section"><div class="event-form-section-heading"><div><p class="eyebrow">CARDS</p><h3>관련 카드</h3><p>선택한 순서대로 팬앱 이벤트 페이지에 표시됩니다.</p></div></div>${eventRelatedCardOptions(event)}</section>
    <section class="event-form-section"><div class="event-form-section-heading"><div><p class="eyebrow">SCHEDULE</p><h3>노출 및 신청 일정</h3><p>이벤트 공개 기간과 신청 가능 기간을 설정합니다.</p></div></div><div class="form-grid"><label class="field"><span>이벤트 유형</span>${adminSelect({ id: "event-type", name: "eventType", value: type, label: "이벤트 유형", className: "form-select", options: eventTypes, required: true })}</label><label class="field"><span>아티스트</span>${adminSelect({ id: "event-artist", name: "artistId", value: event.artistId || "", label: "아티스트", className: "form-select", options: artistOptions })}</label></div><div class="form-grid"><label class="field"><span>시작 일시</span><input name="startsAt" type="datetime-local" value="${event.startsAt ? String(event.startsAt).slice(0,16) : ""}" required /></label><label class="field"><span>종료 일시</span><input name="endsAt" type="datetime-local" value="${event.endsAt ? String(event.endsAt).slice(0,16) : ""}" /></label></div><div class="form-grid"><label class="field"><span>신청 시작</span><input name="applicationStartsAt" type="datetime-local" value="${event.applicationStartsAt ? String(event.applicationStartsAt).slice(0,16) : ""}" /></label><label class="field"><span>신청 마감</span><input name="applicationEndsAt" type="datetime-local" value="${event.applicationEndsAt ? String(event.applicationEndsAt).slice(0,16) : ""}" /></label></div></section>
    <section class="event-form-section"><div class="event-form-section-heading"><div><p class="eyebrow">OPERATIONS</p><h3>운영 설정</h3><p>장소, 참여 인원, 연결 콘텐츠와 버튼 문구를 설정합니다.</p></div></div><div class="form-grid"><label class="field"><span>장소 <em class="field-optional">선택</em></span><input name="venue" value="${escapeHtml(event.venue || "")}" maxlength="200" placeholder="예: KSPO DOME" /></label><label class="field"><span>참여 인원 제한 <em class="field-optional">선택</em></span><input name="participantLimit" type="number" min="1" value="${event.participantLimit ?? ""}" placeholder="제한 없음" /></label></div><label class="field"><span>연결 대상</span><div id="event-connection-field">${eventConnectionOptions(type, selectedConnection)}</div></label><label class="field"><span>버튼 문구</span><input name="ctaLabel" value="${escapeHtml(event.ctaLabel || "이벤트 보기")}" maxlength="80" /></label><label class="event-featured-option"><input name="featured" type="checkbox" ${event.featured ? "checked" : ""} /><span><strong>홈 대표 이벤트로 우선 노출</strong><small>홈 상단 배너의 첫 번째 이벤트로 노출합니다.</small></span></label></section>
  </div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">${event.id ? "변경 저장" : "초안 저장"}</button></footer></form>`;
}

function drawerHeader(eyebrow, title, description) {
  return `<header class="drawer-header"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${description}</p></div><button class="icon-button close-drawer" type="button" aria-label="닫기">${icon("close")}</button></header>`;
}

function organizationDrawer() {
  const editing = state.drawerData?.organization;
  return `${drawerHeader("PARTNER", editing ? "파트너 정보 수정" : "새 파트너 등록", "계약 기업의 기본 정보와 운영 기간을 설정합니다.")}<form class="drawer-body form" id="organization-form"><section class="organization-logo-picker">${organizationLogoPickerContents(editing)}</section><label class="field"><span>기업명</span><input name="name" value="${escapeHtml(editing?.name || "")}" placeholder="예: 스타웨이브 엔터테인먼트" required /></label><label class="field"><span>파트너 코드</span><input name="slug" value="${escapeHtml(editing?.slug || "")}" placeholder="starwave-ent" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><small class="field-help">영문 소문자·숫자·하이픈만 사용합니다. 이미 사용 중인 코드는 등록할 수 없습니다.</small></label><div class="form-grid"><label class="field"><span>대표 담당자</span><input name="contactName" value="${escapeHtml(editing?.contactName || "")}" placeholder="홍길동" /></label><label class="field"><span>담당자 이메일</span><input name="contactEmail" type="email" value="${escapeHtml(editing?.contactEmail || "")}" placeholder="manager@company.com" /></label></div><div class="form-grid"><label class="field date-field"><span>계약 시작일</span><div class="date-input">${icon("calendar_month")}<input name="contractStartsAt" type="date" value="${editing?.contractStartsAt?.slice(0, 10) || ""}" /></div><small class="field-help">계약이 시작되는 날짜</small></label><label class="field date-field"><span>계약 종료일</span><div class="date-input">${icon("event_available")}<input name="contractEndsAt" type="date" value="${editing?.contractEndsAt?.slice(0, 10) || ""}" /></div><small class="field-help">시작일 이후로 선택하세요</small></label></div><div id="organization-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">${editing ? "변경 저장" : "파트너 등록"}</button></footer></form>`;
}

function artistEditDrawer() {
  const artist = state.drawerData?.artist;
  if (!artist) return "";
  return `${drawerHeader("ARTIST PROFILE", "아티스트 정보 수정", "팬앱과 운영 화면에 표시되는 이름과 대표 이미지를 관리합니다.")}<form class="drawer-body form" id="artist-edit-form" data-artist-id="${escapeHtml(artist.id)}"><div class="artist-edit-preview"><span class="artist-avatar large">${artist.imageUrl ? `<img src="${escapeHtml(artist.imageUrl)}" alt="" />` : escapeHtml(artist.name.slice(0, 1))}</span><div><strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.id)}</small></div></div><label class="field"><span>표시 이름</span><input name="name" value="${escapeHtml(artist.name)}" maxlength="120" required /></label><label class="field"><span>대표 이미지 URL</span><input name="imageUrl" type="url" value="${escapeHtml(artist.imageUrl || "")}" placeholder="https://cdn.example.com/artist.jpg" /></label><p class="hint">현재는 승인된 CDN 이미지 URL을 사용합니다. 파일 업로드는 미디어 라이브러리 연결 시 추가됩니다.</p><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">변경 저장</button></footer></form>`;
}

function temporaryCredentialPanel() {
  const credential = state.temporaryCredential;
  if (!credential) return "";
  return `<div class="credential-result" role="status">${icon("key")}<div><strong>임시 비밀번호가 발급되었습니다.</strong><p>${escapeHtml(credential.email)}</p><code>${escapeHtml(credential.temporaryPassword)}</code><small>이 화면을 닫으면 다시 표시되지 않습니다. 안전한 경로로 전달하세요.</small></div><button class="icon-button" id="copy-temporary-password" type="button" aria-label="임시 비밀번호 복사">${icon("content_copy")}</button></div>`;
}

function accessRoleBadge(role, current = false) {
  const labels = { root: "루트 관리자", admin: "관리자", company_admin: "기업 슈퍼 관리자", manager: "매니저", editor: "에디터", viewer: "뷰어", artist: "아티스트", fan: "팬" };
  const tone = { root: "violet", admin: "violet", company_admin: "violet", manager: "blue", editor: "blue", viewer: "gray", artist: "pink", fan: "gray" }[role] || "gray";
  return `<span class="access-role ${tone}${current ? " current" : ""}">${icon(role === "root" || role === "company_admin" ? "shield_person" : "badge")}<span>${current ? "현재 세션" : labels[role] || role}</span></span>`;
}

function roleChangeDrawer() {
  const data = state.drawerData;
  const member = data?.member;
  const isMember = data?.kind === "member";
  if (!member) return "";
  const options = isMember
    ? [
        ...(isRoot() ? [{ value: "company_admin", label: "기업 슈퍼 관리자", description: "회사 운영과 구성원 관리" }] : []),
        { value: "manager", label: "매니저", description: "드롭·코드 운영 및 검수 요청" },
        { value: "editor", label: "에디터", description: "카드·드롭 초안 편집" },
        { value: "viewer", label: "뷰어", description: "읽기 전용" },
      ]
    : [{ value: "fan", label: "팬" }, { value: "artist", label: "아티스트" }, { value: "admin", label: "관리자" }];
  return `${drawerHeader("ACCESS", "역할 변경", `${member.displayName || member.email} 계정의 접근 범위를 변경합니다.`)}<form class="drawer-body form" id="role-change-form"><div class="assignment-member"><span class="person-avatar">${escapeHtml((member.displayName || member.email).slice(0, 1))}</span><div><strong>${escapeHtml(member.displayName || "-")}</strong><small>${escapeHtml(member.email)}</small></div></div><label class="field"><span>새 역할</span>${adminSelect({ id: "role-change-value", name: "role", value: isMember ? member.accessLevel : member.role, label: "새 역할", className: "form-select", options })}</label><p class="hint">권한을 낮추거나 변경하면 해당 계정의 기존 로그인 세션이 종료됩니다.</p><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">역할 저장</button></footer></form>`;
}

function artistProfileReviewDrawer() {
  const profile = state.drawerData?.profile;
  if (!profile) return "";
  const artistOptions = state.catalog.artists.map((artist) => ({
    value: artist.id,
    label: artist.name,
  }));
  const statusOptions = [
    { value: "pending", label: "검수 대기" },
    { value: "verified", label: "승인" },
    { value: "rejected", label: "반려" },
  ];
  return `${drawerHeader("ROOT ACCESS REVIEW", "아티스트 계정·소속 승인", "아티스트 스튜디오 계정의 소속과 접근 상태를 설정합니다.")}<form class="drawer-body form" id="artist-profile-review-form" data-profile-id="${escapeHtml(profile.userId)}"><div class="assignment-member"><span class="person-avatar">${escapeHtml((profile.nickname || profile.email || "아").slice(0, 1))}</span><div><strong>${escapeHtml(profile.nickname || "닉네임 미설정")}</strong><small>${escapeHtml(profile.email)}</small></div></div><label class="field"><span>소속 그룹</span>${adminSelect({ id: "artist-profile-review-artist", name: "artistId", value: profile.artistId, label: "소속 그룹", className: "form-select", options: artistOptions })}</label><label class="field"><span>계정 승인 상태</span>${adminSelect({ id: "artist-profile-review-status", name: "verificationStatus", value: profile.verificationStatus, label: "계정 승인 상태", className: "form-select", options: statusOptions })}</label><p class="hint">승인된 계정만 해당 그룹의 스튜디오 카탈로그와 카드 작업을 사용할 수 있습니다. 카드 검수는 카드 관리 메뉴에서 진행합니다.</p><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">접근 권한 저장</button></footer></form>`;
}

function dropLinkDrawer() {
  const card = state.drawerData?.card;
  if (!card) return "";
  const canLink = can("drops:write") && !isRoot();
  const accessMessage = isRoot()
    ? "이 작업은 기업 담당자 계정에서 진행해 주세요."
    : !can("drops:write")
      ? "드롭 연결 권한이 없습니다."
      : "";
  const scoped = state.drops.filter((drop) => !card.artistId || drop.artistId === card.artistId);
  const options = scoped.length
    ? scoped.map((drop) => ({ value: drop.id, label: `${drop.name} · ${drop.status}` }))
    : [{ value: "", label: "연결 가능한 드롭이 없습니다." }];
  const artists = scopedArtists();
  const artistOptions = artists.map((artist) => ({ value: artist.id, label: artist.name }));
  const selectedArtistId = card.artistId || card.ownerArtistId || artists[0]?.id || "";
  const draftDrops = scoped.filter((drop) => drop.status === "draft");
  const pendingDrops = scoped.filter((drop) => drop.status === "pending_review");
  const lifecycleActions = draftDrops.length && can("drops:submit")
    ? `<div class="inline-actions"><span class="hint">드롭 생성 후 루트 관리자 공개 승인을 요청할 수 있습니다.</span>${draftDrops.map((drop) => `<button class="secondary submit-drop" data-id="${escapeHtml(drop.id)}" type="button">발행 요청</button>`).join("")}</div>`
    : pendingDrops.length && can("drops:write") && !isRoot()
      ? `<div class="inline-actions"><span class="hint">발행 요청을 검토한 뒤 팬앱 공개 여부를 결정합니다.</span>${pendingDrops.map((drop) => `<button class="primary drop-status" data-id="${escapeHtml(drop.id)}" data-status="live" type="button">공개하기</button>`).join("")}</div>`
      : "";
  return `${drawerHeader("DROP READY", "승인 카드 드롭 연결", "승인된 카드를 드롭에 연결해 코드 발행 준비 상태로 전환합니다.")}<div class="drawer-body form"><div class="assignment-member"><span class="card-thumb">${icon("style")}</span><div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.artistId || card.ownerArtistId || "아티스트 미지정")}</small></div></div><form id="drop-link-form" data-card-id="${escapeHtml(card.id)}"><label class="field"><span>연결할 드롭</span>${adminSelect({ id: "drop-link-drop", name: "dropId", value: options[0].value, label: "연결할 드롭", className: "form-select", options })}</label><p class="hint">라이브 드롭에 연결하면 팬앱 공개 카드로 전환되고, 초안 드롭이면 준비 상태로 보관됩니다.</p>${accessMessage ? `<div class="issuance-creation-note blocked">${icon("info")}<span>${escapeHtml(accessMessage)}</span><button class="secondary" type="button" data-view="guide">운영 가이드에서 권한 확인</button></div>` : ""}<footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit" ${scoped.length && canLink ? "" : "disabled"}>드롭 준비됨</button></footer></form>${lifecycleActions}<details class="inline-create-panel"><summary>새 드롭 만들기</summary><form id="drop-form" data-card-id="${escapeHtml(card.id)}"><input class="ops-control" name="name" placeholder="예: 2026 SUMMER 홀로그램 드롭" required />${adminSelect({ id: "drop-link-artist", name: "artistId", value: selectedArtistId, label: "아티스트", className: "form-select", options: artistOptions, required: true })}<label class="field"><span>시작 일시</span><input class="ops-control" name="startsAt" type="datetime-local" data-native-datetime required /></label><label class="field"><span>종료 일시</span><input class="ops-control" name="endsAt" type="datetime-local" data-native-datetime required /></label><button class="primary" type="submit" ${artists.length ? "" : "disabled"}>생성 후 카드 연결</button></form></details></div>`;
}

function memberPasswordDrawer() {
  const member = state.drawerData?.member;
  if (!member) return "";
  return `${drawerHeader("SECURITY", "임시 비밀번호 재발급", `${member.displayName || member.email} 계정의 기존 세션을 종료했습니다.`)}<div class="drawer-body"><div class="security-callout">${icon("verified_user")}<span>새 임시 비밀번호로 한 번 로그인한 뒤, 담당자가 직접 비밀번호를 변경해야 합니다.</span></div>${temporaryCredentialPanel()}<footer class="drawer-footer"><button class="primary close-drawer" type="button">확인</button></footer></div>`;
}

function memberDrawer() {
  const organization = state.selectedOrganization;
  const artists = organization?.artists || [];
  const roleOptions = [
    { value: "manager", label: "매니저", description: "편집 및 검수 요청" },
    { value: "editor", label: "에디터", description: "콘텐츠 편집" },
    { value: "viewer", label: "뷰어", description: "읽기 전용" },
  ];
  return `${drawerHeader("ACCESS", "기업 관리자 추가", `${organization?.name || "파트너"} 운영 담당자 계정을 발급합니다.`)}<div class="drawer-body">${temporaryCredentialPanel()}<form class="form" id="organization-member-form"><label class="field"><span>담당자 이름</span><input name="displayName" placeholder="담당자 이름" required /></label><label class="field"><span>로그인 이메일</span><input name="email" type="email" placeholder="manager@company.com" required /></label><label class="field"><span>권한</span>${adminSelect({ id: "member-access-level", name: "accessLevel", value: "manager", label: "권한", className: "form-select", options: roleOptions })}</label><fieldset class="checkbox-fieldset"><legend>담당 아티스트</legend>${artists.length ? artists.map((artist) => `<label><input type="checkbox" name="artistIds" value="${escapeHtml(artist.id)}"/><span>${escapeHtml(artist.name)}</span></label>`).join("") : `<p class="hint">먼저 파트너의 아티스트를 연결해 주세요.</p>`}</fieldset><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">계정 발급</button></footer></form></div>`;
}

function artistAssignmentDrawer() {
  const member = state.drawerData?.member;
  const assigned = new Set((member?.assignedArtists || []).map((artist) => artist.id));
  const artists = state.selectedOrganization?.artists || [];
  return `${drawerHeader("ARTIST SCOPE", "담당 아티스트 배정", `${member?.displayName || "관리자"} 계정의 운영 범위를 설정합니다.`)}<form class="drawer-body form" id="member-artist-form" data-member-id="${escapeHtml(member?.id || "")}"><div class="assignment-member"><span class="person-avatar">${escapeHtml((member?.displayName || "관").slice(0, 1))}</span><div><strong>${escapeHtml(member?.displayName || "")}</strong><small>${escapeHtml(member?.email || "")}</small></div></div><fieldset class="checkbox-fieldset artist-list-fieldset"><legend>배정할 아티스트</legend>${artists.map((artist) => `<label><input type="checkbox" name="artistIds" value="${escapeHtml(artist.id)}" ${assigned.has(artist.id) ? "checked" : ""}/><span class="artist-avatar small">${escapeHtml(artist.name.slice(0, 1))}</span><span>${escapeHtml(artist.name)}</span></label>`).join("") || `<p class="hint">파트너에 연결된 아티스트가 없습니다.</p>`}</fieldset><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">배정 저장</button></footer></form>`;
}

function cardCreateDrawer() {
  const artists = scopedArtists();
  const members = state.catalog.members || [];
  const organizationScopeOptions = [
    { value: "", label: "현재 조직 범위" },
    ...state.organizations.map((organization) => ({ value: organization.id, label: organization.name })),
  ];
  const artistScopeOptions = [
    { value: "", label: "전체 아티스트" },
    ...artists.map((artist) => ({ value: artist.id, label: artist.name })),
  ];
  const memberScopeOptions = [
    { value: "", label: "멤버 지정 없음" },
    ...members.map((member) => ({ value: member.id, label: member.name, dataArtistId: member.artistId })),
  ];
  const conditionOptions = Object.entries(conditionLabels).map(([value, label]) => ({ value, label }));
  const artistOptions = [{ value: "", label: "아티스트 선택" }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  const memberOptions = [{ value: "", label: "멤버 선택" }, ...members.map((member) => ({ value: member.id, label: member.name, dataArtistId: member.artistId }))];
  const rarityOptions = [
    { value: "N", label: "N · 노멀" },
    { value: "R", label: "R · 레어" },
    { value: "SR", label: "SR · 슈퍼 레어" },
    { value: "Special", label: "Special" },
  ];
  return `${drawerHeader("NEW CARD", "운영 카드 등록", "이미지를 업로드하고 팬에게 보여줄 카드 정보를 입력합니다.")}<form class="drawer-body form" id="admin-card-form"><label class="upload-field"><input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" required /><span>${icon("add_photo_alternate")}</span><strong>카드 이미지 업로드</strong><small>PNG, JPG, WebP · 세로형 이미지를 권장합니다.</small></label><label class="field"><span>카드명</span><input name="name" placeholder="예: 컴백 기념 사인 카드" required /></label><label class="field"><span>시즌</span><input name="seasonName" placeholder="예: 2026 SUMMER" /></label><div class="form-grid"><label class="field"><span>아티스트</span>${adminSelect({ id: "admin-card-artist", name: "artistId", label: "아티스트 선택", options: artistOptions, className: "form-select", required: !isRoot() })}</label><label class="field"><span>멤버</span>${adminSelect({ id: "admin-card-member", name: "memberId", label: "멤버 선택", options: memberOptions, className: "form-select" })}</label></div><div class="form-grid"><label class="field"><span>등급</span>${adminSelect({ id: "admin-card-rarity", name: "rarity", value: "N", label: "등급", options: rarityOptions, className: "form-select", required: true })}</label><label class="field"><span>발행 수량</span><input name="issueLimit" type="number" min="1" placeholder="제한 없음" /></label></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">카드 등록</button></footer></form>`;
}

function rewardOptions(selected = "", filter = () => true) {
  const rewards = (state.engagement.rewards || []).filter(filter);
  return [
    `<option value="">보상 없음</option>`,
    ...rewards.map(
      (reward) =>
        `<option value="${escapeHtml(reward.id)}" ${reward.id === selected ? "selected" : ""}>${escapeHtml(reward.name)} · ${escapeHtml(reward.rewardType || "reward")} · ${reward.artistId ? "아티스트 보상" : "전체 보상"}</option>`,
    ),
  ].join("");
}

const rewardImagePresets = [
  { id: "ticket", label: "퍼플 스타 티켓", src: "./assets/rewards/reward-ticket.png" },
  { id: "vip", label: "VIP 크라운 패스", src: "./assets/rewards/reward-vip.png" },
  { id: "crystal", label: "바이올렛 크리스탈", src: "./assets/rewards/reward-crystal.png" },
  { id: "music", label: "뮤직 티켓", src: "./assets/rewards/reward-music.png" },
];

function resetRewardImageState() {
  if (state.rewardImagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(state.rewardImagePreviewUrl);
  state.rewardImageFile = null;
  state.rewardImagePreviewUrl = "";
}

function rewardPreset(id) {
  return rewardImagePresets.find((preset) => preset.id === id) || rewardImagePresets[0];
}

function rewardImageSource(reward = {}) {
  if (state.rewardImagePreviewUrl) return state.rewardImagePreviewUrl;
  if (reward.metadata?.imageAssetId && reward.id) {
    return `${API_BASE}/admin/engagement/rewards/${encodeURIComponent(reward.id)}/image`;
  }
  return rewardPreset(reward.metadata?.imagePreset || "ticket").src;
}

function rewardDrawer() {
  const reward = state.drawerData?.reward || {};
  const artists = scopedArtists();
  const organizationScopeOptions = [
    { value: "", label: "현재 조직 범위" },
    ...state.organizations.map((organization) => ({ value: organization.id, label: organization.name })),
  ];
  const artistScopeOptions = [
    { value: "", label: "전체 아티스트" },
    ...artists.map((artist) => ({ value: artist.id, label: artist.name })),
  ];
  const imagePreset = reward.metadata?.imagePreset || "ticket";
  const imageSource = rewardImageSource(reward);
  const rewardTypes = [
    { value: "badge", label: "뱃지" },
    { value: "title", label: "칭호" },
    { value: "profile_frame", label: "프로필 프레임" },
    { value: "digital_bonus", label: "디지털 특전" },
  ];
  return `${drawerHeader("", "보상 만들기", "업적과 레벨 패스에서 팬에게 지급할 보상을 등록합니다.")}<form class="drawer-body form reward-editor-form" id="reward-form">
    <section class="reward-image-section"><h3>보상 이미지</h3><div class="reward-image-picker"><div class="reward-image-preview"><img id="reward-image-preview" src="${escapeHtml(imageSource)}" alt="선택한 보상 이미지 미리보기" /></div><div class="reward-image-actions"><button class="primary" id="reward-image-upload-button" type="button">${icon("upload")} 이미지 업로드</button><button class="secondary" id="reward-media-library-button" type="button" aria-controls="reward-image-presets">${icon("collections")} 기본 이미지 선택</button><small>직접 업로드하거나 아래 기본 이미지 4종에서 선택<br />권장 512 × 512px · PNG, JPG, WEBP</small><input id="reward-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden /></div></div>
      <input id="reward-image-preset" name="imagePreset" type="hidden" value="${escapeHtml(imagePreset)}" />
      <div class="reward-image-presets" id="reward-image-presets" role="list" aria-label="보상 이미지 라이브러리">${rewardImagePresets.map((preset) => `<button class="reward-image-preset ${imagePreset === preset.id && !state.rewardImagePreviewUrl ? "selected" : ""}" type="button" data-reward-image-preset="${preset.id}" aria-label="${escapeHtml(preset.label)}"><img src="${preset.src}" alt="" />${imagePreset === preset.id && !state.rewardImagePreviewUrl ? `<span>${icon("check")}</span>` : ""}</button>`).join("")}</div>
    </section>
    <label class="field"><span>보상 이름</span><input name="name" value="${escapeHtml(reward.name || "")}" placeholder="예: NOVA 첫 수집가" required /></label>
    <label class="field"><span>보상 종류</span>${adminSelect({ id: "reward-type", name: "rewardType", value: reward.rewardType || "badge", label: "보상 종류", className: "form-select", options: rewardTypes })}<small class="field-help">포인트·카드팩은 미션 보상 또는 상점 상품에서 운영합니다.</small></label>
    ${isRoot() ? `<label class="field"><span>조직</span>${adminSelect({ id: "reward-organization", name: "organizationId", value: reward.organizationId || "", label: "조직", className: "form-select", options: organizationScopeOptions })}<small>아티스트 범위 보상은 해당 조직과 함께 지정해야 합니다.</small></label>` : `<input name="organizationId" type="hidden" value="${escapeHtml(reward.organizationId || state.adminContext?.organizationId || "")}" />`}
    <label class="field"><span>아티스트</span>${adminSelect({ id: "reward-artist", name: "artistId", value: reward.artistId || "", label: "아티스트", className: "form-select", options: artistScopeOptions })}</label>
    <label class="field"><span>표시 라벨</span><input name="label" value="${escapeHtml(reward.metadata?.label || "")}" placeholder="팬 프로필에 표시할 라벨" /></label>
    <label class="field"><span>보상 설명</span><textarea name="description" maxlength="500" placeholder="팬이 보상 카드를 눌렀을 때 표시할 설명">${escapeHtml(reward.metadata?.description || "")}</textarea></label>
    <section class="reward-live-preview"><h3>미리보기</h3><div><span class="reward-live-preview-image"><img id="reward-card-preview-image" src="${escapeHtml(imageSource)}" alt="" /></span><span><strong id="reward-card-preview-name">${escapeHtml(reward.name || "보상 이름")}</strong><small id="reward-card-preview-label">${escapeHtml(reward.metadata?.label || "팬앱 표시 라벨")}</small></span><em id="reward-card-preview-type">${escapeHtml(rewardTypes.find((type) => type.value === (reward.rewardType || "badge"))?.label || "뱃지")}</em><b>팬 앱 표시 예시 ${icon("info")}</b><i aria-hidden="true">›</i></div></section>
    <div id="reward-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">보상 저장</button></footer></form>`;
}

function organizationOptions(selected = "") {
  return [
    `<option value="">현재 조직 범위</option>`,
    ...state.organizations.map(
      (organization) =>
        `<option value="${escapeHtml(organization.id)}" ${organization.id === selected ? "selected" : ""}>${escapeHtml(organization.name)}</option>`,
    ),
  ].join("");
}

function achievementDrawer() {
  const achievement = state.drawerData?.achievement || {};
  const selectedCondition = achievement.conditionType || "first_card";
  const payload = achievement.conditionPayload || {};
  const visibleFields = new Set(conditionFields[selectedCondition] || []);
  const artists = scopedArtists();
  const members = state.catalog.members || [];
  const cardOptions = cardCatalogItems().map((card) => ({ value: card.id, label: card.name }));
  const campaignOptions = state.campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }));
  const dropOptions = state.drops.map((drop) => ({ value: drop.id, label: drop.name }));
  const dateError = `<small id="achievement-date-error" class="field-error" hidden>업적 종료 시각은 시작 시각 이후로 선택해 주세요.</small>`;
  const approvalAction = canApproveFanGrowth() && achievement.id
    ? `<button class="primary fan-growth-transition" type="button" data-kind="achievement" data-action="approve" data-id="${escapeHtml(achievement.id)}">업적 공개 승인</button>`
    : "";
  const rewardChoices = (state.engagement.rewards || []).map((reward) => ({ value: reward.id, label: reward.name, description: reward.rewardType || "보상" }));
  return `${drawerHeader("FAN GROWTH", "업적 템플릿", "조직·아티스트·멤버 범위와 서버 조건 템플릿으로 업적을 운영합니다.")}<form class="drawer-body form" id="achievement-form" data-id="${escapeHtml(achievement.id || "")}"><label class="field"><span>업적 이름</span><input name="title" value="${escapeHtml(achievement.title || "")}" placeholder="예: 첫 공식 카드 수집" required /></label><label class="field"><span>설명</span><textarea name="description" maxlength="500" placeholder="팬에게 표시되는 달성 설명">${escapeHtml(achievement.description || "")}</textarea></label><section class="scope-fields"><p class="eyebrow">범위</p><label class="field"><span>조직</span>${adminSelect({ id: "achievement-organization", name: "organizationId", value: achievement.organizationId || "", label: "조직", className: "form-select", options: organizationScopeOptions })}</label><div class="form-grid"><label class="field"><span>아티스트</span>${adminSelect({ id: "achievement-artist", name: "artistId", value: achievement.artistId || "", label: "아티스트", className: "form-select", options: artistScopeOptions })}</label><label class="field"><span>멤버</span>${adminSelect({ id: "achievement-member", name: "memberId", value: achievement.memberId || "", label: "멤버", className: "form-select", options: memberScopeOptions })}</label></div></section><section class="condition-template-fields"><p class="eyebrow">조건 템플릿</p><label class="field"><span>조건</span>${adminSelect({ id: "achievement-condition", name: "conditionType", value: selectedCondition, label: "조건", className: "form-select", options: conditionOptions })}</label>${visibleFields.has("targetValue") ? `<label class="field"><span>목표 수치</span><input name="targetValue" type="number" min="1" value="${Number(achievement.targetValue || 1)}" required /></label>` : `<input type="hidden" name="targetValue" value="${Number(achievement.targetValue || 1)}" />`}${visibleFields.has("cardId") ? `<label class="field"><span>특정 카드</span>${adminSelect({ id: "achievement-card", name: "cardId", value: payload.cardId || "", label: "카드 선택", className: "form-select", options: [{ value: "", label: "카드 선택" }, ...cardOptions] })}</label>` : ""}${visibleFields.has("campaignId") ? `<label class="field"><span>세트 캠페인</span>${adminSelect({ id: "achievement-campaign", name: "campaignId", value: payload.campaignId || "", label: "캠페인 선택", className: "form-select", options: [{ value: "", label: "캠페인 선택" }, ...campaignOptions] })}</label>` : ""}${visibleFields.has("dropId") ? `<label class="field"><span>드롭</span>${adminSelect({ id: "achievement-drop", name: "dropId", value: payload.dropId || "", label: "드롭 선택", className: "form-select", options: [{ value: "", label: "드롭 선택" }, ...dropOptions] })}</label>` : ""}</section><section class="reward-preview"><p class="eyebrow">XP · 보상 · 기간</p><div class="form-grid"><label class="field"><span>XP 보상 선택</span>${adminMultiSelect({ id: "achievement-rewards", name: "rewardIds", values: achievement.rewardIds || [], label: "업적 보상", className: "form-multi-select", options: rewardChoices })}</label></div><div class="form-grid"><label class="field"><span>기간 시작</span><input name="startsAt" type="datetime-local" value="${toLocalInputDateTime(achievement.startsAt)}" /></label><label class="field"><span>기간 종료</span><input name="endsAt" type="datetime-local" value="${toLocalInputDateTime(achievement.endsAt)}" />${dateError}</label></div></section><div id="achievement-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button>${canManageFanGrowth() ? `<button class="secondary" type="submit" data-save-mode="draft">임시 저장</button>${achievement.id ? `<button class="secondary fan-growth-transition" type="button" data-kind="achievement" data-action="submit" data-id="${escapeHtml(achievement.id)}">검수 요청</button>` : ""}` : ""}${approvalAction}</footer></form>`;
}

function missionDrawer() {
  const mission = state.drawerData?.mission || {};
  const artists = scopedArtists();
  const organizationScopeOptions = [
    { value: "", label: "현재 조직 범위" },
    ...state.organizations.map((organization) => ({ value: organization.id, label: organization.name })),
  ];
  const artistScopeOptions = [
    { value: "", label: "전체 아티스트" },
    ...artists.map((artist) => ({ value: artist.id, label: artist.name })),
  ];
  const recurrence = [
    { value: "once", label: "1회" },
    { value: "daily", label: "매일" },
    { value: "weekly", label: "매주" },
    { value: "season", label: "시즌" },
  ];
  const eventKinds = [
    { value: "event_commented", label: "이벤트 댓글" },
    { value: "card_redeemed", label: "카드 등록" },
    { value: "card_pack_opened", label: "카드팩 개봉" },
    { value: "event_joined", label: "이벤트 참여" },
    { value: "collection_goal_completed", label: "컬렉션 완성" },
  ];
  const reward = mission.rewardPayload || {};
  const approvalAction = canApproveFanGrowth() && mission.id && mission.status === "pending_review"
    ? `<button class="primary fan-growth-transition" type="button" data-kind="mission" data-action="approve" data-id="${escapeHtml(mission.id)}">공개 승인</button>`
    : "";
  return `${drawerHeader("FAN GROWTH", mission.id ? "미션 편집" : "미션 만들기", "팬 행동 이벤트와 XP·포인트 보상을 하나의 운영 규칙으로 관리합니다.")}<form class="drawer-body form" id="mission-form" data-id="${escapeHtml(mission.id || "")}"><label class="field"><span>미션 이름</span><input name="title" value="${escapeHtml(mission.title || "")}" placeholder="예: 이벤트 댓글로 응원하기" required /></label><label class="field"><span>설명</span><textarea name="description" maxlength="500" placeholder="팬에게 표시할 미션 설명">${escapeHtml(mission.description || "")}</textarea></label><section class="scope-fields"><p class="eyebrow">범위</p><label class="field"><span>조직</span>${adminSelect({ id: "mission-organization", name: "organizationId", value: mission.organizationId || "", label: "조직", className: "form-select", options: organizationScopeOptions })}</label><label class="field"><span>아티스트</span>${adminSelect({ id: "mission-artist", name: "artistId", value: mission.artistId || "", label: "아티스트", className: "form-select", options: artistScopeOptions })}</label></section><div class="form-grid"><label class="field"><span>행동 이벤트</span>${adminSelect({ id: "mission-event-kind", name: "eventKind", value: mission.eventKind || "event_commented", label: "행동 이벤트", className: "form-select", options: eventKinds })}</label><label class="field"><span>반복 주기</span>${adminSelect({ id: "mission-recurrence", name: "recurrence", value: mission.recurrence || "once", label: "반복 주기", className: "form-select", options: recurrence })}</label></div><div class="form-grid"><label class="field"><span>목표 횟수</span><input name="targetValue" type="number" min="1" value="${Number(mission.targetValue || 1)}" required /></label><label class="field"><span>XP 보상</span><input name="xp" type="number" min="0" value="${Number(reward.xp || 0)}" /></label></div><div class="form-grid"><label class="field"><span>포인트 보상</span><input name="points" type="number" min="0" value="${Number(reward.points || 0)}" /></label><label class="field"><span>카드 보상 ID (선택)</span><input name="rewardId" value="${escapeHtml(reward.rewardId || "")}" placeholder="reward_..." /></label></div><div id="mission-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button>${canManageFanGrowth() ? `<button class="primary" type="submit">저장</button>${mission.id && mission.status === "draft" ? `<button class="secondary fan-growth-transition" type="button" data-kind="mission" data-action="submit" data-id="${escapeHtml(mission.id)}">검수 요청</button>` : ""}` : ""}${approvalAction}</footer></form>`;
}

function fanPassDrawer() {
  const season = state.drawerData?.season || {};
  const isGlobalPass = isRoot() && (season.scopeType === "global" || (season.id && !season.organizationId && !season.artistId));
  const passRewardFilter = isGlobalPass
    ? (reward) => !reward.organizationId && !reward.artistId
    : () => true;
  const passRewardOptions = [
    { value: "", label: "보상 없음" },
    ...(state.engagement.rewards || []).filter(passRewardFilter).map((reward) => ({
      value: reward.id,
      label: `${reward.name} · ${reward.rewardType || "reward"} · ${reward.artistId ? "아티스트 보상" : "전체 보상"}`,
    })),
  ];
  const organizationScopeOptions = [
    { value: "", label: "현재 조직 범위" },
    ...state.organizations.map((organization) => ({ value: organization.id, label: organization.name })),
  ];
  const artistScopeOptions = [
    { value: "", label: isGlobalPass ? "전체 서비스 · 글로벌 팬 레벨" : "담당 아티스트 선택" },
    ...scopedArtists().map((artist) => ({ value: artist.id, label: artist.name })),
  ];
  const tierCount = Math.max(3, Math.min(maxFanPassTiers, (season.tiers || []).length || 3));
  const presetOptions = fanPassPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("");
  const tiers = Array.from({ length: tierCount }, (_, index) => {
    const tier = (season.tiers || [])[index] || { tier: index + 1, requiredXp: "", rewardId: "", premiumRewardId: "" };
    return `<article class="pass-tier-row"><span class="pass-tier-handle">${icon("drag_indicator")}</span><div class="pass-tier-heading"><strong>Lv.${index + 1}</strong><span class="pass-tier-visibility">${icon("lock_open")} 공개</span></div><button class="icon-button pass-tier-menu" type="button" aria-label="Lv.${index + 1} 옵션">${icon("more_horiz")}</button><label class="field"><span>필요 경험치 (XP)</span><input name="tierXp" type="number" min="0" value="${tier.requiredXp ?? ""}" placeholder="${index * 100}" /></label><label class="field"><span>무료 보상</span>${adminSelect({ id: `pass-tier-free-${index}`, name: "tierReward", value: tier.rewardId || "", label: "무료 보상", className: "form-select", options: passRewardOptions })}</label><label class="field"><span>프리미엄 보상</span>${adminSelect({ id: `pass-tier-premium-${index}`, name: "tierPremiumReward", value: tier.premiumRewardId || "", label: "프리미엄 보상", className: "form-select", options: passRewardOptions })}</label></article>`;
  }).join("");
  const approvalAction = canApproveFanGrowth() && season.id && season.status === "pending_review"
    ? `<button class="primary fan-growth-transition" type="button" data-kind="pass" data-action="approve" data-id="${escapeHtml(season.id)}">패스 공개 승인</button>`
    : "";
  const published = season.status === "published";
  return `${drawerHeader("", season.id ? "레벨 패스 편집" : "레벨 패스 등록", isGlobalPass ? "전체 팬에게 공통으로 제공되는 레벨과 보상을 설정합니다." : "아티스트별 시즌과 경험치 구간 보상을 설정합니다.")}<form class="drawer-body form fan-pass-editor-form" id="fan-pass-form" data-id="${escapeHtml(season.id || "")}"><section class="fan-pass-form-section"><h3>기본 정보</h3><label class="field"><span>패스 이름</span><input name="title" value="${escapeHtml(season.title || "")}" placeholder="예: 드림스케이프 레벨 패스" required /></label><label class="field"><span>설명</span><textarea name="description" maxlength="500" placeholder="팬에게 표시할 시즌 설명">${escapeHtml(season.description || "")}</textarea><small class="field-counter">${String(season.description || "").length} / 500</small></label>${isRoot() ? `<div class="form-grid"><label class="field"><span>조직</span>${adminSelect({ id: "fan-pass-organization", name: "organizationId", value: season.organizationId || "", label: "조직", className: "form-select", options: organizationScopeOptions })}</label><label class="field"><span>아티스트</span>${adminSelect({ id: "fan-pass-artist", name: "artistId", value: season.artistId || "", label: "아티스트", className: "form-select", options: artistScopeOptions, required: !isGlobalPass })}</label></div>` : `<input type="hidden" name="organizationId" value="${escapeHtml(season.organizationId || state.adminContext?.organizationId || "")}"/><label class="field"><span>아티스트</span>${adminSelect({ id: "fan-pass-artist", name: "artistId", value: season.artistId || "", label: "아티스트", className: "form-select", options: artistScopeOptions, required: true })}</label>`}<div class="form-grid"><label class="field"><span>시즌 시작</span><input name="startsAt" type="datetime-local" value="${toLocalInputDateTime(season.startsAt)}" /></label><label class="field"><span>시즌 종료</span><input name="endsAt" type="datetime-local" value="${toLocalInputDateTime(season.endsAt)}" /><small id="fan-pass-date-error" class="field-error" hidden>패스 종료 시각은 시작 시각 이후로 선택해 주세요.</small></label></div><div class="form-grid"><label class="field toggle-field"><span>프리미엄 패스</span><input name="premiumEnabled" type="checkbox" ${season.premiumEnabled ? "checked" : ""} /><small>구매한 팬에게 오른쪽 프리미엄 보상 라인을 공개합니다.</small></label><label class="field"><span>프리미엄 가격 (P)</span><input name="premiumPricePoints" type="number" min="1" value="${season.premiumPricePoints ?? ""}" placeholder="1200" /></label></div></section><section class="fan-pass-form-section"><div class="fan-pass-section-heading"><h3>티어 마일스톤</h3><button class="secondary" id="add-pass-tier" type="button">${icon("add")} 티어 추가</button></div>${isGlobalPass ? `<p class="hint fan-pass-scope-hint">전체 팬 레벨에는 전체 보상만 연결할 수 있습니다. 아티스트 전용 보상은 목록에서 제외됩니다.</p>` : ""}<div class="pass-tier-list">${tiers}</div></section><section class="fan-pass-preview-grid"><article><strong>팬앱 미리보기</strong><button class="secondary" type="button">미리보기 열기 ${icon("open_in_new")}</button><p><b>예상 표시:</b> Lv.1 ~ Lv.${tierCount}</p><small>팬앱에서 보이는 레벨 진행과 보상 구성을 확인할 수 있습니다.</small></article><article><strong>공개 상태</strong><span class="badge ${published ? "success-badge" : season.status === "pending_review" ? "warning-badge" : "draft"}">${escapeHtml(fanGrowthStatusLabel(season.status || "draft"))}</span><small>${published ? "현재 팬에게 공개 중입니다." : "저장 후 검수 요청할 수 있습니다."}</small></article></section><div id="fan-pass-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button>${canManageFanGrowth() ? `<button class="primary" type="submit">저장</button>` : ""}${season.id && season.status === "draft" && canManageFanGrowth() ? `<button class="secondary fan-growth-transition" type="button" data-kind="pass" data-action="submit" data-id="${escapeHtml(season.id)}">검수 요청</button>` : ""}${approvalAction}</footer></form>`;
}

function cardsView() {
  const artists = scopedArtists();
  const artistOptions = [
    { value: "all", label: "모든 아티스트" },
    ...artists.map((artist) => ({ value: artist.id, label: artist.name })),
  ];
  const statusOptions = [
    { value: "all", label: "모든 상태" },
    { value: "published", label: "공개됨" },
    { value: "draft", label: "초안" },
    { value: "pending_review", label: "검수 중" },
    { value: "pending_partner_review", label: "회사 검수 대기" },
    { value: "pending_platform_review", label: "플랫폼 검수 대기" },
    { value: "approved", label: "공개 승인" },
    { value: "drop_ready", label: "드롭 준비됨" },
    { value: "changes_requested", label: "수정 요청" },
  ];
  const visible = state.cards || [];
  const emptyDetail = `<section class="panel review-detail-panel empty-detail">${icon("rate_review")}<strong>검수할 카드를 선택하세요</strong><small>대기열이나 카드 목록에서 항목을 열면 제출 스냅샷과 승인·반려 컨트롤이 표시됩니다.</small></section>`;
  const reviewDetail = reviewPanel() || emptyDetail;
  return `<div class="commercial-review-workspace"><div class="review-commandbar"><div><nav class="review-breadcrumb" aria-label="카드 > 검수"><span>카드</span><span aria-hidden="true">&gt;</span><strong>검수</strong></nav><h2>${isRoot() ? "전체 카드 운영" : "담당 카드 운영"}</h2><p>${isRoot() ? "아티스트 카드의 검수와 공개 상태를 관리합니다." : "배정된 아티스트의 카드 초안을 만들고 검수를 요청합니다."}</p></div><div class="review-command-actions"><button class="secondary" id="export-cards-csv" type="button">${icon("download")} CSV 내보내기</button>${can("cards:write") ? `<button class="primary review-register-cta" id="open-card-drawer" type="button">${icon("add_card")} 카드 등록</button>` : ""}</div></div>${reviewStatusTabs()}<div class="review-workbench"><section class="panel review-list-panel"><div class="review-list-heading"><div><p class="eyebrow">RELEASE REVIEW</p><h3>검수 대기열</h3></div><span>${state.cardPagination?.total ?? visible.length}개 항목</span></div><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="card-search" placeholder="카드명, 아티스트 검색" value="${escapeHtml(state.query)}" /></label>${adminSelect({ id: "card-artist-filter", value: state.cardArtist, label: "아티스트 필터", className: "filter-select card-artist-filter", options: artistOptions })}${adminSelect({ id: "card-status", value: state.status, label: "카드 상태 필터", className: "filter-select card-status-filter", options: statusOptions })}</div><div class="table-wrap"><table class="table responsive-table card-table"><thead><tr><th>카드</th><th>메타데이터</th><th>마감</th><th>담당자</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${cardRows(visible)}</tbody></table></div>${tablePagination("cardPage", state.cardPagination?.page ?? state.cardPage, state.cardPagination?.total ?? visible.length, state.cardPagination?.pageSize ?? 10)}</section>${reviewDetail}</div>${contentCalendarPanel()}</div>`;
}

function legacyContentCalendarPanel() {
  const cards = cardCatalogItems();
  const entries = state.contentCalendar || [];
  const label = (entry) => `${entry.contentType || "card"} · ${entry.contentId || ""}`;
  const statusOptions = [
    { value: "scheduled", label: "예정" },
    { value: "live", label: "진행 중" },
    { value: "completed", label: "완료" },
    { value: "cancelled", label: "취소" },
  ];
  const rows = entries.length
    ? entries.map((entry) => `<li class="content-calendar-row"><div><strong>${escapeHtml(entry.title || label(entry))}</strong><small>${escapeHtml(label(entry))} · ${formatDate(entry.startsAt)} ~ ${formatDate(entry.endsAt)}</small></div>${adminSelect({ id: `calendar-status-${entry.id}`, value: entry.status || "scheduled", label: `${entry.title || "공개 일정"} 상태`, className: "calendar-status-select", dataCalendarStatus: entry.id, options: statusOptions })}</li>`).join("")
    : `<li class="empty">등록된 공개 일정이 없습니다. 첫 공개 일정을 추가해 보세요.</li>`;
  return `<section class="panel content-calendar-panel"><div class="panel-heading"><div><p class="eyebrow">CONTENT OPERATIONS</p><h3>공개 일정</h3><span>카드 운영 화면에서 카드·이벤트·상품의 공개 일정을 함께 관리합니다.</span></div><button class="secondary" id="refresh-content-calendar" type="button">${state.contentCalendarLoading ? "불러오는 중..." : "새로고침"}</button></div>${state.contentCalendarMessage ? `<div class="notice ${state.contentCalendarMessage.startsWith("실패") ? "error" : ""}">${escapeHtml(state.contentCalendarMessage)}</div>` : ""}<div class="content-calendar-layout"><ol class="content-calendar-list">${rows}</ol>${can("cards:write") ? `<form id="content-calendar-form" class="content-calendar-form"><label class="field"><span>콘텐츠 유형</span><select name="contentType"><option value="card">카드</option><option value="event">이벤트</option><option value="product">상품</option></select></label><label class="field"><span>콘텐츠 ID</span><select name="contentId" required><option value="">콘텐츠 선택</option>${cards.map((card) => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name || card.id)}</option>`).join("")}</select></label><label class="field"><span>일정 이름</span><input name="title" required maxlength="120" placeholder="예: DREAMSCAPE 1차 공개" /></label><div class="form-grid"><label class="field"><span>시작</span><input name="startsAt" type="datetime-local" required /></label><label class="field"><span>종료</span><input name="endsAt" type="datetime-local" required /></label></div><label class="field"><span>운영 메모</span><textarea name="notes" maxlength="500" placeholder="노출 위치·담당자·공지 메모"></textarea></label><button class="primary" type="submit">일정 추가</button></form>` : ""}</div></section>`;
}

function contentCalendarPanel() {
  const type = state.contentCalendarDraftType || "card";
  const targets = {
    card: cardCatalogItems().map((item) => ({ value: item.id, label: item.name || item.id })),
    event: (state.events || []).map((item) => ({ value: item.id, label: item.title || item.name || item.id })),
    product: (state.shopProducts || []).map((item) => ({ value: item.id, label: item.name || item.title || item.id })),
  };
  const typeOptions = [
    { value: "card", label: "카드" },
    { value: "event", label: "이벤트" },
    { value: "product", label: "상품" },
  ];
  const targetOptions = [{ value: "", label: targets[type].length ? "콘텐츠 선택" : "등록된 콘텐츠 없음" }, ...targets[type]];
  const markup = legacyContentCalendarPanel();
  return markup
    .replace(
      /<label class="field"><span>콘텐츠 유형<\/span><select name="contentType">[\s\S]*?<\/select><\/label>/,
      `<label class="field"><span>콘텐츠 유형</span>${adminSelect({ id: "content-calendar-type", name: "contentType", value: type, label: "콘텐츠 유형", className: "content-calendar-type-select", dataCalendarContentType: "true", options: typeOptions })}</label>`,
    )
    .replace(
      /<label class="field"><span>콘텐츠 ID<\/span><select name="contentId" required>[\s\S]*?<\/select><\/label>/,
      `<label class="field"><span>콘텐츠 ID</span>${adminSelect({ id: "content-calendar-id", name: "contentId", value: "", label: "콘텐츠 ID", className: "content-calendar-id-select", required: true, options: targetOptions })}</label>`,
    );
}

function shopProductStatusLabel(status) {
  return ({ published: "공개됨", draft: "초안", archived: "보관됨" }[status] || status || "-");
}

function shopProductTypeLabel(type) {
  return ({ card_pack: "카드팩", reward: "보상", membership: "멤버십" }[type] || "상품");
}

function pointChargePackagesView() {
  const packages = state.pointChargePackages || [];
  const packageRows = packages.length
    ? packages.map((item) => `<tr><td data-label="상품"><label class="point-package-product-field"><span>표시명</span><input class="point-package-inline point-package-label" name="label" value="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)} 표시명" /></label><small class="point-package-id">${escapeHtml(item.id)}</small></td><td data-label="포인트"><label class="point-package-number-field"><span>지급 포인트</span><input class="point-package-inline" name="points" type="number" min="1" value="${Number(item.points)}" aria-label="${escapeHtml(item.label)} 포인트" /></label></td><td data-label="가격"><label class="point-package-number-field"><span>판매가</span><input class="point-package-inline" name="priceWon" type="number" min="1" value="${Number(item.priceWon)}" aria-label="${escapeHtml(item.label)} 가격" /></label></td><td data-label="상태·예약"><div class="point-package-state"><span class="badge ${item.status === "active" ? "success-badge" : "draft"}">${item.status === "active" ? "판매 중" : "판매 중지"}</span><label class="point-package-schedule-field"><span>예약 공개</span><input class="point-package-inline point-package-schedule" name="scheduledPublishAt" type="datetime-local" value="${escapeHtml(toLocalInputDateTime(item.scheduledPublishAt))}" aria-label="${escapeHtml(item.label)} 예약 공개 시각" /></label></div></td><td data-label="관리"><div class="point-package-actions"><button class="primary point-package-save" type="button" data-point-package-id="${escapeHtml(item.id)}">저장</button><button class="secondary point-package-toggle" type="button" data-point-package-id="${escapeHtml(item.id)}" data-point-package-status="${item.status === "active" ? "inactive" : "active"}">${item.status === "active" ? "판매 중지" : "판매 재개"}</button></div></td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">등록된 포인트 상품이 없습니다.</td></tr>`;
  const charges = state.pointCharges || [];
  const chargeRows = charges.length
    ? charges.map((item) => `<tr><td><strong>${escapeHtml(item.userEmail || item.userId)}</strong><small>${escapeHtml(item.id)}</small></td><td>${Number(item.points).toLocaleString()}P</td><td>${Number(item.priceWon).toLocaleString()}원</td><td>${escapeHtml(item.paymentMethod)}</td><td><span class="badge ${item.status === "completed" ? "success-badge" : item.status === "refunded" ? "draft" : "danger-badge"}">${item.status === "completed" ? "완료" : item.status === "refunded" ? "환불" : escapeHtml(item.status)}</span></td><td>${formatDateTime(item.createdAt)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">충전 내역이 없습니다.</td></tr>`;
  return `<div class="card-operations-page"><div class="page-heading"><div><p class="eyebrow">POINT ECONOMY / CONTROL ROOM</p><h2>포인트 상품·충전 관제</h2><p>팬앱 충전 패키지의 가격·예약 공개·판매 상태를 관리하고 최근 충전·환불 내역을 확인합니다.</p></div></div><section class="panel point-charge-catalog-panel"><div class="panel-heading"><div><h3>충전 상품</h3><span>예약 시각 전에는 팬앱에 노출되지 않으며 변경 사항은 다음 카탈로그 조회부터 반영됩니다.</span></div><button class="secondary" id="refresh-point-charge-packages" type="button">새로고침</button></div><form id="point-package-form" class="point-package-create-grid ops-form"><label class="field"><span>상품 ID</span><input name="id" class="ops-control" placeholder="예: points_500" pattern="[a-z0-9_]+" required /></label><label class="field"><span>표시명</span><input name="label" class="ops-control" placeholder="예: 500P" required /></label><label class="field"><span>포인트</span><input name="points" class="ops-control" type="number" min="1" placeholder="500" required /></label><label class="field"><span>가격(원)</span><input name="priceWon" class="ops-control" type="number" min="1" placeholder="5000" required /></label><label class="field"><span>예약 공개</span><input name="scheduledPublishAt" class="ops-control" type="datetime-local" aria-label="예약 공개 시각" /></label><button class="primary" type="submit">상품 추가</button></form><div class="table-wrap"><table class="table responsive-table point-package-table"><thead><tr><th>상품</th><th>포인트</th><th>가격</th><th>상태·예약</th><th>관리</th></tr></thead><tbody>${packageRows}</tbody></table></div></section><section class="panel"><div class="panel-heading"><div><h3>최근 충전·환불 내역</h3><span>결제 승인·원장 반영·환불 상태를 확인합니다.</span></div><button class="secondary" id="refresh-point-charges" type="button">새로고침</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>팬</th><th>포인트</th><th>금액</th><th>결제수단</th><th>상태</th><th>시각</th></tr></thead><tbody>${chargeRows}</tbody></table></div></section></div>`;
}

function shopProductsView() {
  const products = state.shopProducts || [];
  const artistName = (id) => scopedArtists().find((artist) => artist.id === id)?.name || id || "-";
  const rows = products.length
    ? products.map((product) => `<tr class="shop-product-select-row" data-shop-product-row-id="${escapeHtml(product.id)}" tabindex="0"><td data-label="상품"><button class="shop-product-summary shop-product-open" type="button" data-shop-product-id="${escapeHtml(product.id)}"><span class="shop-product-icon">${icon(product.productType === "card_pack" ? "inventory_2" : "redeem")}</span><span><strong>${escapeHtml(product.name)}</strong><small><b>${escapeHtml(shopProductTypeLabel(product.productType))}</b>${product.cardPackId ? ` · ${escapeHtml(product.cardPackId)}` : ""}</small></span></button></td><td data-label="아티스트">${escapeHtml(artistName(product.artistId))}</td><td data-label="가격"><strong>${Number(product.pricePoints || 0).toLocaleString()}P</strong></td><td data-label="상태"><span class="badge ${product.status === "published" ? "success-badge" : product.status === "archived" ? "draft" : "warning-badge"}">${escapeHtml(shopProductStatusLabel(product.status))}</span></td><td data-label="관리"><div class="shop-product-manage">${product.status === "draft" && can("cards:write") ? `<button class="secondary shop-product-publish" type="button" data-shop-product-id="${escapeHtml(product.id)}">공개</button>` : ""}<button class="icon-button shop-product-open" type="button" data-shop-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.name)} 상세 보기">${icon("chevron_right")}</button></div></td></tr>`).join("")
    : '<tr><td colspan="5" class="empty">등록된 상점 상품이 없습니다.</td></tr>';
  return `<div class="card-operations-page"><div class="page-heading with-actions"><div><p class="eyebrow">SHOP CATALOG</p><h2>상점 상품 관리</h2><p>팬앱 상점에 노출할 카드팩 상품을 등록하고 공개 상태를 관리합니다.</p></div>${can("cards:write") ? `<button class="primary" id="open-shop-product-create" type="button">${icon("add")} 상품 등록</button>` : ""}</div><section class="panel shop-product-catalog-panel"><div class="notice">상품은 카드팩과 연결되어야 팬앱에서 구매할 수 있습니다. 초안은 팬앱에 노출되지 않습니다.</div><div class="table-wrap"><table class="table responsive-table shop-product-table"><thead><tr><th>상품</th><th>아티스트</th><th>가격</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div><footer class="preview-table-footer"><strong>총 ${products.length}개</strong></footer></section></div>`;
}

function shopProductEditorDraft() {
  return state.shopProductDraft || {
    name: "Nebula Ver. 카드팩",
    artistId: scopedArtists()[0]?.id || "",
    productType: "card_pack",
    cardPackId: state.cardPacks.find((pack) => pack.status === "published")?.id || "",
    rewardId: "",
    imageUrl: "",
    pricePoints: "1200",
    description: "DREAMSCAPE의 새로운 비주얼과 이야기를 담은 카드팩입니다.",
  };
}

function shopProductContentBlocks() {
  return state.shopProductBlocks?.length
    ? state.shopProductBlocks.map((block) => ({ type: "text", imageUrl: "", alt: "", ...block }))
    : [{ key: "intro", type: "text", title: "상품 소개", body: "", imageUrl: "", alt: "" }];
}

async function loadShopProductDetail(productId) {
  try {
    const result = await api(`/admin/shop/products/${encodeURIComponent(productId)}`);
    const product = result.data;
    state.shopProductDraft = product;
    state.shopProductBlocks = Array.isArray(product.detailContent) && product.detailContent.length
      ? product.detailContent
      : [{ key: "intro", type: "text", title: "상품 소개", body: product.description || "", imageUrl: "", alt: "" }];
    state.view = "shop-product-create";
    layout();
  } catch (error) {
    toast(error?.message || "상점 상품 상세를 불러오지 못했습니다.");
  }
}

function shopProductBlockEditor(block, index) {
  const typeLabel = block.type === "image" ? "이미지" : "텍스트";
  return `<article class="shop-product-block-row" data-shop-content-block="${escapeHtml(block.key)}"><span class="shop-product-block-drag">${icon("drag_indicator")}</span><div class="shop-product-block-copy"><strong>${escapeHtml(block.title)}</strong><small>${typeLabel} · 팬앱 상품 상세에 표시되는 콘텐츠 블록</small></div><button class="icon-button shop-product-block-edit" type="button" data-shop-block-edit="${escapeHtml(block.key)}" aria-label="${escapeHtml(block.title)} 편집">${icon("edit")}</button><button class="icon-button danger-button shop-product-block-remove" type="button" data-shop-block-remove="${escapeHtml(block.key)}" aria-label="${escapeHtml(block.title)} 삭제" ${index === 0 ? "disabled" : ""}>${icon("delete")}</button></article>`;
}

function shopProductPreview(draft, blocks) {
  const pack = state.cardPacks.find((item) => item.id === draft.cardPackId);
  const artist = scopedArtists().find((item) => item.id === draft.artistId);
  const imageUrl = draft.imageUrl || pack?.imageUrl || "";
  const image = imageUrl
    ? `<img src="${escapeHtml(resolveAdminAssetUrl(imageUrl))}" alt="${escapeHtml(draft.name || "상품 이미지")}" />`
    : `<div class="shop-product-preview-image-placeholder">${icon("inventory_2")}<span>상품 이미지 미리보기</span></div>`;
  const content = blocks.map((block) => block.type === "image"
    ? `<figure class="shop-product-preview-media"><img src="${escapeHtml(resolveAdminAssetUrl(block.imageUrl || imageUrl))}" alt="${escapeHtml(block.alt || block.title)}" data-shop-preview-target="block-image-${escapeHtml(block.key)}" /><figcaption data-shop-preview-target="block-title-${escapeHtml(block.key)}">${escapeHtml(block.title)}</figcaption></figure>`
    : `<section class="shop-product-preview-block"><h4 data-shop-preview-target="block-title-${escapeHtml(block.key)}">${escapeHtml(block.title)}</h4><p data-shop-preview-target="block-${escapeHtml(block.key)}">${escapeHtml(block.body || "내용을 입력해 주세요.")}</p></section>`).join("");
  return `<div class="shop-product-preview-panel"><div class="shop-product-preview-toolbar"><strong>미리보기 패널</strong><div class="shop-product-preview-toggle" role="group" aria-label="미리보기 크기"><button type="button" class="${state.shopProductPreviewMode === "mobile" ? "active" : ""}" data-shop-preview-mode="mobile">${icon("phone_iphone")} 모바일</button><button type="button" class="${state.shopProductPreviewMode === "desktop" ? "active" : ""}" data-shop-preview-mode="desktop">${icon("desktop_windows")} 데스크톱</button></div></div><div class="shop-product-preview-surface ${state.shopProductPreviewMode === "mobile" ? "mobile" : "desktop"}"><div class="shop-product-preview-topbar">${icon("arrow_back")}<strong>상품 상세</strong>${icon("ios_share")}</div><div class="shop-product-preview-hero">${image}</div><div class="shop-product-preview-body"><span class="shop-product-preview-artist">${escapeHtml(artist?.name || "아티스트")}</span><h3 data-shop-preview-target="name">${escapeHtml(draft.name || "상품명")}</h3><strong class="shop-product-preview-price" data-shop-preview-target="price">${Number(draft.pricePoints || 0).toLocaleString()}P</strong><button class="primary full-width" type="button">${icon("shopping_cart")} 카드팩 구매하기</button><div class="shop-product-preview-tabs"><span class="active">상품 소개</span><span>구성품 안내</span><span>구매 안내</span></div>${content}</div></div></div>`;
}

function legacyShopProductCreateView() {
  const artists = scopedArtists();
  const packs = state.cardPacks.filter((pack) => pack.status === "published");
  const draft = shopProductEditorDraft();
  const blocks = shopProductContentBlocks();
  const blockFields = blocks.map((block) => `<div class="shop-product-block-input" data-shop-block-input="${escapeHtml(block.key)}"><div class="shop-product-block-input-heading"><strong>${escapeHtml(block.title)}</strong><span>${block.type === "image" ? "이미지 블록" : "텍스트 블록"}</span></div><label class="field"><span>블록 유형</span>${adminSelect({ id: `shop-product-block-type-${block.key}`, name: `block_type_${block.key}`, value: block.type, label: `${block.title} 블록 유형`, className: "shop-product-block-type", options: [{ value: "text", label: "텍스트" }, { value: "image", label: "이미지" }] })}</label><label class="field"><span>블록 제목</span><input name="block_title_${escapeHtml(block.key)}" value="${escapeHtml(block.title)}" data-shop-block-title="${escapeHtml(block.key)}" /></label>${block.type === "image" ? `<label class="field"><span>이미지 URL</span><input name="block_image_${escapeHtml(block.key)}" type="url" value="${escapeHtml(block.imageUrl || "")}" placeholder="https://..." data-shop-block-image="${escapeHtml(block.key)}" /><small class="field-help">상품 상세 안에 표시할 이미지를 연결합니다.</small></label><label class="field"><span>대체 텍스트</span><input name="block_alt_${escapeHtml(block.key)}" value="${escapeHtml(block.alt || "")}" placeholder="이미지 설명" data-shop-block-alt="${escapeHtml(block.key)}" /></label>` : `<label class="field"><span>텍스트 내용</span><textarea name="block_${escapeHtml(block.key)}" data-shop-preview-field="block-${escapeHtml(block.key)}">${escapeHtml(block.body || "")}</textarea></label>`}</div>`).join("");
  const rewards = (state.engagement.rewards || []).filter((reward) => reward.status === "published");
  const productType = draft.productType || "card_pack";
  const productTypeOptions = [
    { value: "card_pack", label: "카드팩" },
    { value: "point_item", label: "포인트 교환 보상" },
    { value: "limited_item", label: "한정 상품 보상" },
  ];
  const artistOptions = [{ value: "", label: "아티스트 선택" }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  const exposureOptions = [
    { value: "shop", label: "상점" },
    { value: "featured", label: "추천 영역" },
    { value: "hidden", label: "비노출" },
  ];
  const fulfillmentField = productType === "card_pack"
    ? `<label class="field"><span>연결 카드팩 <em>*</em></span>${adminSelect({ id: "shop-product-card-pack", name: "cardPackId", required: true, value: draft.cardPackId, label: "공개 카드팩", className: "shop-product-fulfillment-select", options: [{ value: "", label: "공개 카드팩 선택" }, ...packs.map((pack) => ({ value: pack.id, label: pack.name + " · " + (pack.version || "v1.0") }))] })}</label>`
    : `<label class="field"><span>지급할 보상 <em>*</em></span>${adminSelect({ id: "shop-product-reward", name: "rewardId", required: true, value: draft.rewardId, label: "공개 보상", className: "shop-product-fulfillment-select", options: [{ value: "", label: "공개 보상 선택" }, ...rewards.map((reward) => ({ value: reward.id, label: reward.title || reward.name || reward.id }))] })}<small class="field-help">PG 없이 포인트 결제 후 팬 계정에 원자적으로 지급됩니다.</small></label>`;
  return `<div class="card-operations-page shop-product-editor"><div class="page-heading with-actions"><div><p class="eyebrow">SHOP CATALOG / PRODUCT EDITOR</p><h2>상품 등록</h2><p>상품 정보를 입력하고 팬앱 상세 화면을 미리보며 콘텐츠를 편집합니다.</p></div><div class="shop-product-editor-actions"><button class="secondary" type="button" id="shop-product-save-draft">저장</button><button class="secondary" type="button" data-shop-preview-mode="desktop">${icon("visibility")} 미리보기</button><button class="primary" type="submit" form="shop-product-form">상품 등록하기</button></div></div><div class="shop-product-editor-layout"><form class="shop-product-editor-form form" id="shop-product-form"><section class="panel shop-product-basic-panel"><div class="panel-heading"><div><p class="eyebrow">PRODUCT INFORMATION</p><h3>기본 정보</h3></div></div><div class="shop-product-basic-grid"><div class="shop-product-image-field"><label class="field"><span>상품 이미지</span><div class="shop-product-image-preview">${draft.imageUrl ? `<img src="${escapeHtml(resolveAdminAssetUrl(draft.imageUrl))}" alt="상품 이미지" />` : `${icon("add_photo_alternate")}<small>상품 이미지를 등록하세요</small>`}</div><input name="imageUrl" type="url" value="${escapeHtml(draft.imageUrl)}" placeholder="이미지 URL" data-shop-preview-field="imageUrl" /></label></div><div class="shop-product-field-stack"><label class="field"><span>상품 유형 <em>*</em></span><select name="productType" required data-shop-product-type><option value="card_pack" ${productType === "card_pack" ? "selected" : ""}>카드팩</option><option value="point_item" ${productType === "point_item" ? "selected" : ""}>포인트 교환 보상</option><option value="limited_item" ${productType === "limited_item" ? "selected" : ""}>한정 상품 보상</option></select></label><label class="field"><span>상품명 <em>*</em></span><input name="name" value="${escapeHtml(draft.name)}" placeholder="예: DREAMSCAPE Nebula Ver. 카드팩" required data-shop-preview-field="name" /></label><label class="field"><span>아티스트 <em>*</em></span><select name="artistId" required data-shop-preview-field="artistId"><option value="">아티스트 선택</option>${artists.map((artist) => `<option value="${escapeHtml(artist.id)}" ${artist.id === draft.artistId ? "selected" : ""}>${escapeHtml(artist.name)}</option>`).join("")}</select></label>${fulfillmentField}<label class="field"><span>판매 가격 <em>*</em></span><div class="input-with-suffix"><input name="pricePoints" type="number" min="1" step="1" value="${escapeHtml(draft.pricePoints)}" required data-shop-preview-field="price" /><span>P</span></div></label><div class="form-grid shop-product-ops-fields"><label class="field"><span>재고 한도</span><input name="inventoryLimit" type="number" min="0" value="${escapeHtml(draft.inventoryLimit || "")}" placeholder="무제한" /><small class="field-help">비워 두면 무제한입니다.</small></label><label class="field"><span>1인 구매 한도</span><input name="perUserLimit" type="number" min="1" value="${escapeHtml(draft.perUserLimit || "")}" placeholder="무제한" /></label></div><div class="form-grid shop-product-ops-fields"><label class="field"><span>예약 공개 시각</span><input name="scheduledPublishAt" type="datetime-local" value="${escapeHtml(toLocalInputDateTime(draft.scheduledPublishAt))}" /></label><label class="field"><span>노출 영역</span><select name="exposureSlot"><option value="shop" ${draft.exposureSlot === "shop" || !draft.exposureSlot ? "selected" : ""}>상점</option><option value="featured" ${draft.exposureSlot === "featured" ? "selected" : ""}>추천 영역</option><option value="hidden" ${draft.exposureSlot === "hidden" ? "selected" : ""}>비노출</option></select></label></div></div></div></section><section class="panel shop-product-content-panel"><div class="panel-heading"><div><p class="eyebrow">DETAIL CONTENT</p><h3>상품 상세 콘텐츠</h3><span>팬앱 상품 상세 페이지에 표시할 콘텐츠를 구성합니다.</span></div><button class="secondary" id="shop-product-add-block" type="button">${icon("add")} 블록 추가</button></div><div class="shop-product-content-layout"><div class="shop-product-block-list">${blocks.map(shopProductBlockEditor).join("")}</div><div class="shop-product-block-editor"><label class="field"><span>상품 설명</span><textarea name="description" maxlength="1000" data-shop-preview-field="description">${escapeHtml(draft.description)}</textarea></label>${blockFields}</div></div></section><div class="notice shop-product-editor-notice">등록 후에는 초안으로 저장됩니다. 상품 목록에서 공개하면 팬앱 상점에 노출됩니다.</div><footer class="shop-product-editor-footer"><button class="secondary" type="button" data-view="shop-products">취소</button><button class="primary" type="submit" ${productType === "card_pack" ? (packs.length ? "" : "disabled") : (rewards.length ? "" : "disabled")}>상품 등록하기</button></footer></form><aside class="shop-product-preview">${shopProductPreview(draft, blocks)}</aside></div></div>`;
}

function shopProductCreateView() {
  const draft = shopProductEditorDraft();
  const productTypeOptions = [
    { value: "card_pack", label: "카드팩" },
    { value: "point_item", label: "포인트 교환 보상" },
    { value: "limited_item", label: "한정 상품 보상" },
  ];
  const artistOptions = [{ value: "", label: "아티스트 선택" }, ...scopedArtists().map((artist) => ({ value: artist.id, label: artist.name }))];
  const exposureOptions = [
    { value: "shop", label: "상점" },
    { value: "featured", label: "추천 영역" },
    { value: "hidden", label: "비노출" },
  ];
  const markup = legacyShopProductCreateView();
  return markup
    .replace(/<select name="productType" required data-shop-product-type>[\s\S]*?<\/select>/, adminSelect({ id: "shop-product-type", name: "productType", required: true, value: draft.productType || "card_pack", label: "상품 유형", className: "shop-product-type-select", options: productTypeOptions }))
    .replace(/<select name="artistId" required data-shop-preview-field="artistId">[\s\S]*?<\/select>/, adminSelect({ id: "shop-product-artist", name: "artistId", required: true, value: draft.artistId, label: "아티스트", className: "shop-product-artist-select", options: artistOptions }))
    .replace(/<select name="exposureSlot">[\s\S]*?<\/select>/, adminSelect({ id: "shop-product-exposure", name: "exposureSlot", value: draft.exposureSlot || "shop", label: "노출 영역", className: "shop-product-exposure-select", options: exposureOptions }));
}

function bindShopProductEditor() {
  const form = document.querySelector("#shop-product-form");
  if (!form) return;
  const editorActions = document.querySelector(".shop-product-editor-actions");
  if (editorActions && !editorActions.querySelector(".shop-product-back")) {
    const back = document.createElement("button");
    back.className = "secondary shop-product-back";
    back.type = "button";
    back.dataset.view = "shop-products";
    back.innerHTML = `${icon("arrow_back")} 상품 목록`;
    back.addEventListener("click", () => {
      state.view = "shop-products";
      state.shopProductDraft = null;
      layout();
    });
    editorActions.prepend(back);
  }
  if (state.shopProductDraft?.id) {
    document.querySelector(".shop-product-editor .page-heading h2")?.replaceChildren(document.createTextNode("상품 수정"));
    document.querySelectorAll('.shop-product-editor button[type="submit"]').forEach((button) => { button.textContent = "상품 수정하기"; });
  }
  const syncDraft = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    const currentDraft = shopProductEditorDraft();
    state.shopProductDraft = {
      ...currentDraft,
      ...values,
      pricePoints: values.pricePoints || "0",
      productType: values.productType || currentDraft.productType || "card_pack",
      rewardId: values.rewardId || currentDraft.rewardId || "",
    };
    state.shopProductBlocks = shopProductContentBlocks().map((block) => ({
      ...block,
      type: values[`block_type_${block.key}`] || block.type || "text",
      title: values[`block_title_${block.key}`] ?? block.title,
      body: values[`block_${block.key}`] ?? block.body,
      imageUrl: values[`block_image_${block.key}`] ?? block.imageUrl ?? "",
      alt: values[`block_alt_${block.key}`] ?? block.alt ?? "",
    }));
  };
  const updatePreview = (event) => {
    syncDraft();
    const field = event.currentTarget.dataset.shopPreviewField;
    if (field === "name") {
      document.querySelectorAll('[data-shop-preview-target="name"]').forEach((node) => { node.textContent = event.currentTarget.value || "상품명"; });
    } else if (field === "price") {
      document.querySelectorAll('[data-shop-preview-target="price"]').forEach((node) => { node.textContent = `${Number(event.currentTarget.value || 0).toLocaleString()}P`; });
    } else if (field?.startsWith("block-")) {
      document.querySelectorAll(`[data-shop-preview-target="${CSS.escape(field)}"]`).forEach((node) => { node.textContent = event.currentTarget.value || "내용을 입력해 주세요."; });
    }
  };
  form.querySelectorAll("[data-shop-preview-field]").forEach((input) => {
    input.addEventListener("input", updatePreview);
    input.addEventListener("change", updatePreview);
  });
  form.querySelector(".shop-product-type-select")?.addEventListener("change", () => {
    syncDraft();
    layout();
  });
  form.querySelectorAll("[data-shop-block-title]").forEach((input) => input.addEventListener("input", (event) => {
    syncDraft();
    const key = event.currentTarget.dataset.shopBlockTitle;
    document.querySelectorAll(`[data-shop-preview-target="block-title-${CSS.escape(key)}"]`).forEach((node) => { node.textContent = event.currentTarget.value || "콘텐츠"; });
    document.querySelector(`[data-shop-content-block="${CSS.escape(key)}"] .shop-product-block-copy strong`)?.replaceChildren(document.createTextNode(event.currentTarget.value || "콘텐츠"));
  }));
  form.querySelectorAll("[data-shop-block-image]").forEach((input) => input.addEventListener("input", (event) => {
    syncDraft();
    const key = event.currentTarget.dataset.shopBlockImage;
    const image = document.querySelector(`[data-shop-preview-target="block-image-${CSS.escape(key)}"]`);
    if (image) image.src = resolveAdminAssetUrl(event.currentTarget.value) || resolveAdminAssetUrl(shopProductEditorDraft().imageUrl);
  }));
  form.querySelectorAll(".shop-product-block-type").forEach((input) => input.addEventListener("change", () => {
    syncDraft();
    layout();
  }));
  document.querySelectorAll("[data-shop-preview-mode]").forEach((button) => button.addEventListener("click", () => {
    state.shopProductPreviewMode = button.dataset.shopPreviewMode;
    const surface = document.querySelector(".shop-product-preview-surface");
    if (surface) surface.className = `shop-product-preview-surface ${state.shopProductPreviewMode}`;
    document.querySelectorAll("[data-shop-preview-mode]").forEach((item) => item.classList.toggle("active", item.dataset.shopPreviewMode === state.shopProductPreviewMode));
  }));
  document.querySelector("#shop-product-add-block")?.addEventListener("click", () => {
    syncDraft();
    const key = `custom-${Date.now()}`;
    state.shopProductBlocks.push({ key, type: "text", title: "새 콘텐츠", body: "내용을 입력해 주세요.", imageUrl: "", alt: "" });
    layout();
  });
  document.querySelectorAll("[data-shop-block-remove]").forEach((button) => button.addEventListener("click", () => {
    syncDraft();
    state.shopProductBlocks = state.shopProductBlocks.filter((block) => block.key !== button.dataset.shopBlockRemove);
    layout();
  }));
  document.querySelectorAll("[data-shop-block-edit]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector(`[data-shop-block-input="${CSS.escape(button.dataset.shopBlockEdit)}"] textarea`)?.focus();
  }));
  document.querySelector("#shop-product-save-draft")?.addEventListener("click", () => {
    syncDraft();
    toast("상품 편집 내용을 임시 저장했습니다.");
  });
}

function cardPackStatusLabel(status) {
  return ({ published: "공개됨", draft: "임시 저장", pending_review: "검수 대기" }[status] || status || "-");
}

function cardPackRows(packs) {
  if (!packs.length) return '<tr><td colspan="6" class="empty">등록된 카드팩이 없습니다.</td></tr>';
  return packs.map((pack) => `<tr class="card-pack-select-row ${state.selectedCardPack?.id === pack.id ? "selected-preview-row" : ""}" data-card-pack-row-id="${escapeHtml(pack.id)}" tabindex="0"><td><button class="table-link card-pack-open" type="button" data-card-pack-id="${escapeHtml(pack.id)}"><strong>${escapeHtml(pack.name)}</strong><small>${escapeHtml(pack.seasonName || "시즌 미지정")} · ${escapeHtml(pack.version || "v1.0")}</small></button></td><td>${escapeHtml(pack.version || "-")}</td><td>${Number(pack.cards?.length || 0)}장</td><td><span class="badge ${pack.status === "published" ? "success-badge" : "draft"}">${escapeHtml(cardPackStatusLabel(pack.status))}</span></td><td>${pack.cards?.length ? `${pack.cards.filter((card) => card.enabled !== false).length}장 활성` : "구성 전"}</td><td><button class="secondary card-pack-compose" type="button" data-card-pack-id="${escapeHtml(pack.id)}">구성 편집</button></td></tr>`).join("");
}

function cardPacksView() {
  const artists = scopedArtists();
  const packs = state.cardPacks;
  const selected = state.selectedCardPack;
  const detail = selected ? `<aside class="panel card-pack-detail-panel"><div class="panel-heading"><div><p class="eyebrow">PACK DETAIL</p><h3>${escapeHtml(selected.name)}</h3><span>${escapeHtml(selected.seasonName || "시즌 미지정")} · ${escapeHtml(selected.version || "v1.0")}</span></div><span class="badge ${selected.status === "published" ? "success-badge" : "draft"}">${escapeHtml(cardPackStatusLabel(selected.status))}</span></div><dl class="detail-list"><div><dt>아티스트</dt><dd>${escapeHtml(artists.find((artist) => artist.id === selected.artistId)?.name || selected.artistId || "-")}</dd></div><div><dt>포함 카드</dt><dd>${Number(selected.cards?.length || 0)}장</dd></div><div><dt>확률 합계</dt><dd>${(selected.cards || []).filter((card) => card.enabled !== false).reduce((total, card) => total + Number(card.probability || 0), 0).toFixed(2)}%</dd></div></dl><div class="detail-actions"><button class="primary card-pack-compose" type="button" data-card-pack-id="${escapeHtml(selected.id)}">카드 구성 편집</button>${selected.status !== "published" && can("cards:write") ? `<button class="secondary card-pack-publish" type="button" data-card-pack-id="${escapeHtml(selected.id)}">검수 후 공개</button>` : ""}</div></aside>` : '<aside class="panel card-pack-detail-panel empty-detail">카드팩을 선택하면 구성과 확률을 확인할 수 있습니다.</aside>';
  return `<div class="card-operations-page"><div class="page-heading with-actions"><div><p class="eyebrow">CARD PACKS</p><h2>카드팩 관리</h2><p>카드팩 기본 정보와 포함 카드 구성을 실제 서비스 데이터로 관리합니다.</p></div>${can("cards:write") ? `<button class="primary" id="open-card-pack-create" type="button">${icon("add")} 새 카드팩 만들기</button>` : ""}</div><div class="card-operations-layout"><section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="card-pack-search" placeholder="카드팩 또는 시즌 검색" value="${escapeHtml(state.cardPackQuery)}" /></label>${adminSelect({ id: "card-pack-artist", value: state.cardPackArtist, label: "아티스트", className: "filter-select", options: [{ value: "all", label: "전체 아티스트" }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))] })}${adminSelect({ id: "card-pack-status", value: state.cardPackStatus, label: "상태", className: "filter-select", options: [{ value: "all", label: "전체 상태" }, { value: "published", label: "공개됨" }, { value: "draft", label: "임시 저장" }, { value: "pending_review", label: "검수 대기" }] })}</div><div class="table-wrap"><table class="table responsive-table card-pack-table"><thead><tr><th>카드팩</th><th>버전</th><th>포함 카드</th><th>공개 상태</th><th>활성 구성</th><th>관리</th></tr></thead><tbody>${cardPackRows(packs)}</tbody></table></div>${tablePagination("cardPackPage", state.cardPackPagination.page, state.cardPackPagination.total, state.cardPackPagination.pageSize)}</section>${detail}</div></div>`;
}

function cardPackCreateView() {
  const artists = scopedArtists();
  const publishedCards = cardCatalogItems().filter((card) => card.status === "published");
  const defaultOdds = publishedCards.length >= 4 ? [1, 9, 30, 60] : publishedCards.map(() => Number((100 / Math.max(publishedCards.length, 1)).toFixed(2)));
  const cardChoices = publishedCards.map((card, index) => `<label class="pack-card-choice"><input type="checkbox" data-pack-card="${escapeHtml(card.id)}" ${index < Math.min(4, publishedCards.length) ? "checked" : ""} /><span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.rarity || "N")} · ${escapeHtml(card.id)}</small></span><input class="pack-card-probability" data-pack-card-probability="${escapeHtml(card.id)}" type="number" min="0.01" max="100" step="0.01" value="${defaultOdds[index] || 0}" aria-label="${escapeHtml(card.name)} 확률" /></label>`).join("");
  return `<div class="card-operations-page"><div class="page-heading"><div><p class="eyebrow">PACK INFORMATION</p><h2>새 카드팩 만들기</h2><p>팬에게 표시될 카드팩 기본 정보를 등록한 뒤 카드 구성을 편집합니다.</p></div></div><div class="card-creation-layout"><form class="panel form" id="card-pack-form"><label class="field"><span>카드팩 이름</span><input name="name" placeholder="예: Nebula Ver." required /></label><div class="form-grid"><label class="field"><span>아티스트</span>${adminSelect({ id: "card-pack-create-artist", name: "artistId", value: artists[0]?.id || "", label: "아티스트", className: "form-select", options: artists.map((artist) => ({ value: artist.id, label: artist.name })) })}</label><label class="field"><span>버전</span><input name="version" value="v1.0" required /></label></div><label class="field"><span>시즌/앨범명</span><input name="seasonName" placeholder="예: 정규 1집 · DREAMSCAPE" /></label><label class="field"><span>카드팩 이미지 URL</span><input name="imageUrl" type="url" placeholder="https://..." /></label><label class="field"><span>설명</span><textarea name="description" maxlength="1000" placeholder="팬에게 공개할 카드팩 설명"></textarea></label><fieldset class="pack-card-selection"><legend>포함 카드와 확률</legend>${cardChoices || '<p class="empty">먼저 공개된 카드를 등록해 주세요.</p>'}</fieldset><div class="notice">카드팩은 먼저 임시 저장됩니다. 활성 카드 확률 합계가 100%일 때 공개할 수 있습니다.</div><footer class="drawer-footer"><button class="secondary" type="button" data-view="card-packs">취소</button><button class="primary" type="submit" ${publishedCards.length ? "" : "disabled"}>카드팩 만들고 구성 편집</button></footer></form><aside class="panel workflow-panel"><p class="eyebrow">WORKFLOW</p><h3>카드팩 등록 순서</h3><ol><li><strong>기본 정보 등록</strong><span>이름·시즌·이미지를 입력합니다.</span></li><li><strong>카드 구성 편집</strong><span>공개된 카드와 개별 확률을 연결합니다.</span></li><li><strong>검수 요청·공개</strong><span>확률이 100%인지 확인한 뒤 공개합니다.</span></li></ol></aside></div></div>`;
}

function cardPackCompositionView() {
  const pack = state.selectedCardPack;
  if (!pack) return '<div class="panel empty-detail">카드팩을 먼저 선택해 주세요.</div>';
  const total = (pack.cards || []).filter((card) => card.enabled !== false).reduce((sum, card) => sum + Number(card.probability || 0), 0);
  const editable = pack.status !== "published" && can("cards:write");
  const demoCardThumbnails = {
    card_demo_published: "./assets/demo/dreamscape/yuna.png",
    card_demo_harin: "./assets/demo/dreamscape/harin.png",
    card_demo_sena: "./assets/demo/dreamscape/sena.png",
    card_demo_rina: "./assets/demo/dreamscape/rina.png",
  };
  const selectedCompositionCard = (pack.cards || []).find((card) => card.cardId === state.selectedCompositionCardId) || pack.cards?.[0] || null;
  const compositionPreview = selectedCompositionCard ? (() => {
    const card = selectedCompositionCard;
    const thumbnailUrl = state.cardThumbnailUrls[card.cardId] || demoCardThumbnails[card.cardId] || "";
    const thumbnail = thumbnailUrl
      ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(card.name)} 카드 미리보기" />`
      : `<span class="composition-card-preview-fallback">${icon("image")}</span>`;
    return `<div class="composition-card-preview-media">${thumbnail}</div><div class="composition-card-preview-copy"><span class="eyebrow">선택한 카드</span><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.cardId)}</p><dl><div><dt>등급</dt><dd data-composition-preview-rarity>${escapeHtml(card.rarity || "N")}</dd></div><div><dt>확률</dt><dd data-composition-preview-probability>${Number(card.probability || 0).toFixed(2)}%</dd></div></dl></div>`;
  })() : `<div class="composition-card-preview-empty">카드를 선택하면 큰 미리보기가 표시됩니다.</div>`;
  const rows = (pack.cards || []).map((card, index) => {
    const thumbnailUrl = state.cardThumbnailUrls[card.cardId] || demoCardThumbnails[card.cardId] || "";
    const thumbnail = thumbnailUrl
      ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(card.name)} 카드 미리보기" />`
      : `<span class="composition-card-thumbnail-fallback">${icon("image")}</span>`;
    const selected = selectedCompositionCard?.cardId === card.cardId;
    return `<tr class="composition-card-row ${selected ? "selected-composition-row" : ""}" data-composition-card-id="${escapeHtml(card.cardId)}" tabindex="0" aria-selected="${selected ? "true" : "false"}"><td data-label="카드"><div class="composition-card-cell"><span class="composition-card-thumbnail">${thumbnail}<span class="composition-card-index">${index + 1}</span></span><span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.cardId)}</small></span></div></td><td data-label="등급"><span class="preview-rarity rarity-${String(card.rarity || "n").toLowerCase()}">${escapeHtml(card.rarity || "N")}</span></td><td data-label="포함 여부">${editable ? `<input type="checkbox" data-composition-enabled="${escapeHtml(card.cardId)}" ${card.enabled !== false ? "checked" : ""} aria-label="${escapeHtml(card.name)} 포함" />` : `<span class="composition-inclusion ${card.enabled !== false ? "included" : "excluded"}">${card.enabled !== false ? "포함" : "제외"}</span>`}</td><td data-label="확률">${editable ? `<label class="composition-probability-field"><input class="pack-card-probability" data-composition-probability="${escapeHtml(card.cardId)}" type="number" min="0.01" max="100" step="0.01" value="${Number(card.probability || 0)}" aria-label="${escapeHtml(card.name)} 확률" /><span>%</span></label>` : `<strong>${Number(card.probability || 0).toFixed(2)}%</strong>`}</td><td data-label="순서"><span class="composition-order">${index + 1}</span></td></tr>`;
  }).join("");
  return `<div class="card-operations-page card-pack-composition-page"><div class="page-heading with-actions"><div><p class="eyebrow">CARD PACK COMPOSITION</p><h2>카드 구성 편집</h2><p>${escapeHtml(pack.seasonName || "시즌 미지정")} · ${escapeHtml(pack.name)} · ${escapeHtml(pack.version || "v1.0")}</p></div><button class="secondary" data-view="card-packs" type="button">${icon("arrow_back")} 카드팩 목록</button></div><div class="card-operations-layout"><section class="panel"><div class="panel-heading"><div><h3>포함 카드</h3><span>총 ${(pack.cards || []).length}장</span></div><strong class="odds-total ${Math.abs(total - 100) < 0.001 ? "valid" : "invalid"}">확률 합계 ${total.toFixed(2)}%</strong></div><form id="card-pack-composition-form"><div class="table-wrap"><table class="table responsive-table composition-table"><thead><tr><th>카드</th><th>등급</th><th>포함 여부</th><th>확률</th><th>순서</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">포함된 카드가 없습니다.</td></tr>'}</tbody></table></div>${editable ? `<footer class="drawer-footer"><button class="primary" type="submit">변경사항 저장</button></footer>` : ""}</form></section><aside class="panel odds-editor-panel"><div class="composition-card-preview" data-composition-card-preview>${compositionPreview}</div><div class="composition-status-panel"><div class="odds-validation"><span>${icon(Math.abs(total - 100) < 0.001 ? "check_circle" : "error")}</span><div><strong>확률 검증</strong><p>${Math.abs(total - 100) < 0.001 ? "합계가 100%입니다." : "합계를 100%로 맞춰 주세요."}</p></div></div><div class="odds-release-status"><span>${icon("public")}</span><div><strong>팬앱 공개</strong><p>${pack.status === "published" ? "현재 확률표가 공개 중입니다." : "공개 전 구성입니다."}</p></div></div></div><div class="odds-policy-card"><strong>${icon("verified_user")} 운영 안내</strong><p>공개 후에는 팬앱 카드팩 상세에도 같은 확률이 표시됩니다.</p></div>${pack.status !== "published" && can("cards:write") ? `<button class="primary full-width card-pack-publish" data-card-pack-id="${escapeHtml(pack.id)}" type="button" ${Math.abs(total - 100) < 0.001 ? "" : "disabled"}>저장 후 공개</button>` : `<div class="composition-published-state">${icon("check_circle")}<span><strong>공개된 구성</strong><small>팬앱에 반영된 상태입니다.</small></span></div>`}</aside></div></div>`;
}
function statusLabel(status) {
  return (
    {
      published: "공개됨",
      approved: "공개 승인",
      pending_review: "검수 중",
      draft: "초안",
      changes_requested: "수정 요청",
    }[status] || status
  );
}

function fanGrowthStatusLabel(status) {
  return (
    {
      draft: "초안",
      pending_review: "검수 대기",
      published: "공개",
      disabled: "비활성",
      ended: "종료",
    }[status] || status
  );
}

function toLocalInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function scopeText(item) {
  const organization = state.organizations.find((entry) => entry.id === item.organizationId);
  const artist = state.catalog.artists.find((entry) => entry.id === item.artistId);
  const member = state.catalog.members.find((entry) => entry.id === item.memberId);
  return [organization?.name || (item.organizationId ? item.organizationId : "현재 조직"), artist?.name, member?.name]
    .filter(Boolean)
    .join(" · ");
}

function failedEngagementEventsPanel(events) {
  if (!events.length) return "";
  const rows = events.map((event) => `<li class="fan-growth-failed-event"><div><strong>${escapeHtml(event.kind || "성장 이벤트")}</strong><small>${escapeHtml(event.errorMessage || event.errorCode || "처리 실패")}</small></div><button class="secondary" type="button" data-engagement-retry="${escapeHtml(event.id)}">실패 이벤트 재처리</button></li>`).join("");
  return `<section class="panel fan-growth-failed-events-panel"><div class="panel-heading"><div><p class="eyebrow">RECOVERY QUEUE</p><h2>실패 이벤트 재처리</h2><p>실패 원인을 확인한 뒤 팬 진행도 반영을 다시 시도합니다.</p></div><span class="badge warning-badge">${events.length}건</span></div><ul class="fan-growth-failed-events">${rows}</ul></section>`;
}

function fanGrowthView() {
  const passSeasons = state.engagement.passSeasons || [];
  const missions = state.engagement.missions || [];
  const failedEvents = state.engagement.failedEvents || [];
  const levelPolicies = state.engagement.levelPolicies || [];
  const artists = scopedArtists();
  const query = state.fanPassQuery.trim().toLowerCase();
  const visible = passSeasons.filter((item) => {
    const artist = artists.find((entry) => entry.id === item.artistId);
    return (!query || `${item.title} ${artist?.name || ""}`.toLowerCase().includes(query))
      && (state.fanPassStatus === "all" || item.status === state.fanPassStatus)
      && (state.fanPassArtist === "all" || item.artistId === state.fanPassArtist);
  });
  const pagedPasses = pagedItems(visible, state.fanPassPage);
  const stats = [
    ["활성 패스", passSeasons.filter((item) => item.status === "published").length, "emoji_events", "공개 중인 레벨 패스"],
    ["검수 대기", passSeasons.filter((item) => item.status === "pending_review").length, "schedule", "검토가 필요한 패스"],
    ["등록 보상", (state.engagement.rewards || []).length, "featured_seasonal_and_gifts", "등록된 총 보상 수"],
    ["공개 미션", missions.filter((item) => item.status === "published").length, "task_alt", "팬앱에 노출 중인 미션"],
  ];
  const createActions = canManageFanGrowth()
    ? `<div class="fan-growth-create-actions"><button class="secondary" id="open-reward-drawer" type="button">${icon("redeem")} 보상 만들기</button><button class="secondary" id="open-mission-drawer" type="button">${icon("task_alt")} 미션 만들기</button>${isRoot() ? `<button class="secondary fan-pass-register" id="open-global-fan-pass-drawer" type="button">${icon("public")} 전체 팬 레벨 등록</button>` : ""}<button class="primary fan-pass-register" id="open-fan-pass-drawer" type="button">${icon("add")} 레벨 패스 등록</button></div>`
    : "";
  const statusOptions = [{ value: "all", label: "모든 상태" }, { value: "published", label: "공개 중" }, { value: "pending_review", label: "검수 대기" }, { value: "draft", label: "임시 저장" }, { value: "ended", label: "종료" }];
  const artistOptions = [{ value: "all", label: "모든 아티스트" }, ...artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  return `<div class="fan-pass-admin"><div class="page-heading with-actions fan-pass-page-heading"><div><p class="eyebrow">FAN GROWTH</p><h2>팬 성장 운영</h2><p>${isRoot() ? "아티스트별 시즌 레벨 마일스톤과 보상을 관리합니다." : "담당 아티스트의 시즌 레벨 마일스톤과 보상을 관리합니다."}</p></div>${createActions}</div><div class="fan-growth-grid fan-pass-summary">${stats.map(([label, value, iconName, note], index) => `<article class="summary-card tone-${index + 1}"><span>${icon(iconName)}</span><div><small>${label}</small><strong>${Number(value).toLocaleString()}</strong><p>${note}</p></div></article>`).join("")}</div><section class="panel fan-pass-list-panel"><div class="panel-heading"><div><h2>레벨 패스 목록</h2></div><span>총 ${passSeasons.length}개</span></div><div class="toolbar compact-toolbar fan-pass-toolbar"><label class="search-field grow">${icon("search")}<input id="fan-pass-search" placeholder="패스 이름, 아티스트 검색" value="${escapeHtml(state.fanPassQuery)}" /></label>${adminSelect({ id: "fan-pass-status-filter", value: state.fanPassStatus, label: "패스 상태", className: "filter-select fan-pass-status-filter", options: statusOptions })}${isRoot() ? adminSelect({ id: "fan-pass-artist-filter", value: state.fanPassArtist, label: "패스 아티스트", className: "filter-select fan-pass-artist-filter", options: artistOptions }) : ""}<button class="secondary fan-pass-filter-reset" id="fan-pass-filter-reset" type="button">${icon("restart_alt")} 필터 초기화</button></div><div class="table-wrap"><table class="table fan-pass-table"><thead><tr><th>패스 이름</th><th>상태</th><th>아티스트</th><th>티어 수</th><th>시즌 기간</th><th>최종 업데이트</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${fanPassRows(pagedPasses.items)}</tbody></table></div>${tablePagination("fanPassPage", pagedPasses.page, visible.length)}</section><section class="fan-growth-admin-grid"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">MISSION CONTROL</p><h2>미션 운영</h2><p>팬 행동 이벤트를 미션 진행도와 보상으로 연결합니다.</p></div><span>${missions.length}개</span></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>미션</th><th>이벤트</th><th>목표</th><th>상태</th><th>관리</th></tr></thead><tbody>${missionRows(missions)}</tbody></table></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">OPERATIONS</p><h2>성장 시스템 상태</h2></div></div><div class="fan-growth-health-list"><div><span>활성 레벨 정책</span><strong>${escapeHtml(levelPolicies.find((item) => item.isActive)?.name || "없음")}</strong></div><div><span>실패 처리 이벤트</span><strong class="${failedEvents.length ? "danger-text" : "success-text"}">${failedEvents.length.toLocaleString()}건</strong></div><div><span>보상 카탈로그</span><strong>${(state.engagement.rewards || []).length.toLocaleString()}개</strong></div></div>${failedEvents.length ? `<div class="fan-growth-alert">${icon("error")} 실패 이벤트를 확인하고 재시도할 수 있습니다.</div>` : ""}</section></section>${failedEngagementEventsPanel(failedEvents)}</div>`;
}

function missionRows(missions) {
  if (!missions.length) return '<tr><td colspan="5" class="empty">아직 등록된 미션이 없습니다.</td></tr>';
  return missions.map((item) => {
    const actions = [];
    if (item.status === "draft" && canManageFanGrowth()) actions.push(`<button class="icon-button edit-mission" type="button" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 수정">${icon("edit")}</button>`);
    if (item.status === "draft" && canManageFanGrowth()) actions.push(`<button class="secondary fan-growth-transition" type="button" data-kind="mission" data-action="submit" data-id="${escapeHtml(item.id)}">검수 요청</button>`);
    if (item.status === "pending_review" && canApproveFanGrowth()) actions.push(`<button class="primary fan-growth-transition" type="button" data-kind="mission" data-action="approve" data-id="${escapeHtml(item.id)}">공개 승인</button>`);
    if (item.status === "published" && canApproveFanGrowth()) actions.push(`<button class="secondary fan-growth-transition" type="button" data-kind="mission" data-action="disable" data-id="${escapeHtml(item.id)}">비활성화</button>`);
    return `<tr><td data-label="미션"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description || "")}</small></td><td data-label="이벤트">${escapeHtml(item.eventKind)}</td><td data-label="목표">${Number(item.targetValue || 1).toLocaleString()}회</td><td data-label="상태"><span class="badge ${item.status === "published" ? "success-badge" : item.status === "pending_review" ? "warning-badge" : item.status === "disabled" ? "danger-badge" : "draft"}">${escapeHtml(fanGrowthStatusLabel(item.status))}</span></td><td data-label="관리"><div class="row-actions">${actions.join("") || "-"}</div></td></tr>`;
  }).join("");
}

function fanGrowthQueueItem(item, kind) {
  return `<div class="fan-growth-queue-item"><span class="badge warning-badge">${kind === "achievement" ? "업적" : "무료 패스"}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(scopeText(item))}</small></div>${canApproveFanGrowth() ? `<button class="primary fan-growth-transition" type="button" data-kind="${kind}" data-action="approve" data-id="${escapeHtml(item.id)}">${kind === "achievement" ? "업적 공개 승인" : "패스 공개 승인"}</button>` : ""}</div>`;
}

function achievementRows(achievements) {
  if (!achievements.length) return '<tr><td colspan="6" class="empty">아직 등록된 업적이 없습니다.</td></tr>';
  return achievements
    .map((item) => {
      const rewards = (item.rewardIds || []).length;
      const writeActions = canManageFanGrowth()
        ? `<button class="icon-button edit-achievement" type="button" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 수정">${icon("edit")}</button>${item.status === "draft" ? `<button class="secondary fan-growth-transition" type="button" data-kind="achievement" data-action="submit" data-id="${escapeHtml(item.id)}">검수 요청</button>` : ""}`
        : "";
      const approveAction = canApproveFanGrowth() && item.status === "pending_review"
        ? `<button class="primary fan-growth-transition" type="button" data-kind="achievement" data-action="approve" data-id="${escapeHtml(item.id)}">업적 공개 승인</button>`
        : "";
      return `<tr><td data-label="업적"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description || item.id)}</small></td><td data-label="조건">${escapeHtml(conditionLabels[item.conditionType] || item.conditionType)}<small>목표 ${Number(item.targetValue || 1).toLocaleString()}</small></td><td data-label="범위">${escapeHtml(scopeText(item))}</td><td data-label="XP·보상"><strong>${Number(item.xpBonus || 0).toLocaleString()} XP</strong><small>보상 ${rewards}개</small></td><td data-label="상태"><span class="badge ${item.status === "published" ? "success-badge" : item.status === "pending_review" ? "warning-badge" : "draft"}">${escapeHtml(fanGrowthStatusLabel(item.status))}</span></td><td data-label="관리"><div class="row-actions">${writeActions}${approveAction}</div></td></tr>`;
    })
    .join("");
}

function fanPassRows(passSeasons) {
  if (!passSeasons.length) return '<tr><td colspan="7" class="empty">조건에 맞는 레벨 패스가 없습니다.</td></tr>';
  return passSeasons
    .map((item) => {
      const artist = state.catalog.artists.find((entry) => entry.id === item.artistId);
      const organization = state.organizations.find((entry) => entry.id === item.organizationId);
      const selected = state.drawer === "fan-pass" && state.drawerData?.season?.id === item.id;
      return `<tr class="edit-fan-pass ${selected ? "selected" : ""}" data-id="${escapeHtml(item.id)}" tabindex="0"><td data-label="패스 이름"><span class="pass-row-handle">${icon("drag_indicator")}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(artist?.name || organization?.name || "전체 팬")}</small></td><td data-label="상태"><span class="badge ${item.status === "published" ? "success-badge" : item.status === "pending_review" ? "warning-badge" : "draft"}">${escapeHtml(fanGrowthStatusLabel(item.status))}</span></td><td data-label="아티스트">${escapeHtml(artist?.name || "전체 서비스")}</td><td data-label="티어 수">${Number((item.tiers || []).length).toLocaleString()}</td><td data-label="시즌 기간">${formatDate(item.startsAt)}<small>${formatDate(item.endsAt)}</small></td><td data-label="최종 업데이트">${formatDate(item.updatedAt || item.startsAt)}</td><td data-label="관리"><button class="icon-button" type="button" aria-label="${escapeHtml(item.title)} 메뉴">${icon("more_horiz")}</button></td></tr>`;
    })
    .join("");
}
function releaseStatusLabel(status) {
  return (
    {
      draft: "초안",
      pending_partner_review: "회사 검수 대기",
      pending_platform_review: "플랫폼 검수 대기",
      changes_requested: "수정 요청",
      approved: "승인 완료",
      drop_ready: "드롭 준비됨",
      published: "공개됨",
    }[status] || statusLabel(status)
  );
}
function releasePolicyLabel(policy) {
  return (
    {
      partner_only: "회사 검수",
      partner_and_platform: "회사·플랫폼 검수",
    }[policy] || "회사 검수"
  );
}
function releaseBadgeClass(status) {
  if (["approved", "drop_ready", "published"].includes(status)) return "success-badge";
  if (status === "changes_requested") return "danger-badge";
  if (["pending_partner_review", "pending_platform_review"].includes(status)) return "warning-badge";
  return "draft";
}
function releaseStatus(card) {
  return card.releaseStatus || card.status || "draft";
}
function cardNextAction(card) {
  if (card.nextAction) return card.nextAction;
  const status = releaseStatus(card);
  if (status === "pending_partner_review") return "partner_review";
  if (status === "pending_platform_review") return "platform_review";
  if (status === "approved") return "prepare_drop";
  return "";
}
function nextActionLabel(action) {
  return (
    {
      partner_review: "회사 검수",
      platform_review: "플랫폼 검수",
      prepare_drop: "드롭 연결",
    }[action] || "대기"
  );
}
function cardMatchesStatus(card, status) {
  if (status === "all") return true;
  if (status === "pending_review") {
    return card.status === "pending_review" || ["pending_partner_review", "pending_platform_review"].includes(releaseStatus(card));
  }
  return card.status === status || releaseStatus(card) === status;
}
function cardDeadlineLabel(card) {
  return formatDate(card.reviewDueAt || card.dueAt || card.releaseDueAt || card.updatedAt || card.createdAt);
}
function cardAssigneeLabel(card) {
  return card.assigneeName || card.reviewerName || card.partnerReviewerName || card.platformReviewerName || cardCreatorLabel(card);
}
function reviewStatusTabs() {
  // The review table is paginated, while the tab badges describe the full
  // review queue. Prefer the already-loaded catalog so the counts do not
  // misleadingly change with the current page.
  const reviewCards = state.cardCatalog?.length ? state.cardCatalog : state.cards;
  const tabs = [
    { value: "all", label: "전체" },
    { value: "pending_review", label: "검수 대기" },
    { value: "changes_requested", label: "수정 요청" },
    { value: "approved", label: "승인 완료" },
  ];
  return `<div class="review-status-tabs" role="tablist" aria-label="카드 검수 상태">${tabs
    .map((tab) => {
      const count = reviewCards.filter((card) => cardMatchesStatus(card, tab.value)).length;
      return `<button class="${state.status === tab.value ? "active" : ""}" type="button" role="tab" aria-selected="${state.status === tab.value ? "true" : "false"}" data-review-status-tab="${escapeHtml(tab.value)}"><span>${escapeHtml(tab.label)}</span><strong>${Number(count).toLocaleString()}</strong></button>`;
    })
    .join("")}</div>`;
}
function cardRows(cards) {
  if (!cards.length)
    return '<tr><td colspan="6" class="empty">조건에 맞는 카드가 없습니다.</td></tr>';
  return cards
    .map((card) => {
      const menuOpen = state.cardActionMenuId === card.id;
      const menuItems = `<button class="row-action-menu-item review-card" type="button" data-id="${escapeHtml(card.id)}">${icon("visibility")}<span>상세 보기</span></button>${releaseStatus(card) === "draft" && can("cards:write") ? `<button class="row-action-menu-item danger-button delete-draft-card" type="button" data-card-action="delete" data-id="${escapeHtml(card.id)}">${icon("delete")}<span>초안 삭제</span></button>` : ""}`;
      const action = `<div class="row-action-menu ${menuOpen ? "open" : ""}"><button class="icon-button row-action-menu-toggle" type="button" data-card-action-menu="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.name)} 더보기" aria-expanded="${menuOpen}">${icon("more_horiz")}</button><div class="row-action-menu-popover" role="menu" aria-label="${escapeHtml(card.name)} 카드 작업">${menuItems}</div></div>`;
      const catalogArtist = state.catalog.artists.find(
        (artist) => artist.id === card.artistId,
      );
      const thumbnail = state.cardThumbnailUrls[card.id]
        ? `<img src="${escapeHtml(state.cardThumbnailUrls[card.id])}" alt="" />`
        : icon("style");
      const selected = state.reviewCard?.id === card.id;
      return `<tr class="${selected ? "review-table-row selected-review-row" : "review-table-row"}" tabindex="0" aria-label="${escapeHtml(card.name)} 상세 보기" aria-current="${selected ? "true" : "false"}" data-review-row-id="${escapeHtml(card.id)}"><td data-label="카드"><div class="card-cell"><span class="card-thumb">${thumbnail}</span><div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.seasonName || card.id)}</small></div></div></td><td data-label="메타데이터"><strong>${escapeHtml(catalogArtist?.name || card.ownerArtistId || card.artistId || "미지정")}</strong><small>${escapeHtml(card.rarity || "-")} · ${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "제한 없음"}</small></td><td data-label="마감">${escapeHtml(cardDeadlineLabel(card))}</td><td data-label="담당자">${escapeHtml(cardAssigneeLabel(card))}</td><td data-label="상태"><span class="badge ${releaseBadgeClass(releaseStatus(card))}">${escapeHtml(releaseStatusLabel(releaseStatus(card)))}</span></td><td data-label="관리" class="row-actions">${action}</td></tr>`;
    })
    .join("");
}

function isReviewRowInteractiveTarget(event) {
  const interactive = event.target.closest('button, a, input, select, textarea, label, [role="button"]');
  return interactive && interactive !== event.currentTarget;
}

function activateReviewRow(event, id, open = openReview) {
  if (!id || isReviewRowInteractiveTarget(event)) return false;
  if (event.key !== undefined) {
    if (event.key !== "Enter" && event.key !== " ") return false;
    event.preventDefault();
  }
  open(id);
  return true;
}

function positionOpenCardActionMenu() {
  const toggle = document.querySelector('.row-action-menu.open [data-card-action-menu]');
  const popover = document.querySelector('.row-action-menu.open .row-action-menu-popover');
  if (!toggle || !popover) return;
  const anchor = toggle.getBoundingClientRect();
  const width = Math.max(popover.offsetWidth || 168, 168);
  const height = Math.max(popover.offsetHeight || 44, 44);
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, anchor.right - width));
  const below = anchor.bottom + 6;
  const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - height - 6);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function activateReviewButton(event, id, open = openReview) {
  event.stopPropagation();
  state.cardActionMenuId = null;
  open(id);
  return true;
}

async function deleteDraftCard(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || releaseStatus(card) !== "draft") {
    toast("초안 카드만 삭제할 수 있습니다.");
    return;
  }
  if (!window.confirm(`\"${card.name}\" 초안 카드를 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
  try {
    await api(`/admin/cards/${encodeURIComponent(cardId)}`, { method: "DELETE" });
    await loadData();
    toast("초안 카드를 삭제했습니다.");
  } catch (error) {
    toast(error?.message || "초안 카드를 삭제하지 못했습니다. 연결된 카드팩이 있는지 확인해 주세요.");
  }
}

function openReviewFromRow(event) {
  activateReviewRow(event, event.currentTarget.dataset.reviewRowId);
}

function openReviewFromRowKey(event) {
  activateReviewRow(event, event.currentTarget.dataset.reviewRowId);
}

async function loadCardThumbnails(cards) {
  await Promise.all(cards.map(async (card) => {
    if (!card.sourceImageUrl || state.cardThumbnailUrls[card.id]) return;
    try {
      const response = await fetch(`${API_BASE}${card.sourceImageUrl.replace(/^\/api/, "")}`, {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      });
      if (!response.ok) return;
      state.cardThumbnailUrls[card.id] = URL.createObjectURL(await response.blob());
    } catch {
      // A missing thumbnail must not prevent the card table from rendering.
    }
  }));
  if (state.authenticated && state.view === "cards") layout();
}
function cardBackImageAssetId(card) {
  return card?.backImageAssetId || card?.designConfig?.back?.backImageAssetId || card?.designConfig?.back?.imageAssetId || null;
}

function cardCreatorLabel(card) {
  const creatorId = card?.ownerArtistId || card?.artistId;
  const artist = state.catalog.artists.find((item) => item.id === creatorId);
  return card?.creatorName || artist?.name || card?.ownerArtistId || (card?.artistId ? "아티스트 운영팀" : "Fanfolio 운영팀");
}

function reviewEffectConfig(card) {
  const design = card?.designConfig || {};
  const side = state.reviewSide === "back" ? design.back || {} : design.front || {};
  const front = design.front || {};
  const configuredPreset = String(side.preset || side.effectPreset || "").toLowerCase();
  const presetEffect = { glow: "holographic", hologram: "holographic", foil: "foil", light: "light", particles: "particles", motion: "motion" }[configuredPreset] || "";
  const effect = String(side.effect || (state.reviewSide === "front" ? design.effect : "") || presetEffect || "none").toLowerCase();
  const material = String(side.material || (state.reviewSide === "front" ? front.material : "matte") || "matte").toLowerCase();
  const preset = String(side.preset || side.effectPreset || side.foilPattern || side.foilFinish || material || "일반");
  const rawIntensity = side.effectIntensity ?? side.intensity ?? 0;
  const intensity = Math.max(0, Math.min(100, Number(rawIntensity) <= 1 ? Number(rawIntensity) * 100 : Number(rawIntensity)));
  const angle = Number(side.effectAngle ?? side.angle ?? 135) || 135;
  const interaction = String(side.interaction || (effect !== "none" ? "tilt" : "static")).toLowerCase();
  const hasEffect = state.reviewSide === "front"
    ? effect !== "none" || material !== "matte" || Boolean(side.foilPattern || side.foilCoverage || side.lenticular)
    : material !== "matte" || Boolean(side.preset && side.preset !== "none") || Boolean(side.edgeFoil || side.spotUv || side.hiddenMessage);
  return { effect, material, preset, intensity, angle, interaction, hasEffect };
}

function reviewEffectLabel(config) {
  if (!config.hasEffect) return "일반 카드";
  if (config.effect.includes("hologram")) return "홀로그램 포일";
  if (config.effect.includes("lenticular") || config.interaction.includes("lenticular")) return "렌티큘러";
  if (config.effect.includes("foil") || config.material !== "matte") return "포일 표면 효과";
  return "표면 효과";
}

function reviewEffectMarkup(card) {
  const config = reviewEffectConfig(card);
  const side = state.reviewSide;
  const imageSrc = side === "back" ? state.reviewBackImageSrc : state.reviewImageSrc;
  const imageMarkup = reviewMediaMarkup(card);
  if (!imageSrc) return imageMarkup;
  const effectClass = config.hasEffect ? " has-review-effect" : "";
  const enabledClass = state.reviewEffectsEnabled ? " effects-enabled" : " effects-disabled";
  return `<div class="review-effect-card side-${side} material-${escapeHtml(config.material)}${effectClass}${enabledClass}" data-review-effect-card style="--review-effect-intensity:${(config.intensity / 100).toFixed(2)};--review-effect-angle:${config.angle}deg;--review-light-x:50%;--review-light-y:42%;"><div class="review-effect-image">${imageMarkup}</div>${config.hasEffect ? `<span class="review-effect-surface" aria-hidden="true"></span>` : ""}<span class="review-effect-badge">${escapeHtml(reviewEffectLabel(config))}</span></div>`;
}

function reviewEffectSummary(card) {
  const config = reviewEffectConfig(card);
  return `<section class="review-effect-summary" aria-label="효과 미리보기"><div><span class="eyebrow">EFFECT PREVIEW</span><strong>${escapeHtml(reviewEffectLabel(config))}</strong></div><button class="secondary review-effect-toggle" type="button" data-review-effects aria-pressed="${state.reviewEffectsEnabled ? "true" : "false"}">${state.reviewEffectsEnabled ? "효과 켜짐" : "효과 꺼짐"}</button><dl><div><dt>프리셋</dt><dd>${escapeHtml(config.preset)}</dd></div><div><dt>강도</dt><dd>${config.hasEffect ? `${Math.round(config.intensity)}%` : "-"}</dd></div><div><dt>상호작용</dt><dd>${config.hasEffect && config.interaction !== "static" ? "카드를 움직여 확인" : "고정"}</dd></div></dl></section>`;
}

function reviewMediaMarkup(card) {
  const back = state.reviewSide === "back";
  const imageSrc = back ? state.reviewBackImageSrc : state.reviewImageSrc;
  const failed = back ? state.reviewBackImageError : state.reviewImageError;
  const hasBack = Boolean(cardBackImageAssetId(card));
  if (imageSrc) return `<img class="review-image" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(card.name)} ${back ? "뒷면" : "앞면"} 미리보기" />`;
  const title = back ? (hasBack ? "뒷면 이미지를 불러오지 못했습니다." : "뒷면 이미지는 기본 템플릿을 사용합니다.") : (failed ? "원본 이미지가 등록되지 않았거나 저장소에서 찾을 수 없습니다." : "미리보기를 불러오는 중입니다.");
  const detail = back ? (hasBack ? "카드 정보에서 뒷면 이미지를 교체한 뒤 다시 확인해 주세요." : "아티스트 스튜디오 또는 카드 정보에서 뒷면 이미지를 등록할 수 있습니다.") : (failed ? "카드 정보에서 앞면 이미지를 교체한 뒤 다시 확인해 주세요." : "잠시만 기다려 주세요.");
  const uploadControl = can("cards:write")
    ? `<div class="review-image-uploads"><label class="review-image-upload">앞면 이미지 다시 업로드<input type="file" accept="image/png,image/jpeg,image/webp" data-review-upload="front" hidden /></label><label class="review-image-upload">뒷면 이미지 다시 업로드<input type="file" accept="image/png,image/jpeg,image/webp" data-review-upload="back" hidden /></label></div>`
    : "";
  return `<div class="review-image empty review-image-fallback">${icon(failed ? "image_not_supported" : "style")}<strong>${title}</strong><small>${detail}</small>${uploadControl}</div>`;
}

function reviewPanel() {
  const card = state.reviewCard;
  if (!card) return "";
  const image = reviewEffectMarkup(card);
  const status = releaseStatus(card);
  const nextAction = cardNextAction(card);
  const policy = card.releasePolicy || (card.rarity === "Special" ? "partner_and_platform" : "partner_only");
  const canReviewPartner = nextAction === "partner_review" && ["company_admin", "manager"].includes(state.adminContext?.accessLevel);
  const canReviewPlatform = nextAction === "platform_review" && can("cards:review_platform");
  const canSubmitReview =
    can("cards:submit_review") &&
    ["draft", "changes_requested"].includes(status);
  const canPrepareDrop = ["approved", "drop_ready"].includes(status) && (can("drops:write") || can("drops:manage"));
  const canEdit = can("cards:write") && !["pending_partner_review", "pending_platform_review", "drop_ready", "published"].includes(status);
  const editForm = canEdit
    ? `<form class="form edit-card-form" id="admin-card-edit-form" data-id="${escapeHtml(card.id)}"><label class="field">카드명<input name="name" value="${escapeHtml(card.name)}" required /></label><label class="field">시즌<input name="seasonName" value="${escapeHtml(card.seasonName || "")}" placeholder="예: 2026 SUMMER" /></label><label class="field">등급>${adminSelect({ id: "admin-card-rarity", name: "rarity", value: card.rarity || "N", label: "등급", className: "form-select", options: [{ value: "N", label: "N (노멀)" }, { value: "R", label: "R (레어)" }, { value: "SR", label: "SR (슈퍼 레어)" }, { value: "Special", label: "Special" }] })}</label><label class="field">발행 수량<input name="issueLimit" type="number" min="1" value="${card.issueLimit || ""}" placeholder="제한 없음" /></label><label class="field">앞면 이미지 교체<input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">선택하지 않으면 기존 이미지를 유지합니다.</span></label><label class="field">뒷면 이미지 교체<input name="backCardImage" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">선택하지 않으면 기본 템플릿 또는 기존 이미지를 유지합니다.</span></label><button class="primary" type="submit">변경 저장</button></form>`
    : "";
  const reviewNote =
    canReviewPartner || canReviewPlatform || canSubmitReview
      ? `<label class="field review-note">검수 메모<textarea id="review-note" maxlength="500" placeholder="${canSubmitReview ? "회사 검수자에게 전달할 확인 사항을 입력하세요." : "수정 요청 시 사유를 입력하세요."}">${escapeHtml(card.reviewNote || "")}</textarea></label>`
      : "";
  const reviewActions = canReviewPartner || canReviewPlatform
    ? '<div class="review-actions"><button class="secondary review-decision" data-id="' +
      escapeHtml(card.id) +
      '" data-stage="' +
      (canReviewPartner ? "partner" : "platform") +
      '" data-decision="changes_requested">수정 요청</button><button class="primary review-decision" data-id="' +
      escapeHtml(card.id) +
      '" data-stage="' +
      (canReviewPartner ? "partner" : "platform") +
      '" data-decision="approved">검수 승인</button></div>'
    : canSubmitReview
      ? `<div class="notice">검수를 요청하면 회사 검수자가 확인하기 전까지 카드가 잠깁니다.</div><div class="review-actions"><button class="primary submit-review-request" data-id="${escapeHtml(card.id)}">검수 요청하기</button></div>`
      : canPrepareDrop
        ? `<div class="notice success">검수가 승인되었습니다. 드롭에 연결하면 코드 배치 작업으로 이어집니다.</div><div class="review-actions"><button class="primary open-drop-link" data-id="${escapeHtml(card.id)}">드롭 준비됨</button></div>`
        : "";
  const reviewBoundaryNotice =
    isRoot() && status === "pending_partner_review"
      ? `<div class="notice">현재 카드는 회사 검수 대기 상태입니다. 기업 검수 담당자가 승인하거나 수정 요청을 처리한 뒤 다음 단계로 진행됩니다.</div>`
      : "";
  const sideToggle = `<div class="review-side-toggle" role="group" aria-label="카드 면 선택"><button class="${state.reviewSide === "front" ? "active" : ""}" type="button" data-review-side="front">앞면</button><button class="${state.reviewSide === "back" ? "active" : ""}" type="button" data-review-side="back">뒷면</button></div>`;
  return `<div class="panel review-panel review-detail-panel"><div class="review-heading"><div><p class="eyebrow">카드 검수</p><h2>${escapeHtml(card.name)}</h2><span class="badge ${releaseBadgeClass(status)}">${escapeHtml(releaseStatusLabel(status))}</span></div><button class="secondary" id="close-review">닫기</button></div><div class="review-content"><div>${sideToggle}${image}${reviewEffectSummary(card)}</div><dl class="review-meta"><div><dt>제작자</dt><dd>${escapeHtml(cardCreatorLabel(card))}</dd></div><div><dt>시즌</dt><dd>${escapeHtml(card.seasonName || "-")}</dd></div><div><dt>등급</dt><dd>${escapeHtml(card.rarity || "-")}</dd></div><div><dt>발행 수량</dt><dd>${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "-"}</dd></div><div><dt>마감</dt><dd>${escapeHtml(cardDeadlineLabel(card))}</dd></div><div><dt>담당자</dt><dd>${escapeHtml(cardAssigneeLabel(card))}</dd></div><div><dt>사인 메시지</dt><dd>${escapeHtml(card.signatureText || "없음")}</dd></div><div><dt>특전</dt><dd>${card.hasVoice ? "보이스 포함" : "보이스 없음"}${card.videoAssetId ? " · 영상 포함" : ""}${card.handwritingAssetId ? " · 손글씨 포함" : ""}</dd></div></dl></div><div class="release-status-grid"><div><span>정책</span><strong>${escapeHtml(releasePolicyLabel(policy))}</strong></div><div><span>검수 버전</span><strong>v${Number(card.reviewVersion || 0)}</strong></div><div><span>다음 작업</span><strong>${escapeHtml(nextActionLabel(nextAction))}</strong></div></div>${releaseSnapshot(card)}${releaseHistory(card)}${cardCollaborationCommentsPanel(card)}${editForm}${reviewNote}${reviewBoundaryNotice}${reviewActions}</div>`;
}

function cardCollaborationCommentsPanel(card) {
  const comments = state.reviewCard?.id === card.id ? state.cardCollaborationComments : [];
  const body = state.cardCollaborationCommentsLoading
    ? "코멘트를 불러오는 중입니다."
    : state.cardCollaborationCommentsError
      ? escapeHtml(state.cardCollaborationCommentsError)
      : comments.length
        ? `<ul class="card-collaboration-comment-list">${comments.map((item) => `<li class="card-collaboration-comment"><div><strong>${escapeHtml(item.authorName || item.authorEmail || "협업자")}</strong><small>v${Number(item.reviewVersion || 0)} · ${formatDateTime(item.createdAt)}</small></div><p>${escapeHtml(item.body)}</p><span class="badge ${item.status === "resolved" ? "success-badge" : "warning-badge"}">${item.status === "resolved" ? "해결됨" : "열림"}</span></li>`).join("")}</ul>`
        : "등록된 협업 코멘트가 없습니다.";
  return `<section class="card-collaboration-comments-panel"><div class="event-section-heading"><div><p class="eyebrow">COLLABORATION</p><h3>협업 코멘트</h3><p>아티스트와 운영자가 카드 검수 중 남긴 피드백을 확인합니다.</p></div><span class="badge">${comments.length}개</span></div><div class="card-collaboration-comment-body">${body}</div></section>`;
}

function releaseSnapshot(card) {
  const snapshot = card.reviewSnapshot || card.snapshot || {};
  const design = snapshot.designConfig || card.designConfig || {};
  const rows = [
    ["앞면", snapshot.previewImageUrl || snapshot.sourceImageUrl || card.previewImageUrl || card.sourceImageUrl || "미등록"],
    ["뒷면 이미지", design.backImageAssetId || design.imageAssetId || card.backImageAssetId || "기본 템플릿"],
    ["미디어", [snapshot.voiceAssetId || card.voiceAssetId ? "보이스" : "", snapshot.videoAssetId || card.videoAssetId ? "영상" : "", snapshot.handwritingAssetId || card.handwritingAssetId ? "손글씨" : "", design.lenticular || design.motion ? "렌티큘러" : ""].filter(Boolean).join(" · ") || "없음"],
    ["제출 메모", card.reviewNote || snapshot.reviewNote || "없음"],
  ];
  return `<section class="release-snapshot"><h3>제출 스냅샷</h3><div class="snapshot-grid">${rows.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></section>`;
}

function releaseHistory(card) {
  const history = card.reviewDecisions || card.reviewHistory || card.reviewRequests || [];
  if (!history.length) return "";
  return `<section class="release-history"><h3>검수 이력</h3>${history
    .map(
      (item) =>
        `<div class="release-history-item"><strong>${escapeHtml(item.stage || item.decision || item.status || "review")}</strong><span>${escapeHtml(item.note || item.status || "기록됨")}</span><small>${formatDate(item.decidedAt || item.createdAt)}</small></div>`,
    )
    .join("")}</section>`;
}

function eventWorkflowLabel(status) {
  return ({ draft: "초안", pending_review: "검수 대기", changes_requested: "수정 요청", approved: "승인됨", scheduled: "예약됨", published: "공개 중", ended: "종료" })[status] || status || "미설정";
}

function eventTypeLabel(type) {
  return ({ announcement: "공지", comment: "댓글 참여", card_drop: "카드 드롭", card: "카드", fan_mission: "팬 미션", external: "외부 링크" })[type] || type || "공지";
}

function eventConnectionOptions(type, selected = "") {
  if (type === "announcement") {
    return adminSelect({
      id: "event-connection-select",
      name: "connection",
      value: "",
      label: "연결 대상",
      className: "form-select",
      options: [{ value: "", label: "연결 없음" }],
    });
  }
  if (type === "external") return `<input name="connection" value="${escapeHtml(selected)}" placeholder="https://..." required />`;
  const source = type === "card_drop" ? state.drops : type === "card" ? cardCatalogItems() : state.engagement.achievements;
  return adminSelect({
    id: "event-connection-select",
    name: "connection",
    value: selected,
    label: "연결 대상",
    className: "form-select",
    required: true,
    options: [{ value: "", label: "연결 대상 선택" }, ...source.map((item) => ({ value: item.id, label: item.name || item.title || item.id }))],
  });
}

function eventRelatedCardOptions(event) {
  const selected = new Set(event.relatedCardIds || []);
  const cards = cardCatalogItems().filter((card) => card.status === "published");
  if (!cards.length) return '<small class="field-help">연결 가능한 공개 카드가 없습니다.</small>';
  return `<div class="event-related-card-options">${cards.map((card) => `<label class="event-card-option"><input type="checkbox" name="relatedCardIds" value="${escapeHtml(card.id)}" ${selected.has(card.id) ? "checked" : ""} /><span class="event-card-check" aria-hidden="true">${icon("check")}</span><span class="event-card-thumb" aria-hidden="true">${icon("style")}</span><span class="event-card-copy"><strong>${escapeHtml(card.name || card.id)}</strong><small>${escapeHtml(card.memberName || "공개 카드")}</small></span><span class="event-card-order">${selected.has(card.id) ? "선택됨" : "연결"}</span></label>`).join("")}</div>`;
}

function eventsView() {
  const artists = [{ value: "all", label: "모든 아티스트" }, ...scopedArtists().map((artist) => ({ value: artist.id, label: artist.name }))];
  const status = [{ value: "all", label: "모든 상태" }, ...["draft", "pending_review", "changes_requested", "approved", "scheduled", "published", "ended"].map((value) => ({ value, label: eventWorkflowLabel(value) }))];
  const type = [{ value: "all", label: "모든 유형" }, ...["announcement", "comment", "card_drop", "card", "fan_mission", "external"].map((value) => ({ value, label: eventTypeLabel(value) }))];
  const selected = state.selectedEvent;
  const rows = state.events.length ? state.events.map((event) => `<tr class="event-row ${selected?.id === event.id ? "selected-row" : ""}" data-event-row-id="${escapeHtml(event.id)}" tabindex="0"><td><div class="event-cell"><span class="event-cell-icon">${icon(eventTypeIcon(event.eventType))}</span><div><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.summary || "")}</small></div></div></td><td>${escapeHtml(eventTypeLabel(event.eventType))}</td><td>${formatDate(event.startsAt)}</td><td><span class="badge ${eventBadgeClass(event.workflowStatus)}">${escapeHtml(eventWorkflowLabel(event.workflowStatus))}</span></td><td><button class="icon-button event-more" type="button" data-event-action="open" data-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(event.title)} 상세 보기">${icon("more_horiz")}</button></td></tr>`).join("") : `<tr><td colspan="5" class="empty">등록된 이벤트가 없습니다.</td></tr>`;
  const detail = selected ? eventDetailPanel(selected) : `<aside class="panel event-detail-empty"><span>${icon("campaign")}</span><h3>이벤트를 선택하세요</h3><p>목록에서 이벤트를 선택하면 미리보기와 운영 액션이 표시됩니다.</p></aside>`;
  const deepLinkedEditor = isEventDeepLink() && can("events:write") && !state.eventEditorOpen
    ? `<section class="panel event-editor-fallback" aria-label="이벤트 등록">${eventDrawer()}</section>`
    : "";
  return `<div class="page-heading"><div><p class="eyebrow">EDITORIAL OPERATIONS</p><h2>이벤트 관리</h2><p>팬앱 홈과 이벤트 페이지에 노출할 콘텐츠를 등록하고 공개 일정을 관리합니다.</p></div>${can("events:write") ? `<a class="primary" id="open-event-drawer" href="?view=events&drawer=event" aria-haspopup="dialog">${icon("add")} 이벤트 등록</a>` : ""}</div>${deepLinkedEditor}<div class="event-workspace"><section class="panel event-list-panel"><div class="panel-heading"><div><p class="eyebrow">EVENT QUEUE</p><h3>이벤트 목록</h3></div><span>${state.eventPagination.total || state.events.length}개 항목</span></div><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="event-search" placeholder="이벤트명, 설명 검색" value="${escapeHtml(state.eventQuery)}" /></label>${adminSelect({ id: "event-status-filter", value: state.eventStatus, label: "이벤트 상태", className: "filter-select event-status-filter", options: status })}${adminSelect({ id: "event-type-filter", value: state.eventType, label: "이벤트 유형", className: "filter-select event-type-filter", options: type })}${adminSelect({ id: "event-artist-filter", value: state.eventArtist, label: "아티스트", className: "filter-select event-artist-filter", options: artists })}</div><div class="table-wrap"><table class="table responsive-table event-table"><thead><tr><th>이벤트</th><th>유형</th><th>시작일</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${rows}</tbody></table></div>${eventPagination()}</section>${detail}</div>`;
}

function eventTypeIcon(type) { return ({ comment: "chat_bubble", card_drop: "style", card: "style", fan_mission: "workspace_premium", external: "open_in_new" })[type] || "campaign"; }
function cardCatalogItems() {
  return state.cardCatalog.length ? state.cardCatalog : state.cards;
}
function eventBadgeClass(status) { return status === "published" ? "success-badge" : status === "pending_review" ? "warning-badge" : status === "changes_requested" ? "danger-badge" : status === "ended" ? "draft" : "violet-badge"; }
function eventPagination() { const page = state.eventPagination.page || 1; const totalPages = state.eventPagination.totalPages || 1; return totalPages > 1 ? `<div class="pagination"><button class="secondary" data-event-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>이전</button><span>${page} / ${totalPages}</span><button class="secondary" data-event-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>다음</button></div>` : ""; }
function eventApplicantSummary(event) {
  const applicants = state.eventApplicantsEventId === event.id ? state.eventApplicants : [];
  const submitted = applicants.filter((item) => item.status === "submitted");
  const winners = applicants.filter((item) => item.status === "winner");
  const drawControls = can("events:write") ? `<div class="event-draw-controls"><label class="event-winner-field"><span>당첨자 수</span><input class="event-winner-count" data-id="${escapeHtml(event.id)}" type="number" min="1" max="${Math.max(1, submitted.length)}" value="1" ${submitted.length ? "" : "disabled"} /><b>명</b></label><button class="primary event-draw" data-id="${escapeHtml(event.id)}" ${submitted.length ? "" : "disabled"}>추첨하기</button></div>` : "";
  return `<section class="event-applicant-panel"><div class="event-section-heading"><div><p class="eyebrow">PARTICIPANTS</p><h4>신청자 관리</h4><p>${eventApplicantSummaryText(event, applicants, submitted, winners)}</p></div><button class="secondary event-applicants" data-id="${escapeHtml(event.id)}">${state.eventApplicantsLoading ? "불러오는 중..." : "신청자 보기"}</button></div><div class="event-draw-box"><div><strong>당첨자 추첨</strong><small>대기 중인 신청자 ${submitted.length}명 · 당첨 ${winners.length}명</small></div>${drawControls}</div><p class="event-applicant-empty">신청자 보기를 누르면 전체 신청자와 당첨 상태를 확인합니다.</p></section>`;
}

function eventApplicantSummaryText(event, applicants, submitted, winners) {
  if (state.eventApplicantsEventId !== event.id) return `현재 참여자 ${event.applicantCount ?? 0}명`;
  return `전체 ${applicants.length}명 · 대기 ${submitted.length}명 · 당첨 ${winners.length}명`;
}

function eventCommentSummary(event) {
  const comments = state.eventCommentsEventId === event.id ? state.eventComments : [];
  const pending = comments.filter((item) => item.status === "pending").length;
  const approved = comments.filter((item) => item.status === "approved").length;
  const rejected = comments.filter((item) => item.status === "rejected").length;
  return `<section class="event-applicant-panel event-comment-panel"><div class="event-section-heading"><div><p class="eyebrow">COMMENTS</p><h4>댓글 검토</h4><p>${state.eventCommentsEventId === event.id ? `전체 ${comments.length}개 · 대기 ${pending}개 · 승인 ${approved}개` : `현재 댓글 ${event.commentCount ?? 0}개 · 검토 상태를 확인하세요.`}</p></div><button class="secondary event-comments" data-id="${escapeHtml(event.id)}">${state.eventCommentsLoading ? "불러오는 중..." : "댓글 검토"}</button></div><div class="event-comment-review-box"><strong>운영 검토</strong><small>승인된 댓글만 다른 팬에게 공개됩니다. 작성자 본인에게는 검토 중 댓글이 표시됩니다.</small><div class="event-comment-review-stats"><span>대기 <b>${pending}</b></span><span>승인 <b>${approved}</b></span><span>반려 <b>${rejected}</b></span></div></div></section>`;
}

function eventApplicantsModal() {
  if (!state.eventApplicantsModalOpen) return "";
  const event = state.events.find((item) => item.id === state.eventApplicantsEventId) || state.selectedEvent;
  const applicants = state.eventApplicants;
  const rows = applicants.length ? applicants.map((item) => `<li><div><strong>${escapeHtml(item.nickname || item.email || item.userId)}</strong><small>${escapeHtml(item.email || item.userId || "")}</small></div><span class="badge ${item.status === "winner" ? "success-badge" : item.status === "not_selected" ? "draft" : "violet-badge"}">${item.status === "winner" ? "당첨" : item.status === "not_selected" ? "미선정" : "신청 완료"}</span></li>`).join("") : `<li class="event-modal-empty">${state.eventApplicantsLoading ? "신청자 목록을 불러오는 중입니다." : "신청자가 없습니다."}</li>`;
  return `<div class="event-applicants-modal-backdrop" id="event-applicants-modal-backdrop"><section class="event-applicants-modal" role="dialog" aria-modal="true" aria-labelledby="event-applicants-modal-title"><header><div><p class="eyebrow">PARTICIPANTS</p><h3 id="event-applicants-modal-title">신청자 목록</h3><p>${escapeHtml(event?.title || "이벤트")} · 총 ${applicants.length}명</p></div><button class="icon-button" id="close-event-applicants" type="button" aria-label="신청자 목록 닫기">${icon("close")}</button></header><div class="event-modal-stats"><span>전체 <b>${applicants.length}</b></span><span>대기 <b>${applicants.filter((item) => item.status === "submitted").length}</b></span><span>당첨 <b>${applicants.filter((item) => item.status === "winner").length}</b></span></div><ul class="event-modal-list">${rows}</ul></section></div>`;
}

function eventCommentsModal() {
  if (!state.eventCommentsModalOpen) return "";
  const event = state.events.find((item) => item.id === state.eventCommentsEventId) || state.selectedEvent;
  const comments = state.eventComments;
  const rows = comments.length ? comments.map((item) => `<li class="event-comment-row"><div><strong>${escapeHtml(item.authorNickname || item.email || "팬")}</strong><small>${escapeHtml(item.email || "")} · ${formatDateTime(item.createdAt)}</small><p>${escapeHtml(item.body)}</p></div><div class="event-comment-actions"><span class="badge ${item.status === "approved" ? "success-badge" : item.status === "rejected" ? "danger-badge" : "warning-badge"}">${item.status === "approved" ? "승인" : item.status === "rejected" ? "반려" : "검토 대기"}</span>${can("events:write") && item.status !== "approved" ? `<button class="secondary event-comment-review" data-event-id="${escapeHtml(event?.id || "")}" data-comment-id="${escapeHtml(item.id)}" data-status="approved">승인</button>` : ""}${can("events:write") && item.status !== "rejected" ? `<button class="secondary danger-text event-comment-review" data-event-id="${escapeHtml(event?.id || "")}" data-comment-id="${escapeHtml(item.id)}" data-status="rejected">반려</button>` : ""}</div></li>`).join("") : `<li class="event-modal-empty">${state.eventCommentsLoading ? "댓글 목록을 불러오는 중입니다." : "등록된 댓글이 없습니다."}</li>`;
  return `<div class="event-applicants-modal-backdrop" id="event-comments-modal-backdrop"><section class="event-applicants-modal event-comments-modal" role="dialog" aria-modal="true" aria-labelledby="event-comments-modal-title"><header><div><p class="eyebrow">COMMENTS</p><h3 id="event-comments-modal-title">댓글 검토</h3><p>${escapeHtml(event?.title || "이벤트")} · 전체 ${comments.length}개</p></div><button class="icon-button" id="close-event-comments" type="button" aria-label="댓글 검토 닫기">${icon("close")}</button></header><div class="event-modal-stats"><span>전체 <b>${comments.length}</b></span><span>대기 <b>${comments.filter((item) => item.status === "pending").length}</b></span><span>승인 <b>${comments.filter((item) => item.status === "approved").length}</b></span><span>반려 <b>${comments.filter((item) => item.status === "rejected").length}</b></span></div><ul class="event-modal-list event-comment-list">${rows}</ul></section></div>`;
}

function eventDetailPanel(event) {
  const canReview = can("events:review") && event.workflowStatus === "pending_review";
  const canPublish = can("events:publish") && ["approved", "scheduled"].includes(event.workflowStatus);
  const canSubmit = can("events:submit") && ["draft", "changes_requested"].includes(event.workflowStatus);
  const relatedCards = (event.relatedCardIds || []).map((id) => cardCatalogItems().find((card) => card.id === id)?.name || id).filter(Boolean);
  const artistName = scopedArtists().find((artist) => artist.id === event.artistId)?.name || "전체 서비스";
  const loadedApplicants = state.eventApplicantsEventId === event.id ? state.eventApplicants : [];
  const winnerCount = loadedApplicants.filter((item) => item.status === "winner").length;
  const previewUrl = `http://${window.location.hostname}:5174/events/${encodeURIComponent(event.id)}`;
  const lifecycleActions = `${canSubmit ? `<button class="primary event-submit" data-id="${escapeHtml(event.id)}">검수 요청</button>` : ""}${canReview ? `<button class="secondary event-review" data-id="${escapeHtml(event.id)}" data-decision="changes_requested">수정 요청</button><button class="primary event-review" data-id="${escapeHtml(event.id)}" data-decision="approve">승인</button>` : ""}${canPublish ? `<button class="primary event-publish" data-id="${escapeHtml(event.id)}">${event.workflowStatus === "scheduled" ? "공개하기" : "예약 공개"}</button>` : ""}${can("events:publish") && ["published", "scheduled"].includes(event.workflowStatus) ? `<button class="secondary danger-text event-end" data-id="${escapeHtml(event.id)}">종료</button>` : ""}`;
  return `<aside class="panel event-detail-panel"><header class="event-detail-header"><div><p class="eyebrow">EVENT DETAIL</p><h3>${escapeHtml(event.title)}</h3><span class="badge ${eventBadgeClass(event.workflowStatus)}">${escapeHtml(eventWorkflowLabel(event.workflowStatus))}</span></div><div class="event-detail-header-actions">${can("events:write") && event.workflowStatus !== "ended" ? `<button class="icon-button event-edit" data-id="${escapeHtml(event.id)}" aria-label="이벤트 편집">${icon("edit")}</button>` : ""}<button class="icon-button" id="close-event-detail" aria-label="닫기">${icon("close")}</button></div></header><div class="event-preview"><div class="event-preview-art">${event.heroUrl ? `<img data-event-hero src="${escapeHtml(resolveAdminAssetUrl(event.heroUrl))}" data-hero-url="${escapeHtml(event.heroUrl)}" alt="이벤트 배너" />` : `<div class="event-preview-fallback">${icon("campaign")}<strong>배너 이미지 없음</strong><small>이벤트 배너를 등록하면 여기에 표시됩니다.</small></div>`}</div><div class="event-preview-copy"><strong>${escapeHtml(event.summary || "설명 없음")}</strong><small>${eventTypeLabel(event.eventType)} · ${formatDate(event.startsAt)}${event.endsAt ? ` – ${formatDate(event.endsAt)}` : ""}</small></div></div><section class="event-summary-card"><div class="event-section-heading"><div><p class="eyebrow">OVERVIEW</p><h4>이벤트 요약</h4></div></div><dl class="event-summary-list"><div><dt>노출 우선순위</dt><dd>${event.priority ?? 0}</dd></div><div><dt>CTA</dt><dd>${escapeHtml(event.ctaLabel || "이벤트 보기")}</dd></div><div><dt>이벤트 유형</dt><dd>${eventTypeLabel(event.eventType)}</dd></div><div><dt>아티스트</dt><dd>${escapeHtml(artistName)}</dd></div><div><dt>장소</dt><dd>${escapeHtml(event.venue || "장소 미정")}</dd></div><div><dt>신청 마감</dt><dd>${event.applicationEndsAt ? formatDate(event.applicationEndsAt) : "제한 없음"}</dd></div><div><dt>참여 인원</dt><dd>${event.participantLimit ? `${event.participantLimit}명` : "제한 없음"}</dd></div><div><dt>신청자 · 당첨자</dt><dd>${event.applicantCount ?? 0}명 · ${winnerCount}명</dd></div><div class="event-summary-wide"><dt>관련 카드</dt><dd>${relatedCards.length ? escapeHtml(relatedCards.join(", ")) : "연결 없음"}</dd></div></dl></section>${event.eventType === "comment" ? eventCommentSummary(event) : eventApplicantSummary(event)}<footer class="event-detail-actions"><button class="secondary event-preview-open" data-preview-url="${escapeHtml(previewUrl)}">${icon("open_in_new")} 이벤트 미리보기</button>${lifecycleActions}</footer></aside>`;
}

async function loadEventHeroPreview() {
  const images = [...document.querySelectorAll("[data-event-hero]")];
  await Promise.all(images.map(async (image) => {
    const heroUrl = image.dataset.heroUrl;
    if (!heroUrl) return;
    try {
      let response = await fetch(resolveAdminAssetUrl(heroUrl), {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      });
      if (response.status === 401) {
        await refreshAccessToken();
        response = await fetch(resolveAdminAssetUrl(heroUrl), {
          credentials: "include",
          headers: {
            "X-Fanfolio-Client": "admin",
            ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
          },
        });
      }
      if (!response.ok) throw new Error(`HERO ${response.status}`);
      image.src = URL.createObjectURL(await response.blob());
    } catch {
      const fallback = document.createElement("div");
      fallback.className = image.closest(".event-upload-thumbnail") ? "event-upload-image-fallback" : "event-preview-fallback";
      fallback.innerHTML = `${icon("image_not_supported")}<strong>배너를 불러오지 못했습니다.</strong>`;
      image.replaceWith(fallback);
    }
  }));
}

async function loadCardPackDetail(packId, openComposition = false) {
  try {
    const result = await api(`/admin/card-packs/${encodeURIComponent(packId)}`);
    state.selectedCardPack = result.data;
    state.selectedCompositionCardId = result.data.cards?.[0]?.cardId || null;
    state.view = openComposition ? "card-pack-composition" : "card-packs";
    layout();
  } catch {
    toast("카드팩 상세를 불러오지 못했습니다.");
  }
}

async function createCardPack(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const artistId = String(form.get("artistId") || "");
  const cards = [...document.querySelectorAll("[data-pack-card]")]
    .filter((input) => input.checked)
    .map((input, position) => {
      const probabilityInput = [...document.querySelectorAll("[data-pack-card-probability]")]
        .find((candidate) => candidate.dataset.packCardProbability === input.dataset.packCard);
      return { cardId: input.dataset.packCard, position, probability: Number(probabilityInput?.value || 0), enabled: true };
    });
  if (!cards.length) {
    toast("카드팩에 포함할 카드를 하나 이상 선택해 주세요.");
    return;
  }
  const mismatchedCard = cards.find((entry) => {
    const card = cardCatalogItems().find((candidate) => candidate.id === entry.cardId);
    return card && artistId && (card.artistId || card.ownerArtistId) !== artistId;
  });
  if (mismatchedCard) {
    toast("카드팩의 아티스트와 포함 카드의 아티스트를 같게 선택해 주세요.");
    return;
  }
  try {
    const result = await api("/admin/card-packs", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        artistId,
        version: form.get("version"),
        seasonName: form.get("seasonName") || null,
        imageUrl: form.get("imageUrl") || null,
        description: form.get("description") || null,
        cards,
      }),
    });
    state.selectedCardPack = result.data;
    state.view = "card-pack-composition";
    await loadData();
    layout();
    toast("카드팩을 임시 저장했습니다. 구성과 확률을 확인해 주세요.");
  } catch (error) {
    toast(error?.message || "카드팩을 만들지 못했습니다. 입력값과 권한을 확인해 주세요.");
  }
}

async function publishCardPack(packId) {
  try {
    await api(`/admin/card-packs/${encodeURIComponent(packId)}/publish`, { method: "POST", body: "{}" });
    await loadData();
    await loadCardPackDetail(packId, true);
    toast("카드팩을 공개했습니다.");
  } catch (error) {
    toast(error?.message || "카드팩 공개에 실패했습니다. 카드 공개 상태와 확률 합계를 확인해 주세요.");
  }
}

async function createShopProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const detailContent = state.shopProductBlocks.map((block) => ({
    key: block.key,
    type: values[`block_type_${block.key}`] || block.type || "text",
    title: values[`block_title_${block.key}`] || block.title,
    body: values[`block_${block.key}`] || block.body || "",
    imageUrl: values[`block_image_${block.key}`] || block.imageUrl || null,
    alt: values[`block_alt_${block.key}`] || block.alt || null,
  }));
  const productId = state.shopProductDraft?.id;
  try {
    if (productId) {
      await api(`/admin/shop/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({
        name: values.name,
        description: values.description || null,
        imageUrl: values.imageUrl || null,
        pricePoints: Number(values.pricePoints),
        detailContent,
        inventoryLimit: values.inventoryLimit ? Number(values.inventoryLimit) : null,
        perUserLimit: values.perUserLimit ? Number(values.perUserLimit) : null,
        scheduledPublishAt: values.scheduledPublishAt || null,
        exposureSlot: values.exposureSlot || "shop",
      }) });
      toast("상점 상품을 수정했습니다.");
      state.view = "shop-products";
      state.shopProductDraft = null;
      await loadData();
      return;
    }
    await api("/admin/shop/products", { method: "POST", body: JSON.stringify({
      artistId: values.artistId,
      productType: values.productType || "card_pack",
      cardPackId: values.productType === "card_pack" ? values.cardPackId : null,
      fulfillment: values.productType === "card_pack" ? {} : { rewardId: values.rewardId },
      name: values.name,
      description: values.description || null,
      imageUrl: values.imageUrl || null,
      pricePoints: Number(values.pricePoints),
      detailContent,
      inventoryLimit: values.inventoryLimit ? Number(values.inventoryLimit) : null,
      perUserLimit: values.perUserLimit ? Number(values.perUserLimit) : null,
      scheduledPublishAt: values.scheduledPublishAt || null,
      exposureSlot: values.exposureSlot || "shop",
    }) });
    toast("상점 상품을 초안으로 저장했습니다.");
    state.view = "shop-products";
    state.shopProductDraft = null;
    await loadData();
  } catch (error) {
    toast(error.message || "상점 상품 저장에 실패했습니다.");
  }
}

async function publishShopProduct(productId) {
  try {
    await api(`/admin/shop/products/${encodeURIComponent(productId)}/publish`, { method: "POST", body: "{}" });
    toast("상점 상품을 공개했습니다.");
    await loadData();
  } catch (error) {
    toast(error.message || "상품 공개에 실패했습니다.");
  }
}

async function saveCardPackComposition(event) {
  event.preventDefault();
  const pack = state.selectedCardPack;
  if (!pack) return;
  const cards = (pack.cards || []).map((card, position) => ({
    cardId: card.cardId,
    position,
    probability: Number(document.querySelector(`[data-composition-probability="${CSS.escape(card.cardId)}"]`)?.value || 0),
    enabled: Boolean(document.querySelector(`[data-composition-enabled="${CSS.escape(card.cardId)}"]`)?.checked),
  }));
  try {
    const result = await api(`/admin/card-packs/${encodeURIComponent(pack.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        artistId: pack.artistId,
        name: pack.name,
        version: pack.version,
        seasonName: pack.seasonName || null,
        imageUrl: pack.imageUrl || null,
        description: pack.description || null,
        cards,
      }),
    });
    state.selectedCardPack = result.data;
    await loadData();
    layout();
    toast("카드팩 구성을 저장했습니다.");
  } catch (error) {
    toast(error?.message || "카드팩 구성을 저장하지 못했습니다. 확률 합계를 확인해 주세요.");
  }
}

function issuanceBatchViewModel(batch) {
    const card = cardCatalogItems().find((item) => item.id === batch.cardId) || null;
  const drop = state.drops.find((item) => item.id === batch.dropId) || null;
  const quantity = Number(batch.codeCount ?? batch.quantity ?? 0);
  const registered = Number(batch.usedCount || 0);
  const remaining = Math.max(0, quantity - registered);
  const expired = Boolean(batch.expiresAt && new Date(batch.expiresAt) <= new Date());
  const status = expired ? "만료" : remaining === 0 ? "등록 완료" : registered > 0 ? "발급 중" : "예약";
  const type = Number(batch.maxUsesPerCode || 1) === 1 ? "한정 특전" : "다회 사용 코드";
  return {
    batch,
    card,
    drop,
    quantity,
    registered,
    remaining,
    expired,
    status,
    type,
    title: card?.name || `${batch.prefix || "CARD"} 인증번호 배치`,
  };
}

function issuanceBatchRows(items, selectedBatchId = state.selectedBatchId) {
  if (!items.length) {
    return '<tr><td colspan="8" class="empty">조건에 맞는 발급 배치가 없습니다.</td></tr>';
  }
  return items.map((item) => {
    const imageUrl = item.card ? state.cardThumbnailUrls[item.card.id] : "";
    const selected = item.batch.id === selectedBatchId;
    const statusClass = item.status === "등록 완료" ? "success-badge" : item.status === "만료" ? "draft" : "warning-badge";
    return `<tr tabindex="0" data-batch-id="${escapeHtml(item.batch.id)}" class="${selected ? "selected-preview-row" : ""}"><td><div class="code-batch-name">${imageUrl ? `<span class="preview-card-thumb"><img src="${escapeHtml(imageUrl)}" alt="" /></span>` : `<span class="preview-card-thumb batch-placeholder">${icon("confirmation_number")}</span>`}<div><strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong><small>${escapeHtml(item.batch.prefix || item.batch.id)}</small></div></div></td><td>${escapeHtml(item.type)}</td><td>${item.quantity.toLocaleString()}장</td><td>${item.registered.toLocaleString()}장</td><td>${item.remaining.toLocaleString()}장</td><td><span class="badge success-badge">생성 완료</span></td><td><span class="badge ${statusClass}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(formatDate(item.batch.expiresAt))}</td></tr>`;
  }).join("");
}

function batchesView() {
  const published = cardCatalogItems().filter((card) => card.status === "published");
  const liveDrops = state.drops.filter((drop) => drop.status === "live");
  const canOpenBatchCreation = published.length > 0 && liveDrops.length > 0;
  const canCreateBatch = !isRoot() && can("codes:write") && canOpenBatchCreation;
  const query = state.issuanceQuery.trim().toLowerCase();
  const items = state.batches.map(issuanceBatchViewModel);
  const visibleItems = items.filter((item) => {
    const searchable = [item.title, item.batch.id, item.batch.prefix, item.card?.name, item.drop?.name].filter(Boolean).join(" ").toLowerCase();
    const statusMatches = state.issuanceStatus === "all" || item.status === state.issuanceStatus;
    const typeMatches = state.issuanceType === "all" || item.type === state.issuanceType;
    const periodMatches = state.issuancePeriod === "all" || (state.issuancePeriod === "active" ? !item.expired : item.expired);
    return (!query || searchable.includes(query)) && statusMatches && typeMatches && periodMatches;
  });
  const paged = pagedItems(visibleItems, state.issuancePage, 5);
  const selected = items.find((item) => item.batch.id === state.selectedBatchId) || paged.items[0] || visibleItems[0] || items[0] || null;
  const reservedCount = items.filter((item) => item.status === "예약").length;
  const issuingCount = items.filter((item) => item.status === "발급 중").length;
  const completedCount = items.filter((item) => item.status === "등록 완료").length;
  const remainingCount = items.reduce((sum, item) => sum + item.remaining, 0);
  const issuanceStatusOptions = [
    { value: "all", label: "전체 상태" },
    { value: "예약", label: "예약" },
    { value: "발급 중", label: "발급 중" },
    { value: "등록 완료", label: "등록 완료" },
    { value: "만료", label: "만료" },
  ];
  const issuanceTypeOptions = [
    { value: "all", label: "전체 카드 유형" },
    { value: "한정 특전", label: "한정 특전" },
    { value: "다회 사용 코드", label: "다회 사용 코드" },
  ];
  const issuancePeriodOptions = [
    { value: "all", label: "전체 기간" },
    { value: "active", label: "만료 전" },
    { value: "expired", label: "만료됨" },
  ];
  return `<section class="card-ops-page issue-code-preview production-issuance-page"><div class="card-ops-heading"><div><p class="eyebrow">ISSUANCE</p><h2>발급·인증번호</h2><p>카드 발급 배치와 인증번호 상태를 관리합니다.</p></div><button class="primary" type="button" data-view="issuance-create" ${canOpenBatchCreation ? "" : "disabled"}>${icon("add")} 추가 발급 배치 만들기</button></div><div class="card-ops-stats issue-stats"><article><span>${icon("calendar_month")}</span><small>예약 배치</small><strong>${reservedCount.toLocaleString()}개</strong></article><article><span>${icon("inventory_2")}</span><small>발급 중 배치</small><strong>${issuingCount.toLocaleString()}개</strong></article><article><span>${icon("check_circle")}</span><small>등록 완료 배치</small><strong>${completedCount.toLocaleString()}개</strong></article><article><span>${icon("schedule")}</span><small>잔여 수량</small><strong>${remainingCount.toLocaleString()}장</strong></article></div><div class="card-ops-master-detail issuance-master-detail"><section class="panel card-ops-table-panel"><div class="card-ops-toolbar"><label class="search-field">${icon("search")}<input id="issuance-search" value="${escapeHtml(state.issuanceQuery)}" placeholder="배치명, 카드명 검색" /></label>${adminSelect({ id: "issuance-status-filter", value: state.issuanceStatus, label: "발급 상태 필터", className: "filter-select issuance-status-filter", dataFilter: "status", options: issuanceStatusOptions })}${adminSelect({ id: "issuance-type-filter", value: state.issuanceType, label: "발급 상태 필터", className: "filter-select issuance-type-filter", dataFilter: "type", options: issuanceTypeOptions })}${adminSelect({ id: "issuance-period-filter", value: state.issuancePeriod, label: "기간 필터", className: "filter-select issuance-period-filter", dataFilter: "period", options: issuancePeriodOptions })}</div><div class="table-wrap"><table class="table"><thead><tr><th>배치명</th><th>카드 유형</th><th>수량</th><th>등록 완료</th><th>잔여 수량</th><th>인증번호 상태</th><th>상태</th><th>만료일</th></tr></thead><tbody>${issuanceBatchRows(paged.items, selected?.batch.id)}</tbody></table></div>${tablePagination("issuancePage", paged.page, visibleItems.length, 5)}</section>${issuanceDetailView(selected)}</div>${codeBatchPanel()}</section>`;
}

function issuanceCreationView() {
  const publishedCards = cardCatalogItems().filter((card) => card.status === "published");
  const liveDrops = state.drops.filter((drop) => drop.status === "live");
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  defaultExpiry.setMinutes(defaultExpiry.getMinutes() - defaultExpiry.getTimezoneOffset());
  const defaultExpiryValue = defaultExpiry.toISOString().slice(0, 16);
  const canCreateBatch = !isRoot() && can("codes:write") && publishedCards.length > 0 && liveDrops.length > 0;
  const readinessAction = isRoot() ? `<button class="secondary" type="button" data-view="guide">운영 가이드에서 권한 확인</button>` : "";
  const cardOptions = publishedCards.map((card) => {
    const artist = state.catalog.artists.find((item) => item.id === card.artistId);
    return {
      value: card.id,
      label: `${card.name} · ${artist?.name || card.artistId || "아티스트 미지정"}`,
    };
  });
  if (!cardOptions.length) cardOptions.push({ value: "", label: "공개 카드를 준비해 주세요." });
  const dropOptions = liveDrops.map((drop) => ({
    value: drop.id,
    label: `${drop.name} · ${drop.artistId || "아티스트 미지정"}`,
  }));
  if (!dropOptions.length) dropOptions.push({ value: "", label: "공개 중인 드롭을 준비해 주세요." });
  const readinessMessage = isRoot()
    ? "파트너 범위 발급은 기업 담당자 계정에서 진행해 주세요."
    : !can("codes:write")
    ? "발급 배치를 만들 권한이 없습니다."
    : !publishedCards.length
      ? "먼저 검수 승인된 공개 카드를 준비해 주세요."
      : !liveDrops.length
        ? "먼저 공개 중인 이벤트 또는 드롭을 준비해 주세요."
        : "생성 즉시 수량만큼 중복되지 않는 인증번호가 준비됩니다.";
  return `<section class="card-ops-page issuance-creation-preview production-issuance-creation">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>발급·인증번호</strong> <span>›</span> <strong>새 발급 배치 만들기</strong></nav><h2>새 발급 배치 만들기</h2><p>한정 특전과 이벤트 카드의 발급 대상, 수량, 인증번호 정책을 등록합니다.</p></div><span class="badge draft">초안</span></div>
    <div class="issuance-creation-layout"><form class="panel issuance-creation-form" id="batch-form"><div class="panel-heading"><div><p class="eyebrow">ISSUANCE BATCH</p><h3>배치 기본 정보</h3><p>등록 후 발급 현황과 인증번호 상태를 한 화면에서 추적할 수 있습니다.</p></div></div>
      <label class="field"><span>발급 카드</span>${adminSelect({ id: "batch-card", name: "cardId", value: cardOptions[0].value, label: "발급 카드", className: "form-select", options: cardOptions })}<small class="field-help">검수 승인 후 공개된 카드만 발급할 수 있습니다.</small></label>
      <label class="field"><span>연결 드롭</span>${adminSelect({ id: "batch-drop", name: "dropId", value: dropOptions[0].value, label: "연결 드롭", className: "form-select", options: dropOptions })}<small class="field-help">팬이 인증번호를 등록할 때 적용할 이벤트 또는 드롭입니다.</small></label>
      <div class="form-grid"><label class="field"><span>생성 수량</span><input name="quantity" type="number" min="1" max="100000" step="1" value="100" required /></label><label class="field"><span>코드당 사용 한도</span><input name="maxUsesPerCode" type="number" min="1" step="1" value="1" required /><small class="field-help">한정 특전은 1회를 권장합니다.</small></label></div>
      <div class="form-grid"><label class="field"><span>만료 일시</span><input name="expiresAt" type="datetime-local" value="${defaultExpiryValue}" required /></label><label class="field"><span>인증번호 접두어</span><input name="prefix" value="FANFOLIO" maxlength="24" pattern="[A-Za-z0-9_-]+" required /><small class="field-help">영문, 숫자, 하이픈, 밑줄만 사용할 수 있습니다.</small></label></div>
      <div class="issuance-creation-note ${canCreateBatch ? "ready" : "blocked"}">${icon(canCreateBatch ? "verified_user" : "info")}<span>${escapeHtml(readinessMessage)}</span>${readinessAction}</div>
      <footer class="drawer-footer"><button class="secondary" data-view="batches" type="button">취소</button><button class="primary" type="submit" ${canCreateBatch ? "" : "disabled"}>배치 만들기</button></footer>
    </form><aside class="panel issuance-creation-guide"><p class="eyebrow">WORKFLOW</p><h3>발급 배치 등록 순서</h3><ol><li class="active"><b>1</b><span><strong>대상 선택</strong><small>공개 카드와 라이브 드롭을 연결합니다.</small></span></li><li><b>2</b><span><strong>인증번호 사전 생성</strong><small>요청 수량만큼 고유 번호를 즉시 만듭니다.</small></span></li><li><b>3</b><span><strong>발급 현황 관리</strong><small>등록 완료와 잔여 수량을 추적합니다.</small></span></li></ol><div class="issuance-creation-note">카드팩에서 카드를 뽑는 순간 발급되는 번호는 카드팩 운영 흐름에서 별도로 관리됩니다. 이 화면은 한정 특전과 이벤트용 사전 생성 배치 전용입니다.</div></aside></div>
  </section>`;
}

function issuanceDetailView(item) {
  if (!item) return "";
  const { batch, card, drop, quantity, registered, remaining, status, type, title } = item.batch ? item : issuanceBatchViewModel(item);
  const statusClass = status === "등록 완료" ? "success-badge" : status === "만료" ? "draft" : "warning-badge";
  return `<aside class="panel issuance-detail-preview"><div class="detail-panel-heading"><div><small>배치 상세</small><h3>${escapeHtml(title)}</h3><p><span class="badge draft">${escapeHtml(type)}</span> <span class="badge ${statusClass}">${escapeHtml(status)}</span></p></div></div><section><h4>기본 정보</h4><dl><div><dt>배치 번호</dt><dd>${escapeHtml(batch.id)}</dd></div><div><dt>카드</dt><dd>${escapeHtml(card?.name || batch.cardId)}</dd></div><div><dt>연결 드롭</dt><dd>${escapeHtml(drop?.name || batch.dropId)}</dd></div><div><dt>수량</dt><dd>${quantity.toLocaleString()}장</dd></div><div><dt>코드당 사용 한도</dt><dd>${Number(batch.maxUsesPerCode || 1).toLocaleString()}회</dd></div><div><dt>만료일</dt><dd>${escapeHtml(formatDateTime(batch.expiresAt))}</dd></div></dl></section><section><h4>발급 현황</h4><dl><div><dt>등록 완료</dt><dd>${registered.toLocaleString()}장</dd></div><div><dt>잔여 수량</dt><dd>${remaining.toLocaleString()}장</dd></div></dl></section><section><h4>인증번호 상태</h4><dl><div><dt>생성 방식</dt><dd>사전 생성</dd></div><div><dt>생성 수</dt><dd>${quantity.toLocaleString()}개</dd></div><div><dt>상태</dt><dd><span class="badge success-badge">생성 완료</span></dd></div></dl></section><div class="detail-actions"><button class="secondary" data-batch-csv="${escapeHtml(batch.id)}" type="button">${icon("download")} CSV 내보내기</button><button class="secondary" data-batch-qr="${escapeHtml(batch.id)}" type="button">${icon("qr_code_2")} QR ZIP</button><button class="primary" data-open-batch-codes="${escapeHtml(batch.id)}" type="button">${icon("manage_search")} 인증번호 관리</button></div></aside>`;
}
function codeStatusLabel(status) {
  return (
    {
      active: "사용 가능",
      disabled: "비활성화",
      expired: "만료",
      exhausted: "사용 완료",
    }[status] || status
  );
}
function codeBatchPanel() {
  const selected = state.codeBatch;
  if (!selected) return "";
  return `<div class="panel"><div class="review-heading"><div><p class="eyebrow">개별 코드 관리</p><h2>${escapeHtml(selected.batchId)}</h2><p class="hint">코드가 유출되거나 훼손된 경우 해당 코드만 비활성화할 수 있습니다.</p></div><button class="secondary" id="close-code-batch">닫기</button></div><div class="table-wrap"><table class="table"><thead><tr><th>코드</th><th>상태</th><th>사용</th><th>만료</th><th>관리</th></tr></thead><tbody>${selected.items.length ? selected.items.map((code) => `<tr><td><code>${escapeHtml(code.code)}</code></td><td><span class="badge ${code.status !== "active" ? "draft" : ""}">${escapeHtml(codeStatusLabel(code.status))}</span></td><td>${code.usedCount}/${code.maxUses}</td><td>${code.expiresAt ? escapeHtml(new Date(code.expiresAt).toLocaleDateString("ko-KR")) : "-"}</td><td class="code-actions">${code.status === "active" ? `<button class="secondary show-code-qr" data-code="${escapeHtml(code.code)}">QR 보기</button><button class="secondary disable-code" data-code="${escapeHtml(code.code)}">비활성화</button>` : '<span class="eyebrow">변경 불가</span>'}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">표시할 코드가 없습니다.</td></tr>'}</tbody></table></div><p class="hint">전체 ${Number(selected.total).toLocaleString()}개 중 ${selected.items.length}개를 표시합니다.</p>${state.codeQr ? `<div class="code-qr-preview" role="dialog" aria-label="인증번호 QR 보기"><div class="review-heading"><div><p class="eyebrow">QR PREVIEW</p><h3>인증번호 QR</h3><code>${escapeHtml(state.codeQr.code)}</code></div><button class="secondary" id="close-code-qr" type="button">닫기</button></div><img src="${escapeHtml(state.codeQr.url)}" alt="${escapeHtml(state.codeQr.code)} QR 코드" /><p class="hint">이 QR은 팬앱의 QR 스캐너에서 인식할 수 있습니다.</p></div>` : ""}</div>`;
}
function dropsView() {
  const artists = scopedArtists();
  const artistOptions = artists.map((artist) => ({ value: artist.id, label: artist.name }));
  return `<div class="page-heading with-actions"><div><p class="eyebrow">DROP OPERATIONS</p><h2>드롭 운영</h2><p>승인된 카드를 팬에게 공개할 드롭을 만들고 발행 상태를 관리합니다.</p></div><span class="badge ${state.drops.some((drop) => drop.status === "live") ? "success-badge" : "draft"}">${state.drops.filter((drop) => drop.status === "live").length}개 공개 중</span></div><section class="panel"><div class="panel-heading"><div><h3>새 드롭 만들기</h3><span>아티스트를 선택한 뒤 기간을 설정하고 초안으로 저장합니다.</span></div></div><form id="drop-form" class="toolbar"><input class="search ops-control" name="name" placeholder="예: 2026 SUMMER 홀로그램 드롭" required />${adminSelect({ id: "drop-artist", name: "artistId", value: artists[0]?.id || "", label: "아티스트", className: "filter-select", options: artistOptions, required: true })}<label class="field"><span class="sr-only">시작 일시</span><input class="ops-control" name="startsAt" type="datetime-local" required /></label><label class="field"><span class="sr-only">종료 일시</span><input class="ops-control" name="endsAt" type="datetime-local" required /></label><button class="primary" type="submit" ${artists.length ? "" : "disabled"}>드롭 생성</button></form></section><section class="panel"><div class="panel-heading"><div><h3>등록된 드롭</h3><span>초안은 발행 요청 후 루트 관리자가 공개할 수 있습니다.</span></div><span>${state.drops.length}개</span></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>드롭</th><th>상태</th><th>기간</th><th>관리</th></tr></thead><tbody>${dropRows()}</tbody></table></div></section></div>`;
}

function batchRows() {
  if (!state.batches.length)
    return '<tr><td colspan="6" class="empty">생성된 코드 배치가 없습니다.</td></tr>';
  return state.batches
    .map(
      (batch) =>
        `<tr><td><strong>${escapeHtml(batch.id)}</strong><small>${escapeHtml(batch.prefix)}</small></td><td>${Number(batch.codeCount ?? batch.quantity).toLocaleString()}장</td><td>${Number(batch.usedCount || 0).toLocaleString()}장</td><td>${escapeHtml(new Date(batch.expiresAt).toLocaleDateString("ko-KR"))}</td><td><a class="text-link" href="${escapeHtml(`${API_BASE}${batch.csvExportUrl.replace(/^\/api/, "")}`)}" target="_blank" rel="noreferrer">CSV</a> <a class="text-link" href="${escapeHtml(`${API_BASE}${batch.qrZipUrl.replace(/^\/api/, "")}`)}" target="_blank" rel="noreferrer">QR ZIP</a></td><td><button class="secondary code-batch" data-id="${escapeHtml(batch.id)}">코드 보기</button></td></tr>`,
    )
    .join("");
}
function dropRows() {
  if (!state.drops.length)
    return '<tr><td colspan="4" class="empty">등록된 드롭이 없습니다.</td></tr>';
  return state.drops
    .map((drop) => {
      const action = isRoot()
        ? drop.status === "live"
          ? `<button class="secondary drop-status" data-id="${escapeHtml(drop.id)}" data-status="ended">종료하기</button>`
          : drop.status === "ended"
            ? '<span class="eyebrow">종료됨</span>'
            : `<button class="secondary drop-status" data-id="${escapeHtml(drop.id)}" data-status="live">공개하기</button>`
        : drop.status === "draft" && can("drops:submit")
          ? `<button class="secondary submit-drop" data-id="${escapeHtml(drop.id)}">발행 요청</button>`
          : drop.status === "pending_review"
            ? '<span class="eyebrow">검수 대기</span>'
            : drop.status === "live"
              ? '<span class="badge success-badge">공개 중</span>'
              : '<span class="eyebrow">종료됨</span>';
      return `<tr><td><strong>${escapeHtml(drop.name)}</strong><small>${escapeHtml(drop.artistId || "아티스트 미지정")}</small></td><td><span class="badge ${drop.status === "live" ? "success-badge" : "draft"}">${escapeHtml(drop.status === "pending_review" ? "검수 대기" : drop.status)}</span></td><td>${escapeHtml(drop.startsAt ? new Date(drop.startsAt).toLocaleDateString("ko-KR") : "-")} ~ ${escapeHtml(drop.endsAt ? new Date(drop.endsAt).toLocaleDateString("ko-KR") : "-")}</td><td>${action}</td></tr>`;
    })
    .join("");
}
function usersView() {
  const roleOptions = [
    { value: "all", label: "모든 역할" },
    { value: "fan", label: "팬" },
    { value: "artist", label: "아티스트" },
    { value: "admin", label: "관리자" },
  ];
  return `<div class="page-heading"><div><p class="eyebrow">SERVICE USERS</p><h2>서비스 사용자</h2><p>팬·아티스트 계정 상태와 서비스 역할을 관리합니다.</p></div></div><section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="user-search" placeholder="이메일 검색" value="${escapeHtml(state.userQuery)}" /></label>${adminSelect({ id: "user-role-filter", value: state.userRole, label: "사용자 역할 필터", className: "filter-select user-role-filter", options: roleOptions })}<button class="secondary" id="user-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>사용자</th><th>닉네임</th><th>온보딩</th><th>역할</th><th>운영</th></tr></thead><tbody>${userRows()}</tbody></table></div>${userPagination()}</section>${fan360Panel()}`;
}

function fan360Panel() {
  const fan = state.fan360;
  if (!fan) return "";
  const account = fan.account || {};
  const rows = (items, empty) => items?.length ? items.map((item) => `<li><strong>${escapeHtml(item.subject || item.productName || item.title || item.status || item.kind || "기록")}</strong><small>${escapeHtml(item.status || item.createdAt || item.updatedAt || "")}</small></li>`).join("") : `<li class="empty">${empty}</li>`;
  const cardRows = (fan.cards || []).map((card) => `<li><strong>${escapeHtml(card.name || card.cardId)}</strong><small>${escapeHtml(card.rarity || "카드")} · ${card.tradeLocked ? "거래 잠금" : "거래 가능"} · ${formatDate(card.acquiredAt)}</small></li>`).join("") || '<li class="empty">보유 카드가 없습니다.</li>';
  const pointRows = (fan.pointCharges || []).map((charge) => `<li><strong>${Number(charge.points).toLocaleString()}P 충전</strong><small>${Number(charge.priceWon).toLocaleString()}원 · ${escapeHtml(charge.status)} · ${formatDate(charge.createdAt)}</small></li>`).join("") || '<li class="empty">충전 내역이 없습니다.</li>';
  const ledgerRows = (fan.pointLedger || []).map((entry) => `<li><strong>${entry.amount >= 0 ? "+" : ""}${Number(entry.amount).toLocaleString()}P</strong><small>${escapeHtml(entry.description || entry.type)} · 잔액 ${Number(entry.balanceAfter).toLocaleString()}P · ${formatDate(entry.createdAt)}</small></li>`).join("") || '<li class="empty">포인트 원장 내역이 없습니다.</li>';
  const notificationStatus = fan.profile.emailNotificationsEnabled ? "이메일 알림 켜짐" : "이메일 알림 꺼짐";
  const supportContext = account.openSupportTickets ? `<div class="support-ticket-context warning"><strong>진행 중인 문의 ${Number(account.openSupportTickets).toLocaleString()}건</strong><span>고객센터 큐에서 담당자와 다음 조치를 확인하세요.</span></div>` : `<div class="support-ticket-context"><strong>진행 중인 문의 없음</strong><span>현재 별도 CS 조치가 필요하지 않습니다.</span></div>`;
  return `<section class="panel fan-360-panel"><div class="panel-heading"><div><p class="eyebrow">FAN 360 VIEW</p><h2>${escapeHtml(fan.profile.nickname || fan.profile.email || fan.profile.id)}</h2><p>${escapeHtml(fan.profile.email || fan.profile.id)} · ${escapeHtml(notificationStatus)} · 비밀번호·민감 목적지는 표시하지 않습니다.</p></div><button class="secondary" type="button" data-close-fan360>닫기</button></div>${supportContext}<div class="fan-360-summary"><span><small>포인트</small><strong>${Number(account.pointBalance || 0).toLocaleString()}P</strong></span><span><small>보유 카드</small><strong>${Number(account.cardCount || 0).toLocaleString()}장</strong></span><span><small>진행 문의</small><strong>${Number(account.openSupportTickets || 0).toLocaleString()}건</strong></span><span><small>온보딩</small><strong>${fan.profile.onboardingCompleted ? "완료" : "미완료"}</strong></span></div>${fan360ActivityTimeline(fan)}<div class="fan-360-columns"><section><h3>보유 카드</h3><ul>${cardRows}</ul></section><section><h3>최근 주문</h3><ul>${rows(fan.orders, "주문 내역이 없습니다.")}</ul></section><section><h3>거래</h3><ul>${rows(fan.trades, "거래 내역이 없습니다.")}</ul></section><section><h3>포인트 충전</h3><ul>${pointRows}</ul></section><section><h3>포인트 원장</h3><ul>${ledgerRows}</ul></section><section><h3>문의·신고</h3><ul>${rows(fan.supportTickets, "문의 내역이 없습니다.")}</ul></section><section><h3>최근 알림</h3><ul>${rows(fan.recentNotifications, "최근 알림이 없습니다.")}</ul></section></div></section>`;
}

function fan360ActivityTimeline(fan) {
  const sources = [
    ...(fan.orders || []).map((item) => ({ label: "주문", title: item.productName || "상품 주문", status: item.status, at: item.createdAt })),
    ...(fan.trades || []).map((item) => ({ label: "거래", title: "카드 거래", status: item.status, at: item.createdAt })),
    ...(fan.pointCharges || []).map((item) => ({ label: "포인트", title: `${Number(item.points || 0).toLocaleString()}P 충전`, status: item.status, at: item.createdAt })),
    ...(fan.supportTickets || []).map((item) => ({ label: "문의·신고", title: item.subject || item.category || "고객 문의", status: item.status, at: item.updatedAt })),
    ...(fan.recentNotifications || []).map((item) => ({ label: "알림", title: item.title || item.kind || "알림", status: item.isRead ? "읽음" : "미확인", at: item.createdAt })),
  ].filter((item) => item.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);
  const body = sources.length
    ? sources.map((item) => `<li><span class="fan-360-activity-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.label)} · ${escapeHtml(item.status || "기록")} · ${formatDate(item.at)}</small></div></li>`).join("")
    : '<li class="empty">확인할 활동 이력이 없습니다.</li>';
  return `<section class="fan-360-timeline"><div class="section-heading"><div><p class="eyebrow">CUSTOMER TIMELINE</p><h3>최근 활동</h3></div><span class="hint">최근 ${sources.length}건</span></div><ol>${body}</ol></section>`;
}
function adminAccountPanel() {
  const account = state.adminProvisionedAccount;
  return `<div class="panel"><h2>관리자 계정 발급</h2><p class="hint">담당자의 이메일을 등록하면 임시 비밀번호를 발급합니다. 이메일 발송은 나중에 연결하고, 현재는 안전한 경로로 직접 전달하세요.</p><form id="admin-account-form" class="toolbar"><input class="search" name="email" type="email" placeholder="manager@company.com" required /><input class="search" name="displayName" placeholder="담당자 이름" required /><button class="primary" type="submit">관리자 발급</button></form>${account ? `<div class="notice"><strong>발급 완료 · ${escapeHtml(account.email)}</strong><br />임시 비밀번호: <code>${escapeHtml(account.temporaryPassword)}</code><br /><small>지금만 확인할 수 있습니다. 담당자는 최초 로그인 후 본인 비밀번호로 변경합니다.</small></div>` : ""}</div>`;
}
function artistAccountRows() {
  if (!state.artistAccounts.length)
    return '<tr><td colspan="3" class="empty">발급된 스튜디오 계정이 없습니다.</td></tr>';
  return state.artistAccounts
    .map(
      (account) =>
        `<tr><td><div class="artist-account-name"><strong>${escapeHtml(account.username)}</strong><small>${escapeHtml(account.displayName || "담당자 이름 없음")}</small></div></td><td><span class="badge ${account.mustChangePassword ? "draft" : ""}">${account.mustChangePassword ? "첫 비밀번호 변경 대기" : "사용 중"}</span></td><td><button class="secondary" type="button" data-artist-reset="${escapeHtml(account.id)}">임시 비밀번호 재발급</button></td></tr>`,
    )
    .join("");
}
function artistAccountPanel() {
  const account = state.artistProvisionedAccount;
  const artistOptions = [{ value: "", label: "아티스트를 선택하세요" }, ...state.catalog.artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  const oneTimePassword = account
    ? `<div class="notice"><strong>${account.wasReset ? "비밀번호 재발급 완료" : "계정 발급 완료"} · ${escapeHtml(account.username)}</strong><br />임시 비밀번호: <code id="artist-temporary-password">${escapeHtml(account.temporaryPassword)}</code> <button class="secondary" id="copy-artist-temporary-password" type="button">복사</button><br /><small>평문 비밀번호는 지금만 표시됩니다. 담당자에게 안전한 경로로 전달하세요.</small></div>`
    : "";
  return `<div class="panel"><h2>아티스트 스튜디오 계정 발급</h2><p class="hint">개인별 아이디를 발급하고 담당 아티스트를 연결하세요. 임시 비밀번호는 생성 직후 한 번만 표시됩니다.</p><form id="artist-account-form" class="toolbar"><input class="search" name="username" placeholder="studio-id" pattern="[A-Za-z0-9._-]+" required /><input class="search" name="displayName" placeholder="담당자 또는 기업명" required />${adminSelect({ id: "artist-account-artist", name: "artistId", value: "", label: "담당 아티스트", className: "filter-select", options: artistOptions })}<button class="primary" type="submit">계정 발급</button></form>${oneTimePassword}<h2 class="subsection-title">아티스트 스튜디오 계정 목록</h2><p class="hint">계정은 데이터베이스에 유지됩니다. 비밀번호를 잊은 경우 계정을 다시 만들지 말고 재발급하세요.</p><div class="table-wrap"><table class="table"><thead><tr><th>계정</th><th>상태</th><th>복구</th></tr></thead><tbody>${artistAccountRows()}</tbody></table></div></div>`;
}
function artistProfileStatusLabel(status) {
  return (
    { pending: "검수 대기", verified: "승인됨", rejected: "반려됨" }[status] ||
    status
  );
}
function artistProfileRows() {
  if (!state.artistProfiles.length)
    return '<tr><td colspan="5" class="empty">검수할 아티스트가 없습니다.</td></tr>';
  return state.artistProfiles
    .map((profile) => {
      const artist = state.catalog.artists.find((item) => item.id === profile.artistId);
      return `<tr><td><strong>${escapeHtml(profile.email)}</strong><small>${escapeHtml(profile.userId)}</small></td><td>${escapeHtml(profile.nickname || "-")}</td><td><span class="scope-summary">${icon("group")} ${escapeHtml(artist?.name || "소속 미지정")}</span></td><td><span class="badge ${profile.verificationStatus === "verified" ? "" : "draft"}">${escapeHtml(artistProfileStatusLabel(profile.verificationStatus))}</span></td><td><button class="summary-edit-button profile-review-button" type="button" data-edit-artist-profile="${escapeHtml(profile.userId)}">${icon("fact_check")} 검수 설정</button></td></tr>`;
    })
    .join("");
}
function artistProfilesPanel() {
  return `<div class="panel"><div class="panel-heading"><div><p class="eyebrow">ROOT ONLY · ACCOUNT ACCESS</p><h2>아티스트 계정·소속 승인</h2><p class="hint">아티스트 스튜디오 계정의 소속 그룹과 접근 승인 상태를 관리합니다. 카드 검수는 카드 관리 메뉴에서 진행합니다.</p></div>${scopeContextChip()}</div><div class="table-wrap"><table class="table"><thead><tr><th>계정</th><th>닉네임</th><th>소속 그룹</th><th>현재 상태</th><th>접근 권한</th></tr></thead><tbody>${artistProfileRows()}</tbody></table></div></div>`;
}
function userRows() {
  if (!state.users.length)
    return '<tr><td colspan="5" class="empty">사용자가 없습니다.</td></tr>';
  return state.users
    .map((user) => {
      const roleControl = `<div class="role-cell">${accessRoleBadge(user.role, user.isCurrentUser)}${user.isCurrentUser ? "" : `<button class="role-edit-action" type="button" data-edit-user-role="${escapeHtml(user.id)}">${icon("edit")} 권한 변경</button>`}</div>`;
      const operationsCell = user.role === "fan"
        ? `<button class="secondary" type="button" data-open-fan360="${escapeHtml(user.id)}">운영 보기</button>`
        : '<span class="muted">팬 전용</span>';
      return `<tr><td><strong>${escapeHtml(user.email)}</strong><small>${escapeHtml(user.id)}</small></td><td>${escapeHtml(user.nickname || "-")}</td><td>${user.onboardingCompleted ? "완료" : "미완료"}</td><td>${roleControl}</td><td>${operationsCell}</td></tr>`;
    })
    .join("");
}
function userPagination() {
  const { page, pageSize, total } = state.userPagination;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return "";
  return `<div class="pagination"><button class="secondary user-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>이전</button><span>${page} / ${pages}</span><button class="secondary user-page" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>다음</button></div>`;
}
function auditRows() {
  if (!state.auditLogs.length)
    return '<tr><td colspan="4" class="empty">감사 로그가 없습니다.</td></tr>';
  return state.auditLogs
    .map(
      (log) =>
        `<tr><td>${escapeHtml(new Date(log.createdAt).toLocaleString("ko-KR"))}</td><td><strong>${escapeHtml(log.action)}</strong></td><td>${escapeHtml(log.actorId || "system")}</td><td>${escapeHtml(`${log.entityType}:${log.entityId}`)}</td></tr>`,
    )
    .join("");
}
function auditPagination() {
  const { page, pageSize, total } = state.auditPagination;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return "";
  return `<div class="pagination"><button class="secondary audit-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>이전</button><span>${page} / ${pages}</span><button class="secondary audit-page" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>다음</button></div>`;
}
function campaignsPanel() {
  const cardOptions = cardCatalogItems().map((card) => ({ value: card.id, label: `${card.name} · ${card.id}` }));
  const artistOptions = [{ value: "", label: "그룹 없음" }, ...state.catalog.artists.map((artist) => ({ value: artist.id, label: artist.name }))];
  const rows = state.campaigns.length
    ? state.campaigns
        .map(
          (campaign) =>
            `<tr><td><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.id)}</small></td><td>${escapeHtml(campaign.requiredCardIds.join(", "))}</td><td>${escapeHtml(campaign.benefitTitle)}${campaign.benefitDownloadAvailable ? " · 파일 있음" : ""}</td><td><span class="badge ${campaign.status === "active" ? "" : "draft"}">${campaign.status === "active" ? "활성" : "비활성"}</span></td><td><button class="secondary campaign-status" data-id="${escapeHtml(campaign.id)}" data-status="${campaign.status === "active" ? "disabled" : "active"}">${campaign.status === "active" ? "비활성화" : "활성화"}</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty">등록된 특전 캠페인이 없습니다.</td></tr>';
  return `<div class="panel campaign-panel"><h2>컬렉션 특전 캠페인</h2><p class="hint">공개 카드 중 조합할 카드를 선택하고 완성 특전 내용을 설정합니다. 선택한 파일은 팬이 클레임한 뒤 다운로드할 수 있습니다.</p><form class="toolbar" id="campaign-form"><input class="search" name="name" placeholder="캠페인 이름" required /><input class="search" name="seasonName" placeholder="시즌 (선택)" />${adminSelect({ id: "campaign-artist", name: "artistId", value: "", label: "그룹", className: "filter-select", options: artistOptions })}<label class="campaign-card-picker"><span>필수 카드</span>${adminMultiSelect({ id: "campaign-required-cards", name: "requiredCardIds", label: "캠페인 카드 선택", className: "form-multi-select", options: cardOptions })}<small>팬이 카드를 모두 모으면 특전을 받을 수 있습니다.</small></label><input class="search" name="benefitTitle" placeholder="특전 제목" required /><input class="search" name="benefitDescription" placeholder="특전 설명" required /><label class="field">특전 파일 (선택)<input class="search" name="benefitFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,audio/mpeg,audio/wav" /></label><button class="primary" type="submit">캠페인 등록</button></form><div class="table-wrap"><table class="table"><thead><tr><th>캠페인</th><th>필수 카드</th><th>특전</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function settingsView() {
  const person = state.adminContext?.user || {};
  const organization = state.adminContext?.organization?.name || (isRoot() ? "전체 서비스" : "미지정");
  const role = isRoot() ? "ROOT · 루트 관리자" : `${state.adminContext?.accessLevel || "viewer"} · ${organization}`;
  return `<div class="page-heading"><div><p class="eyebrow">ACCOUNT & SECURITY</p><h2>계정 설정</h2><p>현재 운영 계정과 접근 범위를 확인하고 보안 설정을 관리합니다.</p></div><button class="secondary" type="button" data-settings-password-change>${icon("password")} 비밀번호 변경</button></div><div class="settings-grid"><section class="panel settings-profile-card"><div class="settings-profile-icon">${escapeHtml((person.displayName || person.email || "관").slice(0, 1))}</div><div><p class="eyebrow">SIGNED IN ACCOUNT</p><h3>${escapeHtml(person.displayName || "관리자")}</h3><p>${escapeHtml(person.email || "이메일 정보 없음")}</p></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">ACCESS SCOPE</p><h3>접근 권한</h3></div><span class="badge success-badge">인증됨</span></div><dl class="settings-list"><div><dt>역할</dt><dd>${escapeHtml(role)}</dd></div><div><dt>운영 범위</dt><dd>${escapeHtml(organization)}</dd></div><div><dt>세션 정책</dt><dd>보안 쿠키 · 자동 갱신</dd></div></dl></section><section class="panel settings-action-card"><span class="settings-action-icon">${icon("security")}</span><div><h3>보안 권장사항</h3><p>관리자 계정은 공유하지 말고, 발급받은 임시 비밀번호는 최초 로그인 후 즉시 변경하세요.</p><button class="secondary" type="button" data-settings-password-change>비밀번호 변경하기</button></div></section></div>`;
}
let toastTimer = null;
function clearToast() {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = "";
  element.classList.remove("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = null;
}
function toast(message) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.classList.remove("show");
    element.textContent = "";
    toastTimer = null;
  }, 2600);
}
async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetchWithRetry(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Fanfolio-Client": "admin" },
    timeoutMs: 10000,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`REFRESH ${response.status}`);
      const body = await response.json();
      ACCESS_TOKEN = body.data.accessToken;
      return ACCESS_TOKEN;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}
async function fetchWithRetry(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 3 : 1;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : method === "GET" ? 8000 : 12000;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    let timeoutId = null;
    let removeExternalAbort = null;
    if (controller) {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      if (fetchOptions.signal) {
        const abortExternalRequest = () => controller.abort(fetchOptions.signal.reason);
        if (fetchOptions.signal.aborted) abortExternalRequest();
        else {
          fetchOptions.signal.addEventListener("abort", abortExternalRequest, { once: true });
          removeExternalAbort = () => fetchOptions.signal.removeEventListener("abort", abortExternalRequest);
        }
      }
    }
    try {
      return await fetch(url, controller ? { ...fetchOptions, signal: controller.signal } : fetchOptions);
    } catch (error) {
      const isNetworkFailure = error?.name === "TypeError" || (timedOut && error?.name === "AbortError");
      if (!isNetworkFailure || attempt === maxAttempts) throw error;
      console.warn(`Admin API network failure; retrying (${attempt}/${maxAttempts - 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 180));
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      removeExternalAbort?.();
    }
  }
  throw new Error("Admin API request failed");
}
async function api(path, options = {}, allowRefresh = true) {
  const headers = {
    "Content-Type": "application/json",
    "X-Fanfolio-Client": "admin",
    ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetchWithRetry(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  if (response.status === 401 && allowRefresh && !path.startsWith("/auth/")) {
    try {
      await refreshAccessToken();
      return api(path, options, false);
    } catch {
      ACCESS_TOKEN = "";
    }
  }
  if (!response.ok) {
    let detail = "";
    let errorCode = "";
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.detail || "";
      errorCode = body?.error?.code || "";
    } catch {
      detail = "";
    }
    const error = new Error(detail || `API ${response.status}`);
    error.status = response.status;
    error.code = errorCode;
    error.path = path;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function loadOptionalOperationalMetrics() {
  if (!can("audit:read")) return { data: null };
  try {
    return await api("/admin/card-operations/metrics");
  } catch (error) {
    // Operational counters are supplementary to the dashboard. An unavailable
    // metrics query must not hide the rest of the administrator workspace.
    if (error.status === 401) throw error;
    console.warn("Optional administrator metrics unavailable", error);
    return { data: null };
  }
}

async function loadOptionalOperationsOverview() {
  if (!can("audit:read")) return { data: null };
  try {
    return await api("/admin/operations/overview");
  } catch (error) {
    if (error.status === 401) throw error;
    console.warn("Optional operations overview unavailable", error);
    return { data: null };
  }
}

async function loadApprovals(renderAfter = true) {
  if (!can("audit:read")) {
    state.approvals = [];
    return { data: { items: [] } };
  }
  const result = await api("/admin/approvals");
  state.approvals = result.data.items || [];
  if (renderAfter) layout();
  return result;
}

async function loadContentCalendar(renderAfter = true) {
  if (!can("cards:read")) return;
  state.contentCalendarLoading = true;
  if (renderAfter) layout();
  try {
    const result = await api("/admin/content-calendar");
    state.contentCalendar = result.data.items || [];
    state.contentCalendarMessage = "";
  } catch (error) {
    if (error.status === 401) throw error;
    state.contentCalendarMessage = "실패: 공개 일정을 불러오지 못했습니다.";
  } finally {
    state.contentCalendarLoading = false;
    if (renderAfter) layout();
  }
}

async function createContentCalendar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await api("/admin/content-calendar", {
      method: "POST",
      body: JSON.stringify(values),
    });
    state.contentCalendarMessage = "공개 일정을 추가했습니다.";
    await loadContentCalendar(false);
    layout();
  } catch (error) {
    state.contentCalendarMessage = `실패: ${error?.message || "공개 일정을 추가하지 못했습니다."}`;
    layout();
  }
}

async function updateContentCalendarStatus(entryId, status) {
  try {
    await api(`/admin/content-calendar/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    state.contentCalendarMessage = "공개 일정 상태를 저장했습니다.";
    await loadContentCalendar(false);
    layout();
  } catch (error) {
    state.contentCalendarMessage = `실패: ${error?.message || "공개 일정 상태를 저장하지 못했습니다."}`;
    layout();
  }
}

async function loadOptionalApprovals() {
  if (!can("audit:read")) return { data: { items: [] } };
  try {
    return await api("/admin/approvals");
  } catch (error) {
    if (error.status === 401) throw error;
    console.warn("Optional approval queue unavailable", error);
    return { data: { items: [] } };
  }
}

async function loadOptionalAdminRequest(path, fallback, label) {
  try {
    return await api(path);
  } catch (error) {
    if (error.status === 401) throw error;
    console.warn(`Optional ${label} unavailable`, error);
    return fallback;
  }
}

async function loadPointChargeOperations(renderAfter = false) {
  if (!isRoot() || !can("engagement:points_adjust")) return;
  const [packages, charges] = await Promise.all([
    api("/admin/point-charge-packages"),
    api("/admin/point-charges"),
  ]);
  state.pointChargePackages = packages.data.items || [];
  state.pointCharges = charges.data.items || [];
  if (renderAfter) layout();
}

async function createPointChargePackage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await api("/admin/point-charge-packages", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    await loadPointChargeOperations(false);
    layout();
    toast("포인트 상품을 추가했습니다.");
  } catch (error) {
    toast(error?.message || "포인트 상품을 추가하지 못했습니다.");
  }
}

async function togglePointChargePackage(packageId, status) {
  try {
    await api(`/admin/point-charge-packages/${encodeURIComponent(packageId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadPointChargeOperations(false);
    layout();
    toast(status === "active" ? "포인트 상품 판매를 재개했습니다." : "포인트 상품 판매를 중지했습니다.");
  } catch (error) {
    toast(error?.message || "포인트 상품 상태를 변경하지 못했습니다.");
  }
}

async function updatePointChargePackage(button) {
  const row = button.closest("tr");
  const packageId = button.dataset.pointPackageId;
  const values = {
    label: row?.querySelector('[name="label"]')?.value.trim(),
    points: Number(row?.querySelector('[name="points"]')?.value),
    priceWon: Number(row?.querySelector('[name="priceWon"]')?.value),
    scheduledPublishAt: row?.querySelector('[name="scheduledPublishAt"]')?.value || null,
  };
  if (!packageId || !values.label || values.points <= 0 || values.priceWon <= 0) {
    toast("상품명·포인트·가격을 올바르게 입력해 주세요.");
    return;
  }
  try {
    await api(`/admin/point-charge-packages/${encodeURIComponent(packageId)}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
    await loadPointChargeOperations(false);
    layout();
    toast("포인트 상품 정보를 저장했습니다.");
  } catch (error) {
    toast(error?.message || "포인트 상품 정보를 저장하지 못했습니다.");
  }
}

function approvalKindLabel(kind) {
  return ({
    refund_order: "주문 환불",
    grant_points: "포인트 조정",
    product_publish: "상품 공개",
  })[kind] || kind || "운영 승인";
}

function approvalStatusLabel(status) {
  return ({ pending: "승인 대기", approved: "승인 완료", rejected: "반려" })[status] || status || "미정";
}

function approvalNextAction(status) {
  return ({ pending: "승인 또는 반려 필요", approved: "원 작업 반영 확인", rejected: "요청자에게 반려 사유 안내" })[status] || "상태 확인 필요";
}

function deliveryStatusLabel(status) {
  return ({ delivered: "전달 완료", failed: "전달 실패", retry: "자동 재시도 대기", dead_letter: "재시도 한도 초과", pending: "전달 대기" })[status] || status || "상태 미정";
}

function deliveryNextAction(status) {
  return ({ delivered: "추가 조치 없음", failed: "오류 확인 후 재시도", retry: "재시도 결과 확인", dead_letter: "원인 확인 후 수동 재처리", pending: "전달 결과 대기" })[status] || "상태 확인 필요";
}

function approvalsView() {
  const pending = state.approvals.filter((item) => item.status === "pending").length;
  const selected = state.approvals.find((item) => item.id === state.selectedApprovalId) || null;
  const rows = state.approvals.length
    ? state.approvals.map((item) => `<tr class="${item.id === state.selectedApprovalId ? "selected-approval-row" : ""}"><td><strong>${escapeHtml(approvalKindLabel(item.kind))}</strong><small>${escapeHtml(item.entityType)} · ${escapeHtml(item.entityId)}</small></td><td>${escapeHtml(item.reason || "사유 미입력")}</td><td>${escapeHtml(item.requestedBy)}</td><td><span class="badge ${item.status === "approved" ? "success-badge" : item.status === "rejected" ? "danger-badge" : "warning-badge"}">${escapeHtml(approvalStatusLabel(item.status))}</span><small class="approval-next-action">${escapeHtml(approvalNextAction(item.status))}</small></td><td><div class="approval-actions"><button class="secondary approval-detail-trigger" data-approval-detail="${escapeHtml(item.id)}">검토 내용</button>${item.status === "pending" ? `<button class="secondary approval-action" data-approval-action="approve" data-approval-id="${escapeHtml(item.id)}">승인</button><button class="secondary danger-text approval-action" data-approval-action="reject" data-approval-id="${escapeHtml(item.id)}">반려</button>` : `<small>${formatDate(item.decidedAt || item.createdAt)}</small>`}</div></td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">대기 중인 승인 요청이 없습니다.</td></tr>`;
  const detail = selected
    ? `<aside class="approval-detail-panel"><div class="panel-heading"><div><p class="eyebrow">REQUEST DETAIL</p><h3>${escapeHtml(approvalKindLabel(selected.kind))}</h3><span>${escapeHtml(selected.entityType || "대상")} · ${escapeHtml(selected.entityId || "대상 ID")}</span></div><span class="badge ${selected.status === "approved" ? "success-badge" : selected.status === "rejected" ? "danger-badge" : "warning-badge"}">${escapeHtml(approvalStatusLabel(selected.status))}</span></div><dl class="approval-detail-facts"><div><dt>요청자</dt><dd>${escapeHtml(selected.requestedBy || "미상")}</dd></div><div><dt>요청 사유</dt><dd>${escapeHtml(selected.reason || "사유 미입력")}</dd></div><div><dt>요청 시각</dt><dd>${escapeHtml(formatDate(selected.createdAt))}</dd></div></dl>${selected.status === "pending" ? `<label class="approval-reason-field">결정 사유<textarea data-approval-reason="${escapeHtml(selected.id)}" placeholder="승인 또는 반려 사유를 남겨 주세요."></textarea></label><div class="approval-detail-actions"><button class="primary approval-detail-action" data-approval-detail-action="approve" data-approval-id="${escapeHtml(selected.id)}">승인하고 기록</button><button class="secondary danger-text approval-detail-action" data-approval-detail-action="reject" data-approval-id="${escapeHtml(selected.id)}">반려하고 기록</button></div>` : `<p class="approval-decision-note">${escapeHtml(selected.decisionReason || "결정 사유가 기록되지 않았습니다.")}</p>`}</aside>`
    : `<aside class="approval-detail-panel approval-detail-empty"><span class="material-symbols-rounded" aria-hidden="true">fact_check</span><strong>승인 요청을 선택하세요</strong><p>검토 내용을 열면 요청 대상, 사유, 요청자와 승인·반려 기록을 확인할 수 있습니다.</p></aside>`;
  return `<div class="page-heading"><div><p class="eyebrow">DUAL CONTROL</p><h2>승인 큐</h2><p>환불·포인트 조정·상품 공개처럼 영향이 큰 운영 작업을 요청자와 별도 승인자로 분리합니다.</p></div><span class="badge ${pending ? "warning-badge" : "success-badge"}">${pending}건 대기</span></div><section class="panel approval-queue-panel"><div class="panel-heading"><div><h3>승인 요청</h3><span>승인 전에는 실제 원장·주문·공개 상태가 변경되지 않습니다.</span></div><button class="secondary" id="refresh-approvals" type="button">새로고침</button></div><div class="table-wrap"><table class="table"><thead><tr><th>요청 유형</th><th>사유</th><th>요청자</th><th>상태</th><th>조치</th></tr></thead><tbody>${rows}</tbody></table></div>${detail}</section>`;
}

async function decideApproval(approvalId, action) {
  try {
    const reason = document.querySelector(`[data-approval-reason="${CSS.escape(approvalId)}"]`)?.value.trim();
    await api(`/admin/approvals/${encodeURIComponent(approvalId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || (action === "reject" ? "관리자 승인 큐에서 반려" : "관리자 승인 큐에서 승인") }),
    });
    await loadApprovals(false);
    setOperationFeedback(action === "approve" ? "승인 요청을 처리했습니다. 원 작업 반영 상태를 확인하세요." : "승인 요청을 반려했습니다. 요청자에게 반려 사유를 안내하세요.");
    layout();
    toast(action === "approve" ? "승인 요청을 처리했습니다." : "승인 요청을 반려했습니다.");
  } catch (error) {
    setOperationFeedback(error?.message || "승인 요청을 처리하지 못했습니다. 큐 상태와 권한을 확인해 주세요.", "error");
    toast(error?.message || "승인 요청을 처리하지 못했습니다.");
  }
}
async function uploadAsset(file, purpose) {
  const presigned = await api("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      purpose,
    }),
  });
  const uploadUrl = presigned.data.uploadUrl.startsWith("http")
    ? presigned.data.uploadUrl
    : `${API_BASE.replace(/\/api$/, "")}${presigned.data.uploadUrl}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    credentials: presigned.data.uploadMode === "direct" ? "omit" : "include",
    headers: {
      "Content-Type": file.type,
      ...(presigned.data.uploadMode === "direct"
        ? {}
        : {
            "X-Fanfolio-Client": "admin",
            ...(ACCESS_TOKEN
              ? { Authorization: `Bearer ${ACCESS_TOKEN}` }
              : {}),
          }),
    },
  });
  if (!response.ok) throw new Error(`UPLOAD ${response.status}`);
  if (presigned.data.completeUrl)
    await api(presigned.data.completeUrl.replace(/^\/api/, ""), {
      method: "POST",
    });
  return presigned.data.assetId;
}
async function loginAdmin(event) {
  event.preventDefault();
  state.loginError = "";
  try {
    if (state.mustChangePassword) {
      const currentPassword = document.querySelector(
        "#admin-current-password",
      ).value;
      const newPassword = document.querySelector("#admin-new-password").value;
      await api("/auth/admin/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      state.mustChangePassword = false;
      state.loginError = "";
      await loadData();
      return;
    }
    const email = document.querySelector("#admin-login-email").value.trim();
    const password = document.querySelector("#admin-login-password").value;
    const result = await api("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    ACCESS_TOKEN = result.data.accessToken;
    state.authenticated = true;
    state.mustChangePassword = result.data.mustChangePassword;
    if (state.mustChangePassword) {
      layout();
      return;
    }
    await loadData();
  } catch (error) {
    if (state.mustChangePassword) {
      state.authenticated = true;
      state.loginError =
        error.status === 401
          ? "현재 비밀번호가 올바르지 않습니다."
          : error.status === 422
            ? "새 비밀번호는 12자 이상이며 현재 비밀번호와 달라야 합니다."
            : "비밀번호 변경에 실패했습니다. API 상태를 확인해 주세요.";
      layout();
      return;
    }
    ACCESS_TOKEN = "";
    state.authenticated = false;
    state.loginError =
      error.status === 401
        ? "이메일 또는 비밀번호가 올바르지 않습니다."
        : error.status === 502 || error.status === 503
          ? "서비스가 잠시 준비 중입니다. Render와 API 상태를 확인해 주세요."
          : "관리자 로그인에 실패했습니다. API 상태를 확인해 주세요.";
    layout();
  }
}

async function loadStatistics(renderAfter = true) {
  if (!can("statistics:read")) {
    state.statistics = null;
    return;
  }
  const params = new URLSearchParams({
    period: state.statisticsPeriod,
    compare: String(state.statisticsCompare),
  });
  if (state.statisticsOrganization !== "all")
    params.set("organizationId", state.statisticsOrganization);
  if (state.statisticsArtist !== "all")
    params.set("artistId", state.statisticsArtist);
  if (state.statisticsPack !== "all")
    params.set("packId", state.statisticsPack);
  const result = await api(`/admin/statistics?${params}`);
  state.statistics = result.data;
  state.error = "";
  if (renderAfter) layout();
}

async function loadAllRedeemCodeBatches(fallback = { data: { items: [], meta: { pagination: {} } } }) {
  const first = await loadOptionalAdminRequest(
    "/admin/redeem-code-batches?page=1&pageSize=100",
    fallback,
    "redeem code batches",
  );
  const pagination = first.data?.meta?.pagination || {};
  const total = Number(pagination.total || first.data?.items?.length || 0);
  const pageSize = Number(pagination.pageSize || 100);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount === 1 || !first.data?.items?.length) return first;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      loadOptionalAdminRequest(
        `/admin/redeem-code-batches?page=${index + 2}&pageSize=${pageSize}`,
        { data: { items: [] } },
        "redeem code batches",
      ),
    ),
  );
  return {
    ...first,
    data: {
      ...first.data,
      items: [
        ...(first.data.items || []),
        ...remaining.flatMap((result) => result.data?.items || []),
      ],
    },
  };
}

async function loadData() {
  state.error = "";
  try {
    const me = await api("/admin/me");
    state.adminContext = me.data;
    state.authenticated = true;
    if (!isRoot() && ["users"].includes(state.view)) {
      state.view = "dashboard";
    }
    const userParams = new URLSearchParams({
      page: String(state.userPage),
      pageSize: "20",
    });
    if (state.userQuery.trim()) userParams.set("q", state.userQuery.trim());
    if (state.userRole !== "all") userParams.set("role", state.userRole);
    const auditParams = new URLSearchParams({
      page: String(state.auditPage),
      pageSize: "50",
    });
    if (state.auditQuery.trim()) auditParams.set("q", state.auditQuery.trim());
    if (state.auditAction !== "all")
      auditParams.set("action", state.auditAction);
    const cardPackParams = new URLSearchParams({
      page: String(state.cardPackPage),
      pageSize: "10",
    });
    if (state.cardPackQuery.trim()) cardPackParams.set("q", state.cardPackQuery.trim());
    if (state.cardPackStatus !== "all") cardPackParams.set("status", state.cardPackStatus);
    if (state.cardPackArtist !== "all") cardPackParams.set("artistId", state.cardPackArtist);
    const [dashboard, cards, cardPacks, shopProducts, auditLogs, catalog, notifications, operationalMetrics, operationsOverview, approvals, statistics] = await Promise.all([
      api("/admin/dashboard"),
      loadCards(false).then(() => ({ data: { items: state.cards, meta: { pagination: state.cardPagination } } })),
      can("cards:read")
        ? api(`/admin/card-packs?${cardPackParams}`)
        : Promise.resolve({ data: { items: [] } }),
      can("cards:read")
        ? api("/admin/shop/products")
        : Promise.resolve({ data: { items: [] } }),
      api(`/admin/audit-logs?${auditParams}`),
      api("/admin/catalog"),
      api("/admin/notifications"),
      loadOptionalOperationalMetrics(),
      loadOptionalOperationsOverview(),
      loadOptionalApprovals(),
      can("statistics:read")
        ? loadStatistics(false).then(() => ({ data: state.statistics }))
        : Promise.resolve({ data: null }),
    ]);
    state.metrics = dashboard.data.metrics;
    state.operationalMetrics = operationalMetrics.data;
    state.operationsOverview = operationsOverview.data;
    state.approvals = approvals.data.items || [];
    state.recentActivity = dashboard.data.recentActivity || [];
    state.cards = cards.data.items;
    state.cardPagination = cards.data.meta?.pagination || state.cardPagination;
    state.cardPacks = cardPacks.data.items || [];
    state.cardPackPagination = cardPacks.data.meta?.pagination || {
      page: state.cardPackPage,
      pageSize: 10,
      total: state.cardPacks.length,
    };
    state.shopProducts = shopProducts.data.items || [];
    void loadCardThumbnails(state.cards);
    state.auditLogs = auditLogs.data.items;
    state.auditPagination = auditLogs.data.meta.pagination;
    state.catalog = catalog.data;
    await loadCardCatalog();
    state.notifications = notifications.data.items || [];
    state.unreadNotificationCount = notifications.data.unreadCount || 0;
    state.statistics = statistics.data;
    if (isRoot()) await loadPointChargeOperations(false);
    await loadOptionalFanGrowth();

    if (can("events:read")) await loadEvents(false);
    if (isRoot()) {
      const [
        drops,
        batches,
        users,
        campaigns,
        artistAccounts,
        artistProfiles,
      ] =
        await Promise.all([
          loadOptionalAdminRequest("/admin/drops", { data: { items: [] } }, "drops"),
          loadAllRedeemCodeBatches(),
          loadOptionalAdminRequest(`/admin/users?${userParams}`, { data: { items: [], meta: { pagination: {} } } }, "users"),
          loadOptionalAdminRequest("/admin/collection-campaigns", { data: { items: [] } }, "collection campaigns"),
          loadOptionalAdminRequest("/admin/artist-accounts", { data: { items: [] } }, "artist accounts"),
          loadOptionalAdminRequest("/admin/artist-profiles", { data: { items: [] } }, "artist profiles"),
        ]);
      state.drops = drops.data.items;
      state.batches = batches.data.items;
      state.users = users.data.items;
      state.userPagination = users.data.meta.pagination;
      state.campaigns = campaigns.data.items;
      state.artistAccounts = artistAccounts.data.items;
      state.artistProfiles = artistProfiles.data.items;
      state.artistProfilesLoaded = true;
      await loadOptionalOrganizations();
    } else {
      const dropsRequest = can("drops:read")
        ? api("/admin/drops")
        : Promise.resolve({ data: { items: [] } });
      const batchesRequest = can("codes:read")
        ? loadAllRedeemCodeBatches()
        : Promise.resolve({ data: { items: [] } });
      const requests = [dropsRequest, batchesRequest];
      if (state.adminContext.accessLevel === "company_admin") {
        requests.push(
          api(
            `/admin/organizations/${encodeURIComponent(state.adminContext.organization.id)}`,
          ),
          api(
            `/admin/organizations/${encodeURIComponent(state.adminContext.organization.id)}/members`,
          ),
        );
      }
      const results = await Promise.all(requests);
      state.drops = results[0].data.items;
      state.batches = results[1].data.items;
      state.users = [];
      state.campaigns = [];
      state.artistAccounts = [];
      state.artistProfiles = [];
      state.artistProfilesLoaded = false;
      if (state.adminContext.accessLevel === "company_admin") {
        state.selectedOrganization = results[2].data;
        state.selectedOrganizationId = state.selectedOrganization.id;
        state.organizations = [state.selectedOrganization];
        state.organizationMembers = results[3].data.items;
      } else {
        state.organizations = [];
        state.selectedOrganizationId = "";
        state.selectedOrganization = null;
        state.organizationMembers = [];
      }
    }
    if (!canViewFanGrowth() && state.view === "fan-growth") state.view = "dashboard";
    if (initialDrawer === "event" && can("events:write")) {
      state.view = "events";
      state.drawer = "event";
    }
    state.error = "";
  } catch (error) {
    if (error.status === 401) {
      ACCESS_TOKEN = "";
      state.authenticated = false;
      state.adminContext = null;
      state.loginError = "관리자 권한이 필요한 세션입니다.";
    } else if (error.status === 403) {
      state.error = "현재 관리자 권한으로 접근할 수 없는 작업입니다.";
    } else {
      const endpoint = error.path
        ? ` (${error.path}${error.status ? ` · HTTP ${error.status}` : ""})`
        : "";
      state.error =
        `관리자 데이터를 불러오지 못했습니다${endpoint}. 관리자 세션과 API 서버를 확인해 주세요.`;
    }
  }
  layout();
}

async function loadCardPacks(renderAfter = true) {
  if (!state.authenticated || !can("cards:read")) return;
  const params = new URLSearchParams({ page: String(state.cardPackPage), pageSize: "10" });
  if (state.cardPackQuery.trim()) params.set("q", state.cardPackQuery.trim());
  if (state.cardPackStatus !== "all") params.set("status", state.cardPackStatus);
  if (state.cardPackArtist !== "all") params.set("artistId", state.cardPackArtist);
  try {
    const result = await api(`/admin/card-packs?${params}`);
    state.cardPacks = result.data.items || [];
    state.cardPackPagination = result.data.meta?.pagination || {
      page: state.cardPackPage,
      pageSize: 10,
      total: state.cardPacks.length,
    };
    if (renderAfter) layout();
  } catch (error) {
    state.error = error?.message || "카드팩 목록을 불러오지 못했습니다.";
    if (renderAfter) layout();
  }
}

async function loadCards(renderAfter = true) {
  if (!state.authenticated || !can("cards:read")) return;
  const params = new URLSearchParams({ page: String(state.cardPage), pageSize: "10" });
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.status !== "all") params.set("status", state.status);
  if (state.cardArtist !== "all") params.set("artistId", state.cardArtist);
  try {
    const result = await api(`/admin/cards?${params}`);
    state.cards = result.data.items || [];
    state.cardPagination = result.data.meta?.pagination || {
      page: state.cardPage,
      pageSize: 20,
      total: state.cards.length,
    };
    void loadCardThumbnails(state.cards);
    if (renderAfter) layout();
  } catch (error) {
    state.error = error?.message || "카드 목록을 불러오지 못했습니다.";
    if (renderAfter) layout();
  }
}

async function loadCardCatalog() {
  if (!state.authenticated || !can("cards:read")) {
    state.cardCatalog = [];
    return;
  }
  try {
    const first = await api("/admin/cards?page=1&pageSize=100");
    const firstItems = first.data.items || [];
    const pagination = first.data.meta?.pagination || {};
    const totalPages = Math.max(1, Math.ceil(Number(pagination.total || firstItems.length) / 100));
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => api(`/admin/cards?page=${index + 2}&pageSize=100`)),
    );
    state.cardCatalog = [
      ...firstItems,
      ...remaining.flatMap((result) => result.data.items || []),
    ];
    void loadCardThumbnails(state.cardCatalog);
  } catch (error) {
    // The paged card table remains usable even if the optional full catalog fetch fails.
    state.cardCatalog = state.cards;
  }
}

async function loadAdminNotifications(renderAfter = true) {
  const result = await api("/admin/notifications");
  state.notifications = result.data.items || [];
  state.unreadNotificationCount = result.data.unreadCount || 0;
  if (renderAfter) layout();
}

const supportPageSize = 10;
const supportStatusLabels = { open: "접수", in_progress: "처리 중", answered: "답변 완료", closed: "종료" };
const supportCategoryLabels = { general: "일반 문의", card: "카드", trade: "거래", order: "주문", report: "신고·분쟁" };
const supportEvidenceLabels = {
  record_evidence: "근거 기록",
  case_note: "운영 근거 기록",
  approval_requested: "승인 요청 생성",
  approval_approved: "승인 완료",
  approval_rejected: "승인 반려",
  collection_hidden: "공개 컬렉션 숨김",
  collection_restored: "공개 컬렉션 복구",
  trade_hold: "거래 보류",
  trade_release: "거래 보류 해제",
  refund_order: "환불 승인 요청",
  grant_points: "포인트 승인 요청",
  hide_collection: "공개 컬렉션 숨김",
  restore_collection: "공개 컬렉션 복구",
};
function supportStatusLabel(status) { return supportStatusLabels[status] || "확인 필요"; }
function supportCategoryLabel(category) { return supportCategoryLabels[category] || "일반 문의"; }
function supportEvidenceLabel(kind) { return supportEvidenceLabels[kind] || "운영 조치"; }

async function loadSupportTickets(renderAfter = true) {
  if (!can("support:read")) return;
  const page = Math.max(1, Number(state.supportPagination.page) || 1);
  const params = new URLSearchParams({ page: String(page), pageSize: String(supportPageSize) });
  if (state.supportQuery.trim()) params.set("q", state.supportQuery.trim());
  if (state.supportStatus !== "all") params.set("status", state.supportStatus);
  if (state.supportCategory !== "all") params.set("category", state.supportCategory);
  const result = await api(`/admin/support-tickets?${params}`);
  state.supportTickets = result.data.items || [];
  const pagination = result.data.meta?.pagination || result.data.pagination || {};
  const total = Number(pagination.total ?? state.supportTickets.length);
  state.supportPagination = { ...state.supportPagination, ...pagination, page, pageSize: supportPageSize, total, totalPages: Number(pagination.totalPages) || Math.max(1, Math.ceil(total / supportPageSize)) };
  if (state.selectedSupportTicket) {
    const selected = state.supportTickets.find(item => item.id === state.selectedSupportTicket.id);
    if (selected) state.selectedSupportTicket = selected;
  }
  if (renderAfter) layout();
}

async function openSupportTicket(ticketId) {
  try {
    const result = await api(`/admin/support-tickets/${encodeURIComponent(ticketId)}`);
    state.selectedSupportTicket = result.data;
    if (state.supportActivityDetailTicketId !== ticketId) {
      state.supportActivityDetailTicketId = ticketId;
      state.supportActivityDetailIndex = null;
    }
    layout();
  } catch {
    toast("문의 내용을 불러오지 못했습니다.");
  }
}

async function updateSupportTicketStatus(ticketId, status) {
  try {
    await api(`/admin/support-tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadSupportTickets(false);
    setOperationFeedback("문의 상태를 변경했습니다. 담당자와 다음 응답 기한을 확인하세요.");
    if (state.selectedSupportTicket?.id === ticketId) await openSupportTicket(ticketId);
    else layout();
    toast("문의 상태를 변경했습니다.");
  } catch {
    setOperationFeedback("문의 상태를 변경하지 못했습니다. 상태와 권한을 확인해 주세요.", "error");
    toast("문의 상태를 변경하지 못했습니다.");
  }
}

async function updateSupportTicketAssignee(ticketId, assignedAdminId) {
  if (!ticketId || !assignedAdminId) return;
  try {
    await api(`/admin/support-tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      body: JSON.stringify({ assignedAdminId }),
    });
    await loadSupportTickets(false);
    setOperationFeedback("담당자를 배정했습니다. 담당자가 후속 조치를 진행할 수 있습니다.");
    await openSupportTicket(ticketId);
    toast("담당자를 배정했습니다.");
  } catch (error) {
    setOperationFeedback(error?.message || "담당자를 배정하지 못했습니다. 권한과 담당자 목록을 확인해 주세요.", "error");
    toast(error?.message || "담당자를 배정하지 못했습니다.");
  }
}

async function replySupportTicket(event) {
  event.preventDefault();
  const ticketId = event.currentTarget.dataset.ticketId || event.currentTarget.dataset.supportReply;
  const body = new FormData(event.currentTarget).get("body");
  if (!ticketId || typeof body !== "string" || body.trim().length < 2) return;
  try {
    await api(`/admin/support-tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim() }),
    });
    await loadSupportTickets(false);
    setOperationFeedback("답변을 등록했습니다. 문의 상태와 운영 활동에 기록되었습니다.");
    await openSupportTicket(ticketId);
    toast("답변을 등록했습니다.");
  } catch {
    setOperationFeedback("답변을 등록하지 못했습니다. 내용을 확인해 주세요.", "error");
    toast("답변을 등록하지 못했습니다.");
  }
}

async function actSupportTicket(ticketId, action, referenceId = null, note = null, amount = null) {
  try {
    await api(`/admin/support-tickets/${encodeURIComponent(ticketId)}/actions`, {
      method: "POST",
      body: JSON.stringify({ action, referenceId, note, amount }),
    });
    await loadSupportTickets(false);
    setOperationFeedback(action === "record_evidence" ? "운영 근거를 기록했습니다." : "운영 조치를 등록했습니다. 승인 큐와 결과를 확인하세요.");
    await openSupportTicket(ticketId);
    toast(action === "record_evidence" ? "운영 근거를 기록했습니다." : "운영 조치를 기록했습니다.");
  } catch (error) {
    setOperationFeedback(error?.message || "운영 조치를 처리하지 못했습니다. 대상과 권한을 확인해 주세요.", "error");
    toast(error?.message || "운영 조치를 처리하지 못했습니다.");
  }
}

async function loadDeliveryQueue(renderAfter = true) {
  if (!can("engagement:retry")) return;
  const params = new URLSearchParams({ page: "1", pageSize: "50" });
  if (state.deliveryStatus !== "all") params.set("status", state.deliveryStatus);
  if (state.deliveryChannel !== "all") params.set("channel", state.deliveryChannel);
  const result = await api(`/admin/notification-deliveries?${params}`);
  state.deliveryItems = result.data.items || [];
  state.deliveryPagination = result.data.pagination || state.deliveryPagination;
  state.error = "";
  if (renderAfter) layout();
}

async function retryDelivery(deliveryId) {
  try {
    await api(`/admin/notification-deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: "POST",
      body: "{}",
    });
    setOperationFeedback("전달 작업을 재시도 대기열에 넣었습니다. 다음 전달 결과를 확인하세요.");
    await loadDeliveryQueue(true);
    toast("전달 작업을 재시도 대기열에 넣었습니다.");
  } catch {
    setOperationFeedback("전달 작업을 재시도하지 못했습니다. 실패 원인과 권한을 확인해 주세요.", "error");
    toast("전달 작업을 재시도하지 못했습니다.");
  }
}

async function retryEngagementEvent(eventId) {
  try {
    await api(`/admin/engagement/events/${encodeURIComponent(eventId)}/retry`, {
      method: "POST",
      body: "{}",
    });
    setOperationFeedback("성장 이벤트를 재처리 대기열에 넣었습니다. 팬 진행도 반영 결과를 확인하세요.");
    await loadFanGrowth();
    toast("성장 이벤트를 재처리 대기열에 넣었습니다.");
  } catch (error) {
    setOperationFeedback(error?.message || "성장 이벤트를 재처리하지 못했습니다. 실패 원인과 권한을 확인해 주세요.", "error");
    toast("성장 이벤트를 재처리하지 못했습니다.");
  }
}

function supportActivityDescriptor(item) {
  const kind = item.kind || "";
  const targetId = item.referenceId || item.targetId || "";
  const targetByKind = {
    trade_hold: "거래",
    trade_release: "거래",
    refund_order: "주문",
    grant_points: "포인트 조정",
    hide_collection: "공개 컬렉션",
    restore_collection: "공개 컬렉션",
    collection_hidden: "공개 컬렉션",
    collection_restored: "공개 컬렉션",
    approval_requested: "승인 요청",
  };
  const copy = {
    trade_hold: ["거래 보류 조치", "분쟁 검토를 위해 거래의 추가 이동을 제한했습니다."],
    trade_release: ["거래 보류 해제", "검토가 끝난 거래의 보류를 해제했습니다."],
    refund_order: ["환불 승인 요청", "주문 환불을 승인 큐에 등록했습니다."],
    grant_points: ["포인트 지급 승인 요청", "포인트 조정 작업을 승인 큐에 등록했습니다."],
    hide_collection: ["공개 컬렉션 숨김", "사용자 공개 컬렉션을 팬앱에서 숨겼습니다."],
    restore_collection: ["공개 컬렉션 복구", "숨겨진 공개 컬렉션을 다시 노출했습니다."],
    collection_hidden: ["공개 컬렉션 숨김", "사용자 공개 컬렉션을 팬앱에서 숨겼습니다."],
    collection_restored: ["공개 컬렉션 복구", "숨겨진 공개 컬렉션을 다시 노출했습니다."],
    record_evidence: ["운영 근거 기록", item.note || "문의 처리를 위한 운영 근거를 기록했습니다."],
    case_note: ["운영 근거 기록", item.note || "문의 처리를 위한 운영 근거를 기록했습니다."],
    approval_requested: ["승인 요청 생성", "위험 작업을 승인 큐에 등록했습니다."],
    approval_approved: ["승인 완료", "승인 요청이 처리되었습니다."],
    approval_rejected: ["승인 반려", "승인 요청이 반려되었습니다."],
  };
  const fallbackLabel = kind
    ? kind.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")
    : "운영 기록";
  const [label, description] = copy[kind] || [supportEvidenceLabel(kind) === "운영 조치" ? fallbackLabel : supportEvidenceLabel(kind), item.note || "문의 처리 과정에서 운영 기록이 남았습니다."];
  return { label, description, targetLabel: targetByKind[kind] || (targetId ? "운영 대상" : "문의"), targetId };
}

function supportActivityTimeline(ticket) {
  const activities = [
    ...(ticket?.messages || []).map((message) => ({
      at: message.createdAt,
      label: "고객센터 메시지",
      actor: message.author?.nickname || message.author?.email || message.authorUserId || "사용자",
      body: message.body,
      kind: "message",
      targetLabel: "문의 내용",
      targetId: ticket?.id || "",
    })),
    ...(ticket?.evidence || []).map((item) => ({
      at: item.createdAt || item.updatedAt,
      ...supportActivityDescriptor(item),
      actor: item.actor?.nickname || item.actor?.email || item.actorUserId || "관리자",
      body: item.note || supportActivityDescriptor(item).description,
      kind: item.kind,
      targetId: item.referenceId || item.targetId || "",
      raw: item,
    })),
  ].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const selectedIndex = state.supportActivityDetailTicketId === ticket?.id && Number.isInteger(state.supportActivityDetailIndex)
    ? state.supportActivityDetailIndex
    : null;
  const selected = selectedIndex !== null && activities[selectedIndex] ? activities[selectedIndex] : null;
  const detail = selected
    ? `<section class="support-activity-detail-panel"><div class="section-heading"><div><p class="eyebrow">ACTIVITY DETAIL</p><h4>${escapeHtml(selected.label)}</h4></div><button type="button" class="text-button" data-support-activity-close>닫기</button></div><p class="support-activity-detail-description">${escapeHtml(selected.description || selected.body || "운영 기록")}</p><dl><div><dt>대상</dt><dd>${escapeHtml(selected.targetLabel || "문의")}</dd></div><div><dt>처리자</dt><dd>${escapeHtml(selected.actor)} · ${escapeHtml(formatDate(selected.at))}</dd></div>${selected.targetId ? `<div><dt>원문 ID</dt><dd class="support-activity-raw-id"><code>${escapeHtml(selected.targetId)}</code><button type="button" class="text-button" data-support-activity-copy="${escapeHtml(selected.targetId)}">ID 복사</button></dd></div>` : ""}</dl></section>`
    : "";
  return activities.length
    ? `<section class="support-activity-timeline"><div class="section-heading"><div><p class="eyebrow">CASE HISTORY</p><h3>운영 활동</h3><p class="hint">문자열 대신 사건과 대상을 기준으로 표시했습니다. 항목을 선택하면 처리 근거를 확인할 수 있습니다.</p></div><span class="hint">${activities.length}건</span></div><ol>${activities.map((item, index) => `<li class="support-activity-item"><span class="support-activity-dot" aria-hidden="true"></span><button type="button" class="support-activity-entry ${selectedIndex === index ? "selected" : ""}" data-support-activity-detail="${index}"><span class="support-activity-entry-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.actor)} · ${formatDate(item.at)}</small><p>${escapeHtml(item.body)}</p>${item.targetId ? `<span class="support-activity-target">대상: ${escapeHtml(item.targetLabel)} · <code>${escapeHtml(item.targetId)}</code></span>` : ""}</span><span class="support-activity-open">상세 보기</span></button></li>`).join("")}</ol>${detail}</section>`
    : `<section class="support-activity-timeline empty"><div class="section-heading"><div><p class="eyebrow">CASE HISTORY</p><h3>운영 활동</h3></div></div><p class="hint">아직 기록된 운영 활동이 없습니다.</p></section>`;
}

function legacyDeliveriesView() {
  const rows = state.deliveryItems.length
    ? state.deliveryItems.map((item) => {
      const retryable = ["failed", "retry", "dead_letter"].includes(item.status);
      const statusClass = item.status === "delivered" ? "success-badge" : retryable ? "warning-badge" : "draft";
      return `<tr><td><strong>${escapeHtml(item.notification?.title || item.notification?.kind || "알림")}</strong><small>${escapeHtml(item.notification?.kind || "")}</small></td><td>${escapeHtml(item.channel)}</td><td><span class="badge ${statusClass}">${escapeHtml(deliveryStatusLabel(item.status))}</span><small class="delivery-next-action">${escapeHtml(deliveryNextAction(item.status))}</small></td><td>${Number(item.attemptCount || 0).toLocaleString()}회</td><td>${escapeHtml(item.lastError || "-")}</td><td>${retryable ? `<button type="button" class="secondary delivery-retry" data-delivery-retry="${escapeHtml(item.id)}">재시도</button>` : "-"}</td></tr>`;
    }).join("")
    : '<tr><td colspan="6" class="empty">조건에 맞는 전달 작업이 없습니다.</td></tr>';
  const hasDeliveryFilter = state.deliveryStatus !== "failed" || state.deliveryChannel !== "all";
  return `<div class="page-heading"><div><p class="eyebrow">DELIVERY OPERATIONS</p><h2>전달 실패 큐</h2><p>이메일·푸시 전달 실패를 확인하고 destination을 노출하지 않은 채 재처리합니다.</p></div></div><section class="panel delivery-queue-panel"><div class="toolbar compact-toolbar ops-form"><label class="sr-only" for="delivery-status-filter">전달 상태 필터</label><select class="ops-control" id="delivery-status-filter"><option value="failed" ${state.deliveryStatus === "failed" ? "selected" : ""}>전달 실패</option><option value="pending" ${state.deliveryStatus === "pending" ? "selected" : ""}>전달 대기</option><option value="retry" ${state.deliveryStatus === "retry" ? "selected" : ""}>재시도 대기</option><option value="dead_letter" ${state.deliveryStatus === "dead_letter" ? "selected" : ""}>재시도 한도 초과</option><option value="all" ${state.deliveryStatus === "all" ? "selected" : ""}>전체 상태</option></select><label class="sr-only" for="delivery-channel-filter">전달 채널 필터</label><select class="ops-control" id="delivery-channel-filter"><option value="all" ${state.deliveryChannel === "all" ? "selected" : ""}>전체 채널</option><option value="email" ${state.deliveryChannel === "email" ? "selected" : ""}>이메일</option><option value="push" ${state.deliveryChannel === "push" ? "selected" : ""}>푸시</option></select>${hasDeliveryFilter ? `<button class="text-button delivery-filter-reset" id="delivery-filter-reset" type="button">${icon("restart_alt")} 필터 초기화</button>` : ""}<span class="panel-count">${Number(state.deliveryPagination.total || 0).toLocaleString()}건</span></div><div class="table-wrap"><table class="table responsive-table delivery-table"><thead><tr><th>알림</th><th>채널</th><th>상태</th><th>시도</th><th>최근 오류</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function deliveriesView() {
  const statusOptions = [
    { value: "failed", label: "전달 실패" },
    { value: "pending", label: "전달 대기" },
    { value: "retry", label: "재시도 대기" },
    { value: "dead_letter", label: "재시도 한도 초과" },
    { value: "all", label: "전체 상태" },
  ];
  const channelOptions = [
    { value: "all", label: "전체 채널" },
    { value: "email", label: "이메일" },
    { value: "push", label: "푸시" },
  ];
  return legacyDeliveriesView()
    .replace(
      /<label class="sr-only" for="delivery-status-filter">전달 상태 필터<\/label><select class="ops-control" id="delivery-status-filter">[\s\S]*?<\/select>/,
      `${adminSelect({ id: "delivery-status-filter", value: state.deliveryStatus, label: "전달 상태 필터", className: "filter-select delivery-status-filter", dataDeliveryFilter: "status", options: statusOptions })}`,
    )
    .replace(
      /<label class="sr-only" for="delivery-channel-filter">전달 채널 필터<\/label><select class="ops-control" id="delivery-channel-filter">[\s\S]*?<\/select>/,
      `${adminSelect({ id: "delivery-channel-filter", value: state.deliveryChannel, label: "전달 채널 필터", className: "filter-select delivery-channel-filter", dataDeliveryFilter: "channel", options: channelOptions })}`,
    );
}

function legacySupportView() {
  const rows = state.supportTickets.length
    ? state.supportTickets.map(ticket => `<button type="button" class="support-ticket-row ${state.selectedSupportTicket?.id === ticket.id ? "selected" : ""}" data-support-ticket="${escapeHtml(ticket.id)}"><span><strong>${escapeHtml(ticket.subject)}</strong><small>${escapeHtml(ticket.owner?.nickname || ticket.owner?.email || ticket.userId)} · ${escapeHtml(supportCategoryLabel(ticket.category))}</small></span><span class="badge ${ticket.status === "closed" ? "success-badge" : ticket.status === "answered" ? "draft" : "warning-badge"}">${escapeHtml(supportStatusLabel(ticket.status))}</span></button>`).join("")
    : "";
  const ticket = state.selectedSupportTicket;
  const supportPagination = state.supportPagination || {};
  const assignees = [
    ...(state.users || []).filter((user) => user.role === "admin"),
    ...(state.adminContext?.user?.id && !(state.users || []).some((user) => user.id === state.adminContext.user.id)
      ? [{ id: state.adminContext.user.id, email: state.adminContext.user.email, nickname: state.adminContext.user.displayName }]
      : []),
  ];
  const assigneeSelectOptions = [{ value: "", label: "담당자 없음" }, ...assignees.map((admin) => ({ value: admin.id, label: admin.nickname || admin.email || admin.id }))];
  const statusSelectOptions = [
    { value: "open", label: "접수" },
    { value: "in_progress", label: "처리 중" },
    { value: "answered", label: "답변 완료" },
    { value: "closed", label: "종료" },
  ];
  const assigneeOptions = assignees.length
    ? assignees.map((admin) => `<option value="${escapeHtml(admin.id)}" ${admin.id === ticket?.assignedAdminId ? "selected" : ""}>${escapeHtml(admin.nickname || admin.email || admin.id)}</option>`).join("")
    : `<option value="${escapeHtml(ticket?.assignedAdminId || "")}" selected>${escapeHtml(ticket?.assignedAdminId || "담당자 없음")}</option>`;
  const canHideCollection = ticket && ticket.category === "report" && ticket.targetType === "user" && Boolean(ticket.targetId);
  const collectionModerationAction = canHideCollection
    ? `<button type="button" class="secondary" data-support-action="hide_collection" data-support-id="${escapeHtml(ticket.id)}">공개 컬렉션 숨김</button>`
    : "";
  const detail = ticket ? `<section class="panel support-ticket-detail"><div class="panel-heading"><div><p class="eyebrow">TICKET DETAIL</p><h2>${escapeHtml(ticket.subject)}</h2><p>${escapeHtml(ticket.owner?.email || ticket.userId)} · ${escapeHtml(supportCategoryLabel(ticket.category))}</p></div><div class="toolbar-actions"><label class="support-assignee-field"><span>담당자 배정</span><select data-support-assignee="${escapeHtml(ticket.id)}">${assigneeOptions}</select></label><select data-support-status="${escapeHtml(ticket.id)}"><option value="open" ${ticket.status === "open" ? "selected" : ""}>접수</option><option value="in_progress" ${ticket.status === "in_progress" ? "selected" : ""}>처리 중</option><option value="answered" ${ticket.status === "answered" ? "selected" : ""}>답변 완료</option><option value="closed" ${ticket.status === "closed" ? "selected" : ""}>종료</option></select></div></div><div class="support-action-bar"><label class="support-action-reference"><span>대상 ID 또는 운영 메모</span><input data-support-action-reference="${escapeHtml(ticket.id)}" placeholder="거래 ID·주문 ID·메모" /></label><label class="support-action-amount"><span>포인트 조정 금액</span><input data-support-action-amount="${escapeHtml(ticket.id)}" type="number" step="1" placeholder="예: 100" /></label><button type="button" class="secondary" data-support-action="record_evidence" data-support-id="${escapeHtml(ticket.id)}">근거 기록</button><button type="button" class="secondary" data-support-action="hold_trade" data-support-id="${escapeHtml(ticket.id)}">거래 보류</button>${collectionModerationAction}<button type="button" class="secondary" data-support-action="refund_order" data-support-id="${escapeHtml(ticket.id)}">환불 승인 요청</button><button type="button" class="secondary" data-support-action="grant_points" data-support-id="${escapeHtml(ticket.id)}">포인트 승인 요청</button></div><div class="support-evidence-list">${(ticket.evidence || []).map(item => `<span class="badge draft">${escapeHtml(supportEvidenceLabel(item.kind))} · ${escapeHtml(item.referenceId || item.note || "기록")}</span>`).join("") || '<span class="hint">아직 운영 근거가 없습니다.</span>'}</div>${supportActivityTimeline(ticket)}<div class="support-message-list">${(ticket.messages || []).map(message => `<article class="support-message"><strong>${escapeHtml(message.author?.nickname || message.author?.email || message.authorUserId)}</strong><small>${formatDate(message.createdAt)}</small><p>${escapeHtml(message.body)}</p></article>`).join("")}</div>${ticket.status !== "closed" ? `<form class="support-reply-form" data-support-reply="${escapeHtml(ticket.id)}"><textarea name="body" rows="4" placeholder="답변 내용을 입력하세요." required></textarea><button class="primary" type="submit">답변 등록</button></form>` : '<p class="hint">종료된 문의입니다. 다시 답변하려면 상태를 접수로 변경하세요.</p>'}</section>` : '<section class="panel empty">왼쪽 목록에서 문의를 선택하세요.</section>';
  const hasSupportFilter = Boolean(state.supportQuery.trim()) || state.supportStatus !== "all" || state.supportCategory !== "all";
  const emptySupportMessage = hasSupportFilter ? "검색 조건을 바꾸거나 필터를 초기화해 주세요." : "현재 접수된 문의가 없습니다.";
  const pagination = supportPagination;
  const total = Number(pagination.total) || state.supportTickets.length;
  const page = Math.max(1, Number(pagination.page) || 1);
  const totalPages = Math.max(1, Number(pagination.totalPages) || Math.ceil(total / supportPageSize));
  const rangeStart = total ? (page - 1) * supportPageSize + 1 : 0;
  const rangeEnd = Math.min(page * supportPageSize, total);
  const paginationView = total ? `<footer class="support-pagination"><span>${rangeStart}-${rangeEnd} / ${total}</span>${totalPages > 1 ? `<div class="support-pagination-controls"><button type="button" class="pagination-button" data-support-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="이전 페이지">${icon("chevron_left")}</button>${Array.from({ length: totalPages }, (_, index) => index + 1).map(item => `<button type="button" class="pagination-button ${item === page ? "active" : ""}" data-support-page="${item}" ${item === page ? "aria-current=\"page\"" : ""}>${item}</button>`).join("")}<button type="button" class="pagination-button" data-support-page="${page + 1}" ${page >= totalPages ? "disabled" : ""} aria-label="다음 페이지">${icon("chevron_right")}</button></div>` : ""}</footer>` : "";
  return `<div class="page-heading"><div><p class="eyebrow">CUSTOMER SUPPORT</p><h2>고객센터 운영 큐</h2><p>문의·신고·거래 분쟁을 한곳에서 분류하고 처리합니다.</p></div></div><div class="support-layout"><section class="panel support-ticket-list"><div class="toolbar ops-form support-filter-toolbar"><label class="search-field grow" for="support-search">${icon("search")}<input class="search ops-control" id="support-search" value="${escapeHtml(state.supportQuery)}" placeholder="제목·이메일 검색" /></label><label class="sr-only" for="support-status-filter">문의 상태 필터</label><select class="ops-control" id="support-status-filter"><option value="all" ${state.supportStatus === "all" ? "selected" : ""}>전체 상태</option><option value="open" ${state.supportStatus === "open" ? "selected" : ""}>접수</option><option value="in_progress" ${state.supportStatus === "in_progress" ? "selected" : ""}>처리 중</option><option value="answered" ${state.supportStatus === "answered" ? "selected" : ""}>답변 완료</option><option value="closed" ${state.supportStatus === "closed" ? "selected" : ""}>종료</option></select><label class="sr-only" for="support-category-filter">문의 유형 필터</label><select class="ops-control" id="support-category-filter"><option value="all" ${state.supportCategory === "all" ? "selected" : ""}>전체 유형</option><option value="general" ${state.supportCategory === "general" ? "selected" : ""}>일반 문의</option><option value="card" ${state.supportCategory === "card" ? "selected" : ""}>카드</option><option value="trade" ${state.supportCategory === "trade" ? "selected" : ""}>거래</option><option value="order" ${state.supportCategory === "order" ? "selected" : ""}>주문</option><option value="report" ${state.supportCategory === "report" ? "selected" : ""}>신고·분쟁</option></select>${hasSupportFilter ? `<button class="text-button support-filter-reset" id="support-filter-reset" type="button">${icon("restart_alt")} 필터 초기화</button>` : ""}</div>${rows || `<div class="empty support-filter-empty">${icon("search_off")}<strong>문의가 없습니다.</strong><span>${emptySupportMessage}</span></div>`}${paginationView}</section>${detail}</div>`;
}

function supportView() {
  const rendered = legacySupportView();
  const filterOptions = {
    status: [
      { value: "all", label: "전체 상태" },
      { value: "open", label: "접수" },
      { value: "in_progress", label: "처리 중" },
      { value: "answered", label: "답변 완료" },
      { value: "closed", label: "종료" },
    ],
    category: [
      { value: "all", label: "전체 유형" },
      { value: "general", label: "일반 문의" },
      { value: "card", label: "카드" },
      { value: "trade", label: "거래" },
      { value: "order", label: "주문" },
      { value: "report", label: "신고·분쟁" },
    ],
  };
  const withFilters = rendered
    .replace(
      /<select class="ops-control" id="support-status-filter">[\s\S]*?<\/select>/,
      adminSelect({ id: "support-status-filter", value: state.supportStatus, label: "문의 상태 필터", className: "support-filter-status", dataSupportFilter: "status", options: filterOptions.status }),
    )
    .replace(
      /<select class="ops-control" id="support-category-filter">[\s\S]*?<\/select>/,
      adminSelect({ id: "support-category-filter", value: state.supportCategory, label: "문의 유형 필터", className: "support-filter-category", dataSupportFilter: "category", options: filterOptions.category }),
    );
  const ticketId = state.selectedSupportTicket?.id;
  if (!ticketId) return withFilters;
  const supportAssignees = [
    ...(state.users || []).filter((user) => user.role === "admin"),
    ...(state.adminContext?.user?.id && !(state.users || []).some((user) => user.id === state.adminContext.user.id)
      ? [{ id: state.adminContext.user.id, displayName: state.adminContext.user.displayName, email: state.adminContext.user.email }]
      : []),
  ];
  const assigneeOptions = supportAssignees.length
    ? supportAssignees.map((user) => ({ value: user.id, label: user.displayName || user.nickname || user.email || user.id }))
    : [{ value: state.selectedSupportTicket.assignedAdminId || "", label: state.selectedSupportTicket.assignedAdminId || "담당자 없음" }];
  const assignee = adminSelect({
    id: `support-assignee-${ticketId}`,
    value: state.selectedSupportTicket.assignedAdminId || "",
    label: "담당자 배정",
    className: "support-assignee-select",
    dataSupportTicket: ticketId,
    options: assigneeOptions,
  });
  const status = adminSelect({
    id: `support-status-${ticketId}`,
    value: state.selectedSupportTicket.status,
    label: "문의 상태",
    className: "support-status-select",
    dataSupportTicket: ticketId,
    options: filterOptions.status.slice(1),
  });
  return withFilters
    .replace(/<select data-support-assignee="[^"]*">[\s\S]*?<\/select>/, assignee)
    .replace(/<select data-support-status="[^"]*">[\s\S]*?<\/select>/, `<label class="support-status-field"><span>문의 상태</span>${status}</label>`);
}

async function loadOrganizations(renderAfter = true) {
  if (!isRoot()) return;
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (state.partnerQuery.trim()) params.set("query", state.partnerQuery.trim());
  if (state.partnerStatus !== "all")
    params.set("status", state.partnerStatus);
  const result = await api(`/admin/organizations?${params}`);
  state.organizations = result.data.items;
  state.organizationPagination =
    result.data.meta?.pagination ||
    ({ page: 1, pageSize: 100, total: state.organizations.length });
  if (
    !state.selectedOrganizationId ||
    !state.organizations.some(
      (organization) => organization.id === state.selectedOrganizationId,
    )
  ) {
    state.selectedOrganizationId = state.organizations[0]?.id || "";
  }
  if (state.selectedOrganizationId) {
    await loadSelectedOrganization(state.selectedOrganizationId, false);
  } else {
    state.selectedOrganization = null;
    state.organizationMembers = [];
  }
  if (renderAfter) layout();
}

async function recoverOrganizationBySlug(slug) {
  const params = new URLSearchParams({ query: slug, page: "1", pageSize: "100" });
  const result = await api(`/admin/organizations?${params}`);
  return result.data.items.find((organization) => organization.slug === slug) || null;
}

async function loadSelectedOrganization(organizationId, renderAfter = true) {
  if (!organizationId) return;
  const [organization, members] = await Promise.all([
    api(`/admin/organizations/${encodeURIComponent(organizationId)}`),
    api(
      `/admin/organizations/${encodeURIComponent(organizationId)}/members`,
    ),
  ]);
  state.selectedOrganizationId = organizationId;
  state.selectedOrganization = organization.data;
  state.organizationMembers = members.data.items;
  if (renderAfter) layout();
}
async function createArtistAccount(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/admin/artist-accounts", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        displayName: form.get("displayName"),
      }),
    });
    const artistId = String(form.get("artistId") || "");
    if (artistId) {
      await api(`/admin/artist-profiles/${encodeURIComponent(result.data.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ artistId, verificationStatus: "pending" }),
      });
    }
    state.artistProvisionedAccount = result.data;
    await loadArtistAccounts();
    state.artistProfilesLoaded = false;
    await loadArtistProfiles();
    layout();
    toast("아티스트 스튜디오 계정을 발급했습니다.");
  } catch (error) {
    toast(
      error.status === 409
        ? "이미 사용 중인 아이디입니다."
        : "계정 발급에 실패했습니다. 관리자 권한과 입력값을 확인해 주세요.",
    );
  }
}

async function loadOptionalOrganizations() {
  try {
    await loadOrganizations(false);
  } catch (error) {
    state.organizations = [];
    state.organizationMembers = [];
    state.selectedOrganization = null;
    state.selectedOrganizationId = "";
    console.warn("Optional organization data unavailable", error);
  }
}
async function resetArtistPassword(userId) {
  const account = state.artistAccounts.find((item) => item.id === userId);
  if (
    !account ||
    !window.confirm(
      `${account.username} 계정의 기존 로그인을 종료하고 임시 비밀번호를 재발급할까요?`,
    )
  )
    return;
  try {
    const result = await api(
      `/admin/artist-accounts/${encodeURIComponent(userId)}/reset-password`,
      { method: "POST", body: "{}" },
    );
    state.artistProvisionedAccount = { ...result.data, wasReset: true };
    await loadData();
    toast("임시 비밀번호를 재발급하고 기존 세션을 종료했습니다.");
  } catch {
    toast(
      "임시 비밀번호 재발급에 실패했습니다. 계정과 관리자 권한을 확인해 주세요.",
    );
  }
}
async function createAdminAccount(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/admin/admin-accounts", {
      method: "POST",
      body: JSON.stringify({
        email: form.get("email"),
        displayName: form.get("displayName"),
      }),
    });
    state.adminProvisionedAccount = result.data;
    layout();
  } catch (error) {
    toast(
      error.status === 409
        ? "이미 등록된 이메일입니다."
        : "관리자 계정 발급에 실패했습니다. 관리자 권한과 입력값을 확인해 주세요.",
    );
  }
}

function openDrawer(name, data = null) {
  clearToast();
  if (name === "event") state.view = "events";
  if (name === "event") state.eventEditorOpen = true;
  if (name === "organization") resetOrganizationLogoState();
  if (name === "reward") resetRewardImageState();
  state.drawer = name;
  state.drawerData = data;
  if (name !== "member" && name !== "member-password") state.temporaryCredential = null;
  layout();
  requestAnimationFrame(() =>
    document.querySelector(".drawer input, .drawer select")?.focus(),
  );
}

window.__fanfolioOpenEventDrawer = () => openDrawer("event");

function closeDrawer() {
  resetOrganizationLogoState();
  resetRewardImageState();
  state.drawer = null;
  state.eventEditorOpen = false;
  state.drawerData = null;
  state.temporaryCredential = null;
  clearEventDeepLink();
  layout();
}

async function saveOrganization(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const editing = state.drawerData?.organization;
  const payload = {
    name: String(form.get("name") || "").trim(),
    slug: String(form.get("slug") || "").trim().toLowerCase(),
    contactName: String(form.get("contactName") || "").trim() || null,
    contactEmail: String(form.get("contactEmail") || "").trim() || null,
    contractStartsAt: form.get("contractStartsAt")
      ? `${form.get("contractStartsAt")}T00:00:00.000Z`
      : null,
    contractEndsAt: form.get("contractEndsAt")
      ? `${form.get("contractEndsAt")}T23:59:59.999Z`
      : null,
  };
  const formElement = event.currentTarget;
  const errorBox = formElement.querySelector("#organization-form-error");
  const startDate = form.get("contractStartsAt");
  const endDate = form.get("contractEndsAt");
  if (startDate && endDate && endDate <= startDate) {
    errorBox.textContent = "계약 종료일은 시작일 이후로 선택해 주세요.";
    errorBox.hidden = false;
    return;
  }
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  errorBox.hidden = true;
  if (state.organizationLogoFile) {
    try {
      payload.logoAssetId = await uploadAsset(
        state.organizationLogoFile,
        "organization_logo"
      );
    } catch (error) {
      submit.disabled = false;
      errorBox.textContent = `로고 업로드에 실패했습니다: ${String(error?.message || error)}`;
      errorBox.hidden = false;
      return;
    }
  } else if (state.organizationLogoRemoved) {
    payload.logoAssetId = null;
  }
  let writeResult;
  try {
    writeResult = await api(
      editing
        ? `/admin/organizations/${encodeURIComponent(editing.id)}`
        : "/admin/organizations",
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
  } catch (error) {
    submit.disabled = false;
    if (error.code === "ORGANIZATION_SLUG_TAKEN") {
      // A previous click may have committed before the UI lost its response.
      // Look up the exact slug without the directory's current search/status filters.
      try {
        const recovered = await recoverOrganizationBySlug(payload.slug);
        if (recovered && recovered.name === payload.name) {
          state.drawer = null;
          state.drawerData = null;
          state.selectedOrganizationId = recovered.id;
          state.selectedOrganization = recovered;
          state.organizationMembers = [];
          state.organizations = [
            recovered,
            ...state.organizations.filter((item) => item.id !== recovered.id),
          ];
          resetOrganizationLogoState();
          toast("이미 저장된 파트너를 불러왔습니다.");
          layout();
          return;
        }
      } catch {
        // Keep the actionable duplicate message if recovery is temporarily unavailable.
      }
    }
    const detail = String(error?.message || error).replace(/^API \d+\s*/, "");
    const message = error.code === "ORGANIZATION_SLUG_TAKEN"
      ? "이미 사용 중인 파트너 코드입니다. 다른 코드를 입력해 주세요."
      : `파트너 ${editing ? "수정" : "등록"} 요청에 실패했습니다${detail ? `: ${detail}` : "."}`;
    errorBox.textContent = message;
    errorBox.hidden = false;
    return;
  }

  try {
    const result = writeResult;
    let refreshFailed = false;
    state.drawer = null;
    state.drawerData = null;
    state.selectedOrganizationId = result.data.id;
    resetOrganizationLogoState();
    try {
      await loadOrganizations(false);
    } catch {
      refreshFailed = true;
      // The write already succeeded. Keep the returned record visible if a
      // follow-up list refresh is briefly unavailable after a cold start.
      state.organizations = [
        result.data,
        ...state.organizations.filter((item) => item.id !== result.data.id),
      ];
      state.selectedOrganization = result.data;
      state.organizationMembers = [];
    }
    toast(refreshFailed
      ? "파트너 정보는 저장되었지만 목록을 새로 고치지 못했습니다."
      : editing ? "파트너 정보를 저장했습니다." : "파트너를 등록했습니다.");
    layout();
  } catch (error) {
    submit.disabled = false;
    const detail = String(error?.message || error).replace(/^API \d+\s*/, "");
    const message = `파트너 목록을 새로 고치지 못했습니다${detail ? `: ${detail}` : "."}`;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
}

async function saveArtist(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const artistId = formElement.dataset.artistId;
  const submit = formElement.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(`/admin/artists/${encodeURIComponent(artistId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        imageUrl: form.get("imageUrl") || null,
      }),
    });
    state.drawer = null;
    state.drawerData = null;
    await loadData();
    toast("아티스트 정보를 저장했습니다.");
  } catch {
    submit.disabled = false;
    toast("아티스트 정보를 저장하지 못했습니다. 권한과 입력값을 확인해 주세요.");
  }
}

async function updateOrganizationStatus(nextStatus) {
  const organization = state.selectedOrganization;
  if (!organization) return;
  const message =
    nextStatus === "suspended"
      ? `${organization.name}의 모든 기업 관리자 접근을 중지할까요?`
      : `${organization.name}의 운영 접근을 다시 활성화할까요?`;
  if (!window.confirm(message)) return;
  try {
    await api(`/admin/organizations/${encodeURIComponent(organization.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadOrganizations(false);
    layout();
    toast(nextStatus === "active" ? "파트너를 활성화했습니다." : "파트너 운영을 중지했습니다.");
  } catch {
    toast("파트너 상태를 변경하지 못했습니다.");
  }
}

async function saveOrganizationArtists() {
  const organization = state.selectedOrganization;
  if (!organization) return;
  const artistIds = Array.from(
    document.querySelectorAll('input[name="organizationArtist"]:checked'),
  ).map((input) => input.value);
  try {
    await api(
      `/admin/organizations/${encodeURIComponent(organization.id)}/artists`,
      { method: "PUT", body: JSON.stringify({ artistIds }) },
    );
    await loadSelectedOrganization(organization.id, false);
    await loadOrganizations(false);
    layout();
    toast("파트너 아티스트 범위를 저장했습니다.");
  } catch {
    toast("아티스트 연결을 저장하지 못했습니다.");
  }
}

async function createOrganizationMember(event) {
  event.preventDefault();
  const organization = state.selectedOrganization;
  if (!organization) return;
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const artistIds = form.getAll("artistIds");
  const submit = formElement.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api(
      `/admin/organizations/${encodeURIComponent(organization.id)}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          accessLevel: form.get("accessLevel"),
          artistIds,
        }),
      },
    );
    state.temporaryCredential = result.data;
    await loadSelectedOrganization(organization.id, false);
    formElement.reset();
    layout();
    toast("기업 관리자 계정을 발급했습니다.");
  } catch (error) {
    submit.disabled = false;
    toast(
      error.status === 409
        ? "이미 등록된 관리자 이메일입니다."
        : "기업 관리자 계정을 발급하지 못했습니다.",
    );
  }
}

async function updateOrganizationMember(memberId, values, successMessage) {
  const organization = state.selectedOrganization;
  if (!organization) return;
  try {
    await api(
      `/admin/organizations/${encodeURIComponent(organization.id)}/members/${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: JSON.stringify(values) },
    );
    await loadSelectedOrganization(organization.id, false);
    layout();
    toast(successMessage);
  } catch {
    toast("관리자 권한을 변경하지 못했습니다.");
  }
}

async function toggleOrganizationMemberStatus(memberId, nextStatus) {
  const member = state.organizationMembers.find((item) => item.id === memberId);
  if (!member) return;
  const message =
    nextStatus === "suspended"
      ? `${member.displayName} 관리자의 기존 로그인 세션을 종료하고 접근을 중지할까요?`
      : `${member.displayName} 관리자의 접근을 다시 활성화할까요?`;
  if (!window.confirm(message)) return;
  await updateOrganizationMember(
    memberId,
    { status: nextStatus },
    nextStatus === "active" ? "관리자를 활성화했습니다." : "관리자 접근을 중지했습니다.",
  );
}

async function resetOrganizationMemberPassword(memberId) {
  const organization = state.selectedOrganization;
  const member = state.organizationMembers.find((item) => item.id === memberId);
  if (!organization || !member || !window.confirm(`${member.displayName} 관리자의 기존 로그인 세션을 종료하고 임시 비밀번호를 재발급할까요?`)) return;
  try {
    const result = await api(
      `/admin/organizations/${encodeURIComponent(organization.id)}/members/${encodeURIComponent(memberId)}/reset-password`,
      { method: "POST", body: "{}" },
    );
    state.temporaryCredential = { ...result.data, wasReset: true };
    state.drawer = "member-password";
    state.drawerData = { member: result.data };
    await loadSelectedOrganization(organization.id, false);
    layout();
    toast("임시 비밀번호를 재발급하고 기존 세션을 종료했습니다.");
  } catch {
    toast("임시 비밀번호 재발급에 실패했습니다. 계정과 권한을 확인해 주세요.");
  }
}

async function saveRoleChange(event) {
  event.preventDefault();
  const data = state.drawerData;
  const role = new FormData(event.currentTarget).get("role");
  if (!data?.member || !role) return;
  if (data.kind === "member") {
    state.drawer = null;
    state.drawerData = null;
    await updateOrganizationMember(data.member.id, { accessLevel: role }, "관리자 권한을 저장했습니다.");
    return;
  }
  state.drawer = null;
  state.drawerData = null;
  await updateUserRole(data.member.id, role);
}

async function saveMemberArtists(event) {
  event.preventDefault();
  const organization = state.selectedOrganization;
  const memberId = event.currentTarget.dataset.memberId;
  if (!organization || !memberId) return;
  const form = new FormData(event.currentTarget);
  try {
    await api(
      `/admin/organizations/${encodeURIComponent(organization.id)}/members/${encodeURIComponent(memberId)}/artists`,
      {
        method: "PUT",
        body: JSON.stringify({ artistIds: form.getAll("artistIds") }),
      },
    );
    state.drawer = null;
    state.drawerData = null;
    await loadSelectedOrganization(organization.id, false);
    layout();
    toast("담당 아티스트를 저장했습니다.");
  } catch {
    toast("담당 아티스트를 저장하지 못했습니다.");
  }
}
function searchUsers() {
  state.userQuery = document.querySelector("#user-search").value.trim();
  state.userPage = 1;
  void loadData();
}
function changeUserPage(page) {
  state.userPage = Number(page);
  void loadData();
}
async function openFan360(userId) {
  try {
    const result = await api(`/admin/users/${encodeURIComponent(userId)}/360`);
    state.fan360 = result.data;
    layout();
  } catch {
    toast("팬 운영 정보를 불러오지 못했습니다.");
  }
}
function searchAuditLogs() {
  state.auditQuery = document.querySelector("#audit-search").value.trim();
  state.auditPage = 1;
  void loadData();
}
function changeAuditPage(page) {
  state.auditPage = Number(page);
  void loadData();
}
async function createCampaign(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const requiredCardIds = Array.from(
    event.target.querySelectorAll('.admin-multi-select-value[name="requiredCardIds"]'),
  ).map((input) => input.value).filter(Boolean);
  const benefitFile = form.get("benefitFile");
  try {
    const benefitAssetId =
      benefitFile instanceof File && benefitFile.size
        ? await uploadAsset(benefitFile, "collection_benefit")
        : null;
    await api("/admin/collection-campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        artistId: form.get("artistId") || null,
        seasonName: form.get("seasonName") || null,
        requiredCardIds,
        benefitTitle: form.get("benefitTitle"),
        benefitDescription: form.get("benefitDescription"),
        benefitAssetId,
      }),
    });
    await loadData();
    toast("특전 캠페인을 등록했습니다.");
  } catch {
    toast(
      "특전 캠페인 등록에 실패했습니다. 카드 선택, 파일 업로드와 관리자 권한을 확인해 주세요.",
    );
  }
}
async function updateCampaignStatus(campaignId, status) {
  try {
    await api(`/admin/collection-campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadData();
    toast(
      status === "active"
        ? "특전 캠페인을 활성화했습니다."
        : "특전 캠페인을 비활성화했습니다.",
    );
  } catch {
    toast("특전 캠페인 상태 변경에 실패했습니다.");
  }
}
function toggleDesktopNavigation() {
  state.navCollapsed = !state.navCollapsed;
  window.localStorage.setItem(
    "fanfolio.admin.navCollapsed",
    String(state.navCollapsed),
  );
  layout();
}
function toggleNavigationSection(group) {
  state.navSectionsCollapsed[group] = !state.navSectionsCollapsed[group];
  window.localStorage.setItem(
    "fanfolio.admin.navSectionsCollapsed.v2",
    JSON.stringify(state.navSectionsCollapsed),
  );
  layout();
}
function closeAccountMenu() {
  if (!state.accountMenuOpen) return;
  state.accountMenuOpen = false;
  layout();
}
async function logoutAdmin() {
  try {
    await api("/auth/logout", { method: "POST", body: "{}" });
  } catch {
    /* The local credential is still cleared below. */
  }
  ACCESS_TOKEN = "";
  state.authenticated = false;
  state.adminContext = null;
  state.metrics = null;
  state.operationalMetrics = null;
  state.operationsOverview = null;
  state.recentActivity = [];
  state.notifications = [];
  state.unreadNotificationCount = 0;
  state.notificationPanelOpen = false;
  state.cards = [];
  state.cardCatalog = [];
  state.cardPacks = [];
  state.drops = [];
  state.batches = [];
  state.users = [];
  state.artistAccounts = [];
  state.auditLogs = [];
  state.campaigns = [];
  state.userQuery = "";
  state.userRole = "all";
  state.userPage = 1;
  state.userPagination = { page: 1, pageSize: 20, total: 0 };
  state.auditQuery = "";
  state.auditAction = "all";
  state.auditPage = 1;
  state.auditPagination = { page: 1, pageSize: 50, total: 0 };
  state.codeBatch = null;
  state.reviewCard = null;
  state.reviewImageSrc = "";
  state.accountMenuOpen = false;
  state.loginError = "";
  layout();
}
async function createAdminCard(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const image = form.get("cardImage");
  if (!(image instanceof File) || !image.size) {
    toast("카드 이미지를 선택해 주세요.");
    return;
  }
  try {
    const imageAssetId = await uploadAsset(image, "card");
    await api("/admin/cards", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        seasonName: form.get("seasonName") || null,
        rarity: form.get("rarity"),
        imageAssetId,
        artistId: form.get("artistId") || null,
        memberId: form.get("memberId") || null,
        issueLimit: form.get("issueLimit")
          ? Number(form.get("issueLimit"))
          : null,
      }),
    });
    state.drawer = null;
    state.drawerData = null;
    await loadData();
    toast("운영 카드를 등록했습니다.");
  } catch (error) {
    toast(
      error.status === 403
        ? "현재 권한으로 카드를 등록할 수 없습니다."
        : "운영 카드 등록에 실패했습니다. 이미지와 입력값을 확인해 주세요.",
    );
  }
}
async function updateAdminCard(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const cardId = event.target.dataset.id;
  const image = form.get("cardImage");
  const backImage = form.get("backCardImage");
  try {
    const payload = {
      name: form.get("name"),
      seasonName: form.get("seasonName") || null,
      rarity: form.get("rarity"),
      issueLimit: form.get("issueLimit")
        ? Number(form.get("issueLimit"))
        : null,
    };
    if (image instanceof File && image.size)
      payload.imageAssetId = await uploadAsset(image, "card");
    if (backImage instanceof File && backImage.size) {
      const backImageAssetId = await uploadAsset(backImage, "card");
      payload.designConfig = {
        ...(state.reviewCard?.designConfig || {}),
        back: {
          ...(state.reviewCard?.designConfig?.back || {}),
          backImageAssetId,
        },
      };
    }
    await api(`/admin/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadData();
    await openReview(cardId);
    toast("카드 정보를 수정했습니다.");
  } catch {
    toast("카드 수정에 실패했습니다. 입력값과 관리자 권한을 확인해 주세요.");
  }
}
async function openReview(cardId) {
  try {
    const result = await api(`/admin/cards/${cardId}`);
    state.reviewCard = result.data;
    state.cardCollaborationComments = [];
    state.cardCollaborationCommentsError = "";
    if (state.reviewImageSrc) URL.revokeObjectURL(state.reviewImageSrc);
    if (state.reviewBackImageSrc) URL.revokeObjectURL(state.reviewBackImageSrc);
    state.reviewImageSrc = "";
    state.reviewImageError = false;
    state.reviewBackImageSrc = "";
    state.reviewBackImageError = false;
    state.reviewSide = "front";
    const imageUrls = [result.data.previewImageUrl, result.data.sourceImageUrl].filter(Boolean);
    for (const imageUrl of imageUrls) {
      const response = await fetch(`${API_BASE}${imageUrl.replace(/^\/api/, "")}`, {
          credentials: "include",
          headers: {
            "X-Fanfolio-Client": "admin",
            ...(ACCESS_TOKEN
              ? { Authorization: `Bearer ${ACCESS_TOKEN}` }
              : {}),
          },
        });
      if (response.ok) {
        state.reviewImageSrc = URL.createObjectURL(await response.blob());
        break;
      }
    }
    state.reviewImageError = !state.reviewImageSrc;
    if (result.data.backImageUrl) {
      const response = await fetch(`${API_BASE}${result.data.backImageUrl.replace(/^\/api/, "")}`, {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      });
      if (response.ok) state.reviewBackImageSrc = URL.createObjectURL(await response.blob());
    }
    state.reviewBackImageError = Boolean(result.data.backImageUrl) && !state.reviewBackImageSrc;
    state.view = "cards";
    layout();
    void loadCardCollaborationComments(cardId);
  } catch {
    toast("카드 상세 정보를 불러오지 못했습니다.");
  }
}

async function loadCardCollaborationComments(cardId) {
  state.cardCollaborationCommentsLoading = true;
  state.cardCollaborationCommentsError = "";
  if (state.reviewCard?.id === cardId) layout();
  try {
    const result = await api(`/admin/cards/${encodeURIComponent(cardId)}/comments`);
    state.cardCollaborationComments = result.data?.items || result.data || [];
  } catch {
    state.cardCollaborationComments = [];
    state.cardCollaborationCommentsError = "협업 코멘트를 불러오지 못했습니다.";
  } finally {
    state.cardCollaborationCommentsLoading = false;
    if (state.reviewCard?.id === cardId) layout();
  }
}
async function replaceReviewImage(file, side) {
  if (!file?.size || !state.reviewCard || !["front", "back"].includes(side)) return;
  try {
    const assetId = await uploadAsset(file, "card");
    const payload = side === "back"
      ? {
          designConfig: {
            ...(state.reviewCard.designConfig || {}),
            back: {
              ...(state.reviewCard.designConfig?.back || {}),
              backImageAssetId: assetId,
            },
          },
        }
      : { imageAssetId: assetId };
    await api(`/admin/cards/${state.reviewCard.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadData();
    await openReview(state.reviewCard.id);
    toast(side === "back" ? "뒷면 이미지를 교체했습니다." : "앞면 이미지를 교체했습니다.");
  } catch {
    toast("이미지 교체에 실패했습니다. 파일 형식과 관리자 권한을 확인해 주세요.");
  }
}
async function submitReleaseDecision(cardId, stage, decision) {
  const note = document.querySelector("#review-note")?.value.trim() || null;
  if (decision === "changes_requested" && !note) {
    toast("수정 요청 사유를 입력해 주세요.");
    return;
  }
  try {
    const reviewEndpoint = {
      partner: `/admin/cards/${cardId}/review/partner`,
      platform: `/admin/cards/${cardId}/review/platform`,
    }[stage];
    if (!reviewEndpoint) {
      toast("검수 단계를 확인해 주세요.");
      return;
    }
    await api(reviewEndpoint, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
    await loadData();
    await openReview(cardId);
    toast(decision === "approved" ? "검수를 승인했습니다." : "수정 요청을 보냈습니다.");
  } catch {
    toast("검수 처리에 실패했습니다. 카드 상태와 권한을 확인해 주세요.");
  }
}
async function submitPartnerReviewRequest(cardId) {
  const reviewNote = document.querySelector("#review-note")?.value.trim() || null;
  try {
    await api(`/admin/cards/${cardId}/submit-review`, {
      method: "POST",
      body: JSON.stringify({ reviewNote }),
    });
    await loadData();
    await openReview(cardId);
    toast("루트 관리자에게 검수를 요청했습니다.");
  } catch {
    toast("검수 요청에 실패했습니다. 카드 상태와 권한을 확인해 주세요.");
  }
}
async function openNotification(notificationId, cardId, view, ticketId, deliveryId) {
  if (notificationId === "toggle") {
    state.notificationPanelOpen = !state.notificationPanelOpen;
    state.accountMenuOpen = false;
    layout();
    return;
  }
  try {
    await api(`/admin/notifications/${notificationId}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
    state.notificationPanelOpen = false;
    state.notifications = state.notifications.filter((item) => item.id !== notificationId);
    await loadAdminNotifications(false);
    state.notifications = state.notifications.filter((item) => item.id !== notificationId && !item.isRead);
    if (cardId) await openReview(cardId);
    else if (view === "support" && ticketId) { state.view = "support"; await openSupportTicket(ticketId); }
    else { state.view = view || "audit"; if (view === "deliveries") await loadDeliveryQueue(true); else layout(); }
  } catch {
    toast("알림 처리에 실패했습니다.");
  }
}
async function linkApprovedCardToDrop(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const dropId = form.get("dropId");
  const cardId = event.currentTarget.dataset.cardId;
  if (!dropId || !cardId) {
    toast("연결할 드롭을 선택해 주세요.");
    return;
  }
  try {
    await api(`/admin/drops/${encodeURIComponent(dropId)}/cards`, {
      method: "POST",
      body: JSON.stringify({ cardId }),
    });
    closeDrawer();
    await loadData();
    await openReview(cardId);
    toast("드롭 준비됨");
  } catch (error) {
    toast(error?.message || "드롭 연결에 실패했습니다. 카드와 드롭 범위를 확인해 주세요.");
  }
}
async function createBatch(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  if (!form.get("cardId") || !form.get("dropId")) {
    toast("공개 카드와 라이브 드롭을 각각 선택해 주세요.");
    return;
  }
  try {
    const expiresAt = new Date(form.get("expiresAt")).toISOString();
    const result = await api("/admin/redeem-code-batches", {
      method: "POST",
      body: JSON.stringify({
        dropId: form.get("dropId"),
        cardId: form.get("cardId"),
        quantity: Number(form.get("quantity")),
        maxUsesPerCode: Number(form.get("maxUsesPerCode")),
        expiresAt,
        prefix: form.get("prefix"),
      }),
    });
    state.batch = result.data;
    state.selectedBatchId = result.data.id;
    state.view = "batches";
    await loadData();
    layout();
    toast("코드 배치를 생성했습니다.");
  } catch (error) {
    toast(error?.message || "코드 배치를 생성하지 못했습니다. 입력값과 권한을 확인해 주세요.");
  }
}
async function openCodeBatch(batchId) {
  try {
    clearCodeQr();
    const result = await api(
      `/admin/redeem-code-batches/${encodeURIComponent(batchId)}/codes`,
    );
    state.codeBatch = { batchId, ...result.data };
    state.view = "batches";
    layout();
  } catch {
    toast("배치 코드를 불러오지 못했습니다. 관리자 세션을 확인해 주세요.");
  }
}
function clearCodeQr() {
  if (state.codeQr?.url) URL.revokeObjectURL(state.codeQr.url);
  state.codeQr = null;
}
async function showCodeQr(code) {
  const selected = state.codeBatch?.items?.find((item) => item.code === code);
  if (!selected?.qrUrl) return;
  try {
    const response = await fetch(
      `${API_BASE}${selected.qrUrl.replace(/^\/api/, "")}`,
      {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      },
    );
    if (!response.ok) throw new Error(`QR ${response.status}`);
    clearCodeQr();
    state.codeQr = { code, url: URL.createObjectURL(await response.blob()) };
    layout();
  } catch {
    toast("QR을 불러오지 못했습니다. 관리자 세션을 확인해 주세요.");
  }
}
async function disableCode(code) {
  try {
    await api(`/admin/redeem-codes/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    await openCodeBatch(state.codeBatch.batchId);
    await loadData();
    toast("코드를 비활성화했습니다.");
  } catch {
    toast("코드 비활성화에 실패했습니다.");
  }
}
async function downloadBatchCsv() {
  if (!state.batch?.csvExportUrl) return;
  try {
    const response = await fetch(
      `${API_BASE}${state.batch.csvExportUrl.replace(/^\/api/, "")}`,
      {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      },
    );
    if (!response.ok) throw new Error(`CSV ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${state.batch.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast("CSV 다운로드에 실패했습니다. 관리자 세션을 확인해 주세요.");
  }
}
async function downloadAdminCsv(path, filename) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: {
        "X-Fanfolio-Client": "admin",
        ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`CSV ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
    toast("CSV 다운로드를 시작했습니다.");
  } catch {
    toast("CSV 다운로드에 실패했습니다. 관리자 세션과 권한을 확인해 주세요.");
  }
}
function exportCardsCsv() {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.status !== "all") params.set("status", state.status);
  const query = params.toString();
  void downloadAdminCsv(
    `/admin/cards/export${query ? `?${query}` : ""}`,
    `fanfolio-cards-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
function exportAuditCsv() {
  const params = new URLSearchParams();
  if (state.auditQuery.trim()) params.set("q", state.auditQuery.trim());
  if (state.auditAction !== "all") params.set("action", state.auditAction);
  const query = params.toString();
  void downloadAdminCsv(
    `/admin/audit-logs/export${query ? `?${query}` : ""}`,
    `fanfolio-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
async function downloadBatchQrZip() {
  if (!state.batch?.qrZipUrl) return;
  try {
    const response = await fetch(
      `${API_BASE}${state.batch.qrZipUrl.replace(/^\/api/, "")}`,
      {
        credentials: "include",
        headers: {
          "X-Fanfolio-Client": "admin",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
        },
      },
    );
    if (!response.ok) throw new Error(`QR ZIP ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${state.batch.id}-qr.zip`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast("QR ZIP 다운로드에 실패했습니다. 관리자 세션을 확인해 주세요.");
  }
}
async function createDrop(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const cardId = event.currentTarget.dataset.cardId || "";
  if (!form.get("artistId")) {
    toast("드롭을 운영할 아티스트를 선택해 주세요.");
    return;
  }
  try {
    const result = await api("/admin/drops", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        artistId: form.get("artistId"),
        startsAt: form.get("startsAt")
          ? new Date(form.get("startsAt")).toISOString()
          : null,
        endsAt: form.get("endsAt")
          ? new Date(form.get("endsAt")).toISOString()
          : null,
      }),
    });
    await loadData();
    if (cardId && result.data?.id) {
      await api(`/admin/drops/${encodeURIComponent(result.data.id)}/cards`, {
        method: "POST",
        body: JSON.stringify({ cardId }),
      });
      closeDrawer();
      await loadData();
      await openReview(cardId);
      toast("드롭을 생성하고 카드를 연결했습니다.");
      return;
    }
    toast("드롭을 생성했습니다.");
  } catch {
    toast("드롭 생성에 실패했습니다. 입력값을 확인해 주세요.");
  }
}
async function saveEvent(event) {
  event.preventDefault();
  const eventForm = event.currentTarget;
  const form = new FormData(eventForm);
  const id = event.currentTarget.dataset.eventId;
  const bannerFile = form.get("bannerFile");
  const submitButton = eventForm.querySelector('[type="submit"]');
  if (!form.get("heroAssetId") && bannerFile instanceof File && bannerFile.size) {
    if (submitButton) submitButton.disabled = true;
    try {
      form.set("heroAssetId", await uploadAsset(bannerFile, "event_banner"));
    } catch (error) {
      toast(error?.message || "이벤트 배너 업로드에 실패했습니다.");
      return;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }
  const kind = form.get("eventType");
  const connection = String(form.get("connection") || "").trim();
  const payload = { heroAssetId: String(form.get("heroAssetId") || "").trim(), title: String(form.get("title") || "").trim(), summary: String(form.get("summary") || "").trim(), description: String(form.get("description") || ""), noticeItems: String(form.get("noticeItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean), relatedCardIds: Array.from(event.currentTarget.querySelectorAll('input[name="relatedCardIds"]:checked')).map((input) => input.value), eventType: kind, artistId: form.get("artistId") || null, startsAt: new Date(form.get("startsAt")).toISOString(), endsAt: form.get("endsAt") ? new Date(form.get("endsAt")).toISOString() : null, applicationStartsAt: form.get("applicationStartsAt") ? new Date(form.get("applicationStartsAt")).toISOString() : null, applicationEndsAt: form.get("applicationEndsAt") ? new Date(form.get("applicationEndsAt")).toISOString() : null, venue: String(form.get("venue") || "").trim() || null, participantLimit: form.get("participantLimit") ? Number(form.get("participantLimit")) : null, ctaLabel: String(form.get("ctaLabel") || "").trim() || null, featured: form.get("featured") === "on", ...(kind === "card_drop" ? { dropId: connection } : {}), ...(kind === "card" ? { cardId: connection } : {}), ...(kind === "fan_mission" ? { achievementId: connection } : {}), ...(kind === "external" ? { externalUrl: connection } : {}) };
  if (submitButton) submitButton.disabled = true;
  try { await api(id ? `/admin/events/${encodeURIComponent(id)}` : "/admin/events", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) }); closeDrawer(); await loadEvents(true); toast(id ? "이벤트를 저장했습니다." : "이벤트 초안을 저장했습니다."); } catch (error) { toast(error?.message || "이벤트 저장에 실패했습니다. 입력값과 권한을 확인해 주세요."); } finally { if (submitButton) submitButton.disabled = false; }
}
async function eventTransition(id, action, decision = null) { const endpoint = { submit: "submit", review: "review", publish: "publish", end: "end" }[action]; try { await api(`/admin/events/${encodeURIComponent(id)}/${endpoint}`, { method: "POST", body: decision ? JSON.stringify({ decision }) : "{}" }); await loadEvents(true); toast(action === "submit" ? "검수 요청을 보냈습니다." : action === "review" ? (decision === "approve" ? "이벤트를 승인했습니다." : "수정 요청을 보냈습니다.") : "이벤트 상태를 변경했습니다."); } catch { toast("이벤트 상태 변경에 실패했습니다."); } }
async function submitEvent(id) { await eventTransition(id, "submit"); }
async function updateDropStatus(dropId, nextStatus) {
  try {
    await api(`/admin/drops/${dropId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadData();
    toast(
      nextStatus === "ended"
        ? "드롭을 종료했습니다."
        : "드롭을 활성화했습니다.",
    );
  } catch {
    toast(
      nextStatus === "ended"
        ? "드롭 종료에 실패했습니다."
        : "드롭 활성화에 실패했습니다.",
    );
  }
}

async function submitDrop(dropId) {
  try {
    await api(`/admin/drops/${encodeURIComponent(dropId)}/submit`, {
      method: "POST",
    });
    await loadData();
    toast("드롭 발행 요청을 전달했습니다.");
  } catch {
    toast("드롭 발행 요청에 실패했습니다. 현재 상태와 권한을 확인해 주세요.");
  }
}
async function updateUserRole(userId, role) {
  try {
    await api(`/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    await loadData();
    toast("사용자 역할을 변경했습니다.");
  } catch {
    toast("역할 변경에 실패했습니다. 현재 관리자 권한은 변경할 수 없습니다.");
    await loadData();
  }
}
async function updateArtistProfile(userId, values = {}) {
  const artistId = values.artistId;
  const verificationStatus = values.verificationStatus;
  if (!artistId || !verificationStatus) {
    toast("소속 그룹과 검수 상태를 선택해 주세요.");
    return false;
  }
  try {
    await api(`/admin/artist-profiles/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ artistId, verificationStatus }),
    });
    state.artistProfilesLoaded = false;
    await loadArtistProfiles();
    toast("아티스트 소속 검수 상태를 저장했습니다.");
    return true;
  } catch {
    toast("아티스트 소속 검수에 실패했습니다. 그룹과 상태를 확인해 주세요.");
    return false;
  }
}

async function saveArtistProfileReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saved = await updateArtistProfile(form.dataset.profileId, {
    artistId: form.querySelector('[data-select-id="artist-profile-review-artist"]')?.dataset.value,
    verificationStatus: form.querySelector('[data-select-id="artist-profile-review-status"]')?.dataset.value,
  });
  if (saved) closeDrawer();
}

function selectedValues(form, name) {
  const hiddenValues = Array.from(form.querySelectorAll(`.admin-multi-select-value[name="${name}"]`)).map((input) => input.value).filter(Boolean);
  if (hiddenValues.length) return hiddenValues;
  return Array.from(form.querySelectorAll(`[name="${name}"] option:checked`)).map((option) => option.value).filter(Boolean);
}

function applyFanPassPreset(presetId) {
  const preset = fanPassPresets.find((item) => item.id === presetId);
  const form = document.querySelector("#fan-pass-form");
  if (!preset || !form) return;
    const data = new FormData(form);
    const currentRewards = data.getAll("tierReward");
    const currentPremiumRewards = data.getAll("tierPremiumReward");
  state.drawerData = {
    season: {
      ...(state.drawerData?.season || {}),
      title: data.get("title") || "",
      description: data.get("description") || preset.description,
      organizationId: data.get("organizationId") || null,
      artistId: data.get("artistId") || null,
      startsAt: data.get("startsAt") || null,
      endsAt: data.get("endsAt") || null,
      tiers: preset.tiers.map((tier, index) => ({
        ...tier,
        rewardId: currentRewards[index] || "",
        premiumRewardId: currentPremiumRewards[index] || "",
      })),
    },
  };
  layout();
  toast(`${preset.label}을 적용했습니다. 각 레벨의 보상을 선택한 뒤 저장하세요.`);
}

async function saveAchievement(event) {
  event.preventDefault();
  if (!canManageFanGrowth()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const startsAt = data.get("startsAt");
  const endsAt = data.get("endsAt");
  const dateError = form.querySelector("#achievement-date-error");
  if (startsAt && endsAt && endsAt <= startsAt) {
    dateError.hidden = false;
    return;
  }
  dateError.hidden = true;
  const conditionType = String(data.get("conditionType") || "first_card");
  const conditionPayload = {};
  ["cardId", "campaignId", "dropId"].forEach((key) => {
    if (data.get(key)) conditionPayload[key] = data.get(key);
  });
  const payload = {
    title: String(data.get("title") || "").trim(),
    description: String(data.get("description") || "").trim() || null,
    organizationId: data.get("organizationId") || null,
    artistId: data.get("artistId") || null,
    memberId: data.get("memberId") || null,
    conditionType,
    targetValue: Number(data.get("targetValue") || 1),
    conditionPayload,
    xpBonus: Number(data.get("xpBonus") || 0),
    rewardIds: selectedValues(form, "rewardIds"),
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
  };
  try {
    await api("/admin/engagement/achievements", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    closeDrawer();
    await loadFanGrowth(true);
    toast("업적 초안을 임시 저장했습니다.");
  } catch {
    const errorBox = form.querySelector("#achievement-form-error");
    errorBox.textContent = "업적 저장에 실패했습니다. 범위와 조건 값을 확인해 주세요.";
    errorBox.hidden = false;
  }
}

async function saveMission(event) {
  event.preventDefault();
  if (!canManageFanGrowth()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const rewardPayload = {
    xp: Number(data.get("xp") || 0),
    points: Number(data.get("points") || 0),
  };
  const rewardId = String(data.get("rewardId") || "").trim();
  if (rewardId) rewardPayload.rewardId = rewardId;
  const payload = {
    title: String(data.get("title") || "").trim(),
    description: String(data.get("description") || "").trim() || null,
    organizationId: data.get("organizationId") || null,
    artistId: data.get("artistId") || null,
    eventKind: data.get("eventKind") || "event_commented",
    targetValue: Number(data.get("targetValue") || 1),
    recurrence: data.get("recurrence") || "once",
    conditionPayload: {},
    rewardPayload,
  };
  try {
    const missionId = form.dataset.id;
    await api(missionId ? `/admin/engagement/missions/${encodeURIComponent(missionId)}` : "/admin/engagement/missions", {
      method: missionId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    closeDrawer();
    await loadFanGrowth(true);
    toast(missionId ? "미션을 저장했습니다." : "미션 초안을 임시 저장했습니다.");
  } catch {
    const errorBox = form.querySelector("#mission-form-error");
    errorBox.textContent = "미션 저장에 실패했습니다. 범위와 목표 값을 확인해 주세요.";
    errorBox.hidden = false;
  }
}

async function saveFanPass(event) {
  event.preventDefault();
  if (!canManageFanGrowth()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const startsAt = data.get("startsAt");
  const endsAt = data.get("endsAt");
  const dateError = form.querySelector("#fan-pass-date-error");
  const errorBox = form.querySelector("#fan-pass-form-error");
  const submitButton = form.querySelector('button[type="submit"]');
  const organizationId = String(data.get("organizationId") || "").trim();
  const artistId = String(data.get("artistId") || "").trim();
  const premiumEnabled = form.elements.premiumEnabled?.checked === true;
  const premiumPrice = Number(data.get("premiumPricePoints") || 0);
  if (isRoot() && ((organizationId && !artistId) || (!organizationId && artistId))) {
    errorBox.textContent = "조직과 아티스트 범위를 함께 선택해 주세요.";
    errorBox.hidden = false;
    return;
  }
  if (premiumEnabled && (!Number.isInteger(premiumPrice) || premiumPrice < 1)) {
    errorBox.textContent = "프리미엄 패스 가격을 1P 이상 입력해 주세요.";
    errorBox.hidden = false;
    return;
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    dateError.hidden = false;
    return;
  }
  dateError.hidden = true;
  const tierXp = data.getAll("tierXp");
  const tierReward = data.getAll("tierReward");
  const tierPremiumReward = data.getAll("tierPremiumReward");
  const tiers = tierXp
    .map((xp, index) => ({ tier: index + 1, rawXp: String(xp).trim(), requiredXp: Number(xp), rewardId: tierReward[index] || null, premiumRewardId: tierPremiumReward[index] || null }))
    .filter((tier) => tier.rawXp !== "" && Number.isFinite(tier.requiredXp) && tier.requiredXp >= 0)
    .map(({ rawXp, ...tier }) => tier)
    .slice(0, maxFanPassTiers);
  errorBox.hidden = true;
  if (submitButton) submitButton.disabled = true;
  try {
    const seasonId = form.dataset.id;
    await api(seasonId ? `/admin/engagement/pass-seasons/${seasonId}` : "/admin/engagement/pass-seasons", {
      method: seasonId ? "PATCH" : "POST",
      body: JSON.stringify({
        title: String(data.get("title") || "").trim(),
        description: String(data.get("description") || "").trim() || null,
        organizationId: organizationId || null,
        artistId: artistId || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        premiumEnabled,
        premiumPricePoints: premiumEnabled ? premiumPrice : null,
        tiers: tiers.length ? tiers : [{ tier: 1, requiredXp: 1, rewardId: null }],
      }),
    });
    closeDrawer();
    await loadFanGrowth(true);
    toast(seasonId ? "레벨 패스를 저장했습니다." : "레벨 패스 초안을 등록했습니다.");
  } catch (error) {
    errorBox.textContent = error?.message || "레벨 패스 저장에 실패했습니다. 범위, 기간과 티어 값을 확인해 주세요.";
    errorBox.hidden = false;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function saveReward(event) {
  event.preventDefault();
  if (!canManageFanGrowth()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const imageAssetId = state.rewardImageFile
      ? await uploadAsset(state.rewardImageFile, "reward_image")
      : state.drawerData?.reward?.metadata?.imageAssetId || null;
    await api("/admin/engagement/rewards", {
      method: "POST",
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        rewardType: data.get("rewardType") || "badge",
        organizationId: data.get("organizationId") || null,
        artistId: data.get("artistId") || null,
        metadata: {
          label: String(data.get("label") || "").trim(),
          description: String(data.get("description") || "").trim(),
          color: "violet",
          imagePreset: imageAssetId ? null : String(data.get("imagePreset") || "ticket"),
          imageAssetId,
        },
      }),
    });
    closeDrawer();
    await loadFanGrowth(true);
    toast("보상을 등록했습니다. 업적이나 패스 티어에서 선택할 수 있습니다.");
  } catch (error) {
    const errorBox = form.querySelector("#reward-form-error");
    errorBox.textContent = error?.status === 401
      ? "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요."
      : "보상 저장에 실패했습니다. 현재 운영 범위와 입력값을 확인해 주세요.";
    errorBox.hidden = false;
  }
}

async function transitionFanGrowth(kind, action, id) {
  const endpointKind = kind === "achievement" ? "achievements" : kind === "mission" ? "missions" : "pass-seasons";
  try {
    await api(`/admin/engagement/${endpointKind}/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      body: "{}",
    });
    await loadFanGrowth(true);
    toast(action === "approve" ? "공개 승인했습니다." : "검수 요청을 보냈습니다.");
  } catch {
    toast("팬 성장 상태를 변경하지 못했습니다. 상태와 권한을 확인해 주세요.");
  }
}
function bind() {
  enhanceDateTimePickers();
  void loadEventHeroPreview();
  document.querySelectorAll("[data-preview-search], [data-preview-filter], #issuance-search, [data-issuance-filter]").forEach((control) => control.classList.add("ops-control"));
  document.querySelectorAll("[data-global-search-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.globalSearchOpen = !state.globalSearchOpen;
    if (!state.globalSearchOpen) state.globalSearchQuery = "";
    layout();
    if (state.globalSearchOpen) setTimeout(() => document.querySelector("[data-global-search-input]")?.focus(), 0);
  }));
  document.querySelector("[data-global-search-input]")?.addEventListener("input", (event) => {
    state.globalSearchQuery = event.currentTarget.value;
    const position = event.currentTarget.selectionStart;
    layout();
    const next = document.querySelector("[data-global-search-input]");
    next?.focus();
    if (position !== null) next?.setSelectionRange(position, position);
  });
  document.querySelectorAll("[data-global-search-result]").forEach((button) => button.addEventListener("click", () => {
    clearToast();
    state.view = button.dataset.globalSearchResult;
    state.globalSearchOpen = false;
    state.globalSearchQuery = "";
    layout();
    if (state.view === "events") void loadEvents(true);
    if (state.view === "partners") void loadOrganizations(true);
  }));
  document.onkeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      state.globalSearchOpen = true;
      state.accountMenuOpen = false;
      layout();
      setTimeout(() => document.querySelector("[data-global-search-input]")?.focus(), 0);
      return;
    }
    if (event.key === "Escape" && state.globalSearchOpen) {
      state.globalSearchOpen = false;
      state.globalSearchQuery = "";
      layout();
    }
  };
  document
    .querySelector("#admin-login-form")
    ?.addEventListener("submit", loginAdmin);
  document.querySelectorAll("[data-nav-section-toggle]").forEach((button) => {
    button.addEventListener("click", () =>
      toggleNavigationSection(button.dataset.navSectionToggle),
    );
  });
  document.querySelectorAll("[data-view]:not([data-open-drawer])").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.operationFeedback = null;
      clearToast();
      state.drawer = null;
      state.drawerData = null;
      state.eventEditorOpen = false;
      state.temporaryCredential = null;
      clearEventDeepLink();
      state.view = button.dataset.view;
      state.mobileNavOpen = false;
      state.accountMenuOpen = false;
      layout();
      resetWorkspaceScroll();
      if (state.view === "events") void loadEvents(true).then(resetWorkspaceScroll);
      if (state.view === "cards") void loadContentCalendar(true).then(resetWorkspaceScroll);
      if (state.view === "statistics") void loadStatistics(true).then(resetWorkspaceScroll);
      if (state.view === "support") void loadSupportTickets(true).then(resetWorkspaceScroll);
      if (state.view === "deliveries") void loadDeliveryQueue(true).then(resetWorkspaceScroll);
      if (state.view === "approvals") void loadApprovals(true).then(resetWorkspaceScroll);
    });
  });
  document.querySelectorAll("[data-open-drawer]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDrawer(button.dataset.openDrawer);
    });
  });
  document.querySelector("#refresh-approvals")?.addEventListener("click", () => void loadApprovals(true));
  document.querySelectorAll("[data-approval-detail]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedApprovalId = button.dataset.approvalDetail;
      layout();
    }),
  );
  document.querySelectorAll(".approval-action").forEach((button) =>
    button.addEventListener("click", () => void decideApproval(button.dataset.approvalId, button.dataset.approvalAction)),
  );
  document.querySelectorAll(".approval-detail-action").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void decideApproval(button.dataset.approvalId, button.dataset.approvalDetailAction);
    }),
  );
  document.querySelectorAll("[data-production-statistics-period]").forEach((button) =>
    button.addEventListener("click", () => {
      state.statisticsPeriod = button.dataset.productionStatisticsPeriod;
      void loadStatistics(true);
    }),
  );
  document.querySelectorAll("[data-production-statistics-filter]").forEach((select) =>
    select.addEventListener("change", () => {
      const key = select.dataset.productionStatisticsFilter;
      if (key === "organization") {
        state.statisticsOrganization = select.value;
        state.statisticsArtist = "all";
        state.statisticsPack = "all";
      } else if (key === "artist") {
        state.statisticsArtist = select.value;
        state.statisticsPack = "all";
      } else {
        state.statisticsPack = select.value;
      }
      void loadStatistics(true);
    }),
  );
  document.querySelector("[data-production-statistics-compare]")?.addEventListener("change", (event) => {
    state.statisticsCompare = event.currentTarget.checked;
    void loadStatistics(true);
  });
  document.querySelector("#open-card-pack-create")?.addEventListener("click", () => {
    state.view = "card-pack-create";
    state.selectedCardPack = null;
    layout();
  });
  document.querySelector("#card-pack-form")?.addEventListener("submit", createCardPack);
  document.querySelector("#content-calendar-form")?.addEventListener("submit", createContentCalendar);
  document.querySelector("#refresh-content-calendar")?.addEventListener("click", () => void loadContentCalendar(true));
  document.querySelector("#shop-product-form")?.addEventListener("submit", createShopProduct);
  document.querySelector("#point-package-form")?.addEventListener("submit", createPointChargePackage);
  document.querySelector("#refresh-point-charge-packages")?.addEventListener("click", () => void loadPointChargeOperations(true));
  document.querySelector("#refresh-point-charges")?.addEventListener("click", () => void loadPointChargeOperations(true));
  document.querySelectorAll(".point-package-toggle").forEach((button) => {
    button.addEventListener("click", () => void togglePointChargePackage(button.dataset.pointPackageId, button.dataset.pointPackageStatus));
  });
  document.querySelectorAll(".point-package-save").forEach((button) => {
    button.addEventListener("click", () => void updatePointChargePackage(button));
  });
  bindShopProductEditor();
  document.querySelector("#open-shop-product-create")?.addEventListener("click", () => {
    state.view = "shop-product-create";
    state.shopProductDraft = null;
    state.shopProductBlocks = [
      { key: "intro", type: "text", title: "상품 소개", body: "DREAMSCAPE의 새로운 비주얼과 이야기를 담은 카드팩입니다.", imageUrl: "", alt: "" },
      { key: "contents", type: "text", title: "구성품 안내", body: "포토카드 5장(랜덤)과 스페셜 포토카드 1장이 포함됩니다.", imageUrl: "", alt: "" },
      { key: "notice", type: "text", title: "구매 안내", body: "구매 후 바로 보관함에서 확인할 수 있습니다.", imageUrl: "", alt: "" },
    ];
    layout();
  });
  document.querySelectorAll(".shop-product-publish").forEach((button) =>
    button.addEventListener("click", () => void publishShopProduct(button.dataset.shopProductId)),
  );
  document.querySelectorAll(".shop-product-open").forEach((button) =>
    button.addEventListener("click", () => void loadShopProductDetail(button.dataset.shopProductId)),
  );
  document.querySelectorAll("[data-shop-product-row-id]").forEach((row) => {
    const open = () => void loadShopProductDetail(row.dataset.shopProductRowId);
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select")) return;
      open();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
  document.querySelector("#card-pack-composition-form")?.addEventListener("submit", saveCardPackComposition);
  document.querySelectorAll("[data-composition-card-id]").forEach((row) => {
    const select = () => {
      state.selectedCompositionCardId = row.dataset.compositionCardId;
      document.querySelectorAll("[data-composition-card-id]").forEach((candidate) => {
        const selected = candidate.dataset.compositionCardId === state.selectedCompositionCardId;
        candidate.classList.toggle("selected-composition-row", selected);
        candidate.setAttribute("aria-selected", String(selected));
      });
      const preview = document.querySelector("[data-composition-card-preview]");
      const card = state.selectedCardPack?.cards?.find((candidate) => candidate.cardId === state.selectedCompositionCardId);
      if (preview && card) {
        const thumbnailUrl = state.cardThumbnailUrls[card.cardId] || ({
          card_demo_published: "./assets/demo/dreamscape/yuna.png",
          card_demo_harin: "./assets/demo/dreamscape/harin.png",
          card_demo_sena: "./assets/demo/dreamscape/sena.png",
          card_demo_rina: "./assets/demo/dreamscape/rina.png",
        })[card.cardId] || "";
        const media = preview.querySelector(".composition-card-preview-media");
        if (media) media.replaceChildren(thumbnailUrl ? Object.assign(document.createElement("img"), { src: thumbnailUrl, alt: `${card.name} 카드 미리보기` }) : document.createTextNode("이미지 없음"));
        preview.querySelector(".composition-card-preview-copy h3").textContent = card.name;
        preview.querySelector(".composition-card-preview-copy p").textContent = card.cardId;
        preview.querySelector("[data-composition-preview-rarity]").textContent = card.rarity || "N";
        preview.querySelector("[data-composition-preview-probability]").textContent = `${Number(card.probability || 0).toFixed(2)}%`;
      }
    };
    row.addEventListener("click", (event) => { if (!event.target.closest("input,button,a,label,select,textarea")) select(); });
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
  });
  document.querySelectorAll(".card-pack-open").forEach((button) =>
    button.addEventListener("click", () => void loadCardPackDetail(button.dataset.cardPackId)),
  );
  document.querySelectorAll("[data-card-pack-row-id]").forEach((row) => {
    const open = () => void loadCardPackDetail(row.dataset.cardPackRowId);
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select")) return;
      open();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
  document.querySelectorAll(".card-pack-compose").forEach((button) =>
    button.addEventListener("click", () => void loadCardPackDetail(button.dataset.cardPackId, true)),
  );
  document.querySelectorAll(".card-pack-publish").forEach((button) =>
    button.addEventListener("click", () => void publishCardPack(button.dataset.cardPackId)),
  );
  document.querySelector("#card-pack-search")?.addEventListener("input", (event) => {
    state.cardPackQuery = event.currentTarget.value;
    state.cardPackPage = 1;
    void loadCardPacks(true);
  });
  document.querySelectorAll("[data-select-id=card-pack-artist] .admin-select-option").forEach((button) =>
    button.addEventListener("click", () => { state.cardPackArtist = button.dataset.value; state.cardPackPage = 1; void loadCardPacks(true); }),
  );
  document.querySelectorAll("[data-select-id=card-pack-status] .admin-select-option").forEach((button) =>
    button.addEventListener("click", () => { state.cardPackStatus = button.dataset.value; state.cardPackPage = 1; void loadCardPacks(true); }),
  );
  document
    .querySelector("#desktop-nav-toggle")
    ?.addEventListener("click", toggleDesktopNavigation);
  document.querySelector("#mobile-nav-toggle")?.addEventListener("click", () => {
    state.mobileNavOpen = !state.mobileNavOpen;
    state.accountMenuOpen = false;
    layout();
  });
  document.querySelector("#nav-scrim")?.addEventListener("click", () => {
    state.mobileNavOpen = false;
    layout();
  });
  document.querySelector("#account-menu-toggle")?.addEventListener("click", () => {
    state.accountMenuOpen = !state.accountMenuOpen;
    state.notificationPanelOpen = false;
    layout();
  });
  document.querySelectorAll("[data-open-notification]").forEach((button) =>
    button.addEventListener("click", () =>
      void openNotification(button.dataset.openNotification, button.dataset.cardId, button.dataset.notificationView, button.dataset.notificationTicket, button.dataset.notificationDelivery),
    ),
  );
  document.querySelectorAll("[data-support-ticket]").forEach((button) =>
    button.addEventListener("click", () => void openSupportTicket(button.dataset.supportTicket)),
  );
  document.querySelectorAll("[data-support-activity-detail]").forEach((button) =>
    button.addEventListener("click", () => {
      state.supportActivityDetailTicketId = state.selectedSupportTicket?.id || "";
      state.supportActivityDetailIndex = Number(button.dataset.supportActivityDetail);
      layout();
    }),
  );
  document.querySelector("[data-support-activity-close]")?.addEventListener("click", () => {
    state.supportActivityDetailIndex = null;
    layout();
  });
  document.querySelectorAll("[data-support-activity-copy]").forEach((button) =>
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const value = button.dataset.supportActivityCopy || "";
      try {
        await navigator.clipboard.writeText(value);
        toast("원문 ID를 복사했습니다.");
      } catch {
        toast("원문 ID를 복사하지 못했습니다.");
      }
    }),
  );
  document.querySelectorAll("[data-support-page]").forEach((button) =>
    button.addEventListener("click", () => {
      const page = Number(button.dataset.supportPage);
      if (button.disabled || !Number.isInteger(page) || page < 1 || page === state.supportPagination.page) return;
      state.supportPagination.page = page;
      void loadSupportTickets(true);
    }),
  );
  document.querySelectorAll("[data-support-status]").forEach((select) =>
    select.addEventListener("change", () => void updateSupportTicketStatus(select.dataset.supportStatus, select.value)),
  );
  document.querySelectorAll("[data-support-assignee]").forEach((select) =>
    select.addEventListener("change", () => void updateSupportTicketAssignee(select.dataset.supportAssignee, select.value)),
  );
  document.querySelectorAll("[data-support-reply]").forEach((form) =>
    form.addEventListener("submit", replySupportTicket),
  );
  if (state.selectedSupportTicket?.evidence?.some((item) => item.kind === "trade_hold")) {
    const actionBar = document.querySelector(".support-action-bar");
    const releaseButton = document.createElement("button");
    releaseButton.type = "button";
    releaseButton.className = "secondary";
    releaseButton.dataset.supportAction = "release_trade";
    releaseButton.dataset.supportId = state.selectedSupportTicket.id;
    releaseButton.textContent = "보류 해제";
    actionBar?.append(releaseButton);
  }
  if (state.selectedSupportTicket?.evidence?.some((item) => item.kind === "collection_hidden") && !state.selectedSupportTicket?.evidence?.some((item) => item.kind === "collection_restored")) {
    const actionBar = document.querySelector(".support-action-bar");
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "secondary";
    restoreButton.dataset.supportAction = "restore_collection";
    restoreButton.dataset.supportId = state.selectedSupportTicket.id;
    restoreButton.textContent = "공개 컬렉션 복구";
    actionBar?.append(restoreButton);
  }
  document.querySelectorAll("[data-support-action]").forEach((button) =>
    button.addEventListener("click", () => {
    const referenceField = document.querySelector(`[data-support-action-reference="${button.dataset.supportId}"]`);
      const reference = referenceField?.value?.trim() || "";
      const needsReference = ["hold_trade", "release_trade", "refund_order", "grant_points"].includes(button.dataset.supportAction);
      if (needsReference && !reference) {
        toast("대상 ID 또는 운영 메모를 입력해 주세요.");
        referenceField?.focus();
        return;
      }
      const amountField = document.querySelector(`[data-support-action-amount="${button.dataset.supportId}"]`);
      const amount = button.dataset.supportAction === "grant_points" ? Number(amountField?.value || 0) : null;
      if (button.dataset.supportAction === "grant_points" && (!Number.isInteger(amount) || amount === 0)) {
        toast("포인트 조정 금액은 0이 아닌 정수로 입력해 주세요.");
        amountField?.focus();
        return;
      }
      void actSupportTicket(button.dataset.supportId, button.dataset.supportAction,
        needsReference ? reference : null,
        needsReference ? "CS 운영 조치" : reference,
        amount);
    }),
  );
  document.querySelector("#support-status-filter")?.addEventListener("change", (event) => {
    state.supportStatus = event.currentTarget.value;
    state.supportPagination.page = 1;
    void loadSupportTickets(true);
  });
  document.querySelector("#support-category-filter")?.addEventListener("change", (event) => {
    state.supportCategory = event.currentTarget.value;
    state.supportPagination.page = 1;
    void loadSupportTickets(true);
  });
  document.querySelector("#support-search")?.addEventListener("input", (event) => {
    state.supportQuery = event.currentTarget.value;
    state.supportPagination.page = 1;
    void loadSupportTickets(true);
  });
  document.querySelector("#support-filter-reset")?.addEventListener("click", () => {
    state.supportQuery = "";
    state.supportStatus = "all";
    state.supportCategory = "all";
    state.supportPagination.page = 1;
    void loadSupportTickets(true);
  });
  document.querySelectorAll("[data-delivery-retry]").forEach((button) =>
    button.addEventListener("click", () => void retryDelivery(button.dataset.deliveryRetry)),
  );
  document.querySelectorAll("[data-engagement-retry]").forEach((button) =>
    button.addEventListener("click", () => void retryEngagementEvent(button.dataset.engagementRetry)),
  );
  document.querySelector("#delivery-status-filter")?.addEventListener("change", (event) => {
    state.deliveryStatus = event.currentTarget.value;
    void loadDeliveryQueue(true);
  });
  document.querySelector("#delivery-channel-filter")?.addEventListener("change", (event) => {
    state.deliveryChannel = event.currentTarget.value;
    void loadDeliveryQueue(true);
  });
  document.querySelector("#delivery-filter-reset")?.addEventListener("click", () => {
    state.deliveryStatus = "failed";
    state.deliveryChannel = "all";
    void loadDeliveryQueue(true);
  });
  document.querySelector("#account-settings")?.addEventListener("click", () => {
    state.view = "settings";
    state.accountMenuOpen = false;
    layout();
  });
  document.querySelectorAll("[data-settings-password-change]").forEach((button) => button.addEventListener("click", () => {
    state.mustChangePassword = true;
    state.accountMenuOpen = false;
    state.loginError = "";
    layout();
  }));
  document.querySelector("#account-password-change")?.addEventListener("click", () => {
    state.mustChangePassword = true;
    state.accountMenuOpen = false;
    state.loginError = "";
    layout();
  });
  document
    .querySelector("#account-logout")
    ?.addEventListener("click", () => void logoutAdmin());

  document.querySelector("#partner-search")?.addEventListener("input", (event) => {
    state.partnerQuery = event.currentTarget.value;
    const position = event.currentTarget.selectionStart;
    layout();
    const input = document.querySelector("#partner-search");
    input?.focus();
    input?.setSelectionRange(position, position);
  });
  document.querySelectorAll("[data-partner-status]").forEach((button) =>
    button.addEventListener("click", () => {
      state.partnerStatus = button.dataset.partnerStatus;
      layout();
    }),
  );
  document.querySelectorAll("[data-partner-id]").forEach((button) =>
    button.addEventListener(
      "click",
      () => void loadSelectedOrganization(button.dataset.partnerId),
    ),
  );
  document.querySelectorAll("[data-partner-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      state.partnerTab = button.dataset.partnerTab;
      layout();
    }),
  );
  document
    .querySelectorAll("#open-organization-drawer, #empty-add-organization")
    .forEach((button) =>
      button.addEventListener("click", () => openDrawer("organization")),
    );
  document.querySelector("#edit-organization")?.addEventListener("click", () =>
    openDrawer("organization", { organization: state.selectedOrganization }),
  );
  document
    .querySelector("#toggle-organization-status")
    ?.addEventListener("click", (event) =>
      void updateOrganizationStatus(event.currentTarget.dataset.nextStatus),
    );
  document
    .querySelector("#save-organization-artists")
    ?.addEventListener("click", () => void saveOrganizationArtists());
  document
    .querySelectorAll("#open-member-drawer, #empty-add-member")
    .forEach((button) =>
      button.addEventListener("click", () => openDrawer("member")),
    );
  document.querySelectorAll("[data-assign-member]").forEach((button) =>
    button.addEventListener("click", () => {
      const member = state.organizationMembers.find(
        (item) => item.id === button.dataset.assignMember,
      );
      openDrawer("artist-assignment", { member });
    }),
  );
  document.querySelectorAll(".edit-artist").forEach((button) =>
    button.addEventListener("click", () => {
      const artist = scopedArtists().find(
        (item) => item.id === button.dataset.artistId,
      );
      if (artist) openDrawer("artist-edit", { artist });
    }),
  );
  document.querySelectorAll(".member-status").forEach((button) =>
    button.addEventListener("click", () =>
      void toggleOrganizationMemberStatus(
        button.dataset.memberId,
        button.dataset.nextStatus,
      ),
    ),
  );

  document
    .querySelectorAll("#open-card-drawer")
    .forEach((button) =>
      button.addEventListener("click", () => openDrawer("card-create")),
    );
  document
    .querySelector("#open-achievement-drawer")
    ?.addEventListener("click", () => openDrawer("achievement"));
  document
    .querySelector("#open-fan-pass-drawer")
    ?.addEventListener("click", () => openDrawer("fan-pass"));
  document
    .querySelector("#open-global-fan-pass-drawer")
    ?.addEventListener("click", () => openDrawer("fan-pass", { season: { scopeType: "global", title: "전체 팬 레벨", description: "모든 아티스트 활동을 아우르는 계정 성장", organizationId: null, artistId: null, tiers: [] } }));
  document
    .querySelector("#open-reward-drawer")
    ?.addEventListener("click", () => openDrawer("reward"));
  document
    .querySelector("#open-mission-drawer")
    ?.addEventListener("click", () => openDrawer("mission"));
  document.querySelectorAll(".edit-achievement").forEach((button) =>
    button.addEventListener("click", () => {
      const achievement = state.engagement.achievements.find((item) => item.id === button.dataset.id);
      if (achievement) openDrawer("achievement", { achievement });
    }),
  );
  document.querySelectorAll(".edit-mission").forEach((button) =>
    button.addEventListener("click", () => {
      const mission = state.engagement.missions.find((item) => item.id === button.dataset.id);
      if (mission) openDrawer("mission", { mission });
    }),
  );
  document.querySelectorAll(".edit-fan-pass").forEach((button) =>
    button.addEventListener("click", () => {
      const season = state.engagement.passSeasons.find((item) => item.id === button.dataset.id);
      if (season) openDrawer("fan-pass", { season });
    }),
  );
  document.querySelector("#fan-pass-search")?.addEventListener("input", (event) => {
    state.fanPassQuery = event.target.value;
    state.fanPassPage = 1;
    layout();
    const search = document.querySelector("#fan-pass-search");
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  });
  document.querySelector("#fan-pass-filter-reset")?.addEventListener("click", () => {
    state.fanPassQuery = "";
    state.fanPassStatus = "all";
    state.fanPassArtist = "all";
    state.fanPassPage = 1;
    layout();
  });
  document.querySelectorAll(".close-drawer").forEach((button) =>
    button.addEventListener("click", closeDrawer),
  );
  document.querySelector("#drawer-backdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "drawer-backdrop") closeDrawer();
  });
  document
    .querySelector("#organization-form")
    ?.addEventListener("submit", saveOrganization);
  bindOrganizationLogoPicker(document.querySelector("#organization-form"));
  bindPartnerLogoFallbacks();
  document
    .querySelector("#artist-edit-form")
    ?.addEventListener("submit", saveArtist);
  document
    .querySelector("#achievement-form")
    ?.addEventListener("submit", saveAchievement);
  document
    .querySelector("#mission-form")
    ?.addEventListener("submit", saveMission);
  document
    .querySelector("#fan-pass-form")
    ?.addEventListener("submit", saveFanPass);
  document.querySelector("#add-pass-tier")?.addEventListener("click", () => {
    const form = document.querySelector("#fan-pass-form");
    if (!form) return;
    const data = new FormData(form);
    const currentSeason = state.drawerData?.season || {};
    const currentTiers = data.getAll("tierXp").map((xp, index) => ({
      tier: index + 1,
      requiredXp: xp,
      rewardId: data.getAll("tierReward")[index] || "",
      premiumRewardId: data.getAll("tierPremiumReward")[index] || "",
    }));
    if (currentTiers.length >= maxFanPassTiers) {
      toast("티어는 최대 30개까지 등록할 수 있습니다.");
      return;
    }
    state.drawerData = {
      season: {
        ...currentSeason,
        title: data.get("title") || "",
        description: data.get("description") || "",
        organizationId: data.get("organizationId") || null,
        artistId: data.get("artistId") || null,
        startsAt: data.get("startsAt") || null,
        endsAt: data.get("endsAt") || null,
        premiumEnabled: data.get("premiumEnabled") === "on",
        premiumPricePoints: data.get("premiumPricePoints") || "",
        tiers: [...currentTiers, { tier: currentTiers.length + 1, requiredXp: "", rewardId: "", premiumRewardId: "" }],
      },
    };
    layout();
  });
  const fanPassForm = document.querySelector("#fan-pass-form");
  if (isRoot() && fanPassForm) {
    const artistSelect = fanPassForm.querySelector('[data-select-id="fan-pass-artist"]');
    const artistValue = artistSelect?.querySelector('[name="artistId"]');
    if (state.drawerData?.season?.scopeType === "global" || (!state.drawerData?.season?.organizationId && !state.drawerData?.season?.artistId)) {
      artistValue?.removeAttribute("required");
    }
  }
  document.querySelector(".fan-pass-preview-grid article:first-child button")?.addEventListener("click", () => {
    const previewUrl = `${window.location.protocol}//${window.location.hostname}:4173/?preview=fan-growth`;
    window.open(previewUrl, "fanfolio-fan-preview", "noopener,noreferrer");
  });
  if (fanPassForm && !document.querySelector("#fan-pass-preset")) {
    const tierSection = fanPassForm.querySelector(".pass-tier-list")?.closest(".fan-pass-form-section");
    if (tierSection) {
      const presetSection = document.createElement("section");
      presetSection.className = "fan-pass-form-section fan-pass-preset-section";
      presetSection.innerHTML = `<div class="fan-pass-section-heading"><div><h3>기본 세트로 시작</h3><small>레벨 수와 XP 구간을 한 번에 채운 뒤 보상은 단계별로 연결할 수 있습니다.</small></div><label class="field preset-field"><span class="sr-only">기본 세트</span>${adminSelect({ id: "fan-pass-preset", name: "preset", value: "", label: "기본 세트 선택", className: "form-select", options: [{ value: "", label: "세트 선택" }, ...fanPassPresets.map((preset) => ({ value: preset.id, label: preset.label }))] })}</label></div>`;
      tierSection.before(presetSection);
      document.querySelector('[data-select-id="fan-pass-preset"] .admin-select-value')?.addEventListener("change", (event) => applyFanPassPreset(event.target.value));
    }
  }
  document
    .querySelector("#reward-form")
    ?.addEventListener("submit", saveReward);
  const rewardForm = document.querySelector("#reward-form");
  const rewardFileInput = document.querySelector("#reward-image-file");
  document.querySelector("#reward-image-upload-button")?.addEventListener("click", () => rewardFileInput?.click());
  document.querySelector("#reward-media-library-button")?.addEventListener("click", () => {
    const library = document.querySelector("#reward-image-presets");
    library?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    library?.classList.add("is-highlighted");
    window.setTimeout(() => library?.classList.remove("is-highlighted"), 900);
    document.querySelector("[data-reward-image-preset]")?.focus();
  });
  rewardFileInput?.addEventListener("change", () => {
    const file = rewardFileInput.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast("PNG, JPG, WEBP 이미지만 등록할 수 있습니다.");
      rewardFileInput.value = "";
      return;
    }
    resetRewardImageState();
    state.rewardImageFile = file;
    state.rewardImagePreviewUrl = URL.createObjectURL(file);
    document.querySelectorAll(".reward-image-preset").forEach((button) => {
      button.classList.remove("selected");
      button.querySelector(":scope > span")?.remove();
    });
    const presetInput = document.querySelector("#reward-image-preset");
    if (presetInput) presetInput.value = "";
    ["#reward-image-preview", "#reward-card-preview-image"].forEach((selector) => {
      const image = document.querySelector(selector);
      if (image) image.src = state.rewardImagePreviewUrl;
    });
  });
  document.querySelectorAll("[data-reward-image-preset]").forEach((button) => button.addEventListener("click", () => {
    resetRewardImageState();
    const preset = rewardPreset(button.dataset.rewardImagePreset);
    const presetInput = document.querySelector("#reward-image-preset");
    if (presetInput) presetInput.value = preset.id;
    document.querySelectorAll(".reward-image-preset").forEach((item) => {
      item.classList.toggle("selected", item === button);
      item.querySelector(":scope > span")?.remove();
    });
    button.insertAdjacentHTML("beforeend", `<span>${icon("check")}</span>`);
    ["#reward-image-preview", "#reward-card-preview-image"].forEach((selector) => {
      const image = document.querySelector(selector);
      if (image) image.src = preset.src;
    });
  }));
  rewardForm?.querySelector('[name="name"]')?.addEventListener("input", (event) => {
    const preview = document.querySelector("#reward-card-preview-name");
    if (preview) preview.textContent = event.target.value.trim() || "보상 이름";
  });
  rewardForm?.querySelector('[name="label"]')?.addEventListener("input", (event) => {
    const preview = document.querySelector("#reward-card-preview-label");
    if (preview) preview.textContent = event.target.value.trim() || "팬앱 표시 라벨";
  });
  document
    .querySelector('#achievement-condition .admin-select-value')
    ?.addEventListener("change", () => {
      state.drawerData = {
        ...(state.drawerData || {}),
        achievement: {
          ...(state.drawerData?.achievement || {}),
          conditionType: document.querySelector('#achievement-condition [name="conditionType"]')?.value || "first_card",
        },
      };
      layout();
    });
  document.querySelectorAll(".fan-growth-transition").forEach((button) =>
    button.addEventListener("click", () =>
      void transitionFanGrowth(button.dataset.kind, button.dataset.action, button.dataset.id),
    ),
  );
  document
    .querySelector("#organization-member-form")
    ?.addEventListener("submit", createOrganizationMember);
  document
    .querySelector("#member-artist-form")
    ?.addEventListener("submit", saveMemberArtists);
  document
    .querySelector("#copy-temporary-password")
    ?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          state.temporaryCredential?.temporaryPassword || "",
        );
        toast("임시 비밀번호를 복사했습니다.");
      } catch {
        toast("브라우저에서 복사를 허용하지 않았습니다.");
      }
    });
  document
    .querySelector("#copy-artist-temporary-password")
    ?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          document.querySelector("#artist-temporary-password")?.textContent || "",
        );
        toast("아티스트 임시 비밀번호를 복사했습니다.");
      } catch {
        toast("브라우저에서 복사를 허용하지 않았습니다.");
      }
    });

  document
    .querySelector("#user-search-submit")
    ?.addEventListener("click", searchUsers);
  document
    .querySelector("#user-search")
    ?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchUsers();
    });
  document
    .querySelectorAll(".user-page")
    .forEach((button) =>
      button.addEventListener("click", () =>
        changeUserPage(button.dataset.page),
      ),
    );
  document.querySelectorAll("[data-open-fan360]").forEach((button) =>
    button.addEventListener("click", () => void openFan360(button.dataset.openFan360)),
  );
  document.querySelector("[data-close-fan360]")?.addEventListener("click", () => {
    state.fan360 = null;
    layout();
  });
  document
    .querySelector("#audit-search-submit")
    ?.addEventListener("click", searchAuditLogs);
  document
    .querySelector("#export-audit-csv")
    ?.addEventListener("click", exportAuditCsv);
  document
    .querySelector("#audit-search")
    ?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchAuditLogs();
    });
  document
    .querySelectorAll(".audit-page")
    .forEach((button) =>
      button.addEventListener("click", () =>
        changeAuditPage(button.dataset.page),
      ),
    );
  document
    .querySelector("#export-cards-csv")
    ?.addEventListener("click", exportCardsCsv);
  document
    .querySelector("#campaign-form")
    ?.addEventListener("submit", createCampaign);
  document
    .querySelectorAll(".campaign-status")
    .forEach((button) =>
      button.addEventListener("click", () =>
        updateCampaignStatus(button.dataset.id, button.dataset.status),
      ),
    );
  document.querySelector("#logout")?.addEventListener("click", () => void logoutAdmin());
  document
    .querySelector("#admin-card-form")
    ?.addEventListener("submit", createAdminCard);
  document
    .querySelector("#admin-card-edit-form")
    ?.addEventListener("submit", updateAdminCard);
  document.querySelector("#event-form")?.addEventListener("submit", saveEvent);
  document.querySelector(".event-upload-select")?.addEventListener("click", () => document.querySelector("#event-banner-file")?.click());
  document.querySelector("#event-banner-file")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const name = document.querySelector("#event-banner-file-name");
    if (file && name) name.textContent = file.name;
    if (!file) return;
    try { event.currentTarget.form.elements.heroAssetId.value = await uploadAsset(file, "event_banner"); toast("이벤트 배너를 업로드했습니다."); } catch { event.currentTarget.value = ""; toast("이벤트 배너 업로드에 실패했습니다."); }
  });
  document.querySelector('#event-form [data-select-id="event-type"] .admin-select-value')?.addEventListener("change", (event) => {
    const field = document.querySelector("#event-connection-field"); if (!field) return;
    field.innerHTML = eventConnectionOptions(event.currentTarget.value);
  });
  document.querySelectorAll("[data-event-row-id]").forEach((row) => {
    const open = () => { state.selectedEvent = state.events.find((item) => item.id === row.dataset.eventRowId) || null; layout(); };
    row.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  });
  document.querySelectorAll("[data-event-page]").forEach((button) => button.addEventListener("click", () => { state.eventPage = Number(button.dataset.eventPage); void loadEvents(true); }));
  document.querySelector("#close-event-detail")?.addEventListener("click", () => { state.selectedEvent = null; layout(); });
  document.querySelector("#event-search")?.addEventListener("input", (event) => { state.eventQuery = event.target.value; state.eventPage = 1; void loadEvents(true); });
  document.querySelectorAll(".event-review").forEach((button) => button.addEventListener("click", () => void eventTransition(button.dataset.id, "review", button.dataset.decision)));
  document.querySelectorAll(".event-submit").forEach((button) => button.addEventListener("click", () => void submitEvent(button.dataset.id)));
  document.querySelectorAll(".event-publish").forEach((button) => button.addEventListener("click", () => void eventTransition(button.dataset.id, "publish")));
  document.querySelectorAll(".event-end").forEach((button) => button.addEventListener("click", () => void eventTransition(button.dataset.id, "end")));
  document.querySelectorAll(".event-edit").forEach((button) => button.addEventListener("click", () => { const event = state.events.find((item) => item.id === button.dataset.id); if (event) openDrawer("event", { event }); }));
  document.querySelectorAll(".event-applicants").forEach((button) => button.addEventListener("click", () => { state.eventApplicantsModalOpen = true; void loadEventApplicants(button.dataset.id); }));
  document.querySelector("#close-event-applicants")?.addEventListener("click", () => { state.eventApplicantsModalOpen = false; layout(); });
  document.querySelector("#event-applicants-modal-backdrop")?.addEventListener("click", (event) => { if (event.target.id === "event-applicants-modal-backdrop") { state.eventApplicantsModalOpen = false; layout(); } });
  document.querySelectorAll(".event-comments").forEach((button) => button.addEventListener("click", () => { state.eventCommentsModalOpen = true; void loadEventComments(button.dataset.id); }));
  document.querySelector("#close-event-comments")?.addEventListener("click", () => { state.eventCommentsModalOpen = false; layout(); });
  document.querySelector("#event-comments-modal-backdrop")?.addEventListener("click", (event) => { if (event.target.id === "event-comments-modal-backdrop") { state.eventCommentsModalOpen = false; layout(); } });
  document.querySelectorAll(".event-comment-review").forEach((button) => button.addEventListener("click", () => void reviewEventComment(button.dataset.eventId, button.dataset.commentId, button.dataset.status)));
  document.querySelectorAll(".event-preview-open").forEach((button) => button.addEventListener("click", () => { window.open(button.dataset.previewUrl, "_blank", "noopener,noreferrer"); }));
  document.querySelectorAll(".event-draw").forEach((button) => button.addEventListener("click", () => {
    const countInput = document.querySelector(`.event-winner-count[data-id="${CSS.escape(button.dataset.id || "")}"]`);
    void drawEventWinners(button.dataset.id, countInput?.value || "1");
  }));
  document
    .querySelector("#drop-link-form")
    ?.addEventListener("submit", linkApprovedCardToDrop);
  const filterCardMembers = (artistId) => {
    const memberControl = document.querySelector(
      '#admin-card-form [data-select-id="admin-card-member"]',
    );
    if (!memberControl) return;
    const options = Array.from(memberControl.querySelectorAll(".admin-select-option"));
    options.forEach((option) => {
      const hidden = Boolean(artistId && option.dataset.value && option.dataset.artistId !== artistId);
      option.hidden = hidden;
      option.disabled = hidden;
    });
    const selected = memberControl.dataset.value;
    const selectedOption = options.find((option) => option.dataset.value === selected);
    if (selectedOption?.hidden) {
      memberControl.dataset.value = "";
      memberControl.querySelector(".admin-select-label").textContent = "멤버 선택";
      const hiddenValue = memberControl.querySelector(".admin-select-value");
      if (hiddenValue) hiddenValue.value = "";
      options.forEach((option) => {
        option.classList.toggle("selected", option.dataset.value === "");
        option.setAttribute("aria-selected", String(option.dataset.value === ""));
      });
    }
  };
  document
    .querySelector('#admin-card-form [data-select-id="admin-card-artist"] .admin-select-value')
    ?.addEventListener("change", (event) => filterCardMembers(event.currentTarget.value));
  filterCardMembers(
    document.querySelector('#admin-card-form [data-select-id="admin-card-artist"]')?.dataset.value || "",
  );
  document.querySelector("#card-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.cardPage = 1;
    void loadCards(true);
  });
  document
    .querySelectorAll(".review-card")
    .forEach((button) =>
      button.addEventListener("click", (event) =>
        activateReviewButton(event, button.dataset.id),
      ),
      );
  document.querySelectorAll("[data-card-action-menu]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.cardActionMenu;
      state.cardActionMenuId = state.cardActionMenuId === id ? null : id;
      layout();
      requestAnimationFrame(positionOpenCardActionMenu);
    }),
  );
  document.querySelectorAll(".delete-draft-card").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteDraftCard(button.dataset.id);
    }),
  );
  document.querySelectorAll("[data-review-row-id]").forEach((row) => {
    row.addEventListener("click", openReviewFromRow);
    row.addEventListener("keydown", openReviewFromRowKey);
  });
  document.querySelectorAll("[data-review-status-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      state.status = button.dataset.reviewStatusTab || "all";
      state.cardPage = 1;
      void loadCards(true);
    }),
  );
  document.querySelectorAll("[data-review-side]").forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewSide = button.dataset.reviewSide === "back" ? "back" : "front";
      layout();
    }),
  );
  document.querySelectorAll("[data-review-effects]").forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewEffectsEnabled = !state.reviewEffectsEnabled;
      layout();
    }),
  );
  document.querySelectorAll("[data-review-effect-card]").forEach((card) => {
    const reset = () => {
      card.style.setProperty("--review-light-x", "50%");
      card.style.setProperty("--review-light-y", "42%");
      card.style.setProperty("--review-tilt-x", "0deg");
      card.style.setProperty("--review-tilt-y", "0deg");
    };
    card.addEventListener("pointermove", (event) => {
      if (!state.reviewEffectsEnabled || event.pointerType === "touch") return;
      const box = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      card.style.setProperty("--review-light-x", `${Math.round(x * 100)}%`);
      card.style.setProperty("--review-light-y", `${Math.round(y * 100)}%`);
      card.style.setProperty("--review-tilt-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
      card.style.setProperty("--review-tilt-y", `${((x - 0.5) * 10).toFixed(2)}deg`);
    });
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointercancel", reset);
  });
  document.querySelectorAll("[data-review-upload]").forEach((input) =>
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void replaceReviewImage(file, input.dataset.reviewUpload);
    }),
  );
  document
    .querySelectorAll(".review-decision")
    .forEach((button) =>
      button.addEventListener("click", () =>
        submitReleaseDecision(
          button.dataset.id,
          button.dataset.stage,
          button.dataset.decision,
        ),
      ),
    );
  document
    .querySelectorAll(".submit-review-request")
    .forEach((button) =>
      button.addEventListener("click", () =>
        submitPartnerReviewRequest(button.dataset.id),
      ),
    );
  document
    .querySelectorAll(".open-drop-link")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const card = state.cards.find((item) => item.id === button.dataset.id) || state.reviewCard;
        openDrawer("drop-link", { card });
      }),
    );
  document.querySelector("#close-review")?.addEventListener("click", () => {
    state.reviewCard = null;
    state.cardCollaborationComments = [];
    state.cardCollaborationCommentsError = "";
    if (state.reviewImageSrc) URL.revokeObjectURL(state.reviewImageSrc);
    if (state.reviewBackImageSrc) URL.revokeObjectURL(state.reviewBackImageSrc);
    state.reviewImageSrc = "";
    state.reviewBackImageSrc = "";
    layout();
  });
  document
    .querySelector("#download-csv")
    ?.addEventListener("click", () => void downloadBatchCsv());
  document
    .querySelector("#download-qr-zip")
    ?.addEventListener("click", () => void downloadBatchQrZip());
  document.querySelector("#issuance-search")?.addEventListener("input", (event) => {
    state.issuanceQuery = event.currentTarget.value;
    state.issuancePage = 1;
    const position = event.currentTarget.selectionStart;
    layout();
    const input = document.querySelector("#issuance-search");
    input?.focus();
    input?.setSelectionRange(position, position);
  });
  document.querySelectorAll("[data-batch-id]").forEach((row) => {
    const selectBatch = () => {
      state.selectedBatchId = row.dataset.batchId;
      state.batch = state.batches.find((batch) => batch.id === row.dataset.batchId) || null;
      layout();
    };
    row.addEventListener("click", selectBatch);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectBatch();
      }
    });
  });
  document.querySelectorAll("[data-batch-csv]").forEach((button) =>
    button.addEventListener("click", () => {
      state.batch = state.batches.find((batch) => batch.id === button.dataset.batchCsv) || null;
      void downloadBatchCsv();
    }),
  );
  document.querySelectorAll("[data-batch-qr]").forEach((button) =>
    button.addEventListener("click", () => {
      state.batch = state.batches.find((batch) => batch.id === button.dataset.batchQr) || null;
      void downloadBatchQrZip();
    }),
  );
  document.querySelectorAll("[data-open-batch-codes]").forEach((button) =>
    button.addEventListener("click", () => void openCodeBatch(button.dataset.openBatchCodes)),
  );
  document
    .querySelectorAll(".code-batch")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void openCodeBatch(button.dataset.id),
      ),
    );
  document.querySelector("#close-code-batch")?.addEventListener("click", () => {
    clearCodeQr();
    state.codeBatch = null;
    layout();
  });
  document.querySelectorAll(".show-code-qr").forEach((button) =>
    button.addEventListener("click", () => void showCodeQr(button.dataset.code)),
  );
  document.querySelector("#close-code-qr")?.addEventListener("click", () => {
    clearCodeQr();
    layout();
  });
  document
    .querySelectorAll(".disable-code")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void disableCode(button.dataset.code),
      ),
    );
  document
    .querySelectorAll(".drop-status")
    .forEach((button) =>
      button.addEventListener("click", () =>
        updateDropStatus(button.dataset.id, button.dataset.status),
      ),
    );
  document
    .querySelectorAll(".submit-drop")
    .forEach((button) =>
      button.addEventListener("click", () => void submitDrop(button.dataset.id)),
    );
  document.querySelectorAll(".admin-select-trigger").forEach((trigger) => {
    const toggleSelect = (focusFirst = false, reverse = false) => {
      const control = trigger.closest(".admin-select");
      const isOpen = control.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
      document.querySelectorAll(".admin-select.open").forEach((other) => {
        if (other !== control) other.classList.remove("open");
      });
      if (isOpen && focusFirst) {
        const options = [...control.querySelectorAll(".admin-select-option")];
        (reverse ? options.at(-1) : options[0])?.focus();
      }
    };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSelect();
    });
    trigger.addEventListener("keydown", (event) => {
      const control = trigger.closest(".admin-select");
      const options = [...control.querySelectorAll(".admin-select-option")];
      const currentIndex = Math.max(0, options.findIndex((option) => option.classList.contains("selected")));
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (!control.classList.contains("open")) {
          toggleSelect(true, event.key === "ArrowUp");
          return;
        }
        options[(currentIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (["Home", "End"].includes(event.key) && control.classList.contains("open")) {
        event.preventDefault();
        (event.key === "Home" ? options[0] : options.at(-1))?.focus();
      } else if (event.key === "Escape" && control.classList.contains("open")) {
        event.preventDefault();
        control.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  });
  document.querySelectorAll(".admin-select-option").forEach((option) => {
    option.addEventListener("keydown", (event) => {
      const control = option.closest(".admin-select");
      const options = [...control.querySelectorAll(".admin-select-option")];
      const index = options.indexOf(option);
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (["Home", "End"].includes(event.key)) {
        event.preventDefault();
        (event.key === "Home" ? options[0] : options.at(-1))?.focus();
      } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        option.click();
      } else if (event.key === "Escape") {
        event.preventDefault();
        control.classList.remove("open");
        control.querySelector(".admin-select-trigger")?.focus();
      }
    });
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      const control = option.closest(".admin-select");
      if (control.dataset.multiSelect) {
        const selected = option.classList.toggle("selected");
        option.setAttribute("aria-selected", String(selected));
        const values = [...control.querySelectorAll(".admin-select-option.selected")].map((item) => item.dataset.value);
        control.dataset.value = values.join(",");
        control.querySelectorAll(".admin-multi-select-value").forEach((input) => input.remove());
        const name = control.dataset.selectName;
        if (name) control.insertAdjacentHTML("beforeend", values.map((value) => `<input class="admin-multi-select-value" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`).join(""));
        control.querySelectorAll(".admin-select-option").forEach((item) => {
          const isSelected = item.classList.contains("selected");
          item.querySelector(".admin-multi-select-check").innerHTML = isSelected ? icon("check") : "";
        });
        const labels = [...control.querySelectorAll(".admin-select-option.selected")].map((item) => item.dataset.label);
        control.querySelector(".admin-select-label").textContent = labels.length ? `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? ` 외 ${labels.length - 2}개` : ""}` : "선택하세요";
        const count = control.querySelector(".admin-multi-select-count");
        if (count) count.textContent = labels.length ? `${labels.length}개 선택` : "필수 선택";
        return;
      }
      const previous = control.dataset.value;
      control.dataset.value = option.dataset.value;
      control.querySelector(".admin-select-label").textContent = option.dataset.label;
      const hiddenValue = control.querySelector(".admin-select-value");
      if (hiddenValue) {
        hiddenValue.value = option.dataset.value;
        hiddenValue.dispatchEvent(new Event("change", { bubbles: true }));
      }
      control.querySelectorAll(".admin-select-option").forEach((item) => {
        const selected = item === option;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      control.classList.remove("open");
      control.querySelector(".admin-select-trigger").setAttribute("aria-expanded", "false");
      if (control.classList.contains("card-artist-filter") && previous !== option.dataset.value) {
        state.cardArtist = option.dataset.value;
        state.cardPage = 1;
        void loadCards(true);
      }
      if (control.classList.contains("card-status-filter") && previous !== option.dataset.value) {
        state.status = option.dataset.value;
        state.cardPage = 1;
        void loadCards(true);
      }
      if (control.classList.contains("event-status-filter") && previous !== option.dataset.value) {
        state.eventStatus = option.dataset.value; state.eventPage = 1; void loadEvents(true);
      }
      if (control.classList.contains("event-type-filter") && previous !== option.dataset.value) {
        state.eventType = option.dataset.value; state.eventPage = 1; void loadEvents(true);
      }
      if (control.classList.contains("event-artist-filter") && previous !== option.dataset.value) {
        state.eventArtist = option.dataset.value; state.eventPage = 1; void loadEvents(true);
      }
      if (control.classList.contains("fan-pass-status-filter") && previous !== option.dataset.value) {
        state.fanPassStatus = option.dataset.value;
        state.fanPassPage = 1;
        layout();
      }
      if (control.classList.contains("fan-pass-artist-filter") && previous !== option.dataset.value) {
        state.fanPassArtist = option.dataset.value;
        state.fanPassPage = 1;
        layout();
      }
      if (control.dataset.issuanceFilter && previous !== option.dataset.value) {
        const key = control.dataset.issuanceFilter;
        if (key === "status") state.issuanceStatus = option.dataset.value;
        if (key === "type") state.issuanceType = option.dataset.value;
        if (key === "period") state.issuancePeriod = option.dataset.value;
        state.issuancePage = 1;
        layout();
      }
      if (control.classList.contains("user-role-filter") && previous !== option.dataset.value) {
        state.userRole = option.dataset.value;
        state.userPage = 1;
        void loadData();
      }
      if (control.classList.contains("audit-action-filter") && previous !== option.dataset.value) {
        state.auditAction = option.dataset.value;
        state.auditPage = 1;
        void loadData();
      }
      if (control.dataset.supportFilter && previous !== option.dataset.value) {
        if (control.dataset.supportFilter === "status") state.supportStatus = option.dataset.value;
        if (control.dataset.supportFilter === "category") state.supportCategory = option.dataset.value;
        state.supportPagination.page = 1;
        void loadSupportTickets(true);
      }
      if (control.dataset.statisticsFilter && previous !== option.dataset.value) {
        if (control.dataset.statisticsFilter === "organization") {
          state.statisticsOrganization = option.dataset.value;
          state.statisticsArtist = "all";
          state.statisticsPack = "all";
        } else if (control.dataset.statisticsFilter === "artist") {
          state.statisticsArtist = option.dataset.value;
          state.statisticsPack = "all";
        } else {
          state.statisticsPack = option.dataset.value;
        }
        void loadStatistics(true);
      }
      if (control.dataset.calendarStatus && previous !== option.dataset.value) {
        void updateContentCalendarStatus(control.dataset.calendarStatus, option.dataset.value);
      }
      if (control.dataset.calendarContentType && previous !== option.dataset.value) {
        state.contentCalendarDraftType = option.dataset.value;
        layout();
      }
      if (control.dataset.deliveryFilter && previous !== option.dataset.value) {
        if (control.dataset.deliveryFilter === "status") state.deliveryStatus = option.dataset.value;
        if (control.dataset.deliveryFilter === "channel") state.deliveryChannel = option.dataset.value;
        void loadDeliveryQueue(true);
      }
      if (control.dataset.previewFilter && previous !== option.dataset.value) {
        cardOperationsPreviewState[control.dataset.previewFilter] = option.dataset.value;
        renderCardOperationsPreview();
      }
      if (control.classList.contains("partner-mobile-select") && previous !== option.dataset.value) {
        void loadSelectedOrganization(option.dataset.value);
      }
      if (control.classList.contains("support-assignee-select") && previous !== option.dataset.value) {
        void updateSupportTicketAssignee(control.dataset.supportTicket, option.dataset.value);
      }
      if (control.classList.contains("support-status-select") && previous !== option.dataset.value) {
        void updateSupportTicketStatus(control.dataset.supportTicket, option.dataset.value);
      }
    });
  });
  document.addEventListener("click", (event) => {
    if (state.cardActionMenuId && !event.target.closest(".row-action-menu")) {
      state.cardActionMenuId = null;
      layout();
      return;
    }
    if (
      state.accountMenuOpen &&
      !event.target.closest(".account-menu") &&
      !event.target.closest("#account-menu-toggle")
    ) {
      state.accountMenuOpen = false;
      layout();
      return;
    }
    if (!event.target.closest(".admin-select")) {
      document.querySelectorAll(".admin-select.open").forEach((control) => control.classList.remove("open"));
    }
  }, { once: true });
  document.querySelector("#drop-form")?.addEventListener("submit", createDrop);
  document
    .querySelector("#batch-form")
    ?.addEventListener("submit", createBatch);
  document
    .querySelector("#artist-account-form")
    ?.addEventListener("submit", createArtistAccount);
  document
    .querySelectorAll("[data-artist-reset]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void resetArtistPassword(button.dataset.artistReset),
      ),
    );
  document.querySelector("#role-change-form")?.addEventListener("submit", saveRoleChange);
  document.querySelectorAll("[data-edit-user-role]").forEach((button) =>
    button.addEventListener("click", () => {
      const member = state.users.find((item) => item.id === button.dataset.editUserRole);
      if (member) openDrawer("role-change", { kind: "user", member });
    }),
  );
  document.querySelectorAll("[data-edit-member-role]").forEach((button) =>
    button.addEventListener("click", () => {
      const member = state.organizationMembers.find((item) => item.id === button.dataset.editMemberRole);
      if (member) openDrawer("role-change", { kind: "member", member });
    }),
  );
  document.querySelectorAll("[data-reset-member-password]").forEach((button) =>
    button.addEventListener("click", () => void resetOrganizationMemberPassword(button.dataset.resetMemberPassword)),
  );
  document.querySelector("#artist-profile-review-form")?.addEventListener("submit", saveArtistProfileReview);
  document.querySelectorAll("[data-edit-artist-profile]").forEach((button) =>
    button.addEventListener("click", () => {
      const profile = state.artistProfiles.find((item) => item.userId === button.dataset.editArtistProfile);
      if (profile) openDrawer("artist-profile-review", { profile });
    }),
  );
  applyClientTablePagination();
  document.querySelectorAll("[data-pagination-state]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state[button.dataset.paginationState] = Number(button.dataset.paginationPage) || 1;
      if (button.dataset.paginationState === "cardPackPage") {
        void loadCardPacks(true);
      } else if (button.dataset.paginationState === "cardPage") {
        void loadCards(true);
      } else {
        layout();
      }
    });
  });
  document.onkeydown = (event) => {
    if (event.key === "Escape" && state.accountMenuOpen) {
      closeAccountMenu();
      return;
    }
    if (event.key === "Escape" && state.drawer) closeDrawer();
  };
}
const cardOperationsPreviewState = {
  view: "packs",
  oddsMode: "card",
  odds: [1, 9, 30, 60],
  publicPreviewOpen: false,
  packDraftTitle: "",
  issueDraftName: "",
  issueDraftType: "limited",
  issueDraftQuantity: 100,
  selectedCardIndex: 0,
  selectedIssuanceMethod: "limited",
  selectedBatchIndex: 0,
  cardQuery: "",
  cardArtist: "all",
  cardRarity: "all",
  cardStatus: "all",
  packQuery: "",
  packArtist: "all",
  packStatus: "all",
  issueQuery: "",
  issueStatus: "all",
  issueType: "all",
  issuePeriod: "all",
  issuePage: 1,
  packVersionDrafts: 0,
  compositionCards: [
    { code: "N-01", member: "지유", rarity: "UR", included: true, odds: 1, src: "./assets/preview/card-aurora-portrait.jpg" },
    { code: "N-02", member: "수아", rarity: "SR", included: true, odds: 1.5, src: "./assets/preview/card-stardust-backstage.jpg" },
    { code: "N-03", member: "시연", rarity: "SR", included: true, odds: 1.5, src: "./assets/preview/card-minho-midnight.jpg" },
    { code: "N-04", member: "유현", rarity: "R", included: true, odds: 7.5, src: "./assets/preview/card-motion-stage.jpg" },
    { code: "N-05", member: "다미", rarity: "R", included: true, odds: 7.5, src: "./assets/preview/card-aurora-portrait.jpg" },
    { code: "N-06", member: "한동", rarity: "R", included: true, odds: 7.5, src: "./assets/preview/card-stardust-backstage.jpg" },
    { code: "N-07", member: "가현", rarity: "N", included: true, odds: 15, src: "./assets/preview/card-motion-stage.jpg" },
  ],
};

function calculatePreviewOddsTotal(values) {
  return values.reduce((total, value) => {
    const parsed = Number(value);
    return total + (Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  }, 0);
}

function cardOperationsPreviewNavigation() {
  const view = cardOperationsPreviewState.view;
  const submenu = [
    ["cards", "카드 관리", "playing_cards"],
    ["packs", "카드팩 관리", "deployed_code"],
    ["codes", "발급·인증번호", "qr_code_2"],
  ];
  return `<aside class="app-nav card-ops-preview-nav" aria-label="관리자 주요 메뉴">
    <div class="nav-brand"><span class="nav-brand-mark"><img src="./assets/fanfolio-app-icon-192.png" alt="Fanfolio 서비스 아이콘" /></span><span class="nav-brand-copy"><strong>FANFOLIO</strong><small>OPERATIONS</small></span>${icon("keyboard_double_arrow_left")}</div>
    <nav>
      <button class="nav-item" type="button">${icon("space_dashboard")}<span>개요</span></button>
      <button class="nav-item" type="button">${icon("domain")}<span>파트너</span></button>
      <button class="nav-item" type="button">${icon("recent_actors")}<span>아티스트</span></button>
      <div class="card-ops-nav-group">
        <button class="nav-item card-ops-parent active" type="button">${icon("style")}<span>카드</span>${icon("expand_less")}</button>
        <div class="card-ops-subnav">${submenu.map(([id, label, iconName]) => `<button type="button" data-card-ops-view="${id}" class="${view === id || (view === "composition" && id === "packs") || (view === "pack-create" && id === "packs") ? "active" : ""}">${icon(iconName)}<span>${label}</span></button>`).join("")}</div>
      </div>
      <button class="nav-item" type="button">${icon("campaign")}<span>이벤트</span></button>
      <button class="nav-item" type="button">${icon("workspace_premium")}<span>팬 성장</span></button>
      <button class="nav-item" type="button">${icon("group")}<span>서비스 사용자</span></button>
      <button class="nav-item" type="button">${icon("history")}<span>감사 로그</span></button>
      <button class="nav-item" type="button">${icon("help")}<span>운영 가이드</span></button>
    </nav>
    <div class="nav-account"><span class="account-avatar">운</span><div class="nav-account-copy"><strong>운영 관리자</strong><small>루트 관리자</small></div>${icon("logout")}</div>
  </aside>`;
}

function cardOperationsPreviewTopbar() {
  const titles = {
    cards: ["카드 관리", "CARD LIBRARY"],
    packs: ["카드팩 관리", "CARD PACKS"],
    codes: ["발급·인증번호", "ISSUANCE"],
    composition: ["카드 구성 편집", "CARD PACKS"],
    "pack-create": ["새 카드팩 만들기", "CARD PACKS"],
    "issue-create": ["새 발급 배치 만들기", "ISSUANCE"],
  };
  const [titleText, eyebrow] = titles[cardOperationsPreviewState.view];
  return `<header class="topbar card-ops-preview-topbar"><div class="topbar-title"><div><p class="eyebrow">${eyebrow}</p><h1 class="title">${titleText}</h1></div></div><div class="top-actions"><span class="scope-chip root-scope">${icon("shield_person")}<span>ROOT 운영 영역</span></span><button class="icon-button" type="button" aria-label="알림">${icon("notifications")}</button><span class="top-avatar">운</span></div></header>`;
}

function previewCardThumb(src, name) {
  return `<span class="preview-card-thumb"><img src="${src}" alt="${name}" /></span>`;
}

function cardManagementPreview() {
  const cards = [
    { name: "Nebula Ver.", member: "유나", artist: "DREAMSCAPE", rarity: "UR", src: "./assets/demo/dreamscape/yuna.png", status: "공개됨", method: "한정 특전", count: "14장", message: "이 순간이 오래도록 빛나길 바라요. 항상 고마워요, 우리 팬들! ✨" },
    { name: "Starlight Ver.", member: "하린", artist: "DREAMSCAPE", rarity: "SR", src: "./assets/demo/dreamscape/harin.png", status: "공개됨", method: "한정 특전", count: "14장", message: "같이 만든 별빛 같은 순간을 오래 기억할게요." },
    { name: "Midnight Ver.", member: "세나", artist: "DREAMSCAPE", rarity: "R", src: "./assets/demo/dreamscape/sena.png", status: "공개됨", method: "한정 특전", count: "14장", message: "언제나 곁에서 응원해 줘서 고마워요." },
    { name: "Aurora Ver.", member: "리나", artist: "DREAMSCAPE", rarity: "R", src: "./assets/demo/dreamscape/rina.png", status: "검수 완료", method: "카드팩 랜덤", count: "28장", message: "새로운 계절에도 우리 함께해요." },
    { name: "Eclipse Ver.", member: "유나", artist: "DREAMSCAPE", rarity: "N", src: "./assets/demo/dreamscape/yuna.png", status: "검수 완료", method: "카드팩 랜덤", count: "14장", message: "오늘도 좋은 하루 보내요." },
    { name: "Bloom Ver.", member: "하린", artist: "LUMINA", rarity: "R", src: "./assets/preview/card-stardust-backstage.jpg", status: "공개됨", method: "한정 특전", count: "20장", message: "우리의 순간이 활짝 피어나길." },
    { name: "Petal Ver.", member: "민재", artist: "LUMINA", rarity: "SR", src: "./assets/preview/card-motion-stage.jpg", status: "검수 완료", method: "카드팩 랜덤", count: "30장", message: "소중한 마음 잊지 않을게요." },
    { name: "Forest Ver.", member: "도윤", artist: "LUMINA", rarity: "N", src: "./assets/preview/card-minho-midnight.jpg", status: "검수 완료", method: "카드팩 랜덤", count: "20장", message: "늘 응원해 줘서 고마워요." },
  ];
  const query = cardOperationsPreviewState.cardQuery.trim().toLowerCase();
  const visibleCards = cards.map((card, index) => ({ card, index })).filter(({ card }) => {
    const haystack = `${card.name} ${card.member} ${card.artist}`.toLowerCase();
    return (!query || haystack.includes(query)) && (cardOperationsPreviewState.cardArtist === "all" || card.artist === cardOperationsPreviewState.cardArtist) && (cardOperationsPreviewState.cardRarity === "all" || card.rarity === cardOperationsPreviewState.cardRarity) && (cardOperationsPreviewState.cardStatus === "all" || card.status === cardOperationsPreviewState.cardStatus);
  });
  const selected = cards[cardOperationsPreviewState.selectedCardIndex] || cards[0];
  const selectedMethod = cardOperationsPreviewState.selectedIssuanceMethod || (selected.method === "한정 특전" ? "limited" : "random");
  return `<section class="card-ops-page card-library-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>카드 관리</strong></nav><h2>카드 관리</h2><p>아티스트 스튜디오에서 등록된 카드와 공개 상태를 관리합니다.</p></div><span class="source-info"><span class="source-info-label">등록 경로</span> 아티스트 스튜디오</span></div>
    <div class="card-ops-master-detail card-library-master-detail"><section class="panel card-ops-table-panel"><div class="card-ops-toolbar"><label class="search-field">${icon("search")}<input data-preview-search="cardQuery" value="${cardOperationsPreviewState.cardQuery}" placeholder="카드명 또는 아티스트 검색" /></label>${adminSelect({ id: "preview-card-artist", value: cardOperationsPreviewState.cardArtist, label: "아티스트 필터", className: "preview-filter-control", dataPreviewFilter: "cardArtist", options: [{ value: "all", label: "전체 아티스트" }, { value: "DREAMSCAPE", label: "DREAMSCAPE" }, { value: "LUMINA", label: "LUMINA" }] })}${adminSelect({ id: "preview-card-rarity", value: cardOperationsPreviewState.cardRarity, label: "희귀도 필터", className: "preview-filter-control", dataPreviewFilter: "cardRarity", options: [{ value: "all", label: "전체 희귀도" }, { value: "UR", label: "UR" }, { value: "SR", label: "SR" }, { value: "R", label: "R" }, { value: "N", label: "N" }] })}${adminSelect({ id: "preview-card-status", value: cardOperationsPreviewState.cardStatus, label: "상태 필터", className: "preview-filter-control", dataPreviewFilter: "cardStatus", options: [{ value: "all", label: "전체 상태" }, { value: "공개됨", label: "공개됨" }, { value: "검수 완료", label: "검수 완료" }] })}</div><div class="table-wrap"><table class="table"><thead><tr><th>카드</th><th>카드명</th><th>아티스트</th><th>시즌</th><th>희귀도</th><th>발행 방식</th><th>발행 수량</th><th>공개 상태</th></tr></thead><tbody>${visibleCards.map(({ card, index }) => `<tr tabindex="0" data-preview-card-index="${index}" class="${index === cardOperationsPreviewState.selectedCardIndex ? "selected-preview-row" : ""}"><td>${previewCardThumb(card.src, card.name)}</td><td><strong>${card.name}</strong></td><td>${card.artist}</td><td>정규 1집</td><td class="rarity-cell"><span class="preview-rarity rarity-${card.rarity.toLowerCase()}">${card.rarity}</span></td><td>${card.method}</td><td>${card.count}</td><td><span class="badge ${card.status === "공개됨" ? "success-badge" : "warning-badge"}">${card.status}</span></td></tr>`).join("")}</tbody></table></div><footer class="preview-table-footer"><strong>총 ${visibleCards.length}개</strong><span class="pagination-control">‹ <b>1</b> ›</span></footer></section>
    <aside class="panel card-detail-preview"><div class="detail-panel-heading"><div><small>카드 상세</small><h3>${selected.name} <span class="preview-rarity rarity-${selected.rarity.toLowerCase()}">${selected.rarity}</span></h3></div>${icon("close")}</div><div class="card-detail-images"><figure><figcaption>앞면</figcaption><img src="${selected.src}" alt="${selected.name} 앞면" /></figure><figure><figcaption>뒷면</figcaption><img src="./assets/preview/card-back-template.png" alt="${selected.name} 뒷면" /></figure></div><section class="card-detail-message"><strong>아티스트 메시지</strong><p>${selected.message}</p></section><dl><div><dt>아티스트</dt><dd>${selected.artist}</dd></div><div><dt>시즌</dt><dd>정규 1집</dd></div><div><dt>희귀도</dt><dd><span class="preview-rarity rarity-${selected.rarity.toLowerCase()}">${selected.rarity}</span></dd></div><div><dt>발행 수량</dt><dd>${selected.count}</dd></div><div><dt>공개 상태</dt><dd><span class="badge success-badge">공개됨</span></dd></div></dl><div class="issuance-method-preview"><strong>발행 방식</strong><button type="button" class="issuance-method-option ${selectedMethod === "limited" ? "selected" : ""}" data-issuance-method="limited" aria-pressed="${selectedMethod === "limited"}"><span>${icon("featured_seasonal_and_gifts")}</span><span><b>한정 특전</b><small>행사 등록 코드로 팬 컬렉션에 추가됩니다.</small></span><em>${selected.count}</em></button><button type="button" class="issuance-method-option ${selectedMethod === "random" ? "selected" : ""}" data-issuance-method="random" aria-pressed="${selectedMethod === "random"}"><span>${icon("inventory_2")}</span><span><b>카드팩 랜덤</b><small>카드팩 개봉 시 확률에 따라 발급됩니다.</small></span><em>${selectedMethod === "random" ? selected.count : "-"}</em></button></div></aside></div>
  </section>`;
}

function packManagementPreview() {
  const packs = [
    ["Nebula Ver.", "14장", "100%", "공개됨", "DREAMSCAPE"],
    ["Starlight Ver.", "12장", "100%", "공개됨", "DREAMSCAPE"],
    ["Midnight Ver.", "14장", "100%", "임시 저장", "DREAMSCAPE"],
  ];
  if (cardOperationsPreviewState.packDraftTitle) packs.unshift([cardOperationsPreviewState.packDraftTitle, "0장", "0%", "임시 저장", "DREAMSCAPE"]);
  const query = cardOperationsPreviewState.packQuery.trim().toLowerCase();
  const visiblePacks = packs.map((pack, index) => ({ pack, index })).filter(({ pack }) => (!query || `${pack[0]} ${pack[4]}`.toLowerCase().includes(query)) && (cardOperationsPreviewState.packArtist === "all" || pack[4] === cardOperationsPreviewState.packArtist) && (cardOperationsPreviewState.packStatus === "all" || pack[3] === cardOperationsPreviewState.packStatus));
  return `<section class="card-ops-page pack-management-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>카드팩 관리</strong></nav><h2>카드팩 관리</h2><p>카드팩 이미지와 정보, 버전별 카드 구성 및 공개 확률을 관리합니다.</p></div><button class="primary" type="button" data-create-pack-version>${icon("add")} 새 버전 만들기</button></div>
    <div class="card-ops-master-detail"><section class="panel card-ops-table-panel"><div class="card-ops-toolbar"><label class="search-field">${icon("search")}<input data-preview-search="packQuery" value="${cardOperationsPreviewState.packQuery}" placeholder="카드팩 또는 아티스트 검색" /></label>${adminSelect({ id: "preview-pack-artist", value: cardOperationsPreviewState.packArtist, label: "아티스트 필터", className: "preview-filter-control", dataPreviewFilter: "packArtist", options: [{ value: "all", label: "전체 아티스트" }, { value: "DREAMSCAPE", label: "DREAMSCAPE" }] })}${adminSelect({ id: "preview-pack-status", value: cardOperationsPreviewState.packStatus, label: "상태 필터", className: "preview-filter-control", dataPreviewFilter: "packStatus", options: [{ value: "all", label: "전체 상태" }, { value: "공개됨", label: "공개됨" }, { value: "임시 저장", label: "임시 저장" }] })}</div><div class="table-wrap"><table class="table"><thead><tr><th>카드팩</th><th>버전</th><th>포함 카드</th><th>확률 합계</th><th>공개 상태</th><th></th></tr></thead><tbody>${visiblePacks.map(({ pack, index }) => { const [name, count, total, status] = pack; const version = name === cardOperationsPreviewState.packDraftTitle ? "v1.0" : `v${3 - index}.0`; return `<tr class="${index === 0 ? "selected-preview-row" : ""}"><td><div class="pack-table-name"><img src="./assets/demo/dreamscape/card-pack.png" alt="${name} 카드팩 이미지" /><div><small>정규 1집 · DREAMSCAPE</small><strong>${name}</strong></div></div></td><td>${version}</td><td>${count}</td><td><strong>${total}</strong></td><td><span class="badge ${status === "공개됨" ? "success-badge" : "draft"}">${status}</span></td><td><button class="icon-button" type="button">${icon("chevron_right")}</button></td></tr>`; }).join("")}</tbody></table></div><footer class="preview-table-footer"><strong>총 ${visiblePacks.length}개</strong><span class="pagination-control">‹ <b>1</b> ›</span></footer></section>
    <aside class="panel pack-detail-preview"><div class="pack-detail-cover"><img src="./assets/preview/card-back-template.png" alt="Nebula Ver. 카드팩 이미지" /><div><small>정규 1집 · DREAMSCAPE</small><h3>Nebula Ver.</h3><span class="badge success-badge">공개됨</span></div></div><dl><div><dt>아티스트</dt><dd>DREAMSCAPE</dd></div><div><dt>포함 카드</dt><dd>14장</dd></div><div><dt>확률 합계</dt><dd>100%</dd></div><div><dt>공개 상태</dt><dd>공개됨</dd></div><div><dt>업데이트</dt><dd>2026. 8. 19. 13:20</dd></div></dl><div class="public-odds-mini"><strong>공개 확률 미리보기</strong><span><b>UR</b> 1%</span><span><b>SR</b> 9%</span><span><b>R</b> 30%</span><span><b>N</b> 60%</span></div><button class="primary" type="button" data-card-ops-view="composition">${icon("edit_square")} 카드 구성 편집</button><button class="secondary" type="button" data-open-odds-preview>${icon("public")} 확률표 공개</button></aside></div>
  </section>`;
}

function packCreationPreview() {
  return `<section class="card-ops-page pack-creation-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>카드팩 관리</strong> <span>›</span> <strong>새 카드팩 만들기</strong></nav><h2>새 카드팩 만들기</h2><p>카드팩의 기본 정보와 이미지를 등록한 뒤 카드 구성을 편집합니다.</p></div><span class="badge draft">초안</span></div>
    <div class="pack-creation-layout"><form class="panel pack-creation-form" data-pack-creation-form><div class="panel-heading"><div><p class="eyebrow">PACK INFORMATION</p><h3>카드팩 기본 정보</h3><p>먼저 팬에게 노출될 카드팩 정보를 등록하세요.</p></div></div><label class="field"><span>카드팩 이름</span><input name="packTitle" value="${cardOperationsPreviewState.packDraftTitle}" placeholder="예: Nebula Ver." required /></label><div class="form-grid"><label class="field"><span>아티스트</span>${adminSelect({ id: "preview-pack-artist", value: "DREAMSCAPE", label: "아티스트", name: "packArtist", required: true, className: "preview-form-control", options: [{ value: "DREAMSCAPE", label: "DREAMSCAPE" }, { value: "LUMINA", label: "LUMINA" }] })}</label><label class="field"><span>버전</span><input name="packVersion" type="text" value="v1.0" placeholder="예: v1.0" required /></label></div><label class="field"><span>카드팩 이미지</span><input name="packImage" type="file" accept="image/png,image/jpeg,image/webp" /><small class="field-help">PNG, JPG, WebP · 세로형 카드팩 이미지를 권장합니다.</small></label><label class="field"><span>설명 <em class="field-optional">선택</em></span><textarea name="packDescription" rows="4" placeholder="팬에게 표시할 카드팩 설명"></textarea></label><footer class="drawer-footer"><button class="secondary" data-card-ops-view="packs" type="button">취소</button><button class="primary" data-create-pack type="submit">카드팩 만들고 구성 편집</button></footer></form><aside class="panel pack-creation-guide"><p class="eyebrow">WORKFLOW</p><h3>카드팩 등록 순서</h3><ol><li class="active"><b>1</b><span><strong>기본 정보 등록</strong><small>이름·이미지·버전을 입력합니다.</small></span></li><li><b>2</b><span><strong>카드 구성 편집</strong><small>포함 카드와 개별 확률을 설정합니다.</small></span></li><li><b>3</b><span><strong>검수 요청 및 공개</strong><small>확률표를 확인하고 검수를 요청합니다.</small></span></li></ol><div class="pack-creation-note">공개된 버전은 확률을 수정할 수 없습니다. 변경이 필요하면 새 버전을 만들어야 합니다.</div></aside></div>
  </section>`;
}

function buildPreviewIssuanceCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const cell = String(value ?? "").replaceAll('"', '""');
    return /[",\r\n]/.test(cell) ? `"${cell}"` : cell;
  }).join(",")).join("\r\n");
}

function previewIssuanceExportRows() {
  return [
    ["배치명", "카드 유형", "수량", "발급", "등록 완료", "잔여 수량", "인증번호 상태", "상태", "생성일"],
    ["Nebula Ver. 특전 카드 배치 #001", "한정 특전", 100, 0, 0, 100, "생성 완료", "등록 완료", "2024.05.10 10:30"],
    ["Nebula Ver. 팩 배치 #001", "카드팩", 1000, 250, 60, 750, "발급 시 생성", "발급 중", "2024.05.10 11:20"],
    ["Bloom Ver. 특전 카드 배치 #001", "한정 특전", 50, 50, 50, 0, "생성 완료", "등록 완료", "2024.05.08 09:15"],
    ["Petal Ver. 팩 배치 #001", "카드팩", 1500, 1120, 820, 380, "발급 시 생성", "발급 중", "2024.05.07 14:40"],
    ["Starlight Ver. 특전 카드 배치 #001", "한정 특전", 30, 30, 27, 3, "생성 완료", "등록 완료", "2024.04.06 16:05"],
  ];
}

function downloadPreviewIssuanceCsv() {
  const csv = buildPreviewIssuanceCsv(previewIssuanceExportRows());
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fanfolio-issuance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function issuanceCodesPreview() {
  const batches = [
    { name: "Nebula Ver. 특전 카드 배치 #001", type: "한정 특전", quantity: 100, issued: 0, registered: 0, remaining: 100, code: "NB-2024-0510-001", status: "등록 완료", codeStatus: "생성 완료", created: "2024.05.10 10:30" },
    { name: "Nebula Ver. 팩 배치 #001", type: "카드팩", quantity: 1000, issued: 250, registered: 60, remaining: 750, code: "NB-2024-0510-002", status: "발급 중", codeStatus: "발급 시 생성", created: "2024.05.10 11:20" },
    { name: "Bloom Ver. 특전 카드 배치 #001", type: "한정 특전", quantity: 50, issued: 50, registered: 50, remaining: 0, code: "BL-2024-0508-001", status: "등록 완료", codeStatus: "생성 완료", created: "2024.05.08 09:15" },
    { name: "Petal Ver. 팩 배치 #001", type: "카드팩", quantity: 1500, issued: 1120, registered: 820, remaining: 380, code: "PT-2024-0507-001", status: "발급 중", codeStatus: "발급 시 생성", created: "2024.05.07 14:40" },
    { name: "Starlight Ver. 특전 카드 배치 #001", type: "한정 특전", quantity: 30, issued: 30, registered: 27, remaining: 3, code: "ST-2024-0506-001", status: "등록 완료", codeStatus: "생성 완료", created: "2024.04.06 16:05" },
    { name: "Aurora Ver. 특전 카드 배치 #001", type: "한정 특전", quantity: 80, issued: 42, registered: 40, remaining: 38, code: "AU-2024-0505-001", status: "발급 중", codeStatus: "생성 완료", created: "2024.05.05 11:10" },
    { name: "DREAMSCAPE QA 발급 배치 #001", type: "한정 특전", quantity: 20, issued: 20, registered: 20, remaining: 0, code: "QA-2024-0504-001", status: "등록 완료", codeStatus: "생성 완료", created: "2024.04.04 15:20" },
  ];
  const query = cardOperationsPreviewState.issueQuery.trim().toLowerCase();
  const visibleBatches = batches.map((batch, index) => ({ batch, index })).filter(({ batch }) => (!query || `${batch.name} ${batch.code}`.toLowerCase().includes(query)) && (cardOperationsPreviewState.issueStatus === "all" || batch.status === cardOperationsPreviewState.issueStatus) && (cardOperationsPreviewState.issueType === "all" || batch.type === cardOperationsPreviewState.issueType) && (cardOperationsPreviewState.issuePeriod === "all" || batch.created.startsWith(cardOperationsPreviewState.issuePeriod)));
  const pagedBatches = pagedItems(visibleBatches, cardOperationsPreviewState.issuePage, 5);
  const selected = batches[cardOperationsPreviewState.selectedBatchIndex] || batches[0];
  return `<section class="card-ops-page issue-code-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>발급·인증번호</strong></nav><h2>발급·인증번호</h2><p>카드 발급 배치와 인증 상태를 관리합니다.</p></div><button class="primary" type="button" data-create-issuance-batch>${icon("add")} 추가 발급 배치 만들기</button></div>
    <div class="card-ops-stats issue-stats"><article><span>${icon("calendar_month")}</span><small>예약 배치</small><strong>3개</strong></article><article><span>${icon("inventory_2")}</span><small>발급 중 배치</small><strong>5개</strong></article><article><span>${icon("check_circle")}</span><small>등록 완료 배치</small><strong>2개</strong></article><article><span>${icon("schedule")}</span><small>잔여 수량</small><strong>3,240장</strong></article></div>
    <div class="card-ops-master-detail issuance-master-detail"><section class="panel card-ops-table-panel"><div class="card-ops-toolbar"><label class="search-field">${icon("search")}<input data-preview-search="issueQuery" value="${cardOperationsPreviewState.issueQuery}" placeholder="배치명, 카드명 검색" /></label>${adminSelect({ id: "preview-issue-status", value: cardOperationsPreviewState.issueStatus, label: "상태 필터", className: "preview-filter-control", dataPreviewFilter: "issueStatus", options: [{ value: "all", label: "전체 상태" }, { value: "등록 완료", label: "등록 완료" }, { value: "발급 중", label: "발급 중" }] })}${adminSelect({ id: "preview-issue-type-filter", value: cardOperationsPreviewState.issueType, label: "카드 유형 필터", className: "preview-filter-control", dataPreviewFilter: "issueType", options: [{ value: "all", label: "전체 카드 유형" }, { value: "한정 특전", label: "한정 특전" }, { value: "카드팩", label: "카드팩" }] })}${adminSelect({ id: "preview-issue-period", value: cardOperationsPreviewState.issuePeriod, label: "기간 필터", className: "preview-filter-control", dataPreviewFilter: "issuePeriod", options: [{ value: "all", label: "전체 기간" }, { value: "2024.05", label: "2024년 5월" }, { value: "2024.04", label: "2024년 4월" }] })}</div><div class="table-wrap"><table class="table"><thead><tr><th>배치명</th><th>카드 유형</th><th>수량</th><th>발급</th><th>등록 완료</th><th>잔여 수량</th><th>인증번호 상태</th><th>상태</th><th>생성일</th></tr></thead><tbody>${pagedBatches.items.map(({ batch, index }) => `<tr tabindex="0" data-preview-batch-index="${index}" class="${index === cardOperationsPreviewState.selectedBatchIndex ? "selected-preview-row" : ""}"><td><div class="code-batch-name">${previewCardThumb(index % 2 ? "./assets/preview/card-back-template.png" : "./assets/preview/card-aurora-portrait.jpg", batch.name)}<div><strong>${batch.name}</strong><small>${batch.type}</small></div></div></td><td>${batch.type}</td><td>${batch.quantity}장</td><td>${batch.issued}장</td><td>${batch.registered}장</td><td>${batch.remaining}장</td><td><span class="badge ${batch.codeStatus === "생성 완료" ? "success-badge" : "warning-badge"}">${batch.codeStatus}</span></td><td><span class="badge ${batch.status === "등록 완료" ? "success-badge" : "warning-badge"}">${batch.status}</span></td><td>${batch.created}</td></tr>`).join("")}</tbody></table></div>${previewTablePagination("issuePage", pagedBatches.page, visibleBatches.length, 5)}</section>
    <aside class="panel issuance-detail-preview"><div class="detail-panel-heading"><div><small>배치 상세</small><h3>${selected.name}</h3><p><span class="badge draft">${selected.type}</span> <span class="badge success-badge">${selected.status}</span></p></div>${icon("close")}</div><section><h4>기본 정보</h4><dl><div><dt>배치 번호</dt><dd>${selected.code}</dd></div><div><dt>카드 유형</dt><dd>${selected.type}</dd></div><div><dt>수량</dt><dd>${selected.quantity}장</dd></div><div><dt>생성일</dt><dd>${selected.created}</dd></div><div><dt>생성자</dt><dd>운영 관리자</dd></div><div><dt>설명</dt><dd>${selected.name}</dd></div></dl></section><section><h4>발급 현황</h4><dl><div><dt>발급</dt><dd>${selected.issued}장</dd></div><div><dt>등록 완료</dt><dd>${selected.registered}장</dd></div><div><dt>잔여 수량</dt><dd>${selected.remaining}장</dd></div></dl></section><section><h4>고유 시리얼</h4><dl><div><dt>시작 시리얼</dt><dd>NBDL-********-000001</dd></div><div><dt>종료 시리얼</dt><dd>NBDL-********-${String(selected.quantity).padStart(6, "0")}</dd></div><div><dt>총 개수</dt><dd>${selected.quantity}개</dd></div></dl></section><section><h4>인증번호 상태</h4><dl><div><dt>생성 방식</dt><dd>${selected.codeStatus === "생성 완료" ? "사전 생성" : "발급 시 생성"}</dd></div><div><dt>상태</dt><dd><span class="badge success-badge">${selected.codeStatus}</span></dd></div></dl></section><div class="detail-actions"><button class="secondary" data-export-issuance-csv type="button">${icon("download")} CSV 내보내기</button></div></aside></div>
  </section>`;
}

function issuanceCreationPreview() {
  return `<section class="card-ops-page issuance-creation-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> <strong>발급·인증번호</strong> <span>›</span> <strong>새 발급 배치 만들기</strong></nav><h2>새 발급 배치 만들기</h2><p>발급 대상과 수량, 인증번호 생성 방식을 먼저 등록합니다.</p></div><span class="badge draft">초안</span></div>
    <div class="issuance-creation-layout"><form class="panel issuance-creation-form" data-issuance-creation-form><div class="panel-heading"><div><p class="eyebrow">ISSUANCE BATCH</p><h3>배치 기본 정보</h3><p>등록 후 발급 현황과 인증번호 상태를 추적할 수 있습니다.</p></div></div><label class="field"><span>배치명</span><input name="issueName" value="${cardOperationsPreviewState.issueDraftName}" placeholder="예: Nebula Ver. 특전 카드 배치 #002" required /></label><div class="form-grid"><label class="field"><span>발급 유형</span>${adminSelect({ id: "preview-issue-type", value: cardOperationsPreviewState.issueDraftType, label: "발급 유형", name: "issueType", required: true, className: "preview-form-control", options: [{ value: "limited", label: "한정 특전 카드" }, { value: "pack", label: "카드팩" }] })}</label><label class="field"><span>발급 수량</span><input name="issueQuantity" type="number" min="1" step="1" value="${cardOperationsPreviewState.issueDraftQuantity}" required /></label></div><label class="field"><span>발급 대상</span>${adminSelect({ id: "preview-issue-target", value: "nebula", label: "발급 대상", name: "issueTarget", options: [{ value: "nebula", label: "Nebula Ver. · DREAMSCAPE" }, { value: "starlight", label: "Starlight Ver. · DREAMSCAPE" }, { value: "bloom", label: "Bloom Ver. · LUMINA" }] })}</label><label class="field"><span>인증번호 생성 방식</span>${adminSelect({ id: "preview-issue-code-mode", value: "pre-generated", label: "인증번호 생성 방식", name: "issueCodeMode", options: [{ value: "pre-generated", label: "발급 전 일괄 생성 · 한정 특전용" }, { value: "on-issue", label: "발급 시 생성 · 카드팩용" }] })}<small class="field-help">한정 특전은 생성 수량만큼 고유 인증번호를 미리 만들고, 카드팩은 실제 카드 발급 시 번호를 생성합니다.</small></label><label class="field"><span>설명 <em class="field-optional">선택</em></span><textarea name="issueDescription" rows="4" placeholder="운영 메모 또는 발급 조건"></textarea></label><footer class="drawer-footer"><button class="secondary" data-card-ops-view="codes" type="button">취소</button><button class="primary" data-create-issuance type="submit">배치 만들기</button></footer></form><aside class="panel issuance-creation-guide"><p class="eyebrow">WORKFLOW</p><h3>발급 배치 등록 순서</h3><ol><li class="active"><b>1</b><span><strong>배치 기본 정보</strong><small>유형·대상·수량을 입력합니다.</small></span></li><li><b>2</b><span><strong>인증번호 준비</strong><small>유형에 맞는 생성 방식으로 준비합니다.</small></span></li><li><b>3</b><span><strong>발급 현황 관리</strong><small>발급·등록 완료·잔여 수량을 추적합니다.</small></span></li></ol><div class="issuance-creation-note">고유 인증번호는 중복되지 않으며, 한정 특전은 사전 생성하고 카드팩은 발급 시 생성합니다.</div></aside></div>
  </section>`;
}

function packCompositionRows() {
  return cardOperationsPreviewState.compositionCards.map((card, index) => `<tr draggable="true" data-composition-index="${index}" class="${card.included ? "" : "excluded-card"}"><td class="drag-cell" title="드래그해서 순서 변경" aria-label="드래그해서 카드 순서 변경"></td><td>${previewCardThumb(card.src, `${card.code} ${card.member}`)}</td><td><strong>${card.code}</strong></td><td>${card.member}</td><td class="rarity-cell"><span class="preview-rarity rarity-${card.rarity.toLowerCase()}">${card.rarity}</span></td><td><button class="composition-switch ${card.included ? "active" : ""}" type="button" data-toggle-composition-card="${index}" aria-pressed="${card.included}"><span></span></button></td><td><label class="odds-input"><input data-preview-card-odds="${index}" type="number" min="0" step="0.1" value="${card.odds}" ${cardOperationsPreviewState.oddsMode === "card" ? "" : "disabled"} /><span>%</span></label></td><td><button class="remove-card-button" type="button" data-remove-composition-card="${index}">삭제</button></td></tr>`).join("");
}

function publicOddsPreview() {
  if (!cardOperationsPreviewState.publicPreviewOpen) return "";
  const labels = [["UR", "N-01"], ["SR", "N-03"], ["R", "N-06"], ["N", "N-10"]];
  const total = calculatePreviewOddsTotal(cardOperationsPreviewState.odds);
  return `<aside class="public-odds-preview" role="dialog" aria-label="팬앱 공개 확률표"><div class="public-odds-heading"><div><p class="eyebrow">FAN APP PREVIEW</p><h3>팬앱 공개 확률표</h3></div><button class="icon-button" data-close-odds-preview type="button" aria-label="닫기">${icon("close")}</button></div><div class="public-pack-summary"><img src="./assets/preview/card-back-template.png" alt="Nebula Ver. 카드팩" /><div><strong>Nebula Ver.</strong><span>정규 1집 · DREAMSCAPE</span></div></div><p>카드팩에서 획득할 수 있는 카드와 개별 확률입니다. 모든 확률은 소수점 단위까지 공개됩니다.</p><div class="public-odds-list">${labels.map(([rarity, code], index) => `<span><b>${rarity} · ${code}</b><em>${Number(cardOperationsPreviewState.odds[index] || 0).toFixed(1)}%</em></span>`).join("")}</div><small>확률 합계 ${total.toFixed(1)}% · 2026. 8. 19. 기준</small></aside>`;
}

function packCompositionPreview() {
  const total = calculatePreviewOddsTotal(cardOperationsPreviewState.odds);
  const valid = Math.abs(total - 100) < 0.001;
  const packTitle = cardOperationsPreviewState.packDraftTitle || "Nebula Ver.";
  return `<section class="card-ops-page pack-composition-preview">
    <div class="card-ops-heading"><div><nav>카드 <span>›</span> 카드팩 관리 <span>›</span> <strong>카드 구성 편집</strong></nav><h2>카드 구성 편집</h2><p>카드팩에 포함될 카드와 확률을 설정합니다.</p></div><span class="badge draft composition-status">편집 중</span></div>
    <div class="pack-composition-workbench"><section class="panel composition-main"><div class="composition-pack-summary"><img src="./assets/preview/card-aurora-portrait.jpg" alt="${packTitle} 카드팩 이미지" /><div><small>정규 1집 · DREAMSCAPE</small><h3>${packTitle}</h3><p>총 14장 · 공개 상태: 공개됨</p></div><button class="secondary" type="button" data-card-ops-view="packs">${icon("arrow_back")} 목록으로</button></div><div class="composition-controls"><button class="primary" type="button">${icon("add")} 카드 추가</button><div class="odds-mode-control"><small>확률 입력 방식</small><div class="segmented-control" role="tablist" aria-label="확률 입력 방식"><button title="등급별 확률로 입력" class="${cardOperationsPreviewState.oddsMode === "rarity" ? "active" : ""}" type="button" data-odds-mode="rarity">등급별 확률</button><button title="카드별 확률로 입력" class="${cardOperationsPreviewState.oddsMode === "card" ? "active" : ""}" type="button" data-odds-mode="card">카드별 확률</button></div></div><p>카드팩에 표시할 확률 기준을 선택합니다.</p></div><div class="table-wrap"><table class="table composition-table"><thead><tr><th></th><th>카드</th><th>카드 번호</th><th>멤버</th><th>등급</th><th>포함 여부</th><th>카드별 확률(%)</th><th>작업</th></tr></thead><tbody>${packCompositionRows()}</tbody></table></div><footer class="composition-table-footer"><strong>총 ${cardOperationsPreviewState.compositionCards.length}장</strong><span class="composition-pagination">‹ <b>1</b> / 1 ›</span><button class="secondary" type="button">20개씩 보기 ${icon("expand_more")}</button></footer></section>
    <aside class="panel odds-editor-panel"><div class="odds-validation"><span>${icon(valid ? "check_circle" : "error")}</span><div><h3>확률 유효성 검증</h3><p>${valid ? "모든 항목이 유효합니다." : "확률 합계를 확인해 주세요."}</p></div></div><div class="odds-policy-card"><strong>${icon("verified_user")} 확률표는 항상 공개됩니다</strong><p>공개 후 확률은 잠깁니다. 이후 수정이 필요하면 새 버전을 만들어야 합니다.</p><span class="badge success-badge">공개 후 확률은 잠깁니다</span></div><div><h3>현재 확률 합계 <em>${total.toFixed(0)}%</em></h3><div class="public-odds-mini odds-breakdown">${[["UR", 0, 1], ["SR", 1, 2], ["R", 2, 4], ["N", 3, 7]].map(([rarity, index, count]) => `<span><b class="preview-rarity rarity-${rarity.toLowerCase()}">${rarity}</b><em>${cardOperationsPreviewState.odds[index]}%</em><small>${count}장</small></span>`).join("")}</div></div><div class="odds-total ${valid ? "valid" : "invalid"}"><span>확률 합계</span><strong data-odds-total>${total.toFixed(1)}%</strong><small>${valid ? `${icon("check_circle")} 공개 가능한 확률 구성입니다.` : `${icon("error")} 합계가 100%가 되도록 조정하세요.`}</small></div><button class="secondary full-width" type="button" data-open-odds-preview>${icon("public")} 공개 확률표 미리보기</button><button class="primary full-width" type="button" ${valid ? "" : "disabled"}>저장 후 검수 요청</button><p class="odds-policy-note">검수 승인 후 서비스에 공개됩니다.</p></aside></div>${publicOddsPreview()}
  </section>`;
}

function cardOperationsPreviewView() {
  const body = {
    cards: cardManagementPreview,
    packs: packManagementPreview,
    codes: issuanceCodesPreview,
    composition: packCompositionPreview,
    "pack-create": packCreationPreview,
    "issue-create": issuanceCreationPreview,
  }[cardOperationsPreviewState.view]();
  return `<div class="admin-shell card-ops-preview">${cardOperationsPreviewNavigation()}<main class="workspace">${cardOperationsPreviewTopbar()}<section class="page-content">${body}</section></main></div>${cardOperationsPreviewState.view !== "composition" ? publicOddsPreview() : ""}<div class="toast" id="card-ops-preview-toast" role="status" aria-live="polite"></div>`;
}

function renderCardOperationsPreview() {
  app.innerHTML = cardOperationsPreviewView();
  bindPreviewAdminSelects();
  document.querySelectorAll("[data-card-ops-view]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.view = button.dataset.cardOpsView;
    cardOperationsPreviewState.publicPreviewOpen = false;
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-odds-mode]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.oddsMode = button.dataset.oddsMode;
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-preview-card-index]").forEach((row) => row.addEventListener("click", () => {
    cardOperationsPreviewState.selectedCardIndex = Number(row.dataset.previewCardIndex);
    const cardMethod = row.querySelector("td:nth-child(6)")?.textContent?.trim();
    cardOperationsPreviewState.selectedIssuanceMethod = cardMethod === "한정 특전" ? "limited" : "random";
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-issuance-method]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.selectedIssuanceMethod = button.dataset.issuanceMethod;
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-create-pack-version]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.view = "pack-create";
    cardOperationsPreviewState.publicPreviewOpen = false;
    cardOperationsPreviewState.packDraftTitle = "";
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-create-issuance-batch]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.view = "issue-create";
    cardOperationsPreviewState.publicPreviewOpen = false;
    cardOperationsPreviewState.issueDraftName = "";
    renderCardOperationsPreview();
  }));
  document.querySelector("[data-pack-creation-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = event.currentTarget.elements.packTitle?.value.trim() || "새 카드팩";
    cardOperationsPreviewState.packDraftTitle = title;
    cardOperationsPreviewState.packVersionDrafts += 1;
    cardOperationsPreviewState.view = "composition";
    renderCardOperationsPreview();
  });
  document.querySelector("[data-issuance-creation-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    cardOperationsPreviewState.issueDraftName = form.elements.issueName?.value.trim() || "새 발급 배치";
    cardOperationsPreviewState.issueDraftType = form.elements.issueType?.value || "limited";
    cardOperationsPreviewState.issueDraftQuantity = Math.max(1, Number(form.elements.issueQuantity?.value || 1));
    cardOperationsPreviewState.view = "codes";
    renderCardOperationsPreview();
  });
  document.querySelectorAll("[data-preview-batch-index]").forEach((row) => row.addEventListener("click", () => {
    cardOperationsPreviewState.selectedBatchIndex = Number(row.dataset.previewBatchIndex);
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-preview-issue-page]").forEach((button) => button.addEventListener("click", () => {
    if (button.disabled) return;
    cardOperationsPreviewState.issuePage = Number(button.dataset.previewIssuePage) || 1;
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-export-issuance-csv]").forEach((button) => button.addEventListener("click", downloadPreviewIssuanceCsv));
  document.querySelectorAll("[data-toggle-composition-card]").forEach((button) => button.addEventListener("click", () => {
    const card = cardOperationsPreviewState.compositionCards[Number(button.dataset.toggleCompositionCard)];
    if (card) card.included = !card.included;
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-remove-composition-card]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.compositionCards.splice(Number(button.dataset.removeCompositionCard), 1);
    renderCardOperationsPreview();
  }));
  document.querySelectorAll("[data-preview-card-odds]").forEach((input) => input.addEventListener("input", () => {
    const card = cardOperationsPreviewState.compositionCards[Number(input.dataset.previewCardOdds)];
    if (card) card.odds = Number(input.value || 0);
  }));
  document.querySelectorAll("[data-preview-search]").forEach((input) => input.addEventListener("input", () => {
    cardOperationsPreviewState[input.dataset.previewSearch] = input.value;
    if (input.dataset.previewSearch === "issueQuery") cardOperationsPreviewState.issuePage = 1;
    renderCardOperationsPreview();
    const next = document.querySelector(`[data-preview-search="${input.dataset.previewSearch}"]`);
    next?.focus();
    next?.setSelectionRange(next.value.length, next.value.length);
  }));
  document.querySelectorAll("[data-composition-index]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      row.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", row.dataset.compositionIndex);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (event) => { event.preventDefault(); row.classList.add("drag-over"); });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer?.getData("text/plain"));
      const to = Number(row.dataset.compositionIndex);
      if (Number.isInteger(from) && Number.isInteger(to) && from !== to) {
        const [moved] = cardOperationsPreviewState.compositionCards.splice(from, 1);
        cardOperationsPreviewState.compositionCards.splice(to, 0, moved);
        renderCardOperationsPreview();
      }
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging", "drag-over"));
  });
  document.querySelectorAll("[data-preview-odds-index]").forEach((input) => input.addEventListener("input", () => {
    cardOperationsPreviewState.odds[Number(input.dataset.previewOddsIndex)] = input.value;
    const total = calculatePreviewOddsTotal(cardOperationsPreviewState.odds);
    const totalBox = document.querySelector(".odds-total");
    const totalValue = document.querySelector("[data-odds-total]");
    const valid = Math.abs(total - 100) < 0.001;
    if (totalValue) totalValue.textContent = `${total.toFixed(1)}%`;
    totalBox?.classList.toggle("valid", valid);
    totalBox?.classList.toggle("invalid", !valid);
  }));
  document.querySelectorAll("[data-open-odds-preview]").forEach((button) => button.addEventListener("click", () => {
    cardOperationsPreviewState.publicPreviewOpen = true;
    renderCardOperationsPreview();
  }));
  document.querySelector("[data-close-odds-preview]")?.addEventListener("click", () => {
    cardOperationsPreviewState.publicPreviewOpen = false;
    renderCardOperationsPreview();
  });
}

function bindPreviewAdminSelects() {
  document.querySelectorAll(".admin-select-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const control = trigger.closest(".admin-select");
      const open = control.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(open));
      document.querySelectorAll(".admin-select.open").forEach((other) => {
        if (other !== control) {
          other.classList.remove("open");
          other.querySelector(".admin-select-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
    });
    trigger.addEventListener("keydown", (event) => {
      const control = trigger.closest(".admin-select");
      const options = [...control.querySelectorAll(".admin-select-option")];
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!control.classList.contains("open")) trigger.click();
        options.find((option) => option.classList.contains("selected"))?.focus();
      } else if (event.key === "Escape") {
        control.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  });
  document.querySelectorAll(".admin-select-option").forEach((option) => option.addEventListener("click", () => {
    const control = option.closest(".admin-select");
    control.dataset.value = option.dataset.value;
    control.querySelector(".admin-select-label").textContent = option.dataset.label;
    const hidden = control.querySelector(".admin-select-value");
    if (hidden) hidden.value = option.dataset.value;
    control.querySelectorAll(".admin-select-option").forEach((item) => {
      const selected = item === option;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    control.classList.remove("open");
    control.querySelector(".admin-select-trigger").setAttribute("aria-expanded", "false");
    if (control.dataset.previewFilter) {
      cardOperationsPreviewState[control.dataset.previewFilter] = option.dataset.value;
      if (control.dataset.previewFilter.startsWith("issue")) cardOperationsPreviewState.issuePage = 1;
      renderCardOperationsPreview();
    }
  }));
}

const statisticsPreviewState = {
  scope: "root",
  period: "30",
  partner: "all",
  artist: "all",
  pack: "all",
  compare: true,
};

const statisticsPeriodScale = { 7: 0.31, 30: 1, 90: 2.74 };

function statisticsChartPoints(values, width = 680, height = 220) {
  if (!values.length) return "";
  if (values.length === 1) return `0,${height / 2}`;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((value - minimum) / range) * height;
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
  }).join(" ");
}

function statisticsFormatNumber(value) {
  return Math.round(value).toLocaleString("ko-KR");
}

function statisticsMetricCard({ iconName, label, value, unit = "", delta, tone = "violet", description }) {
  const comparison = delta ? `<em class="${delta.startsWith("-") ? "negative" : "positive"}">${delta}</em>${description}` : "선택 기간";
  return `<article class="statistics-kpi-card"><div class="statistics-kpi-icon ${tone}">${icon(iconName)}</div><div class="statistics-kpi-copy"><span>${label}</span><strong>${value}<small>${unit}</small></strong><p>${comparison}</p></div></article>`;
}

function statisticsTrendChart(primary, secondary, labels, showComparison = statisticsPreviewState.compare) {
  const width = 680;
  const height = 220;
  const primaryPoints = statisticsChartPoints(primary, width, height);
  const secondaryPoints = statisticsChartPoints(secondary, width, height);
  const areaPoints = primaryPoints ? `0,${height} ${primaryPoints} ${width},${height}` : "";
  return `<div class="statistics-trend-chart"><div class="statistics-chart-legend"><span class="primary">현재 기간</span>${showComparison ? '<span class="secondary">이전 기간</span>' : ""}</div><svg viewBox="0 0 ${width} ${height + 28}" role="img" aria-label="기간별 팬 성장과 카드팩 개봉 추이"><defs><linearGradient id="statisticsTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6657ed" stop-opacity=".24"/><stop offset="100%" stop-color="#6657ed" stop-opacity="0"/></linearGradient></defs><g class="statistics-chart-grid"><line x1="0" y1="0" x2="${width}" y2="0"/><line x1="0" y1="73" x2="${width}" y2="73"/><line x1="0" y1="146" x2="${width}" y2="146"/><line x1="0" y1="220" x2="${width}" y2="220"/></g><polygon class="statistics-chart-area" points="${areaPoints}"/><polyline class="statistics-chart-line primary" points="${primaryPoints}"/>${showComparison ? `<polyline class="statistics-chart-line secondary" points="${secondaryPoints}"/>` : ""}${primaryPoints.split(" ").map((point) => { const [x, y] = point.split(","); return `<circle class="statistics-chart-dot" cx="${x}" cy="${y}" r="4"/>`; }).join("")}<g class="statistics-chart-labels">${labels.map((label, index) => `<text x="${(index / Math.max(1, labels.length - 1)) * width}" y="246" text-anchor="${index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}">${label}</text>`).join("")}</g></svg></div>`;
}

function statisticsOddsComparison(rows) {
  return `<div class="statistics-odds-grid"><div class="statistics-odds-head"><span>등급</span><span>공개 확률</span><span>실제 발급</span><span>편차</span></div>${rows.map(({ rarity, published, actual }) => { const variance = actual - published; const safe = Math.abs(variance) < 0.5; return `<div class="statistics-odds-row"><span><b class="statistics-rarity rarity-${rarity.toLowerCase()}">${rarity}</b></span><strong>${published.toFixed(2)}%</strong><strong>${actual.toFixed(2)}%</strong><em class="${safe ? "safe" : "watch"}">${variance >= 0 ? "+" : ""}${variance.toFixed(2)}%p</em></div>`; }).join("")}</div>`;
}

function statisticsPerformanceTable(rows, partner = false) {
  return `<div class="statistics-table-wrap"><table class="statistics-table"><thead><tr><th>카드팩</th><th>아티스트</th><th>개봉</th><th>${partner ? "컬렉션 등록" : "등록 전환"}</th><th>전기 대비</th></tr></thead><tbody>${rows.map((row) => `<tr><td><span class="statistics-pack-cell"><i style="--pack-color:${row.color}"></i><span><strong>${row.pack}</strong><small>${row.season}</small></span></span></td><td>${row.artist}</td><td><strong>${statisticsFormatNumber(row.opens)}</strong></td><td>${row.conversion}%</td><td><em class="statistics-table-delta ${row.delta < 0 ? "negative" : "positive"}">${row.delta > 0 ? "+" : ""}${row.delta}%</em></td></tr>`).join("")}</tbody></table></div>`;
}

function statisticsDelta(value, suffix = "%") {
  if (value === null || value === undefined) return "";
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}${suffix}`;
}

function statisticsLifecycleKpis(kpis) {
  const combinations = kpis.combinations || { current: 0, change: null };
  const trades = kpis.trades || { current: 0, change: null };
  return `${statisticsMetricCard({ iconName: "merge_type", label: "카드 조합", value: statisticsFormatNumber(combinations.current), unit: "회", delta: statisticsDelta(combinations.change), tone: "blue", description: " 중복 카드 소모" })}${statisticsMetricCard({ iconName: "swap_horiz", label: "거래 제안", value: statisticsFormatNumber(trades.current), unit: "건", delta: statisticsDelta(trades.change), tone: "violet", description: " 팬 간 거래" })}`;
}

function statisticsOptions(items, selected, allLabel) {
  return `<option value="all">${allLabel}</option>${items.map((item) => `<option value="${escapeHtml(item.id)}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}`;
}

function statisticsFilterOptions(items, selected, allLabel) {
  return [{ value: "all", label: allLabel }, ...items.map((item) => ({ value: item.id, label: item.name }))];
}

function productionStatisticsFilterMarkup(data, rootScope) {
  return `${rootScope ? adminSelect({ id: "statistics-organization", value: state.statisticsOrganization, label: "파트너 필터", className: "statistics-filter-control", options: statisticsFilterOptions(data.filters.organizations, state.statisticsOrganization, "전체 파트너"), dataStatisticsFilter: "organization" }) : ""}${adminSelect({ id: "statistics-artist", value: state.statisticsArtist, label: "아티스트 필터", className: "statistics-filter-control", options: statisticsFilterOptions(data.filters.artists, state.statisticsArtist, "전체 아티스트"), dataStatisticsFilter: "artist" })}${adminSelect({ id: "statistics-pack", value: state.statisticsPack, label: "카드팩 필터", className: "statistics-filter-control", options: statisticsFilterOptions(data.filters.packs, state.statisticsPack, "전체 카드팩"), dataStatisticsFilter: "pack" })}`;
}

function statisticsSampleTrend(rows, maximumPoints = 8) {
  if (rows.length <= maximumPoints) return rows;
  const step = Math.ceil((rows.length - 1) / (maximumPoints - 1));
  const sampled = rows.filter((_, index) => index % step === 0);
  const last = rows.at(-1);
  if (sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

function statisticsView() {
  if (!can("statistics:read")) return dashboardView();
  const data = state.statistics;
  if (!data) {
    return `<div class="page-heading"><div><p class="eyebrow">INSIGHTS</p><h2>통계</h2><p>운영 통계를 불러오는 중입니다.</p></div></div><section class="panel empty">통계 데이터를 준비하고 있습니다.</section>`;
  }
  const rootScope = data.scope.kind === "root";
  const comparisonEnabled = Boolean(data.period.compare);
  const kpis = Object.fromEntries(
    Object.entries(data.kpis).map(([key, metric]) => [key, { ...metric, change: comparisonEnabled ? metric.change : null }]),
  );
  kpis.combinations ||= { current: 0, previous: 0, change: null };
  kpis.trades ||= { current: 0, previous: 0, change: null };
  const packRows = data.packPerformance.map((row, index) => ({
    pack: row.name,
    season: row.seasonName || "시즌 미지정",
    artist: data.filters.artists.find((artist) => artist.id === row.artistId)?.name || row.artistId,
    opens: row.openings,
    conversion: Number(row.registrationRate || 0),
    delta: Number(row.change || 0),
    color: ["#6657ed", "#5ca9ef", "#e56bb0", "#172a66"][index % 4],
  }));
  const sampledTrend = statisticsSampleTrend(data.trend);
  const trendValues = sampledTrend.map((row) => Number(row.activeFans || 0));
  const health = data.operationHealth;
  return `<div class="statistics-production"><div class="statistics-hero"><div><nav>통계 <span>›</span> <strong>${rootScope ? "서비스 전체" : "파트너 성과"}</strong></nav><h2>${rootScope ? "서비스 운영 통계" : "파트너 성과 통계"}</h2><p>${rootScope ? "팬 활동부터 카드 발급 무결성까지 실제 서비스 데이터를 확인합니다." : "내 조직과 배정 아티스트 범위의 실제 성과를 확인합니다."}</p></div><span class="scope-chip ${rootScope ? "root-scope" : "company-scope"}">${icon(rootScope ? "shield_person" : "domain")}<span>${rootScope ? "ROOT 전체 범위" : "파트너 전용 범위"}</span></span></div><div class="statistics-filter-bar"><div class="statistics-periods" role="group" aria-label="조회 기간">${["7", "30", "90"].map((period) => `<button type="button" data-production-statistics-period="${period}" class="${state.statisticsPeriod === period ? "active" : ""}">${period}일</button>`).join("")}</div><div class="statistics-selects">${productionStatisticsFilterMarkup(data, rootScope)}<label class="statistics-compare-toggle"><input type="checkbox" data-production-statistics-compare ${state.statisticsCompare ? "checked" : ""}/><span></span>전기 비교</label></div></div><section class="statistics-kpi-grid">${statisticsMetricCard({ iconName: "groups", label: rootScope ? "전체 활성 팬" : "파트너 활성 팬", value: statisticsFormatNumber(kpis.activeFans.current), unit: "명", delta: statisticsDelta(kpis.activeFans.change), tone: "violet", description: " 이전 기간 대비" })}${statisticsMetricCard({ iconName: "playing_cards", label: "카드 발급", value: statisticsFormatNumber(kpis.issuedCards.current), unit: "장", delta: statisticsDelta(kpis.issuedCards.change), tone: "blue", description: " 현재 범위" })}${statisticsMetricCard({ iconName: "inventory_2", label: "카드팩 개봉", value: statisticsFormatNumber(kpis.packOpenings.current), unit: "회", delta: statisticsDelta(kpis.packOpenings.change), tone: "mint", description: " 공개 카드팩 기준" })}${statisticsMetricCard({ iconName: "verified", label: "등록 완료율", value: Number(kpis.registrationRate.current).toFixed(1), unit: "%", delta: statisticsDelta(kpis.registrationRate.change, "%p"), tone: "amber", description: " 인식 대비 등록" })}</section><section class="statistics-dashboard-grid"><article class="statistics-panel statistics-trend-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ACTIVITY TREND</p><h3>일별 활성 팬 추이</h3></div><span class="statistics-panel-caption">${data.period.days}일 실제 기록</span></div>${statisticsTrendChart(trendValues, [], sampledTrend.map((row) => row.date.slice(5)), false)}</article><article class="statistics-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">REGISTRATION FUNNEL</p><h3>카드 등록 퍼널</h3></div><span class="statistics-panel-caption">추적 시작 ${escapeHtml(data.trackingSince.slice(0, 10))}</span></div><div class="statistics-funnel">${data.funnel.map((row, index) => `<div style="--funnel-width:${Math.max(4, row.rate)}%"><span><b>${index + 1}</b>${escapeHtml(row.label)}</span><strong>${statisticsFormatNumber(row.count)}<small>${Number(row.rate).toFixed(1)}%</small></strong></div>`).join("")}</div></article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">PACK PERFORMANCE</p><h3>카드팩 성과</h3></div><span class="statistics-panel-caption">${packRows.length}개 카드팩</span></div>${packRows.length ? statisticsPerformanceTable(packRows, !rootScope) : '<div class="empty">선택한 범위에 카드팩 개봉 기록이 없습니다.</div>'}</article><article class="statistics-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">OPERATION HEALTH</p><h3>운영 이상 징후</h3></div><span class="statistics-live-chip"><i></i> 실데이터</span></div><div class="statistics-alert-list"><div class="${health.redemptionFailures ? "warning" : "safe"}">${icon(health.redemptionFailures ? "error" : "check_circle")}<span><strong>등록 실패</strong><small>선택 기간 ${statisticsFormatNumber(health.redemptionFailures)}건</small></span><em>${health.redemptionFailures ? "확인 필요" : "정상"}</em></div><div>${icon("content_copy")}<span><strong>중복 등록 시도</strong><small>${statisticsFormatNumber(health.duplicateAttempts)}건</small></span><em>${health.duplicateAttempts ? "관찰" : "정상"}</em></div><div class="${health.oddsStatus === "normal" ? "safe" : "warning"}">${icon("fact_check")}<span><strong>확률 편차</strong><small>공개 확률 대비 실제 발급</small></span><em>${health.oddsStatus === "normal" ? "정상" : "확인"}</em></div></div></article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ODDS INTEGRITY</p><h3>공개 확률 대비 실제 발급</h3></div><span class="statistics-panel-caption">선택 범위 기준</span></div>${statisticsOddsComparison(data.oddsIntegrity)}</article></section></div>`;
}

function rootStatisticsPreview() {
  const scale = statisticsPeriodScale[statisticsPreviewState.period] || 1;
  const packRows = [
    { pack: "Nebula Ver.", season: "정규 1집 · DREAMSCAPE", artist: "DREAMSCAPE", opens: 48920 * scale, conversion: 31.4, delta: 12.8, color: "#6657ed" },
    { pack: "Starlight Ver.", season: "정규 1집 · DREAMSCAPE", artist: "DREAMSCAPE", opens: 37640 * scale, conversion: 29.8, delta: 8.4, color: "#5ca9ef" },
    { pack: "Bloom Ver.", season: "2026 BLOOM", artist: "LUMINA", opens: 29840 * scale, conversion: 27.1, delta: -2.1, color: "#e56bb0" },
  ];
  const visiblePacks = packRows.filter((row) => (statisticsPreviewState.artist === "all" || row.artist === statisticsPreviewState.artist) && (statisticsPreviewState.pack === "all" || row.pack === statisticsPreviewState.pack));
  return `<div class="statistics-scope-body"><section class="statistics-kpi-grid">${statisticsMetricCard({ iconName: "groups", label: "전체 활성 팬", value: statisticsFormatNumber(84230 * scale), unit: "명", delta: "+12.6%", tone: "violet", description: " 이전 기간 대비" })}${statisticsMetricCard({ iconName: "playing_cards", label: "카드 발급", value: statisticsFormatNumber(186420 * scale), unit: "장", delta: "+18.4%", tone: "blue", description: " 인증·랜덤 합산" })}${statisticsMetricCard({ iconName: "inventory_2", label: "카드팩 개봉", value: statisticsFormatNumber(241890 * scale), unit: "회", delta: "+9.8%", tone: "mint", description: " 공개 카드팩 기준" })}${statisticsMetricCard({ iconName: "verified", label: "등록 완료율", value: "72.4", unit: "%", delta: "+3.1%p", tone: "amber", description: " 발급 대비 등록" })}</section><section class="statistics-dashboard-grid"><article class="statistics-panel statistics-trend-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">GROWTH TREND</p><h3>팬 성장과 카드팩 개봉 추이</h3></div><span class="statistics-panel-caption">일별 누적 지표</span></div>${statisticsTrendChart([48, 53, 51, 59, 63, 66, 72, 76, 81, 84], [43, 46, 48, 50, 55, 58, 61, 65, 69, 73], ["1일", "5일", "10일", "15일", "20일", "25일", "30일"])}</article><article class="statistics-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ISSUANCE FUNNEL</p><h3>발급 전환 퍼널</h3></div><span class="statistics-panel-caption">전체 서비스</span></div><div class="statistics-funnel">${[["인증번호 발급", 100, "186,420"], ["최초 인식", 78, "145,410"], ["카드 등록", 72, "134,160"], ["컬렉션 확인", 69, "128,630"]].map(([label, value, count], index) => `<div style="--funnel-width:${value}%"><span><b>${index + 1}</b>${label}</span><strong>${count}<small>${value}%</small></strong></div>`).join("")}</div></article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">PACK PERFORMANCE</p><h3>카드팩 성과</h3></div><button type="button" class="statistics-text-button">전체 보기 ${icon("arrow_forward")}</button></div>${statisticsPerformanceTable(visiblePacks)}</article><article class="statistics-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">OPERATION HEALTH</p><h3>운영 이상 징후</h3></div><span class="statistics-live-chip"><i></i> 실시간</span></div><div class="statistics-alert-list"><div class="warning">${icon("error")}<span><strong>등록 실패 집중</strong><small>최근 1시간 · 인증번호 23건</small></span><em>확인 필요</em></div><div>${icon("content_copy")}<span><strong>중복 등록 시도</strong><small>동일 기기 반복 시도 7건</small></span><em>관찰</em></div><div class="safe">${icon("fact_check")}<span><strong>확률 편차</strong><small>최대 편차 0.24%p</small></span><em>정상</em></div></div></article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ODDS INTEGRITY</p><h3>공개 확률 대비 실제 발급</h3></div><span class="statistics-panel-caption">총 186,420회 기준</span></div>${statisticsOddsComparison([{ rarity: "UR", published: 1, actual: 1.08 }, { rarity: "SR", published: 9, actual: 8.91 }, { rarity: "R", published: 30, actual: 30.24 }, { rarity: "N", published: 60, actual: 59.77 }])}</article></section></div>`;
}

function partnerStatisticsPreview() {
  const scale = statisticsPeriodScale[statisticsPreviewState.period] || 1;
  const rows = [
    { pack: "Nebula Ver.", season: "정규 1집", artist: "DREAMSCAPE", opens: 32480 * scale, conversion: 74.2, delta: 15.1, color: "#6657ed" },
    { pack: "Starlight Ver.", season: "정규 1집", artist: "DREAMSCAPE", opens: 28640 * scale, conversion: 68.4, delta: 7.8, color: "#5ca9ef" },
    { pack: "Midnight Ver.", season: "정규 1집", artist: "DREAMSCAPE", opens: 22640 * scale, conversion: 63.9, delta: -1.3, color: "#172a66" },
  ];
  const visibleRows = rows.filter((row) => statisticsPreviewState.pack === "all" || row.pack === statisticsPreviewState.pack);
  return `<div class="statistics-scope-body"><section class="statistics-kpi-grid">${statisticsMetricCard({ iconName: "person_celebrate", label: "파트너 활성 팬", value: statisticsFormatNumber(27480 * scale), unit: "명", delta: "+14.2%", tone: "violet", description: " DREAMSCAPE 팬" })}${statisticsMetricCard({ iconName: "style", label: "카드 발급", value: statisticsFormatNumber(64210 * scale), unit: "장", delta: "+11.8%", tone: "blue", description: " 파트너 전체" })}${statisticsMetricCard({ iconName: "deployed_code", label: "카드팩 개봉", value: statisticsFormatNumber(83760 * scale), unit: "회", delta: "+16.5%", tone: "mint", description: " 3개 버전" })}${statisticsMetricCard({ iconName: "collections_bookmark", label: "컬렉션 등록", value: statisticsFormatNumber(59420 * scale), unit: "건", delta: "+9.4%", tone: "amber", description: " 중복 제외" })}</section><section class="statistics-dashboard-grid"><article class="statistics-panel statistics-trend-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ARTIST ACTIVITY</p><h3>아티스트별 팬 활동</h3></div><span class="statistics-panel-caption">팬 활동 XP 기준</span></div><div class="statistics-artist-ranking">${[["DREAMSCAPE", 91, "+18.2%", "드"], ["LUMINA", 73, "+9.7%", "루"], ["STELLON", 58, "+4.1%", "스"]].map(([name, value, delta, initial], index) => `<div><span class="statistics-rank">${index + 1}</span><span class="statistics-artist-avatar">${initial}</span><span class="statistics-artist-copy"><strong>${name}</strong><i><b style="width:${value}%"></b></i></span><em>${delta}</em></div>`).join("")}</div></article><article class="statistics-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">COLLECTION</p><h3>컬렉션 현황</h3></div><strong class="statistics-big-rate">56%</strong></div><div class="statistics-collection-ring"><div><span>평균<br/>완성률</span></div><ul><li><i class="complete"></i><span>완성 컬렉션</span><strong>2,940</strong></li><li><i class="progress"></i><span>수집 진행 중</span><strong>8,320</strong></li><li><i class="start"></i><span>수집 시작</span><strong>16,220</strong></li></ul></div></article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">PACK PERFORMANCE</p><h3>카드팩별 성과</h3></div><span class="statistics-panel-caption">DREAMSCAPE</span></div>${statisticsPerformanceTable(visibleRows, true)}</article><article class="statistics-panel statistics-wide-panel"><div class="statistics-panel-heading"><div><p class="eyebrow">ODDS INTEGRITY</p><h3>공개 확률 대비 실제 발급</h3></div><span class="statistics-panel-caption">파트너 발급 64,210회</span></div>${statisticsOddsComparison([{ rarity: "UR", published: 1, actual: 1.04 }, { rarity: "SR", published: 9, actual: 9.12 }, { rarity: "R", published: 30, actual: 29.88 }, { rarity: "N", published: 60, actual: 59.96 }])}</article></section></div>`;
}

function statisticsPreviewNavigation() {
  return `<aside class="app-nav statistics-preview-nav" aria-label="관리자 주요 메뉴"><div class="nav-brand"><span class="nav-brand-mark"><img src="./assets/fanfolio-app-icon-192.png" alt="Fanfolio 서비스 아이콘" /></span><span class="nav-brand-copy"><strong>FANFOLIO</strong><small>OPERATIONS</small></span>${icon("keyboard_double_arrow_left")}</div><nav><button class="nav-item" type="button">${icon("space_dashboard")}<span>개요</span></button><button class="nav-item" type="button">${icon("domain")}<span>파트너</span></button><button class="nav-item" type="button">${icon("recent_actors")}<span>아티스트</span></button><button class="nav-item" type="button">${icon("style")}<span>카드</span></button><button class="nav-item" type="button">${icon("campaign")}<span>이벤트</span></button><button class="nav-item active" type="button">${icon("monitoring")}<span>통계</span></button><button class="nav-item" type="button">${icon("workspace_premium")}<span>팬 성장</span></button><button class="nav-item" type="button">${icon("group")}<span>서비스 사용자</span></button><button class="nav-item" type="button">${icon("history")}<span>감사 로그</span></button><button class="nav-item" type="button">${icon("help")}<span>운영 가이드</span></button></nav><div class="nav-account"><span class="account-avatar">운</span><div class="nav-account-copy"><strong>운영 관리자</strong><small>루트 관리자</small></div>${icon("logout")}</div></aside>`;
}

function statisticsPreviewView() {
  const rootScope = statisticsPreviewState.scope === "root";
  const partnerOptions = [{ value: "all", label: "전체 파트너" }, { value: "dream", label: "DREAM Entertainment" }, { value: "luminous", label: "Luminous Lab" }];
  const artistOptions = [{ value: "all", label: "전체 아티스트" }, { value: "DREAMSCAPE", label: "DREAMSCAPE" }, { value: "LUMINA", label: "LUMINA" }];
  const packOptions = [{ value: "all", label: "전체 카드팩" }, { value: "Nebula Ver.", label: "Nebula Ver." }, { value: "Starlight Ver.", label: "Starlight Ver." }, { value: "Midnight Ver.", label: "Midnight Ver." }];
  return `<div class="admin-shell statistics-preview">${statisticsPreviewNavigation()}<main class="workspace"><header class="topbar statistics-preview-topbar"><div class="topbar-title"><div><p class="eyebrow">INSIGHTS</p><h1 class="title">통계</h1></div></div><div class="top-actions"><span class="scope-chip ${rootScope ? "root-scope" : "partner-scope"}">${icon(rootScope ? "shield_person" : "domain")}<span>${rootScope ? "ROOT 운영 영역" : "파트너 운영 영역"}</span></span><button class="icon-button" type="button" aria-label="알림">${icon("notifications")}</button><span class="top-avatar">운</span></div></header><section class="page-content statistics-preview-content"><div class="statistics-hero"><div><nav>통계 <span>›</span> <strong>${rootScope ? "서비스 전체" : "파트너 성과"}</strong></nav><h2>${rootScope ? "서비스 운영 통계" : "파트너 성과 통계"}</h2><p>${rootScope ? "팬 성장부터 카드 발급 무결성까지 서비스 전체 흐름을 확인합니다." : "파트너와 소속 아티스트의 팬 활동 및 카드 성과를 확인합니다."}</p></div><div class="statistics-scope-switch" role="tablist" aria-label="통계 범위"><button type="button" data-statistics-scope="root" class="${rootScope ? "active" : ""}">${icon("shield_person")} ROOT</button><button type="button" data-statistics-scope="partner" class="${rootScope ? "" : "active"}">${icon("domain")} 파트너</button></div></div><div class="statistics-filter-bar"><div class="statistics-periods" role="group" aria-label="조회 기간">${[["7", "7일"], ["30", "30일"], ["90", "90일"]].map(([value, label]) => `<button type="button" data-statistics-period="${value}" class="${statisticsPreviewState.period === value ? "active" : ""}">${label}</button>`).join("")}</div><div class="statistics-selects">${rootScope ? adminSelect({ id: "statistics-partner", value: statisticsPreviewState.partner, label: "파트너 필터", className: "statistics-filter-select", dataStatisticsFilter: "partner", options: partnerOptions }) : ""}${adminSelect({ id: "statistics-artist", value: statisticsPreviewState.artist, label: "아티스트 필터", className: "statistics-filter-select", dataStatisticsFilter: "artist", options: artistOptions })}${adminSelect({ id: "statistics-pack", value: statisticsPreviewState.pack, label: "카드팩 필터", className: "statistics-filter-select", dataStatisticsFilter: "pack", options: packOptions })}<label class="statistics-compare-toggle"><input type="checkbox" data-statistics-compare ${statisticsPreviewState.compare ? "checked" : ""}/><span></span>전기 비교</label></div></div>${rootScope ? rootStatisticsPreview() : partnerStatisticsPreview()}</section></main></div>`;
}

function renderStatisticsPreview() {
  app.innerHTML = statisticsPreviewView();
  document.querySelectorAll("[data-statistics-scope]").forEach((button) => button.addEventListener("click", () => {
    statisticsPreviewState.scope = button.dataset.statisticsScope;
    statisticsPreviewState.artist = "all";
    statisticsPreviewState.pack = "all";
    renderStatisticsPreview();
  }));
  document.querySelectorAll("[data-statistics-period]").forEach((button) => button.addEventListener("click", () => {
    statisticsPreviewState.period = button.dataset.statisticsPeriod;
    renderStatisticsPreview();
  }));
  document.querySelectorAll("[data-statistics-filter]").forEach((control) => {
    const trigger = control.querySelector(".admin-select-trigger");
    trigger?.addEventListener("click", () => {
      document.querySelectorAll(".admin-select.open").forEach((item) => {
        if (item !== control) {
          item.classList.remove("open");
          item.querySelector(".admin-select-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
      control.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(control.classList.contains("open")));
    });
    trigger?.addEventListener("keydown", (event) => {
      const options = [...control.querySelectorAll(".admin-select-option")];
      const selectedIndex = Math.max(0, options.findIndex((option) => option.classList.contains("selected")));
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (!control.classList.contains("open")) trigger.click();
        options[(selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (["Home", "End"].includes(event.key) && control.classList.contains("open")) {
        event.preventDefault();
        (event.key === "Home" ? options[0] : options.at(-1))?.focus();
      } else if (event.key === "Escape" && control.classList.contains("open")) {
        event.preventDefault();
        control.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    control.querySelectorAll(".admin-select-option").forEach((option) => {
      option.addEventListener("keydown", (event) => {
        const options = [...control.querySelectorAll(".admin-select-option")];
        const index = options.indexOf(option);
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
        } else if (["Home", "End"].includes(event.key)) {
          event.preventDefault();
          (event.key === "Home" ? options[0] : options.at(-1))?.focus();
        } else if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          option.click();
        } else if (event.key === "Escape") {
          event.preventDefault();
          control.classList.remove("open");
          trigger?.focus();
        }
      });
      option.addEventListener("click", () => {
        statisticsPreviewState[control.dataset.statisticsFilter] = option.dataset.value;
        renderStatisticsPreview();
      });
    });
  });
  document.querySelector("[data-statistics-compare]")?.addEventListener("change", (event) => {
    statisticsPreviewState.compare = event.currentTarget.checked;
    renderStatisticsPreview();
  });
}

async function restoreAdminSession() {
  try {
    const context = await api("/admin/me");
    state.adminContext = context.data;
    state.authenticated = true;
    state.restoringSession = false;
    await loadData();
    if (new URLSearchParams(window.location.search || "").get("drawer") === "event" && can("events:write")) {
      openDrawer("event");
    }
  } catch {
    // An absent or expired scoped cookie keeps the login screen visible.
    state.restoringSession = false;
    layout();
  }
}

const localPreviewMode = isLocalHost && typeof URLSearchParams !== "undefined"
  ? new URLSearchParams(window.location.search || "").get("preview")
  : "";

if (localPreviewMode === "card-operations") {
  renderCardOperationsPreview();
} else if (localPreviewMode === "statistics") {
  renderStatisticsPreview();
} else if (localPreviewMode === "reward-builder") {
  state.authenticated = true;
  state.restoringSession = false;
  state.view = "fan-growth";
  state.adminContext = {
    accessLevel: "root",
    displayName: "운영 관리자",
    allowedActions: ["engagement:write", "engagement:manage_global", "engagement:approve_global"],
  };
  state.catalog = {
    artists: [
      { id: "artist_dreamscape", name: "드림스케이프" },
      { id: "artist_luminous", name: "루미너스" },
    ],
    members: [],
  };
  state.drawer = "reward";
  state.drawerData = {
    reward: {
      name: "NOVA 첫 수집가",
      rewardType: "badge",
      artistId: "artist_dreamscape",
      metadata: { label: "NOVA 수집 배지", color: "violet", imagePreset: "ticket" },
    },
  };
  layout();
} else {
  layout();
  void restoreAdminSession();
}
