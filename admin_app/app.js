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
  metrics: null,
  recentActivity: [],
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

function title() {
  return {
    dashboard: "운영 개요",
    partners: "파트너 관리",
    artists: "아티스트 관리",
    cards: "카드 관리",
    batches: "드롭·코드",
    users: "서비스 사용자",
    audit: "감사 로그",
  }[state.view];
}

function navItems() {
  return [
    { id: "dashboard", label: "개요", icon: "space_dashboard" },
    ...(isRoot()
      ? [{ id: "partners", label: "파트너", icon: "domain" }]
      : []),
    { id: "artists", label: "아티스트", icon: "recent_actors" },
    { id: "cards", label: "카드", icon: "style" },
    ...(isRoot()
      ? [{ id: "batches", label: "드롭·코드", icon: "qr_code_2" }]
      : []),
    ...(isRoot()
      ? [{ id: "users", label: "서비스 사용자", icon: "group" }]
      : []),
    { id: "audit", label: "감사 로그", icon: "history" },
  ];
}

function scopeLabel() {
  if (isRoot()) return "ROOT";
  return state.adminContext?.organization?.name || "파트너";
}

function sessionLoadingView() {
  return `<main class="admin-login"><div class="admin-login-card" role="status" aria-live="polite"><div class="brand-lockup">${icon("auto_awesome_motion")}<span>FANFOLIO</span></div><div class="session-loader" aria-hidden="true"></div><h1>관리자 세션 확인 중</h1><p class="hint">안전한 운영 환경을 준비하고 있습니다.</p></div></main>`;
}
function loginView() {
  const passwordChange = state.mustChangePassword;
  return `<main class="admin-login"><div class="admin-login-card"><div class="brand-lockup">${icon("auto_awesome_motion")}<span>FANFOLIO</span></div><p class="eyebrow">OPERATIONS CONSOLE</p><h1>${passwordChange ? "새 비밀번호 설정" : "관리자 로그인"}</h1><p class="login-copy">${passwordChange ? "최초 발급 비밀번호를 본인만의 비밀번호로 변경해 주세요." : "발급받은 관리자 계정으로 운영 범위에 접속합니다."}</p><form id="admin-login-form" class="form login-form">${passwordChange ? `<label class="field"><span>현재 비밀번호</span><div class="input-with-icon">${icon("lock")}<input id="admin-current-password" type="password" autocomplete="current-password" required /></div></label><label class="field"><span>새 비밀번호</span><div class="input-with-icon">${icon("password")}<input id="admin-new-password" type="password" autocomplete="new-password" minlength="12" placeholder="12자 이상" required /></div></label><button class="primary" type="submit">새 비밀번호 저장</button>` : `<label class="field"><span>관리자 이메일</span><div class="input-with-icon">${icon("mail")}<input id="admin-login-email" type="email" autocomplete="email" placeholder="name@company.com" required /></div></label><label class="field"><span>비밀번호</span><div class="input-with-icon">${icon("lock")}<input id="admin-login-password" type="password" autocomplete="current-password" placeholder="비밀번호 입력" required /></div></label><button class="primary" type="submit">운영 센터 들어가기</button>`}</form>${state.loginError ? `<div class="notice error" role="alert">${escapeHtml(state.loginError)}</div>` : ""}<p class="login-support">계정 발급 또는 접근 문제가 있다면 루트 관리자에게 문의하세요.</p></div></main>`;
}

function navigationView() {
  const person = state.adminContext?.user || {};
  const role = isRoot() ? "루트 관리자" : `${state.adminContext?.accessLevel || "viewer"} · ${scopeLabel()}`;
  return `<aside class="app-nav ${state.mobileNavOpen ? "open" : ""}" aria-label="관리자 주요 메뉴"><div class="nav-brand"><span class="nav-brand-mark">${icon("auto_awesome_motion")}</span><span class="nav-brand-copy"><strong>FANFOLIO</strong><small>OPERATIONS</small></span></div><nav>${navItems()
    .map(
      (item) =>
        `<button type="button" data-view="${item.id}" class="nav-item ${state.view === item.id ? "active" : ""}" aria-current="${state.view === item.id ? "page" : "false"}">${icon(item.icon)}<span>${item.label}</span></button>`,
    )
    .join("")}</nav><div class="nav-account"><span class="account-avatar">${escapeHtml((person.displayName || person.email || "관").slice(0, 1))}</span><div><strong>${escapeHtml(person.displayName || "관리자")}</strong><small>${escapeHtml(role)}</small></div><button class="icon-button" id="logout" type="button" aria-label="로그아웃">${icon("logout")}</button></div></aside>`;
}

function topbarView() {
  const person = state.adminContext?.user || {};
  return `<header class="topbar"><div class="topbar-title"><button class="icon-button mobile-nav-toggle" id="mobile-nav-toggle" type="button" aria-label="메뉴 열기">${icon("menu")}</button><div><p class="eyebrow">FANFOLIO OPERATIONS</p><h1 class="title">${title()}</h1></div></div><div class="top-actions"><span class="scope-chip">${icon(isRoot() ? "shield_person" : "domain")} ${escapeHtml(scopeLabel())}</span><button class="icon-button" type="button" aria-label="알림">${icon("notifications")}</button><span class="top-avatar" title="${escapeHtml(person.email || "")}">${escapeHtml((person.displayName || person.email || "관").slice(0, 1))}</span></div></header>`;
}

