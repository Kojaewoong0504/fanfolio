import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("admin dashboard exposes a data-backed release readiness checklist", () => {
  assert.match(source, /function dashboardReadinessView\(\)/);
  assert.match(source, /dashboardReadinessView\(\)/);
  assert.match(source, /조직·아티스트/);
  assert.match(source, /카드 콘텐츠/);
  assert.match(source, /노출 일정/);
  assert.match(source, /발급 준비/);
  assert.match(source, /검수·공개/);
  assert.match(source, /data-readiness-action=/);
  assert.match(source, /aria-label="운영 공개 준비 체크리스트"/);
});

test("readiness checklist has a compact responsive layout and state contrast", () => {
  assert.match(styles, /\.dashboard-readiness-panel/);
  assert.match(styles, /\.dashboard-readiness-item\.complete/);
  assert.match(styles, /\.dashboard-readiness-item\.pending/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*\.dashboard-readiness-grid/);
});
