import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("admin exposes the dual-control approval queue", () => {
  assert.match(source, /\/admin\/approvals/);
  assert.match(source, /\/admin\/approvals\/\$\{encodeURIComponent\(approvalId\)\}\/\$\{action\}/);
  assert.match(source, /승인 큐/);
  assert.match(source, /approval-action/);
});

test("shop product operations fields are editable in the catalog form", () => {
  assert.match(source, /name="inventoryLimit"/);
  assert.match(source, /name="perUserLimit"/);
  assert.match(source, /name="scheduledPublishAt"/);
  assert.match(source, /name="exposureSlot"/);
  assert.match(css, /\.shop-product-ops-fields/);
});