function currentView() {
  return {
    dashboard: dashboardView,
    partners: partnersView,
    artists: artistsView,
    cards: cardsView,
    batches: batchesView,
    users: usersView,
    audit: auditView,
  }[state.view]?.() || dashboardView();
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
  app.innerHTML = `<div class="admin-shell ${partnerMode ? "partner-layout partner-directory" : ""}">${navigationView()}${partnerMode ? partnerListColumn() : ""}<main class="workspace ${partnerMode ? "partner-detail" : ""}">${topbarView()}${state.error ? `<div class="notice error" role="alert">${escapeHtml(state.error)}</div>` : ""}<section class="page-content">${currentView()}</section></main></div>${drawerView()}<div class="nav-scrim ${state.mobileNavOpen ? "show" : ""}" id="nav-scrim"></div><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
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
  document
    .querySelectorAll(".review-artist-profile")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void updateArtistProfile(button.dataset.id),
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
              `<button class="partner-list-item ${state.selectedOrganizationId === organization.id ? "active" : ""}" type="button" data-partner-id="${escapeHtml(organization.id)}"><span class="company-avatar">${escapeHtml(organization.name.slice(0, 1))}</span><span class="partner-list-copy"><strong>${escapeHtml(organization.name)}</strong><small>${organization.artistCount} 아티스트 · ${organization.memberCount} 관리자</small></span><span class="status-dot ${organization.status}" aria-label="${organization.status === "active" ? "활성" : "중지"}"></span></button>`,
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
  return `<section class="partner-detail-view"><div class="partner-mobile-selector"><label>파트너 선택<select id="partner-mobile-select">${state.organizations.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === organization.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label></div><header class="partner-hero"><div class="company-avatar large">${escapeHtml(organization.name.slice(0, 1))}</div><div class="partner-identity"><div class="partner-name-row"><h2>${escapeHtml(organization.name)}</h2><span class="badge ${organization.status === "active" ? "success-badge" : "danger-badge"}">${organization.status === "active" ? "운영 중" : "운영 중지"}</span></div><p>${escapeHtml(organization.contactEmail || "대표 담당자 이메일 미등록")}</p><div class="partner-meta"><span>${icon("calendar_month")} ${formatContractDate(organization.contractStartsAt)} – ${formatContractDate(organization.contractEndsAt)}</span><span>${icon("update")} ${formatDate(organization.updatedAt)} 업데이트</span></div></div><div class="partner-hero-actions"><button class="secondary" id="edit-organization" type="button">${icon("edit")} 정보 수정</button><button class="secondary danger-button" id="toggle-organization-status" type="button" data-next-status="${organization.status === "active" ? "suspended" : "active"}">${icon(organization.status === "active" ? "pause_circle" : "play_circle")} ${organization.status === "active" ? "운영 중지" : "다시 활성화"}</button></div></header><nav class="detail-tabs" aria-label="파트너 상세 메뉴">${[
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
  return `<section class="detail-section full"><div class="section-heading"><div><p class="eyebrow">ACCESS CONTROL</p><h3>기업 관리자</h3><p>담당 범위와 읽기·편집 권한을 계정별로 관리합니다.</p></div><button class="primary" id="open-member-drawer" type="button">${icon("person_add")} 관리자 추가</button></div>${
    state.organizationMembers.length
      ? `<div class="table-wrap"><table class="table responsive-table member-table"><thead><tr><th>관리자</th><th>권한</th><th>담당 아티스트</th><th>최근 로그인</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${state.organizationMembers
          .map(
            (member) =>
              `<tr><td data-label="관리자"><div class="person-cell"><span class="person-avatar">${escapeHtml((member.displayName || member.email).slice(0, 1))}</span><div><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(member.email)}</small></div></div></td><td data-label="권한"><select class="compact-select member-role" data-member-id="${escapeHtml(member.id)}" aria-label="${escapeHtml(member.displayName)} 권한"><option value="manager" ${member.accessLevel === "manager" ? "selected" : ""}>매니저</option><option value="editor" ${member.accessLevel === "editor" ? "selected" : ""}>에디터</option><option value="viewer" ${member.accessLevel === "viewer" ? "selected" : ""}>뷰어</option></select></td><td data-label="담당 아티스트"><button class="artist-assignment-trigger" type="button" data-assign-member="${escapeHtml(member.id)}">${member.assignedArtists.length ? member.assignedArtists.map((artist) => `<span>${escapeHtml(artist.name)}</span>`).join("") : "배정 없음"} ${icon("edit")}</button></td><td data-label="최근 로그인">${formatDate(member.lastLoginAt)}</td><td data-label="상태"><span class="badge ${member.status === "active" ? "success-badge" : "danger-badge"}">${member.status === "active" ? "활성" : "중지"}</span></td><td data-label="관리"><button class="icon-button member-status" type="button" data-member-id="${escapeHtml(member.id)}" data-next-status="${member.status === "active" ? "suspended" : "active"}" aria-label="${member.status === "active" ? "계정 중지" : "계정 활성화"}">${icon(member.status === "active" ? "person_off" : "person_check")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="inline-empty">${icon("manage_accounts")}<h4>등록된 기업 관리자가 없습니다.</h4><p>첫 담당자 계정을 발급하고 담당 아티스트를 배정하세요.</p><button class="primary" id="empty-add-member" type="button">관리자 추가</button></div>`
  }</section>`;
}

function partnerArtistsView(organization) {
  const selected = new Set((organization.artists || []).map((artist) => artist.id));
  return `<section class="detail-section full"><div class="section-heading"><div><p class="eyebrow">ARTIST SCOPE</p><h3>소속 아티스트 연결</h3><p>이 기업이 운영할 수 있는 전체 아티스트 범위를 설정합니다.</p></div><button class="primary" id="save-organization-artists" type="button">변경 저장</button></div><div class="artist-assignment-grid">${
    state.catalog.artists.length
      ? state.catalog.artists
          .map(
            (artist) =>
              `<label class="artist-check-card"><input type="checkbox" name="organizationArtist" value="${escapeHtml(artist.id)}" ${selected.has(artist.id) ? "checked" : ""}/><span class="artist-avatar">${artist.imageUrl ? `<img src="${escapeHtml(artist.imageUrl)}" alt="" />` : escapeHtml(artist.name.slice(0, 1))}</span><span><strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.id)}</small></span>${icon("check_circle", "selected-icon")}</label>`,
          )
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
  return `<div class="page-heading with-actions"><div><p class="eyebrow">ARTISTS</p><h2>${isRoot() ? "전체 아티스트 운영" : "담당 아티스트"}</h2><p>${isRoot() ? "아티스트 소속과 스튜디오 계정을 관리합니다." : "배정받은 아티스트와 카드 운영 상태를 확인합니다."}</p></div></div><div class="artist-overview-grid">${
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
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SECURITY LOG</p><h2>감사 로그</h2><p>현재 권한 범위에서 발생한 변경 이력을 확인합니다.</p></div></div><div class="toolbar compact-toolbar"><label class="search-field">${icon("search")}<input id="audit-search" placeholder="행동, 실행자, 대상 검색" value="${escapeHtml(state.auditQuery)}" /></label><select class="filter" id="audit-action-filter" aria-label="감사 로그 행동 필터"><option value="all" ${state.auditAction === "all" ? "selected" : ""}>모든 행동</option><option value="card.published" ${state.auditAction === "card.published" ? "selected" : ""}>카드 공개</option><option value="card.created" ${state.auditAction === "card.created" ? "selected" : ""}>카드 등록</option><option value="organization.updated" ${state.auditAction === "organization.updated" ? "selected" : ""}>파트너 변경</option><option value="organization.member_updated" ${state.auditAction === "organization.member_updated" ? "selected" : ""}>관리자 변경</option></select><button class="secondary" id="audit-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>시각</th><th>행동</th><th>실행자</th><th>대상</th></tr></thead><tbody>${auditRows()}</tbody></table></div>${auditPagination()}</section>`;
}

function drawerView() {
  if (!state.drawer) return "";
  const contents = {
    organization: organizationDrawer,
    member: memberDrawer,
    "artist-assignment": artistAssignmentDrawer,
    "artist-edit": artistEditDrawer,
    "card-create": cardCreateDrawer,
  }[state.drawer]?.();
  if (!contents) return "";
  return `<div class="drawer-backdrop" id="drawer-backdrop"><aside class="drawer ${state.drawer === "card-create" ? "card-create-drawer" : state.drawer === "member" ? "member-drawer" : state.drawer === "artist-assignment" ? "artist-assignment-drawer" : state.drawer === "artist-edit" ? "artist-edit-drawer" : ""}" role="dialog" aria-modal="true" aria-label="작업 패널">${contents}</aside></div>`;
}

function drawerHeader(eyebrow, title, description) {
  return `<header class="drawer-header"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${description}</p></div><button class="icon-button close-drawer" type="button" aria-label="닫기">${icon("close")}</button></header>`;
}

function organizationDrawer() {
  const editing = state.drawerData?.organization;
  return `${drawerHeader("PARTNER", editing ? "파트너 정보 수정" : "새 파트너 등록", "계약 기업의 기본 정보와 운영 기간을 설정합니다.")}<form class="drawer-body form" id="organization-form"><label class="field"><span>기업명</span><input name="name" value="${escapeHtml(editing?.name || "")}" placeholder="예: 스타웨이브 엔터테인먼트" required /></label><label class="field"><span>파트너 코드</span><input name="slug" value="${escapeHtml(editing?.slug || "")}" placeholder="starwave-ent" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><div class="form-grid"><label class="field"><span>대표 담당자</span><input name="contactName" value="${escapeHtml(editing?.contactName || "")}" placeholder="홍길동" /></label><label class="field"><span>담당자 이메일</span><input name="contactEmail" type="email" value="${escapeHtml(editing?.contactEmail || "")}" placeholder="manager@company.com" /></label></div><div class="form-grid"><label class="field"><span>계약 시작일</span><input name="contractStartsAt" type="date" value="${editing?.contractStartsAt?.slice(0, 10) || ""}" /></label><label class="field"><span>계약 종료일</span><input name="contractEndsAt" type="date" value="${editing?.contractEndsAt?.slice(0, 10) || ""}" /></label></div><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">${editing ? "변경 저장" : "파트너 등록"}</button></footer></form>`;
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

function memberDrawer() {
  const organization = state.selectedOrganization;
  const artists = organization?.artists || [];
  return `${drawerHeader("ACCESS", "기업 관리자 추가", `${organization?.name || "파트너"} 운영 담당자 계정을 발급합니다.`)}<div class="drawer-body">${temporaryCredentialPanel()}<form class="form" id="organization-member-form"><label class="field"><span>담당자 이름</span><input name="displayName" placeholder="담당자 이름" required /></label><label class="field"><span>로그인 이메일</span><input name="email" type="email" placeholder="manager@company.com" required /></label><label class="field"><span>권한</span><select name="accessLevel"><option value="manager">매니저 · 편집 및 검수 요청</option><option value="editor">에디터 · 콘텐츠 편집</option><option value="viewer">뷰어 · 읽기 전용</option></select></label><fieldset class="checkbox-fieldset"><legend>담당 아티스트</legend>${artists.length ? artists.map((artist) => `<label><input type="checkbox" name="artistIds" value="${escapeHtml(artist.id)}"/><span>${escapeHtml(artist.name)}</span></label>`).join("") : `<p class="hint">먼저 파트너의 아티스트를 연결해 주세요.</p>`}</fieldset><footer class="drawer-footer"><button class="secondary close-drawer" type="button">취소</button><button class="primary" type="submit">계정 발급</button></footer></form></div>`;
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

function cardsView() {
  const artists = scopedArtists();
  const visible = state.cards.filter(
    (card) =>
      `${card.name}${card.ownerArtistId}${card.rarity}`
        .toLowerCase()
        .includes(state.query.toLowerCase()) &&
      (state.cardArtist === "all" ||
        card.ownerArtistId === state.cardArtist ||
        card.artistId === state.cardArtist) &&
      (state.status === "all" || card.status === state.status),
  );
  return `<div class="page-heading with-actions"><div><p class="eyebrow">CARD LIBRARY</p><h2>${isRoot() ? "전체 카드 운영" : "담당 카드 운영"}</h2><p>${isRoot() ? "아티스트 카드의 검수와 공개 상태를 관리합니다." : "배정된 아티스트의 카드 초안을 만들고 검수를 요청합니다."}</p></div>${can("cards:write") ? `<button class="primary" id="open-card-drawer" type="button">${icon("add_card")} 카드 등록</button>` : ""}</div>${reviewPanel()}<section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="card-search" placeholder="카드명, 아티스트 검색" value="${escapeHtml(state.query)}" /></label><select class="filter" id="card-artist-filter" aria-label="아티스트 필터"><option value="all" ${state.cardArtist === "all" ? "selected" : ""}>모든 아티스트</option>${artists.map((artist) => `<option value="${escapeHtml(artist.id)}" ${state.cardArtist === artist.id ? "selected" : ""}>${escapeHtml(artist.name)}</option>`).join("")}</select><select class="filter" id="card-status"><option value="all" ${state.status === "all" ? "selected" : ""}>모든 상태</option><option value="published" ${state.status === "published" ? "selected" : ""}>공개됨</option><option value="draft" ${state.status === "draft" ? "selected" : ""}>초안</option><option value="pending_review" ${state.status === "pending_review" ? "selected" : ""}>검수 중</option><option value="approved" ${state.status === "approved" ? "selected" : ""}>공개 승인</option><option value="changes_requested" ${state.status === "changes_requested" ? "selected" : ""}>수정 요청</option></select></div><div class="table-wrap"><table class="table responsive-table card-table"><thead><tr><th>카드</th><th>아티스트</th><th>등급</th><th>발행 수량</th><th>상태</th><th><span class="sr-only">관리</span></th></tr></thead><tbody>${cardRows(visible)}</tbody></table></div></section>`;
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
function cardRows(cards) {
  if (!cards.length)
    return '<tr><td colspan="6" class="empty">조건에 맞는 카드가 없습니다.</td></tr>';
  return cards
    .map((card) => {
      const canPublishCard = can("cards:publish") && card.status !== "published";
      const action = `<button class="icon-button review-card" type="button" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.name)} 상세 보기">${icon("more_horiz")}</button>${canPublishCard && (card.status === "approved" || (card.status === "draft" && !card.ownerArtistId)) ? `<button class="secondary publish" data-id="${escapeHtml(card.id)}">공개</button>` : ""}`;
      const catalogArtist = state.catalog.artists.find(
        (artist) => artist.id === card.artistId,
      );
      return `<tr><td data-label="카드"><div class="card-cell"><span class="card-thumb">${icon("style")}</span><div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.seasonName || card.id)}</small></div></div></td><td data-label="아티스트">${escapeHtml(catalogArtist?.name || card.ownerArtistId || card.artistId || "미지정")}</td><td data-label="등급"><strong>${escapeHtml(card.rarity || "-")}</strong></td><td data-label="발행 수량">${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "제한 없음"}</td><td data-label="상태"><span class="badge ${card.status === "published" ? "success-badge" : card.status === "changes_requested" ? "danger-badge" : "warning-badge"}">${escapeHtml(statusLabel(card.status))}</span></td><td data-label="관리" class="row-actions">${action}</td></tr>`;
    })
    .join("");
}
function reviewPanel() {
  const card = state.reviewCard;
  if (!card) return "";
  const image = state.reviewImageSrc
    ? `<img class="review-image" src="${escapeHtml(state.reviewImageSrc)}" alt="${escapeHtml(card.name)} 미리보기" />`
    : '<div class="review-image empty">미리보기를 불러오지 못했습니다.</div>';
  const canReview = can("cards:review") && card.status === "pending_review";
  const canSubmitReview =
    can("cards:submit_review") &&
    ["draft", "changes_requested"].includes(card.status);
  const canPublish =
    can("cards:publish") &&
    (card.status === "approved" ||
      (card.status === "draft" && !card.ownerArtistId));
  const canEdit = can("cards:write") && card.status !== "published";
  const editForm = canEdit
    ? `<form class="form edit-card-form" id="admin-card-edit-form" data-id="${escapeHtml(card.id)}"><label class="field">카드명<input name="name" value="${escapeHtml(card.name)}" required /></label><label class="field">시즌<input name="seasonName" value="${escapeHtml(card.seasonName || "")}" placeholder="예: 2026 SUMMER" /></label><label class="field">등급<select name="rarity"><option value="N" ${card.rarity === "N" ? "selected" : ""}>N (노멀)</option><option value="R" ${card.rarity === "R" ? "selected" : ""}>R (레어)</option><option value="SR" ${card.rarity === "SR" ? "selected" : ""}>SR (슈퍼 레어)</option><option value="Special" ${card.rarity === "Special" ? "selected" : ""}>Special</option></select></label><label class="field">발행 수량<input name="issueLimit" type="number" min="1" value="${card.issueLimit || ""}" placeholder="제한 없음" /></label><label class="field">카드 이미지 교체<input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" /><span class="hint">선택하지 않으면 기존 이미지를 유지합니다.</span></label><button class="primary" type="submit">변경 저장</button></form>`
    : "";
  const reviewNote =
    canReview || canSubmitReview
      ? `<label class="field review-note">검수 메모<textarea id="review-note" maxlength="500" placeholder="${canSubmitReview ? "루트 관리자에게 전달할 확인 사항을 입력하세요." : "수정 요청 또는 승인 사유를 입력하세요."}">${escapeHtml(card.reviewNote || "")}</textarea></label>`
      : "";
  const reviewActions = canReview
    ? '<div class="review-actions"><button class="secondary review-decision" data-id="' +
      escapeHtml(card.id) +
      '" data-decision="request_changes">수정 요청</button><button class="primary review-decision" data-id="' +
      escapeHtml(card.id) +
      '" data-decision="approve">검수 승인</button></div>'
    : canSubmitReview
      ? `<div class="notice">검수를 요청하면 루트 관리자가 확인하기 전까지 카드가 잠깁니다.</div><div class="review-actions"><button class="primary submit-review-request" data-id="${escapeHtml(card.id)}">검수 요청하기</button></div>`
      : canPublish
        ? '<div class="notice success">검수가 승인되었습니다. 공개하기를 누르면 팬에게 카드가 노출됩니다.</div><div class="review-actions"><button class="primary review-publish" data-id="' +
          escapeHtml(card.id) +
          '">공개하기</button></div>'
        : "";
  return `<div class="panel review-panel"><div class="review-heading"><div><p class="eyebrow">카드 검수</p><h2>${escapeHtml(card.name)}</h2><span class="badge">${escapeHtml(statusLabel(card.status))}</span></div><button class="secondary" id="close-review">닫기</button></div><div class="review-content"><div>${image}</div><dl class="review-meta"><div><dt>제작자</dt><dd>${escapeHtml(card.ownerArtistId || "-")}</dd></div><div><dt>시즌</dt><dd>${escapeHtml(card.seasonName || "-")}</dd></div><div><dt>등급</dt><dd>${escapeHtml(card.rarity || "-")}</dd></div><div><dt>발행 수량</dt><dd>${card.issueLimit ? Number(card.issueLimit).toLocaleString() : "-"}</dd></div><div><dt>사인 메시지</dt><dd>${escapeHtml(card.signatureText || "없음")}</dd></div><div><dt>특전</dt><dd>${card.hasVoice ? "보이스 포함" : "보이스 없음"}${card.handwritingAssetId ? " · 손글씨 포함" : ""}</dd></div></dl></div>${editForm}${reviewNote}${reviewActions}</div>`;
}

function batchesView() {
  const published = state.cards.filter((card) => card.status === "published");
  const dropOptions = state.drops
    .map(
      (drop) =>
        `<option value="${escapeHtml(drop.id)}">${escapeHtml(drop.name)} · ${escapeHtml(drop.status)}</option>`,
    )
    .join("");
  return `<div class="batch-layout"><div class="panel"><h2>새 드롭 만들기</h2><form class="form" id="drop-form"><label class="field">드롭 이름<input name="name" placeholder="예: 2026 봄 컴백" required /></label><label class="field">시작 시각<input name="startsAt" type="datetime-local" /></label><label class="field">종료 시각<input name="endsAt" type="datetime-local" /></label><button class="primary" type="submit">드롭 생성</button></form><div class="table-wrap"><table class="table"><thead><tr><th>드롭</th><th>상태</th><th>기간</th><th>관리</th></tr></thead><tbody>${dropRows()}</tbody></table></div></div><div class="panel"><h2>새 코드 배치 만들기</h2><form class="form" id="batch-form"><label class="field">카드 선택<select name="cardId" required>${published.length ? published.map((card) => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)}</option>`).join("") : '<option value="">공개 카드가 없습니다.</option>'}</select></label><label class="field">드롭 선택<select name="dropId" required>${dropOptions || '<option value="">먼저 드롭을 만드세요.</option>'}</select></label><label class="field">생성 수량<input name="quantity" type="number" min="1" value="1000" required /></label><label class="field">코드 최대 사용 횟수<input name="maxUsesPerCode" type="number" min="1" value="1" required /></label><label class="field">만료 시각<input name="expiresAt" type="datetime-local" required /></label><label class="field">코드 접두사<input name="prefix" value="FANFOLIO" maxlength="30" required /></label><button class="primary" type="submit" ${published.length && state.drops.some((drop) => drop.status === "live") ? "" : "disabled"}>코드 배치 생성</button></form>${state.batch ? `<div class="notice success">배치 ${escapeHtml(state.batch.id)}가 생성되었습니다. <button class="text-link" id="download-csv">CSV 다운로드</button> <button class="text-link" id="download-qr-zip">QR ZIP 다운로드</button></div>` : ""}</div></div>${codeBatchPanel()}<div class="panel"><h2>생성된 코드 배치</h2><p class="hint">코드 수와 실제 사용 수를 확인하고 필요한 파일을 다시 내려받을 수 있습니다.</p><div class="table-wrap"><table class="table"><thead><tr><th>배치</th><th>생성 수</th><th>사용 수</th><th>만료</th><th>다운로드</th><th>관리</th></tr></thead><tbody>${batchRows()}</tbody></table></div></div>`;
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
      const action =
        drop.status === "live"
          ? `<button class="secondary drop-status" data-id="${escapeHtml(drop.id)}" data-status="ended">종료하기</button>`
          : drop.status === "ended"
            ? '<span class="eyebrow">종료됨</span>'
            : `<button class="secondary drop-status" data-id="${escapeHtml(drop.id)}" data-status="live">활성화</button>`;
      return `<tr><td>${escapeHtml(drop.name)}</td><td><span class="badge ${drop.status === "live" ? "" : "draft"}">${escapeHtml(drop.status)}</span></td><td>${escapeHtml(drop.startsAt ? new Date(drop.startsAt).toLocaleDateString("ko-KR") : "-")} ~ ${escapeHtml(drop.endsAt ? new Date(drop.endsAt).toLocaleDateString("ko-KR") : "-")}</td><td>${action}</td></tr>`;
    })
    .join("");
}
function usersView() {
  return `<div class="page-heading"><div><p class="eyebrow">SERVICE USERS</p><h2>서비스 사용자</h2><p>팬·아티스트 계정 상태와 서비스 역할을 관리합니다.</p></div></div><section class="panel"><div class="toolbar compact-toolbar"><label class="search-field grow">${icon("search")}<input id="user-search" placeholder="이메일 검색" value="${escapeHtml(state.userQuery)}" /></label><select class="filter" id="user-role-filter" aria-label="사용자 역할 필터"><option value="all" ${state.userRole === "all" ? "selected" : ""}>모든 역할</option><option value="fan" ${state.userRole === "fan" ? "selected" : ""}>팬</option><option value="artist" ${state.userRole === "artist" ? "selected" : ""}>아티스트</option><option value="admin" ${state.userRole === "admin" ? "selected" : ""}>관리자</option></select><button class="secondary" id="user-search-submit">검색</button></div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>사용자</th><th>닉네임</th><th>온보딩</th><th>역할</th></tr></thead><tbody>${userRows()}</tbody></table></div>${userPagination()}</section>`;
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
      const artists = state.catalog.artists
        .map(
          (artist) =>
            `<option value="${escapeHtml(artist.id)}" ${artist.id === profile.artistId ? "selected" : ""}>${escapeHtml(artist.name)}</option>`,
        )
        .join("");
      return `<tr><td><strong>${escapeHtml(profile.email)}</strong><small>${escapeHtml(profile.userId)}</small></td><td>${escapeHtml(profile.nickname || "-")}</td><td><select class="artist-profile-artist" data-id="${escapeHtml(profile.userId)}">${artists}</select></td><td><span class="badge ${profile.verificationStatus === "verified" ? "" : "draft"}">${escapeHtml(artistProfileStatusLabel(profile.verificationStatus))}</span></td><td><select class="artist-profile-status" data-id="${escapeHtml(profile.userId)}"><option value="pending" ${profile.verificationStatus === "pending" ? "selected" : ""}>검수 대기</option><option value="verified" ${profile.verificationStatus === "verified" ? "selected" : ""}>승인</option><option value="rejected" ${profile.verificationStatus === "rejected" ? "selected" : ""}>반려</option></select><button class="secondary review-artist-profile" data-id="${escapeHtml(profile.userId)}">저장</button></td></tr>`;
    })
    .join("");
}
function artistProfilesPanel() {
  return `<div class="panel"><h2>아티스트 소속 검수</h2><p class="hint">아티스트가 카드에 연결할 수 있는 그룹을 지정하고 검수 상태를 관리합니다. 승인된 계정만 해당 그룹의 카탈로그를 사용할 수 있습니다.</p><div class="table-wrap"><table class="table"><thead><tr><th>계정</th><th>닉네임</th><th>소속 그룹</th><th>현재 상태</th><th>검수 처리</th></tr></thead><tbody>${artistProfileRows()}</tbody></table></div></div>`;
}
function userRows() {
  if (!state.users.length)
    return '<tr><td colspan="4" class="empty">사용자가 없습니다.</td></tr>';
  return state.users
    .map((user) => {
      const roleControl = user.isCurrentUser
        ? '<span class="badge draft">현재 세션</span>'
        : `<select class="role-change" data-id="${escapeHtml(user.id)}"><option value="fan" ${user.role === "fan" ? "selected" : ""}>팬</option><option value="artist" ${user.role === "artist" ? "selected" : ""}>아티스트</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>관리자</option></select>`;
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
    const error = new Error(`API ${response.status}`);
    error.status = response.status;
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
    if (!isRoot() && ["partners", "batches", "users"].includes(state.view)) {
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
    const [dashboard, cards, auditLogs, catalog] = await Promise.all([
      api("/admin/dashboard"),
      api("/admin/cards"),
      api(`/admin/audit-logs?${auditParams}`),
      api("/admin/catalog"),
    ]);
    state.metrics = dashboard.data.metrics;
    state.recentActivity = dashboard.data.recentActivity || [];
    state.cards = cards.data.items;
    state.auditLogs = auditLogs.data.items;
    state.auditPagination = auditLogs.data.meta.pagination;
    state.catalog = catalog.data;

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
      state.drops = [];
      state.batches = [];
      state.users = [];
      state.campaigns = [];
      state.artistAccounts = [];
      state.artistProfiles = [];
      state.artistProfilesLoaded = false;
      state.organizations = [];
      state.selectedOrganizationId = "";
      state.selectedOrganization = null;
      state.organizationMembers = [];
    }
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
  state.drawer = name;
  state.drawerData = data;
  if (name !== "member") state.temporaryCredential = null;
  layout();
  requestAnimationFrame(() =>
    document.querySelector(".drawer input, .drawer select")?.focus(),
  );
}

function closeDrawer() {
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
    name: form.get("name"),
    slug: form.get("slug"),
    contactName: form.get("contactName") || null,
    contactEmail: form.get("contactEmail") || null,
    contractStartsAt: form.get("contractStartsAt")
      ? `${form.get("contractStartsAt")}T00:00:00.000Z`
      : null,
    contractEndsAt: form.get("contractEndsAt")
      ? `${form.get("contractEndsAt")}T23:59:59.999Z`
      : null,
  };
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api(
      editing
        ? `/admin/organizations/${encodeURIComponent(editing.id)}`
        : "/admin/organizations",
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
    state.selectedOrganizationId = result.data.id;
    state.drawer = null;
    state.drawerData = null;
    await loadOrganizations(false);
    toast(editing ? "파트너 정보를 저장했습니다." : "파트너를 등록했습니다.");
    layout();
  } catch (error) {
    submit.disabled = false;
    toast(
      error.status === 409
        ? "이미 사용 중인 파트너 코드입니다."
        : "파트너 정보를 저장하지 못했습니다.",
    );
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
  state.userRole = document.querySelector("#user-role-filter").value;
  state.userPage = 1;
  void loadData();
}
function changeUserPage(page) {
  state.userPage = Number(page);
  void loadData();
}
function searchAuditLogs() {
  state.auditQuery = document.querySelector("#audit-search").value.trim();
  state.auditAction = document.querySelector("#audit-action-filter").value;
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
async function publishCard(cardId) {
  try {
    await api(`/admin/cards/${cardId}/publish`, { method: "POST", body: "{}" });
    state.reviewCard = null;
    if (state.reviewImageSrc) URL.revokeObjectURL(state.reviewImageSrc);
    state.reviewImageSrc = "";
    await loadData();
    toast("카드를 공개했습니다.");
  } catch {
    toast("카드 공개에 실패했습니다.");
  }
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
    state.reviewImageSrc = "";
    const imageUrl = result.data.previewImageUrl || result.data.sourceImageUrl;
    if (imageUrl) {
      const response = await fetch(
        `${API_BASE}${imageUrl.replace(/^\/api/, "")}`,
        {
          credentials: "include",
          headers: {
            "X-Fanfolio-Client": "admin",
            ...(ACCESS_TOKEN
              ? { Authorization: `Bearer ${ACCESS_TOKEN}` }
              : {}),
          },
        },
      );
      if (response.ok)
        state.reviewImageSrc = URL.createObjectURL(await response.blob());
    }
    state.view = "cards";
    layout();
  } catch {
    toast("카드 상세 정보를 불러오지 못했습니다.");
  }
}
async function submitReview(cardId, decision) {
  const note = document.querySelector("#review-note")?.value.trim() || null;
  try {
    await api(`/admin/cards/${cardId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
    if (decision === "approve") await openReview(cardId);
    else {
      state.reviewCard = null;
      await loadData();
    }
    toast(
      decision === "approve"
        ? "검수를 승인했습니다."
        : "아티스트에게 수정 요청을 보냈습니다.",
    );
  } catch {
    toast("검수 처리에 실패했습니다. 카드 상태를 확인해 주세요.");
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
async function createBatch(event) {
  event.preventDefault();
  const form = new FormData(event.target);
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
  try {
    await api("/admin/drops", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
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
async function updateArtistProfile(userId) {
  const artistId = document.querySelector(
    `.artist-profile-artist[data-id="${CSS.escape(userId)}"]`,
  )?.value;
  const verificationStatus = document.querySelector(
    `.artist-profile-status[data-id="${CSS.escape(userId)}"]`,
  )?.value;
  try {
    await api(`/admin/artist-profiles/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ artistId, verificationStatus }),
    });
    state.artistProfilesLoaded = false;
    await loadArtistProfiles();
    toast("아티스트 소속 검수 상태를 저장했습니다.");
  } catch {
    toast("아티스트 소속 검수에 실패했습니다. 그룹과 상태를 확인해 주세요.");
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
      layout();
    });
  });
  document.querySelector("#mobile-nav-toggle")?.addEventListener("click", () => {
    state.mobileNavOpen = !state.mobileNavOpen;
    layout();
  });
  document.querySelector("#nav-scrim")?.addEventListener("click", () => {
    state.mobileNavOpen = false;
    layout();
  });

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
  document.querySelectorAll(".member-role").forEach((select) =>
    select.addEventListener("change", () =>
      void updateOrganizationMember(
        select.dataset.memberId,
        { accessLevel: select.value },
        "관리자 권한을 저장했습니다.",
      ),
    ),
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
  document.querySelectorAll(".close-drawer").forEach((button) =>
    button.addEventListener("click", closeDrawer),
  );
  document.querySelector("#drawer-backdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "drawer-backdrop") closeDrawer();
  });
  document
    .querySelector("#organization-form")
    ?.addEventListener("submit", saveOrganization);
  document
    .querySelector("#artist-edit-form")
    ?.addEventListener("submit", saveArtist);
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
    .querySelector("#user-role-filter")
    ?.addEventListener("change", searchUsers);
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
    .querySelector("#audit-action-filter")
    ?.addEventListener("change", searchAuditLogs);
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
  document.querySelector("#logout")?.addEventListener("click", async () => {
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
    state.loginError = "";
    layout();
  });
  document
    .querySelector("#admin-card-form")
    ?.addEventListener("submit", createAdminCard);
  document
    .querySelector("#admin-card-edit-form")
    ?.addEventListener("submit", updateAdminCard);
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
    .querySelector("#card-artist-filter")
    ?.addEventListener("change", (event) => {
      state.cardArtist = event.target.value;
      layout();
    });
  document
    .querySelector("#card-status")
    ?.addEventListener("change", (event) => {
      state.status = event.target.value;
      layout();
    });
  document
    .querySelectorAll(".publish")
    .forEach((button) =>
      button.addEventListener("click", () => publishCard(button.dataset.id)),
    );
  document
    .querySelectorAll(".review-card")
    .forEach((button) =>
      button.addEventListener("click", () => openReview(button.dataset.id)),
    );
  document
    .querySelectorAll(".review-decision")
    .forEach((button) =>
      button.addEventListener("click", () =>
        submitReview(button.dataset.id, button.dataset.decision),
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
    .querySelectorAll(".review-publish")
    .forEach((button) =>
      button.addEventListener("click", () => publishCard(button.dataset.id)),
    );
  document.querySelector("#close-review")?.addEventListener("click", () => {
    state.reviewCard = null;
    if (state.reviewImageSrc) URL.revokeObjectURL(state.reviewImageSrc);
    state.reviewImageSrc = "";
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
    .querySelectorAll(".role-change")
    .forEach((select) =>
      select.addEventListener("change", () =>
        updateUserRole(select.dataset.id, select.value),
      ),
    );
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
  document
    .querySelectorAll(".review-artist-profile")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void updateArtistProfile(button.dataset.id),
      ),
    );
  document.onkeydown = (event) => {
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
