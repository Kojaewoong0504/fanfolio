const isLocalHost = ["localhost", "127.0.0.1"].includes(
  window.location.hostname,
);
const API_BASE = isLocalHost
  ? window.localStorage.getItem("fanfolio_api_base") ||
    "http://localhost:8000/api"
  : "/api";
let ACCESS_TOKEN = "";
let refreshInFlight = null;
const app = document.querySelector("#app");
const state = {
  view: "dashboard",
  authenticated: false,
  restoringSession: true,
  mustChangePassword: false,
  adminContext: null,
  mobileNavOpen: false,
  navCollapsed:
    window.localStorage.getItem("fanfolio.admin.navCollapsed") === "true",
  accountMenuOpen: false,
  notificationPanelOpen: false,
  metrics: null,
  recentActivity: [],
  notifications: [],
  unreadNotificationCount: 0,
  cards: [],
  drops: [],
  batches: [],
  users: [],
  artistAccounts: [],
  artistProfiles: [],
  artistProfilesLoaded: false,
  auditLogs: [],
  campaigns: [],
  catalog: { artists: [], members: [] },
  engagement: { achievements: [], rewards: [], passSeasons: [] },
  query: "",
  cardArtist: "all",
  status: "all",
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
  reviewCard: null,
  reviewImageSrc: "",
  reviewImageError: false,
  reviewBackImageSrc: "",
  reviewBackImageError: false,
  reviewSide: "front",
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
  drawer: null,
  drawerData: null,
  temporaryCredential: null,
  organizationLogoFile: null,
  organizationLogoPreviewUrl: "",
  organizationLogoRemoved: false,
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
const fanGrowthEmptyState = { achievements: [], rewards: [], passSeasons: [] };
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
const maxFanPassTiers = 10;

function resolvePartnerLogoUrl(logoUrl) {
  if (!logoUrl) return "";
  if (isLocalHost && logoUrl.startsWith("/api/")) {
    return `${API_BASE}${logoUrl.replace(/^\/api/, "")}`;
  }
  return logoUrl;
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
    batches: "드롭·코드",
    "fan-growth": "팬 성장",
    users: "서비스 사용자",
    audit: "감사 로그",
    guide: "운영 가이드",
  }[state.view];
}

