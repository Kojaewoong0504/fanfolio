import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("studio review exposes card-scoped collaboration comments", () => {
  assert.match(source, /card-comments-panel/);
  assert.match(source, /\/comments/);
  assert.match(source, /협업 코멘트/);
  assert.match(source, /data-collaboration-comment/);
});
