import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("admin dashboard exposes a scoped operational queue overview", () => {
  assert.match(source, /\/admin\/operations\/overview/);
  assert.match(source, /operationsOverviewView/);
  assert.match(source, /failedDeliveries/);
  assert.match(source, /openSupportTickets/);
  assert.match(styles, /\.operations-overview-panel/);
  assert.match(styles, /\.ops-queue-grid/);
  assert.match(source, /failedEngagementEvents.*fan-growth/);
});

test("fan growth operations expose retry actions for failed engagement events", () => {
  assert.match(source, /function retryEngagementEvent\(eventId\)/);
  assert.match(source, /\/admin\/engagement\/events\/\$\{encodeURIComponent\(eventId\)\}\/retry/);
  assert.match(source, /data-engagement-retry=/);
  assert.match(source, /실패 이벤트 재처리/);
});

test("root user operations view exposes the fan 360 endpoint without secrets", () => {
  assert.match(source, /\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/360/);
  assert.match(source, /fan360Panel/);
  assert.match(source, /data-open-fan360/);
  assert.match(source, /비밀번호·민감 목적지는 표시하지 않습니다/);
});

test("service user rows keep the fan 360 action scoped to fan accounts", () => {
  assert.match(source, /user\.role\s*===\s*["']fan["']/);
  assert.match(source, /팬 전용/);
});

test("support ticket detail exposes an admin assignee control", () => {
  assert.match(source, /data-support-assignee=/);
  assert.match(source, /assignedAdminId/);
  assert.match(source, /담당자 배정/);
});

test("support reply form passes its ticket id to the submit handler", () => {
  assert.match(source, /const ticketId = event\.currentTarget\.dataset\.ticketId \|\| event\.currentTarget\.dataset\.supportReply/);
});

test("support case actions expose an inline reference field instead of a native prompt", () => {
  assert.match(source, /data-support-action-reference/);
  assert.doesNotMatch(source, /window\.prompt\("운영 메모 또는 대상 ID를 입력하세요\."\)/);
});

test("reported fan cases expose a reversible collection moderation action", () => {
  assert.match(source, /hide_collection/);
  assert.match(source, /restore_collection/);
  assert.match(source, /공개 컬렉션 복구/);
  assert.match(source, /공개 컬렉션 숨김/);
  assert.match(source, /needsReference && !reference/);
});

test("collection moderation is only offered for report tickets targeting a fan", () => {
  assert.match(source, /const canHideCollection = ticket && ticket\.category === "report" && ticket\.targetType === "user" && Boolean\(ticket\.targetId\)/);
  assert.doesNotMatch(source, /replace\(\s*['"]data-support-action="refund_order"['"]/);
});

test("operation feedback is cleared when navigating between admin views", () => {
  assert.match(source, /state\.operationFeedback = null;[\s\S]*state\.view = button\.dataset\.view/);
});

test("sidecar operation feedback spans the workspace instead of occupying a grid column", () => {
  assert.match(styles, /\.workspace-sidecar-body\s*>\s*\.operation-feedback\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});

test("toast feedback is cleared when navigating to a different admin view", () => {
  assert.match(source, /function clearToast\(\)/);
  assert.match(source, /clearToast\(\);[\s\S]*state\.view = button\.dataset\.view/);
});

test("view navigation closes an open drawer before rendering the next workspace", () => {
  assert.match(source, /state\.drawer = null;[\s\S]*state\.drawerData = null;[\s\S]*state\.eventEditorOpen = false;[\s\S]*state\.view = button\.dataset\.view/);
});

test("point adjustment support action exposes a required amount field", () => {
  assert.match(source, /data-support-action-amount/);
  assert.match(source, /포인트 조정 금액/);
});

test("support cases expose a release action for active trade holds", () => {
  assert.match(source, /release_trade/);
  assert.match(source, /보류 해제/);
});

test("high-risk queues explain the next operator action in the row", () => {
  assert.match(source, /approval-next-action/);
  assert.match(source, /승인 대기 중|승인 완료|반려 사유/);
  assert.match(source, /delivery-next-action/);
  assert.match(source, /재시도 가능|자동 재시도 대기|전달 완료/);
});

test("support detail exposes a chronological activity timeline", () => {
  assert.match(source, /support-activity-timeline/);
  assert.match(source, /운영 활동/);
  assert.match(source, /support-activity-item/);
  assert.match(styles, /\.support-activity-timeline/);
  assert.match(styles, /\.operation-feedback/);
});

test("support activity history explains operations and exposes drill-down details", () => {
  assert.match(source, /supportActivityDescriptor/);
  assert.match(source, /data-support-activity-detail/);
  assert.match(source, /상세 보기/);
  assert.match(source, /원문 ID/);
  assert.match(source, /data-support-activity-copy/);
  assert.match(styles, /\.support-activity-detail-panel/);
  assert.match(styles, /\.support-activity-target/);
});

test("fan 360 view exposes collection and risk context for support work", () => {
  assert.match(source, /fan\.cards/);
  assert.match(source, /보유 카드/);
  assert.match(source, /거래 잠금/);
  assert.match(source, /fan\.profile\.emailNotificationsEnabled/);
  assert.match(source, /support-ticket-context/);
});

test("fan 360 view presents a unified recent activity timeline", () => {
  assert.match(source, /function fan360ActivityTimeline\(fan\)/);
  assert.match(source, /CUSTOMER TIMELINE/);
  assert.match(source, /fan\.orders|fan\.trades|fan\.pointCharges|fan\.supportTickets|fan\.recentNotifications/);
  assert.match(source, /fan360ActivityTimeline\(fan\)/);
  assert.match(styles, /\.fan-360-timeline/);
});

test("support and delivery filters use the shared operating control contract", () => {
  assert.match(source, /class="search ops-control"[^>]*id="support-search"/);
  assert.match(source, /adminSelect\(\{ id: "support-status-filter"[\s\S]*dataSupportFilter: "status"/);
  assert.match(source, /adminSelect\(\{ id: "support-category-filter"[\s\S]*dataSupportFilter: "category"/);
  assert.match(source, /params\.set\("category", state\.supportCategory\)/);
  assert.match(source, /delivery-status-filter/);
  assert.match(source, /delivery-channel-filter/);
  assert.match(source, /dataDeliveryFilter: "status"/);
  assert.match(source, /dataDeliveryFilter: "channel"/);
  assert.match(styles, /\.ops-control[\s\S]*appearance:\s*none/);
});

test("support detail uses the shared custom select for assignment and status mutations", () => {
  assert.match(source, /id: `support-assignee-\$\{ticketId\}`[\s\S]*dataSupportTicket: ticketId/);
  assert.match(source, /id: `support-status-\$\{ticketId\}`[\s\S]*dataSupportTicket: ticketId/);
  assert.match(source, /support-assignee-select/);
  assert.match(source, /support-status-select/);
  assert.match(source, /updateSupportTicketAssignee\(control\.dataset\.supportTicket/);
  assert.match(source, /updateSupportTicketStatus\(control\.dataset\.supportTicket/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("approval queue exposes request detail and an auditable decision reason", () => {
  assert.match(source, /selectedApprovalId/);
  assert.match(source, /data-approval-detail=/);
  assert.match(source, /approval-detail-panel/);
  assert.match(source, /data-approval-reason=/);
  assert.match(source, /승인 사유|결정 사유/);
  assert.match(source, /data-approval-detail-action/);
  assert.match(styles, /\.approval-detail-panel/);
});

test("support and delivery queues provide a recoverable filtered-empty state", () => {
  assert.match(source, /support-filter-reset/);
  assert.match(source, /delivery-filter-reset/);
  assert.match(source, /조건에 맞는 전달 작업이 없습니다/);
  assert.match(source, /검색 조건을 바꾸거나 필터를 초기화/);
});

test("support detail controls have the shared visual treatment", () => {
  assert.match(styles, /\[data-support-status\]/);
  assert.match(styles, /\[data-support-action-reference\]/);
  assert.match(styles, /\[data-support-action-amount\]/);
  assert.match(styles, /\.support-reply-form textarea[^{]*\{[^}]*min-height: 96px/);
});

test("support queue uses compact Korean labels and bounded pagination", () => {
  assert.match(source, /function supportStatusLabel\(/);
  assert.match(source, /function supportCategoryLabel\(/);
  assert.match(source, /supportPageSize\s*=\s*10/);
  assert.match(source, /data-support-page/);
  assert.match(source, /supportPagination/);
  assert.match(styles, /\.support-ticket-list[\s\S]*max-height/);
  assert.match(styles, /\.support-ticket-row[\s\S]*min-height:\s*76px/);
});

test("navigation sections remain collapsible even when their current workflow is active", () => {
  assert.doesNotMatch(source, /Boolean\(state\.navSectionsCollapsed\[group\]\) && !currentGroup/);
});

test("recent operational drawers use the shared control styling for operational selectors", () => {
  assert.match(source, /id="event-form"[\s\S]*adminSelect\(\{ id: "event-type"/);
  assert.match(source, /id="event-form"[\s\S]*adminSelect\(\{ id: "event-artist"/);
  assert.match(source, /id="fan-pass-form"[\s\S]*fan-pass-organization/);
  assert.match(source, /id="fan-pass-form"[\s\S]*fan-pass-artist/);
  assert.match(source, /id="mission-form"[\s\S]*adminSelect\(\{ id: "mission-artist"/);
  assert.match(source, /reward-organization/);
  assert.match(source, /achievement-condition/);
});

test("multi-value campaign and achievement controls preserve readable selection state", () => {
  assert.match(source, /function adminMultiSelect\(/);
  assert.match(source, /id: "campaign-required-cards"[\s\S]*name: "requiredCardIds"/);
  assert.match(source, /id: "achievement-rewards"[\s\S]*name: "rewardIds"/);
  assert.match(source, /data-multi-select="true"/);
  assert.match(source, /admin-multi-select-value/);
  assert.match(source, /campaign-card-picker/);
  assert.match(styles, /\.admin-multi-select-check/);
});

test("fan pass tier editor keeps repeated reward fields readable in the sidecar", () => {
  assert.match(styles, /\.fan-pass-editor-form \.pass-tier-row\s*\{[^}]*grid-template-columns:\s*24px minmax\(0, 1fr\) 28px/);
  assert.match(styles, /\.fan-pass-editor-form \.pass-tier-row > \.field:nth-of-type\(3\)\s*\{\s*grid-row:\s*4/);
  assert.match(styles, /\.fan-pass-editor-form \.pass-tier-row \.admin-select,[\s\S]*\.fan-pass-editor-form \.pass-tier-row input\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.fan-pass-editor-form \.pass-tier-row > \.field\s*\{[^}]*display:\s*grid/);
});

test("production statistics filters use the shared admin selector controls", () => {
  assert.match(source, /statisticsFilterOptions\(data\.filters\.organizations, state\.statisticsOrganization, "전체 파트너"\)/);
  assert.match(source, /dataStatisticsFilter: "organization"/);
  assert.match(source, /dataStatisticsFilter: "artist"/);
  assert.match(source, /dataStatisticsFilter: "pack"/);
  assert.match(source, /control\.dataset\.statisticsFilter/);
  assert.match(styles, /statistics-selects \.admin-select/);
});
