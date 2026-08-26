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

test("point adjustment support action exposes a required amount field", () => {
  assert.match(source, /data-support-action-amount/);
  assert.match(source, /포인트 조정 금액/);
});

test("support cases expose a release action for active trade holds", () => {
  assert.match(source, /release_trade/);
  assert.match(source, /보류 해제/);
});
