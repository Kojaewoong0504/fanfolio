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
