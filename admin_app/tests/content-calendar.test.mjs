import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("card operations workspace exposes the content calendar without a separate page", () => {
  assert.match(source, /contentCalendarPanel/);
  assert.match(source, /공개 일정/);
  assert.match(source, /content-calendar-form/);
  assert.match(source, /\/content-calendar/);
  assert.match(source, /data-calendar-status/);
  assert.doesNotMatch(source, /state\.view\s*=\s*["']calendar["']/);
});

test("content calendar exposes selectable card, event, and product targets", () => {
  assert.match(source, /contentCalendarDraftType/);
  assert.match(source, /data-calendar-content-type/);
  assert.match(source, /콘텐츠 유형/);
  assert.match(source, /state\.events\.map/);
  assert.match(source, /shopProducts\s*\|\| \[\]\)\.map/);
  assert.match(source, /content-calendar-type-select/);
  assert.match(source, /content-calendar-id-select/);
});