function navItems() {
  const companyWorkspace = !isRoot() && state.adminContext?.accessLevel === "company_admin";
  return [
    { id: "dashboard", label: "개요", icon: "space_dashboard" },
    ...(isRoot()
      ? [{ id: "partners", label: "파트너", icon: "domain" }]
      : []),
    ...(companyWorkspace
      ? [{ id: "partners", label: "우리 회사", icon: "domain" }]
      : []),
    { id: "artists", label: "아티스트", icon: "recent_actors" },
    { id: "cards", label: "카드", icon: "style" },
    ...(can("drops:read")
      ? [{ id: "batches", label: "드롭·코드", icon: "qr_code_2" }]
      : []),
    ...(canViewFanGrowth()
      ? [{ id: "fan-growth", label: "팬 성장", icon: "workspace_premium" }]
      : []),
    ...(isRoot()
      ? [{ id: "users", label: "서비스 사용자", icon: "group" }]
      : []),
    { id: "audit", label: "감사 로그", icon: "history" },
    { id: "guide", label: "운영 가이드", icon: "help" },
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
  return `<aside class="app-nav ${state.mobileNavOpen ? "open" : ""}" aria-label="관리자 주요 메뉴"><div class="nav-brand"><span class="nav-brand-mark"><img src="./assets/fanfolio-app-icon-192.png" alt="Fanfolio 서비스 아이콘" /></span><span class="nav-brand-copy"><strong>FANFOLIO</strong><small>OPERATIONS</small></span><button class="icon-button nav-toggle" id="desktop-nav-toggle" type="button" aria-label="${navToggleLabel}" title="${navToggleLabel}">${icon(state.navCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left")}</button></div><nav>${navItems()
    .map(
      (item) =>
        `<button type="button" data-view="${item.id}" class="nav-item ${state.view === item.id ? "active" : ""}" aria-current="${state.view === item.id ? "page" : "false"}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span>${item.label}</span></button>`,
    )
    .join("")}</nav><div class="nav-account"><span class="account-avatar">${escapeHtml((person.displayName || person.email || "관").slice(0, 1))}</span><div class="nav-account-copy"><strong>${escapeHtml(person.displayName || "관리자")}</strong><small>${escapeHtml(role)}</small></div><button class="icon-button" id="logout" type="button" aria-label="로그아웃" title="로그아웃">${icon("logout")}</button></div></aside>`;
}

function topbarView() {
  const person = state.adminContext?.user || {};
  const personName = person.displayName || "관리자";
  const personInitial = escapeHtml((person.displayName || person.email || "관").slice(0, 1));
  const unreadBadge = state.unreadNotificationCount
    ? `<span class="notification-badge">${state.unreadNotificationCount}</span>`
    : "";
  return `<header class="topbar"><div class="topbar-title"><button class="icon-button mobile-nav-toggle" id="mobile-nav-toggle" type="button" aria-label="메뉴 열기">${icon("menu")}</button><div><p class="eyebrow">FANFOLIO OPERATIONS</p><h1 class="title">${title()}</h1></div></div><div class="top-actions">${scopeContextChip()}<div class="notification-menu ${state.notificationPanelOpen ? "open" : ""}"><button class="icon-button notification-button" type="button" aria-label="알림" aria-expanded="${state.notificationPanelOpen}" data-open-notification="toggle">${icon("notifications")}${unreadBadge}</button>${notificationPanelView()}</div><div class="account-menu ${state.accountMenuOpen ? "open" : ""}"><button class="top-avatar" id="account-menu-toggle" type="button" aria-haspopup="menu" aria-expanded="${state.accountMenuOpen}" aria-label="${escapeHtml(personName)} 계정 메뉴" title="${escapeHtml(person.email || personName)}">${personInitial}</button><div class="account-popover" role="menu" aria-label="계정 메뉴"><button type="button" id="account-settings" role="menuitem">${icon("manage_accounts")}<span>계정 설정</span></button><button type="button" id="account-password-change" role="menuitem">${icon("password")}<span>비밀번호 변경</span></button><button type="button" id="account-logout" role="menuitem">${icon("logout")}<span>로그아웃</span></button></div></div></div></header>`;
}

function notificationPanelView() {
  const items = state.notifications.length
    ? state.notifications
        .slice(0, 8)
        .map(
          (item) =>
            `<button class="notification-item ${item.isRead ? "" : "unread"}" type="button" data-open-notification="${escapeHtml(item.id)}" data-card-id="${escapeHtml(item.entityType === "card" ? item.entityId || "" : "")}"><strong>${escapeHtml(item.title || notificationKindLabel(item.kind))}</strong><span>${escapeHtml(item.body || notificationKindLabel(item.kind))}</span><small>${formatDate(item.createdAt)}</small></button>`,
        )
        .join("")
    : `<div class="notification-empty">${icon("notifications_off")}<span>새 알림이 없습니다.</span></div>`;
  return `<div class="notification-popover" role="menu" aria-label="알림 목록"><div class="notification-popover-heading"><strong>알림</strong><span>${state.unreadNotificationCount} unread</span></div><div class="notification-list">${items}</div></div>`;
}

function notificationKindLabel(kind) {
  return (
    {
      card_partner_review_requested: "회사 검수 요청",
      card_platform_review_requested: "플랫폼 검수 요청",
    }[kind] || "운영 알림"
  );
}

function currentView() {
  return {
    dashboard: dashboardView,
    partners: partnersView,
    artists: artistsView,
    cards: cardsView,
    batches: batchesView,
    "fan-growth": fanGrowthView,
    users: usersView,
    audit: auditView,
    guide: guideView,
  }[state.view]?.() || dashboardView();
}

function adminSelect({ id, value, label, options, className = "", name = "" }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return `<div class="admin-select ${className}" data-select-id="${escapeHtml(id)}" data-value="${escapeHtml(selected?.value || "")}">${name ? `<input class="admin-select-value" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected?.value || "")}" />` : ""}<button class="admin-select-trigger" type="button" role="combobox" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${escapeHtml(id)}-menu">${icon("expand_more")}<span>${escapeHtml(selected?.label || "선택")}</span></button><div class="admin-select-menu" id="${escapeHtml(id)}-menu" role="listbox" aria-label="${escapeHtml(label)}">${options.map((option) => `<button class="admin-select-option ${option.value === selected?.value ? "selected" : ""}" type="button" role="option" aria-selected="${option.value === selected?.value}" data-value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}">${escapeHtml(option.label)}${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</button>`).join("")}</div></div>`;
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
  const partnerMode = state.view === "partners" && isRoot();
  app.innerHTML = `<div class="admin-shell ${state.navCollapsed ? "nav-collapsed" : ""} ${partnerMode ? "partner-layout partner-directory" : ""}">${navigationView()}${partnerMode ? partnerListColumn() : ""}<main class="workspace ${partnerMode ? "partner-detail" : ""}">${topbarView()}${state.error ? `<div class="notice error" role="alert">${escapeHtml(state.error)}</div>` : ""}<section class="page-content">${currentView()}</section></main></div>${drawerView()}<div class="nav-scrim ${state.mobileNavOpen ? "show" : ""}" id="nav-scrim"></div><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
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
  return `<div class="page-heading"><div><p class="eyebrow">TODAY</p><h2>운영 현황을 한눈에 확인하세요</h2><p>${escapeHtml(scopeDescription)}</p></div></div><div class="metrics"><article class="metric"><span class="metric-icon purple">${icon("style")}</span><div><span class="metric-label">전체 카드</span><strong class="metric-value">${metrics.totalCards}</strong><span class="metric-note">현재 범위 등록 카드</span></div></article><article class="metric"><span class="metric-icon green">${icon("public")}</span><div><span class="metric-label">공개 카드</span><strong class="metric-value">${metrics.publishedCards}</strong><span class="metric-note">팬에게 노출 중</span></div></article><article class="metric"><span class="metric-icon blue">${icon("campaign")}</span><div><span class="metric-label">진행 중 드롭</span><strong class="metric-value">${metrics.activeDrops}</strong><span class="metric-note">현재 라이브</span></div></article><article class="metric"><span class="metric-icon amber">${icon("qr_code_scanner")}</span><div><span class="metric-label">누적 발급</span><strong class="metric-value">${Number(metrics.redeemedCount).toLocaleString()}</strong><span class="metric-note">사용 완료 코드</span></div></article></div><div class="dashboard-grid"><section class="panel action-panel"><div class="panel-heading"><div><p class="eyebrow">QUICK ACTIONS</p><h2>바로 시작하기</h2></div></div><div class="quick-actions">${can("cards:write") ? `<button class="quick-action" id="open-card-drawer" type="button"><span>${icon("add_card")}</span><div><strong>새 카드 등록</strong><small>이미지와 카드 정보를 등록합니다.</small></div>${icon("arrow_forward")}</button>` : ""}${isRoot() ? `<button class="quick-action" data-view="partners" type="button"><span>${icon("domain_add")}</span><div><strong>파트너 관리</strong><small>기업 담당자와 아티스트를 배정합니다.</small></div>${icon("arrow_forward")}</button>` : ""}<button class="quick-action" data-view="artists" type="button"><span>${icon("recent_actors")}</span><div><strong>아티스트 확인</strong><small>소속과 계정 상태를 확인합니다.</small></div>${icon("arrow_forward")}</button></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">RECENT ACTIVITY</p><h2>최근 운영 활동</h2></div><button class="text-button" data-view="audit" type="button">전체 보기 ${icon("arrow_forward")}</button></div><div class="activity-list">${activity}</div></section></div>`;
}
function activityLabel(action) {
  return (
    {
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

async function loadFanGrowth(renderAfter = false) {
  if (!canViewFanGrowth()) {
    state.engagement = { ...fanGrowthEmptyState };
    return;
  }
  const [achievements, rewards, passSeasons] = await Promise.all([
    api("/admin/engagement/achievements"),
    api("/admin/engagement/rewards"),
    api("/admin/engagement/pass-seasons"),
  ]);
  state.engagement = {
    achievements: achievements.data.items || [],
    rewards: rewards.data.items || [],
    passSeasons: passSeasons.data.items || [],
  };
  if (renderAfter) layout();
}

function formatDate(value) {
  if (!value) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
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
  const managementActions = isRoot()
    ? `<div class="partner-hero-actions"><button class="secondary" id="edit-organization" type="button">${icon("edit")} 정보 수정</button><button class="secondary danger-button" id="toggle-organization-status" type="button" data-next-status="${organization.status === "active" ? "suspended" : "active"}">${icon(organization.status === "active" ? "pause_circle" : "play_circle")} ${organization.status === "active" ? "운영 중지" : "다시 활성화"}</button></div>`
    : "";
  return `<section class="partner-detail-view"><div class="partner-mobile-selector">${isRoot() ? `<label>파트너 선택<select id="partner-mobile-select">${state.organizations.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === organization.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}</div><header class="partner-hero">${partnerLogoMarkup(organization, "large")}<div class="partner-identity"><div class="partner-name-row"><h2>${escapeHtml(organization.name)}</h2><span class="badge ${organization.status === "active" ? "success-badge" : "danger-badge"}">${organization.status === "active" ? "운영 중" : "운영 중지"}</span></div><p>${escapeHtml(organization.contactEmail || "대표 담당자 이메일 미등록")}</p><div class="partner-meta"><span>${icon("calendar_month")} ${formatContractDate(organization.contractStartsAt)} – ${formatContractDate(organization.contractEndsAt)}</span><span>${icon("update")} ${formatDate(organization.updatedAt)} 업데이트</span></div></div>${managementActions}</header><nav class="detail-tabs" aria-label="파트너 상세 메뉴">${[
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
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SECURITY LOG</p><h2>감사 로그</h2><p>현재 권한 범위에서 발생한 변경 이력을 확인합니다.</p></div></div><div class="toolbar compact-toolbar"><label class="search-field">${icon("search")}<input id="audit-search" placeholder="행동, 실행자, 대상 검색" value="${escapeHtml(state.auditQuery)}" /></label>${adminSelect({ id: "audit-action-filter", value: state.auditAction, label: "감사 로그 행동 필터", className: "filter-select audit-action-filter", options: actionOptions })}<button class="secondary" id="audit-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>시각</th><th>행동</th><th>실행자</th><th>대상</th></tr></thead><tbody>${auditRows()}</tbody></table></div>${auditPagination()}</section>`;
}

function drawerView() {
  if (!state.drawer) return "";
  const contents = {
    organization: organizationDrawer,
    member: memberDrawer,
    "artist-assignment": artistAssignmentDrawer,
    "artist-edit": artistEditDrawer,
    "card-create": cardCreateDrawer,
    "drop-link": dropLinkDrawer,
    achievement: achievementDrawer,
    "fan-pass": fanPassDrawer,
    "role-change": roleChangeDrawer,
    "member-password": memberPasswordDrawer,
    "artist-profile-review": artistProfileReviewDrawer,
  }[state.drawer]?.();
  if (!contents) return "";
  const cardOperationsNote = state.drawer === "card-create"
    ? `<div class="drawer-context-note">${icon("info")}<span><strong>아티스트 스튜디오와 다른 작업입니다.</strong><br />스튜디오는 창작·검수 요청, 이 화면은 메타데이터·발행량·공개 상태를 관리합니다.</span></div>`
    : "";
  return `<div class="drawer-backdrop" id="drawer-backdrop"><aside class="drawer ${state.drawer === "card-create" ? "card-create-drawer" : state.drawer === "member" ? "member-drawer" : state.drawer === "artist-assignment" ? "artist-assignment-drawer" : state.drawer === "artist-edit" ? "artist-edit-drawer" : state.drawer === "drop-link" ? "drop-link-drawer" : state.drawer === "achievement" ? "achievement-builder" : state.drawer === "fan-pass" ? "fan-pass-drawer" : ""}" role="dialog" aria-modal="true" aria-label="작업 패널">${cardOperationsNote}${contents}</aside></div>`;
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
  const scoped = state.drops.filter((drop) => !card.artistId || drop.artistId === card.artistId);
  const options = scoped.length
    ? scoped.map((drop) => ({ value: drop.id, label: `${drop.name} · ${drop.status}` }))
    : [{ value: "", label: "연결 가능한 드롭이 없습니다." }];
  return `${drawerHeader("DROP READY", "승인 카드 드롭 연결", "승인된 카드를 같은 아티스트의 드롭에 연결해 코드 발행 준비 상태로 전환합니다.")}<form class="drawer-body form" id="drop-link-form" data-card-id="${escapeHtml(card.id)}"><div class="assignment-member"><span class="card-thumb">${icon("style")}</span><div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.artistId || card.ownerArtistId || "아티스트 미지정")}</small></div></div><label class="field"><span>연결할 드롭</span>${adminSelect({ id: "drop-link-drop", name: "dropId", value: options[0].value, label: "연결할 드롭", className: "form-select", options })}</label><p class="hint">드롭이 라이브 상태이면 연결 즉시 공개 카드로 전환되고, 초안이면 드롭 준비 상태로 보관됩니다.</p><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit" ${scoped.length ? "" : "disabled"}>드롭 준비됨</button></footer></form>`;
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
  return `${drawerHeader("NEW CARD", "운영 카드 등록", "이미지를 업로드하고 팬에게 보여줄 카드 정보를 입력합니다.")}<form class="drawer-body form" id="admin-card-form"><label class="upload-field"><input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" required /><span>${icon("add_photo_alternate")}</span><strong>카드 이미지 업로드</strong><small>PNG, JPG, WebP · 세로형 이미지를 권장합니다.</small></label><label class="field"><span>카드명</span><input name="name" placeholder="예: 컴백 기념 사인 카드" required /></label><label class="field"><span>시즌</span><input name="seasonName" placeholder="예: 2026 SUMMER" /></label><div class="form-grid"><label class="field"><span>아티스트</span><select name="artistId" ${isRoot() ? "" : "required"}><option value="">아티스트 선택</option>${artists.map((artist) => `<option value="${escapeHtml(artist.id)}">${escapeHtml(artist.name)}</option>`).join("")}</select></label><label class="field"><span>멤버</span><select name="memberId"><option value="">멤버 선택</option>${members.map((member) => `<option value="${escapeHtml(member.id)}" data-artist-id="${escapeHtml(member.artistId)}">${escapeHtml(member.name)}</option>`).join("")}</select></label></div><div class="form-grid"><label class="field"><span>등급</span><select name="rarity"><option value="N">N · 노멀</option><option value="R">R · 레어</option><option value="SR">SR · 슈퍼 레어</option><option value="Special">Special</option></select></label><label class="field"><span>발행 수량</span><input name="issueLimit" type="number" min="1" placeholder="제한 없음" /></label></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">카드 등록</button></footer></form>`;
}

function rewardOptions(selected = "") {
  const rewards = state.engagement.rewards || [];
  return [
    `<option value="">보상 없음</option>`,
    ...rewards.map(
      (reward) =>
        `<option value="${escapeHtml(reward.id)}" ${reward.id === selected ? "selected" : ""}>${escapeHtml(reward.name)} · ${escapeHtml(reward.rewardType || "reward")}</option>`,
    ),
  ].join("");
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
  const cardOptions = state.cards.map(
    (card) =>
      `<option value="${escapeHtml(card.id)}" ${(payload.cardId || "") === card.id ? "selected" : ""}>${escapeHtml(card.name)}</option>`,
  ).join("");
  const campaignOptions = state.campaigns.map(
    (campaign) =>
      `<option value="${escapeHtml(campaign.id)}" ${(payload.campaignId || "") === campaign.id ? "selected" : ""}>${escapeHtml(campaign.name)}</option>`,
  ).join("");
  const dropOptions = state.drops.map(
    (drop) =>
      `<option value="${escapeHtml(drop.id)}" ${(payload.dropId || "") === drop.id ? "selected" : ""}>${escapeHtml(drop.name)}</option>`,
  ).join("");
  const dateError = `<small id="achievement-date-error" class="field-error" hidden>업적 종료 시각은 시작 시각 이후로 선택해 주세요.</small>`;
  const approvalAction = canApproveFanGrowth() && achievement.id
    ? `<button class="primary fan-growth-transition" type="button" data-kind="achievement" data-action="approve" data-id="${escapeHtml(achievement.id)}">업적 공개 승인</button>`
    : "";
  return `${drawerHeader("FAN GROWTH", "업적 템플릿", "조직·아티스트·멤버 범위와 서버 조건 템플릿으로 업적을 운영합니다.")}<form class="drawer-body form" id="achievement-form" data-id="${escapeHtml(achievement.id || "")}"><label class="field"><span>업적 이름</span><input name="title" value="${escapeHtml(achievement.title || "")}" placeholder="예: 첫 공식 카드 수집" required /></label><label class="field"><span>설명</span><textarea name="description" maxlength="500" placeholder="팬에게 표시되는 달성 설명">${escapeHtml(achievement.description || "")}</textarea></label><section class="scope-fields"><p class="eyebrow">범위</p><label class="field"><span>조직</span><select name="organizationId">${organizationOptions(achievement.organizationId || "")}</select></label><div class="form-grid"><label class="field"><span>아티스트</span><select name="artistId"><option value="">전체 아티스트</option>${artists.map((artist) => `<option value="${escapeHtml(artist.id)}" ${achievement.artistId === artist.id ? "selected" : ""}>${escapeHtml(artist.name)}</option>`).join("")}</select></label><label class="field"><span>멤버</span><select name="memberId"><option value="">멤버 지정 없음</option>${members.map((member) => `<option value="${escapeHtml(member.id)}" data-artist-id="${escapeHtml(member.artistId)}" ${achievement.memberId === member.id ? "selected" : ""}>${escapeHtml(member.name)}</option>`).join("")}</select></label></div></section><section class="condition-template-fields"><p class="eyebrow">조건 템플릿</p><label class="field"><span>조건</span><select name="conditionType" id="achievement-condition">${Object.entries(conditionLabels).map(([value, label]) => `<option value="${escapeHtml(value)}" ${selectedCondition === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>${visibleFields.has("targetValue") ? `<label class="field"><span>목표 수치</span><input name="targetValue" type="number" min="1" value="${Number(achievement.targetValue || 1)}" required /></label>` : `<input type="hidden" name="targetValue" value="${Number(achievement.targetValue || 1)}" />`}${visibleFields.has("cardId") ? `<label class="field"><span>특정 카드</span><select name="cardId"><option value="">카드 선택</option>${cardOptions}</select></label>` : ""}${visibleFields.has("campaignId") ? `<label class="field"><span>세트 캠페인</span><select name="campaignId"><option value="">캠페인 선택</option>${campaignOptions}</select></label>` : ""}${visibleFields.has("dropId") ? `<label class="field"><span>드롭</span><select name="dropId"><option value="">드롭 선택</option>${dropOptions}</select></label>` : ""}</section><section class="reward-preview"><p class="eyebrow">XP · 보상 · 기간</p><div class="form-grid"><label class="field"><span>XP</span><input name="xpBonus" type="number" min="0" value="${Number(achievement.xpBonus || 0)}" /></label><label class="field"><span>보상</span><select name="rewardIds" multiple size="4">${rewardOptions((achievement.rewardIds || [])[0] || "")}</select></label></div><div class="form-grid"><label class="field"><span>기간 시작</span><input name="startsAt" type="datetime-local" value="${toLocalInputDateTime(achievement.startsAt)}" /></label><label class="field"><span>기간 종료</span><input name="endsAt" type="datetime-local" value="${toLocalInputDateTime(achievement.endsAt)}" />${dateError}</label></div></section><div id="achievement-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button>${canManageFanGrowth() ? `<button class="secondary" type="submit" data-save-mode="draft">임시 저장</button>${achievement.id ? `<button class="secondary fan-growth-transition" type="button" data-kind="achievement" data-action="submit" data-id="${escapeHtml(achievement.id)}">검수 요청</button>` : ""}` : ""}${approvalAction}</footer></form>`;
}

function fanPassDrawer() {
  const season = state.drawerData?.season || {};
  const tiers = Array.from({ length: maxFanPassTiers }, (_, index) => {
    const tier = (season.tiers || [])[index] || { tier: index + 1, requiredXp: "", rewardId: "" };
    return `<div class="pass-tier-row"><span>${index + 1}</span><label class="field"><span>티어 XP</span><input name="tierXp" type="number" min="0" value="${tier.requiredXp ?? ""}" /></label><label class="field"><span>티어 보상</span><select name="tierReward">${rewardOptions(tier.rewardId || "")}</select></label></div>`;
  }).join("");
  const approvalAction = canApproveFanGrowth() && season.id
    ? `<button class="primary fan-growth-transition" type="button" data-kind="pass" data-action="approve" data-id="${escapeHtml(season.id)}">패스 공개 승인</button>`
    : "";
  return `${drawerHeader("FREE FAN PASS", "무료 팬 패스", "시즌 기간과 최대 10개 XP 티어 보상만 운영합니다.")}<form class="drawer-body form" id="fan-pass-form" data-id="${escapeHtml(season.id || "")}"><label class="field"><span>패스 이름</span><input name="title" value="${escapeHtml(season.title || "")}" placeholder="예: NOVA 여름 팬 패스" required /></label><label class="field"><span>설명</span><textarea name="description" maxlength="500">${escapeHtml(season.description || "")}</textarea></label><section class="scope-fields"><p class="eyebrow">범위</p><div class="form-grid"><label class="field"><span>조직</span><select name="organizationId">${organizationOptions(season.organizationId || "")}</select></label><label class="field"><span>아티스트</span><select name="artistId"><option value="">전체 아티스트</option>${scopedArtists().map((artist) => `<option value="${escapeHtml(artist.id)}" ${season.artistId === artist.id ? "selected" : ""}>${escapeHtml(artist.name)}</option>`).join("")}</select></label></div></section><section><p class="eyebrow">시즌 기간</p><div class="form-grid"><label class="field"><span>시작</span><input name="startsAt" type="datetime-local" value="${toLocalInputDateTime(season.startsAt)}" /></label><label class="field"><span>종료</span><input name="endsAt" type="datetime-local" value="${toLocalInputDateTime(season.endsAt)}" /><small id="fan-pass-date-error" class="field-error" hidden>패스 종료 시각은 시작 시각 이후로 선택해 주세요.</small></label></div></section><section><p class="eyebrow">티어</p><div class="pass-tier-list">${tiers}</div></section><div id="fan-pass-form-error" class="form-error" role="alert" hidden></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button>${canManageFanGrowth() ? `<button class="secondary" type="submit">임시 저장</button>${season.id ? `<button class="secondary fan-growth-transition" type="button" data-kind="pass" data-action="submit" data-id="${escapeHtml(season.id)}">검수 요청</button>` : ""}` : ""}${approvalAction}</footer></form>`;
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
  const visible = state.cards.filter(
    (card) =>
      `${card.name}${card.ownerArtistId}${card.rarity}`
        .toLowerCase()
        .includes(state.query.toLowerCase()) &&
      (state.cardArtist === "all" ||
        card.ownerArtistId === state.cardArtist ||
        card.artistId === state.cardArtist) &&
      (state.status === "all" ||
        card.status === state.status ||
        releaseStatus(card) === state.status),
  );
  return `<div class="page-heading with-actions"><div><p class="eyebrow">CARD LIBRARY</p><h2>${isRoot() ? "전체 카드 운영" : "담당 카드 운영"}</h2><p>${isRoot() ? "아티스트 카드의 검수와 공개 상태를 관리합니다." : "배정된 아티스트의 카드 초안을 만들고 검수를 요청합니다."}</p></div>${can("cards:write") ? `<button class="primary" id="open-card-drawer" type="button">${icon("add_card")} 카드 등록</button>` : ""}</div>${releaseQueue()}${reviewPanel()}<section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="card-search" placeholder="카드명, 아티스트 검색" value="${escapeHtml(state.query)}" /></label>${adminSelect({ id: "card-artist-filter", value: state.cardArtist, label: "아티스트 필터", className: "filter-select card-artist-filter", options: artistOptions })}${adminSelect({ id: "card-status", value: state.status, label: "카드 상태 필터", className: "filter-select card-status-filter", options: statusOptions })}</div><div class="table-wrap"><table class="table responsive-table card-table"><thead><tr><th>카드</th><th>아티스트</th><th>등급</th><th>발행 수량</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${cardRows(visible)}</tbody></table></div></section>`;
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

function fanGrowthView() {
  const achievements = state.engagement.achievements || [];
  const passSeasons = state.engagement.passSeasons || [];
  const pendingAchievements = achievements.filter((item) => item.status === "pending_review");
  const pendingPasses = passSeasons.filter((item) => item.status === "pending_review");
  const pendingQueue = [...pendingAchievements, ...pendingPasses];
  const stats = [
    ["업적", achievements.length, "workspace_premium"],
    ["검수 대기", pendingQueue.length, "rate_review"],
    ["무료 패스", passSeasons.length, "card_membership"],
  ];
  const createActions = canManageFanGrowth()
    ? `<div class="inline-actions"><button class="secondary" id="open-fan-pass-drawer" type="button">${icon("card_membership")} 무료 패스</button><button class="primary" id="open-achievement-drawer" type="button">${icon("workspace_premium")} 업적 만들기</button></div>`
    : "";
  return `<div class="page-heading with-actions"><div><p class="eyebrow">FAN GROWTH</p><h2>팬 성장 운영</h2><p>${escapeHtml(scopeLabel())} 범위에서 업적, 보상, 무료 팬 패스를 초안·검수·공개 흐름으로 관리합니다.</p></div>${createActions}</div><div class="fan-growth-grid">${stats.map(([label, value, iconName]) => `<article class="summary-card"><span>${icon(iconName)}</span><div><small>${label}</small><strong>${Number(value).toLocaleString()}</strong></div></article>`).join("")}</div>${pendingQueue.length ? `<section class="panel fan-growth-queue"><div class="panel-heading"><div><p class="eyebrow">REVIEW QUEUE</p><h2>검수 대기열</h2></div></div><div class="fan-growth-list">${pendingAchievements.map((item) => fanGrowthQueueItem(item, "achievement")).join("")}${pendingPasses.map((item) => fanGrowthQueueItem(item, "pass")).join("")}</div></section>` : ""}<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ACHIEVEMENTS</p><h2>업적 템플릿</h2></div></div><div class="table-wrap"><table class="table responsive-table fan-growth-table"><thead><tr><th>업적</th><th>조건</th><th>범위</th><th>XP·보상</th><th>상태</th><th>관리</th></tr></thead><tbody>${achievementRows(achievements)}</tbody></table></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">FREE FAN PASS</p><h2>무료 팬 패스 시즌</h2></div></div><div class="table-wrap"><table class="table responsive-table fan-growth-table"><thead><tr><th>패스</th><th>범위</th><th>기간</th><th>티어</th><th>상태</th><th>관리</th></tr></thead><tbody>${fanPassRows(passSeasons)}</tbody></table></div></section>`;
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
  if (!passSeasons.length) return '<tr><td colspan="6" class="empty">아직 등록된 무료 팬 패스가 없습니다.</td></tr>';
  return passSeasons
    .map((item) => {
      const writeActions = canManageFanGrowth()
        ? `<button class="icon-button edit-fan-pass" type="button" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 수정">${icon("edit")}</button>${item.status === "draft" ? `<button class="secondary fan-growth-transition" type="button" data-kind="pass" data-action="submit" data-id="${escapeHtml(item.id)}">검수 요청</button>` : ""}`
        : "";
      const approveAction = canApproveFanGrowth() && item.status === "pending_review"
        ? `<button class="primary fan-growth-transition" type="button" data-kind="pass" data-action="approve" data-id="${escapeHtml(item.id)}">패스 공개 승인</button>`
        : "";
      return `<tr><td data-label="패스"><strong>${escapeHtml(item.title)}</strong><small>무료 Fan Pass</small></td><td data-label="범위">${escapeHtml(scopeText(item))}</td><td data-label="기간">${formatDate(item.startsAt)}<small>${formatDate(item.endsAt)}</small></td><td data-label="티어">${Number((item.tiers || []).length).toLocaleString()}개</td><td data-label="상태"><span class="badge ${item.status === "published" ? "success-badge" : item.status === "pending_review" ? "warning-badge" : "draft"}">${escapeHtml(fanGrowthStatusLabel(item.status))}</span></td><td data-label="관리"><div class="row-actions">${writeActions}${approveAction}</div></td></tr>`;
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
function releaseQueue() {
  const actionable = state.cards.filter((card) => cardNextAction(card));
  if (!actionable.length) return "";
  const items = actionable
    .map((card) => {
      const action = cardNextAction(card);
      return `<button class="release-queue-item" type="button" data-id="${escapeHtml(card.id)}"><span class="badge ${releaseBadgeClass(releaseStatus(card))}">${escapeHtml(releaseStatusLabel(releaseStatus(card)))}</span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(nextActionLabel(action))} · v${Number(card.reviewVersion || 0)}</small></button>`;
    })
    .join("");
  return `<section class="panel release-queue"><div class="panel-heading"><div><p class="eyebrow">RELEASE REVIEW</p><h2>검수 대기열</h2></div></div><div class="release-queue-list">${items}</div></section>`;
}
function cardRows(cards) {
  if (!cards.length)
    return '<tr><td colspan="6" class="empty">조건에 맞는 카드가 없습니다.</td></tr>';
  return cards
    .map((card) => {
      const action = `<button class="icon-button review-card" type="button" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.name)} 상세 보기">${icon("more_horiz")}</button>`;
      const catalogArtist = state.catalog.artists.find(
        (artist) => artist.id === card.artistId,
      );
      return `<tr><td data-label="카드"><div class="card-cell"><span class="card-thumb">${icon("style")}</span><div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.seasonName || card.id)}</small></div></div></td><td data-label="아티스트">${escapeHtml(catalogArtist?.name || card.ownerArtistId || card.artistId || "미지정")}</td><td data-label="등급"><strong>${escapeHtml(card.rarity || "-")}</strong></td><td data-label="발행 수량">${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "제한 없음"}</td><td data-label="상태"><span class="badge ${releaseBadgeClass(releaseStatus(card))}">${escapeHtml(releaseStatusLabel(releaseStatus(card)))}</span></td><td data-label="관리" class="row-actions">${action}</td></tr>`;
    })
    .join("");
}
function cardBackImageAssetId(card) {
  return card?.backImageAssetId || card?.designConfig?.back?.backImageAssetId || card?.designConfig?.back?.imageAssetId || null;
}

function cardCreatorLabel(card) {
  const creatorId = card?.ownerArtistId || card?.artistId;
  const artist = state.catalog.artists.find((item) => item.id === creatorId);
  return card?.creatorName || artist?.name || card?.ownerArtistId || (card?.artistId ? "아티스트 운영팀" : "Fanfolio 운영팀");
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
  const image = reviewMediaMarkup(card);
  const status = releaseStatus(card);
  const nextAction = cardNextAction(card);
  const policy = card.releasePolicy || (card.rarity === "Special" ? "partner_and_platform" : "partner_only");
  const canReviewPartner = nextAction === "partner_review" && ["company_admin", "manager"].includes(state.adminContext?.accessLevel);
  const canReviewPlatform = nextAction === "platform_review" && can("cards:review_platform");
  const canSubmitReview =
    can("cards:submit_review") &&
    ["draft", "changes_requested"].includes(status);
  const canPrepareDrop = status === "approved" && can("drops:write");
  const canEdit = can("cards:write") && !["pending_partner_review", "pending_platform_review", "drop_ready", "published"].includes(status);
  const editForm = canEdit
    ? `<form class="form edit-card-form" id="admin-card-edit-form" data-id="${escapeHtml(card.id)}"><label class="field">카드명<input name="name" value="${escapeHtml(card.name)}" required /></label><label class="field">시즌<input name="seasonName" value="${escapeHtml(card.seasonName || "")}" placeholder="예: 2026 SUMMER" /></label><label class="field">등급<select name="rarity"><option value="N" ${card.rarity === "N" ? "selected" : ""}>N (노멀)</option><option value="R" ${card.rarity === "R" ? "selected" : ""}>R (레어)</option><option value="SR" ${card.rarity === "SR" ? "selected" : ""}>SR (슈퍼 레어)</option><option value="Special" ${card.rarity === "Special" ? "selected" : ""}>Special</option></select></label><label class="field">발행 수량<input name="issueLimit" type="number" min="1" value="${card.issueLimit || ""}" placeholder="제한 없음" /></label><label class="field">앞면 이미지 교체<input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">선택하지 않으면 기존 이미지를 유지합니다.</span></label><label class="field">뒷면 이미지 교체<input name="backCardImage" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">선택하지 않으면 기본 템플릿 또는 기존 이미지를 유지합니다.</span></label><button class="primary" type="submit">변경 저장</button></form>`
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
  const sideToggle = `<div class="review-side-toggle" role="group" aria-label="카드 면 선택"><button class="${state.reviewSide === "front" ? "active" : ""}" type="button" data-review-side="front">앞면</button><button class="${state.reviewSide === "back" ? "active" : ""}" type="button" data-review-side="back">뒷면</button></div>`;
  return `<div class="panel review-panel"><div class="review-heading"><div><p class="eyebrow">카드 검수</p><h2>${escapeHtml(card.name)}</h2><span class="badge ${releaseBadgeClass(status)}">${escapeHtml(releaseStatusLabel(status))}</span></div><button class="secondary" id="close-review">닫기</button></div><div class="review-content"><div>${sideToggle}${image}</div><dl class="review-meta"><div><dt>제작자</dt><dd>${escapeHtml(cardCreatorLabel(card))}</dd></div><div><dt>시즌</dt><dd>${escapeHtml(card.seasonName || "-")}</dd></div><div><dt>등급</dt><dd>${escapeHtml(card.rarity || "-")}</dd></div><div><dt>발행 수량</dt><dd>${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "-"}</dd></div><div><dt>사인 메시지</dt><dd>${escapeHtml(card.signatureText || "없음")}</dd></div><div><dt>특전</dt><dd>${card.hasVoice ? "보이스 포함" : "보이스 없음"}${card.videoAssetId ? " · 영상 포함" : ""}${card.handwritingAssetId ? " · 손글씨 포함" : ""}</dd></div></dl></div><div class="release-status-grid"><div><span>정책</span><strong>${escapeHtml(releasePolicyLabel(policy))}</strong></div><div><span>검수 버전</span><strong>v${Number(card.reviewVersion || 0)}</strong></div><div><span>다음 작업</span><strong>${escapeHtml(nextActionLabel(nextAction))}</strong></div></div>${releaseSnapshot(card)}${releaseHistory(card)}${editForm}${reviewNote}${reviewActions}</div>`;
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

function batchesView() {
  const published = state.cards.filter((card) => card.status === "published");
  const availableArtists = scopedArtists();
  const artistOptions = [{ value: "", label: "아티스트 선택" }, ...availableArtists.map((artist) => ({ value: artist.id, label: artist.name }))];
  const cardOptions = published.length
    ? published.map((card) => ({ value: card.id, label: card.name }))
    : [{ value: "", label: "공개 카드가 없습니다." }];
  const dropOptions = state.drops.length
    ? state.drops.map((drop) => ({ value: drop.id, label: `${drop.name} · ${drop.status}` }))
    : [{ value: "", label: "먼저 드롭을 만드세요." }];
  const canCreateDrop = can("drops:write") && availableArtists.length;
  const canCreateBatch = can("codes:write") && published.length && state.drops.some((drop) => drop.status === "live");
  return `<div class="page-heading"><div><p class="eyebrow">DROP & REDEEM CODE</p><h2>드롭과 카드 코드를 운영합니다</h2><p>담당 아티스트의 공개 카드에만 코드를 발행하고, 매니저는 초안을 발행 요청으로 전달합니다.</p></div></div><div class="batch-layout"><div class="panel"><h2>새 드롭 만들기</h2><form class="form" id="drop-form"><label class="field">드롭 이름<input name="name" placeholder="예: 2026 봄 컴백" required /></label><label class="field">대상 아티스트${adminSelect({ id: "drop-artist", name: "artistId", value: "", label: "대상 아티스트", className: "form-select", options: artistOptions })}</label><label class="field">시작 시각<input name="startsAt" type="datetime-local" /></label><label class="field">종료 시각<input name="endsAt" type="datetime-local" /></label><button class="primary" type="submit" ${canCreateDrop ? "" : "disabled"}>드롭 초안 생성</button></form><div class="table-wrap"><table class="table"><thead><tr><th>드롭</th><th>상태</th><th>기간</th><th>관리</th></tr></thead><tbody>${dropRows()}</tbody></table></div></div><div class="panel"><h2>새 코드 배치 만들기</h2><form class="form" id="batch-form"><label class="field">카드 선택${adminSelect({ id: "batch-card", name: "cardId", value: cardOptions[0].value, label: "카드 선택", className: "form-select", options: cardOptions })}</label><label class="field">드롭 선택${adminSelect({ id: "batch-drop", name: "dropId", value: dropOptions[0].value, label: "드롭 선택", className: "form-select", options: dropOptions })}</label><label class="field">생성 수량<input name="quantity" type="number" min="1" value="1000" required /></label><label class="field">코드 최대 사용 횟수<input name="maxUsesPerCode" type="number" min="1" value="1" required /></label><label class="field">만료 시각<input name="expiresAt" type="datetime-local" required /></label><label class="field">코드 접두사<input name="prefix" value="FANFOLIO" maxlength="30" required /></label><button class="primary" type="submit" ${canCreateBatch ? "" : "disabled"}>코드 배치 생성</button></form>${state.batch ? `<div class="notice success">배치 ${escapeHtml(state.batch.id)}가 생성되었습니다. <button class="text-link" id="download-csv">CSV 다운로드</button> <button class="text-link" id="download-qr-zip">QR ZIP 다운로드</button></div>` : ""}</div></div>${codeBatchPanel()}<div class="panel"><h2>생성된 코드 배치</h2><p class="hint">코드 수와 실제 사용 수를 확인하고 필요한 파일을 다시 내려받을 수 있습니다.</p><div class="table-wrap"><table class="table"><thead><tr><th>배치</th><th>생성 수</th><th>사용 수</th><th>만료</th><th>다운로드</th><th>관리</th></tr></thead><tbody>${batchRows()}</tbody></table></div></div>`;
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
  return `<div class="panel"><div class="review-heading"><div><p class="eyebrow">개별 코드 관리</p><h2>${escapeHtml(selected.batchId)}</h2><p class="hint">코드가 유출되거나 훼손된 경우 해당 코드만 비활성화할 수 있습니다.</p></div><button class="secondary" id="close-code-batch">닫기</button></div><div class="table-wrap"><table class="table"><thead><tr><th>코드</th><th>상태</th><th>사용</th><th>만료</th><th>관리</th></tr></thead><tbody>${selected.items.length ? selected.items.map((code) => `<tr><td><code>${escapeHtml(code.code)}</code></td><td><span class="badge ${code.status !== "active" ? "draft" : ""}">${escapeHtml(codeStatusLabel(code.status))}</span></td><td>${code.usedCount}/${code.maxUses}</td><td>${code.expiresAt ? escapeHtml(new Date(code.expiresAt).toLocaleDateString("ko-KR")) : "-"}</td><td>${code.status === "active" ? `<button class="secondary disable-code" data-code="${escapeHtml(code.code)}">비활성화</button>` : '<span class="eyebrow">변경 불가</span>'}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">표시할 코드가 없습니다.</td></tr>'}</tbody></table></div><p class="hint">전체 ${Number(selected.total).toLocaleString()}개 중 ${selected.items.length}개를 표시합니다.</p></div>`;
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
  return `<div class="page-heading"><div><p class="eyebrow">SERVICE USERS</p><h2>서비스 사용자</h2><p>팬·아티스트 계정 상태와 서비스 역할을 관리합니다.</p></div></div><section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="user-search" placeholder="이메일 검색" value="${escapeHtml(state.userQuery)}" /></label>${adminSelect({ id: "user-role-filter", value: state.userRole, label: "사용자 역할 필터", className: "filter-select user-role-filter", options: roleOptions })}<button class="secondary" id="user-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>사용자</th><th>닉네임</th><th>온보딩</th><th>역할</th></tr></thead><tbody>${userRows()}</tbody></table></div>${userPagination()}</section>`;
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
  const oneTimePassword = account
    ? `<div class="notice"><strong>${account.wasReset ? "비밀번호 재발급 완료" : "계정 발급 완료"} · ${escapeHtml(account.username)}</strong><br />임시 비밀번호: <code>${escapeHtml(account.temporaryPassword)}</code><br /><small>평문 비밀번호는 지금만 표시됩니다. 담당자에게 안전한 경로로 전달하세요.</small></div>`
    : "";
  return `<div class="panel"><h2>아티스트 스튜디오 계정 발급</h2><p class="hint">개인별 아이디를 발급하세요. 임시 비밀번호는 생성 직후 한 번만 표시됩니다.</p><form id="artist-account-form" class="toolbar"><input class="search" name="username" placeholder="studio-id" pattern="[A-Za-z0-9._-]+" required /><input class="search" name="displayName" placeholder="담당자 또는 기업명" required /><button class="primary" type="submit">계정 발급</button></form>${oneTimePassword}<h2 class="subsection-title">아티스트 스튜디오 계정 목록</h2><p class="hint">계정은 데이터베이스에 유지됩니다. 비밀번호를 잊은 경우 계정을 다시 만들지 말고 재발급하세요.</p><div class="table-wrap"><table class="table"><thead><tr><th>계정</th><th>상태</th><th>복구</th></tr></thead><tbody>${artistAccountRows()}</tbody></table></div></div>`;
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
    return '<tr><td colspan="4" class="empty">사용자가 없습니다.</td></tr>';
  return state.users
    .map((user) => {
      const roleControl = `<div class="role-cell">${accessRoleBadge(user.role, user.isCurrentUser)}${user.isCurrentUser ? "" : `<button class="role-edit-action" type="button" data-edit-user-role="${escapeHtml(user.id)}">${icon("edit")} 권한 변경</button>`}</div>`;
      return `<tr><td><strong>${escapeHtml(user.email)}</strong><small>${escapeHtml(user.id)}</small></td><td>${escapeHtml(user.nickname || "-")}</td><td>${user.onboardingCompleted ? "완료" : "미완료"}</td><td>${roleControl}</td></tr>`;
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
  const cards = state.cards
    .map(
      (card) =>
        `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)} · ${escapeHtml(card.id)}</option>`,
    )
    .join("");
  const rows = state.campaigns.length
    ? state.campaigns
        .map(
          (campaign) =>
            `<tr><td><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.id)}</small></td><td>${escapeHtml(campaign.requiredCardIds.join(", "))}</td><td>${escapeHtml(campaign.benefitTitle)}${campaign.benefitDownloadAvailable ? " · 파일 있음" : ""}</td><td><span class="badge ${campaign.status === "active" ? "" : "draft"}">${campaign.status === "active" ? "활성" : "비활성"}</span></td><td><button class="secondary campaign-status" data-id="${escapeHtml(campaign.id)}" data-status="${campaign.status === "active" ? "disabled" : "active"}">${campaign.status === "active" ? "비활성화" : "활성화"}</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty">등록된 특전 캠페인이 없습니다.</td></tr>';
  return `<div class="panel campaign-panel"><h2>컬렉션 특전 캠페인</h2><p class="hint">공개 카드 중 조합할 카드를 선택하고 완성 특전 내용을 설정합니다. 선택한 파일은 팬이 클레임한 뒤 다운로드할 수 있습니다.</p><form class="toolbar" id="campaign-form"><input class="search" name="name" placeholder="캠페인 이름" required /><input class="search" name="seasonName" placeholder="시즌 (선택)" /><select class="filter" name="artistId"><option value="">그룹 없음</option>${state.catalog.artists.map((artist) => `<option value="${escapeHtml(artist.id)}">${escapeHtml(artist.name)}</option>`).join("")}</select><select class="filter" name="requiredCardIds" multiple aria-label="캠페인 카드 선택">${cards}</select><input class="search" name="benefitTitle" placeholder="특전 제목" required /><input class="search" name="benefitDescription" placeholder="특전 설명" required /><label class="field">특전 파일 (선택)<input class="search" name="benefitFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,audio/mpeg,audio/wav" /></label><button class="primary" type="submit">캠페인 등록</button></form><div class="table-wrap"><table class="table"><thead><tr><th>캠페인</th><th>필수 카드</th><th>특전</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function settingsView() {
  return "";
}
function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}
async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Fanfolio-Client": "admin" },
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
async function api(path, options = {}, allowRefresh = true) {
  const headers = {
    "Content-Type": "application/json",
    "X-Fanfolio-Client": "admin",
    ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {
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
    throw error;
  }
  return response.status === 204 ? null : response.json();
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
    const [dashboard, cards, auditLogs, catalog, notifications] = await Promise.all([
      api("/admin/dashboard"),
      api("/admin/cards"),
      api(`/admin/audit-logs?${auditParams}`),
      api("/admin/catalog"),
      api("/admin/notifications"),
    ]);
    state.metrics = dashboard.data.metrics;
    state.recentActivity = dashboard.data.recentActivity || [];
    state.cards = cards.data.items;
    state.auditLogs = auditLogs.data.items;
    state.auditPagination = auditLogs.data.meta.pagination;
    state.catalog = catalog.data;
    state.notifications = notifications.data.items || [];
    state.unreadNotificationCount = notifications.data.unreadCount || 0;
    await loadFanGrowth(false);

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
          api("/admin/drops"),
          api("/admin/redeem-code-batches"),
          api(`/admin/users?${userParams}`),
          api("/admin/collection-campaigns"),
          api("/admin/artist-accounts"),
          api("/admin/artist-profiles"),
        ]);
      state.drops = drops.data.items;
      state.batches = batches.data.items;
      state.users = users.data.items;
      state.userPagination = users.data.meta.pagination;
      state.campaigns = campaigns.data.items;
      state.artistAccounts = artistAccounts.data.items;
      state.artistProfiles = artistProfiles.data.items;
      state.artistProfilesLoaded = true;
      await loadOrganizations(false);
    } else {
      const dropsRequest = can("drops:read")
        ? api("/admin/drops")
        : Promise.resolve({ data: { items: [] } });
      const batchesRequest = can("codes:read")
        ? api("/admin/redeem-code-batches")
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
  } catch (error) {
    if (error.status === 401) {
      ACCESS_TOKEN = "";
      state.authenticated = false;
      state.adminContext = null;
      state.loginError = "관리자 권한이 필요한 세션입니다.";
    } else if (error.status === 403) {
      state.error = "현재 관리자 권한으로 접근할 수 없는 작업입니다.";
    } else {
      state.error =
        "관리자 API에 연결하지 못했습니다. 관리자 세션과 API 서버를 확인해 주세요.";
    }
  }
  layout();
}

async function loadAdminNotifications(renderAfter = true) {
  const result = await api("/admin/notifications");
  state.notifications = result.data.items || [];
  state.unreadNotificationCount = result.data.unreadCount || 0;
  if (renderAfter) layout();
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
    state.artistProvisionedAccount = result.data;
    await loadData();
    toast("아티스트 스튜디오 계정을 발급했습니다.");
  } catch (error) {
    toast(
      error.status === 409
        ? "이미 사용 중인 아이디입니다."
        : "계정 발급에 실패했습니다. 관리자 권한과 입력값을 확인해 주세요.",
    );
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
  if (name === "organization") resetOrganizationLogoState();
  state.drawer = name;
  state.drawerData = data;
  if (name !== "member" && name !== "member-password") state.temporaryCredential = null;
  layout();
  requestAnimationFrame(() =>
    document.querySelector(".drawer input, .drawer select")?.focus(),
  );
}

function closeDrawer() {
  resetOrganizationLogoState();
  state.drawer = null;
  state.drawerData = null;
  state.temporaryCredential = null;
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
    event.target.querySelector('[name="requiredCardIds"]').selectedOptions,
  ).map((option) => option.value);
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
  state.recentActivity = [];
  state.notifications = [];
  state.unreadNotificationCount = 0;
  state.notificationPanelOpen = false;
  state.cards = [];
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
  } catch {
    toast("카드 상세 정보를 불러오지 못했습니다.");
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
async function openNotification(notificationId, cardId) {
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
    await loadAdminNotifications(false);
    if (cardId) await openReview(cardId);
    else layout();
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
  } catch {
    toast("드롭 연결에 실패했습니다. 카드와 드롭 범위를 확인해 주세요.");
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
    await loadData();
    toast("코드 배치를 생성했습니다.");
  } catch {
    toast("코드 배치를 생성하지 못했습니다. 입력값과 권한을 확인해 주세요.");
  }
}
async function openCodeBatch(batchId) {
  try {
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
  if (!form.get("artistId")) {
    toast("드롭을 운영할 아티스트를 선택해 주세요.");
    return;
  }
  try {
    await api("/admin/drops", {
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
    toast("드롭을 생성했습니다.");
  } catch {
    toast("드롭 생성에 실패했습니다. 입력값을 확인해 주세요.");
  }
}
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
  return Array.from(form.querySelectorAll(`[name="${name}"] option:checked`))
    .map((option) => option.value)
    .filter(Boolean);
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

async function saveFanPass(event) {
  event.preventDefault();
  if (!canManageFanGrowth()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const startsAt = data.get("startsAt");
  const endsAt = data.get("endsAt");
  const dateError = form.querySelector("#fan-pass-date-error");
  if (startsAt && endsAt && endsAt <= startsAt) {
    dateError.hidden = false;
    return;
  }
  dateError.hidden = true;
  const tierXp = data.getAll("tierXp");
  const tierReward = data.getAll("tierReward");
  const tiers = tierXp
    .map((xp, index) => ({ tier: index + 1, requiredXp: Number(xp), rewardId: tierReward[index] || null }))
    .filter((tier) => Number.isFinite(tier.requiredXp) && tier.requiredXp > 0)
    .slice(0, maxFanPassTiers);
  try {
    await api("/admin/engagement/pass-seasons", {
      method: "POST",
      body: JSON.stringify({
        title: String(data.get("title") || "").trim(),
        description: String(data.get("description") || "").trim() || null,
        organizationId: data.get("organizationId") || null,
        artistId: data.get("artistId") || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        tiers: tiers.length ? tiers : [{ tier: 1, requiredXp: 1, rewardId: null }],
      }),
    });
    closeDrawer();
    await loadFanGrowth(true);
    toast("무료 팬 패스 초안을 임시 저장했습니다.");
  } catch {
    const errorBox = form.querySelector("#fan-pass-form-error");
    errorBox.textContent = "무료 팬 패스 저장에 실패했습니다. 기간과 티어 값을 확인해 주세요.";
    errorBox.hidden = false;
  }
}

async function transitionFanGrowth(kind, action, id) {
  const endpointKind = kind === "achievement" ? "achievements" : "pass-seasons";
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
  document
    .querySelector("#admin-login-form")
    ?.addEventListener("submit", loginAdmin);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.mobileNavOpen = false;
      state.accountMenuOpen = false;
      layout();
    });
  });
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
      void openNotification(button.dataset.openNotification, button.dataset.cardId),
    ),
  );
  document.querySelector("#account-settings")?.addEventListener("click", () => {
    toast("계정 설정은 관리자 API 연결 후 제공됩니다.");
    closeAccountMenu();
  });
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
  document
    .querySelector("#partner-mobile-select")
    ?.addEventListener("change", (event) =>
      void loadSelectedOrganization(event.currentTarget.value),
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
  document.querySelectorAll(".edit-achievement").forEach((button) =>
    button.addEventListener("click", () => {
      const achievement = state.engagement.achievements.find((item) => item.id === button.dataset.id);
      if (achievement) openDrawer("achievement", { achievement });
    }),
  );
  document.querySelectorAll(".edit-fan-pass").forEach((button) =>
    button.addEventListener("click", () => {
      const season = state.engagement.passSeasons.find((item) => item.id === button.dataset.id);
      if (season) openDrawer("fan-pass", { season });
    }),
  );
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
    .querySelector("#fan-pass-form")
    ?.addEventListener("submit", saveFanPass);
  document
    .querySelector("#achievement-condition")
    ?.addEventListener("change", () => {
      state.drawerData = {
        ...(state.drawerData || {}),
        achievement: {
          ...(state.drawerData?.achievement || {}),
          conditionType: document.querySelector("#achievement-condition").value,
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
  document
    .querySelector("#audit-search-submit")
    ?.addEventListener("click", searchAuditLogs);
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
  document
    .querySelector("#drop-link-form")
    ?.addEventListener("submit", linkApprovedCardToDrop);
  document
    .querySelector('#admin-card-form select[name="artistId"]')
    ?.addEventListener("change", (event) => {
      const artistId = event.currentTarget.value;
      const memberSelect = document.querySelector(
        '#admin-card-form select[name="memberId"]',
      );
      if (!memberSelect) return;
      Array.from(memberSelect.options).forEach((option) => {
        option.hidden = Boolean(
          artistId && option.dataset.artistId !== artistId,
        );
      });
      if (memberSelect.selectedOptions[0]?.hidden) memberSelect.value = "";
    });
  document.querySelector("#card-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    layout();
  });
  document
    .querySelectorAll(".review-card")
    .forEach((button) =>
      button.addEventListener("click", () => openReview(button.dataset.id)),
    );
  document
    .querySelectorAll(".release-queue-item")
    .forEach((button) =>
      button.addEventListener("click", () => openReview(button.dataset.id)),
    );
  document.querySelectorAll("[data-review-side]").forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewSide = button.dataset.reviewSide === "back" ? "back" : "front";
      layout();
    }),
  );
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
  document
    .querySelectorAll(".code-batch")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void openCodeBatch(button.dataset.id),
      ),
    );
  document.querySelector("#close-code-batch")?.addEventListener("click", () => {
    state.codeBatch = null;
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
    trigger.addEventListener("click", () => {
      const control = trigger.closest(".admin-select");
      const isOpen = control.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
      document.querySelectorAll(".admin-select.open").forEach((other) => {
        if (other !== control) other.classList.remove("open");
      });
    });
  });
  document.querySelectorAll(".admin-select-option").forEach((option) =>
    option.addEventListener("click", () => {
      const control = option.closest(".admin-select");
      const previous = control.dataset.value;
      control.dataset.value = option.dataset.value;
      control.querySelector(".admin-select-trigger span").textContent = option.dataset.label;
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
        layout();
      }
      if (control.classList.contains("card-status-filter") && previous !== option.dataset.value) {
        state.status = option.dataset.value;
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
    }),
  );
  document.addEventListener("click", (event) => {
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
  document.onkeydown = (event) => {
    if (event.key === "Escape" && state.accountMenuOpen) {
      closeAccountMenu();
      return;
    }
    if (event.key === "Escape" && state.drawer) closeDrawer();
  };
}
async function restoreAdminSession() {
  try {
    const context = await api("/admin/me");
    state.adminContext = context.data;
    state.authenticated = true;
    state.restoringSession = false;
    await loadData();
  } catch {
    // An absent or expired scoped cookie keeps the login screen visible.
    state.restoringSession = false;
    layout();
  }
}

layout();
void restoreAdminSession();
