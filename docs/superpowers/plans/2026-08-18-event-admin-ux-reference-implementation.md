# Event Admin UX Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin event workspace and editor drawer to match the approved Fanfolio operations-console reference while preserving existing event, applicant, draw, upload, and save behavior.

**Architecture:** Keep the existing single-page admin renderer and API contracts. Restructure only the event detail/editor markup in `admin_app/app.js`, then use scoped CSS in `admin_app/styles.css` for the queue/detail split, media upload card, related-card rows, schedule groups, applicant controls, and sticky actions. Verify with existing admin contract tests and the in-app browser.

**Tech Stack:** Vanilla JavaScript, HTML template strings, CSS, Node test runner, Codex in-app Browser.

---

### Task 1: Lock the approved visual structure in admin markup

**Files:**
- Modify: `admin_app/app.js:712-735` (`eventDrawer`)
- Modify: `admin_app/app.js:1295-1305` (`eventRelatedCardOptions`)
- Test: `admin_app/tests/admin-events.test.mjs`

- [ ] Add assertions for the reference sections: media upload card, content, related cards, schedule, operations, applicant management, and sticky save actions.
- [ ] Render the banner as a controlled upload card with preview/asset state, replace/remove affordances, and no visible browser-default file input.
- [ ] Render related cards as selectable rows with a custom check indicator, card title, member metadata, and selected state while preserving `relatedCardIds` names for form submission.
- [ ] Keep all existing field names and event connection controls unchanged so `saveEvent` sends the same payload.
- [ ] Run `node --test admin_app/tests/admin-events.test.mjs` and confirm the new structural assertions pass.

### Task 2: Apply the reference visual system to the workspace

**Files:**
- Modify: `admin_app/styles.css:3140-3200`

- [ ] Style the event workspace as a calm queue/detail split with consistent 12px radii, thin borders, navy text, lavender surfaces, and violet primary actions.
- [ ] Add a media upload card with a dashed drop zone, preview thumbnail, file metadata, replace/remove buttons, and a readable asset identifier row.
- [ ] Add two-column schedule and operations grids that collapse cleanly below the existing workspace breakpoint.
- [ ] Style related-card rows with visible selected/unselected states and keyboard focus treatment.
- [ ] Align participant count, winner count, and draw action as one compact operations module in the event detail panel.
- [ ] Remove default file-input and raw checkbox visual leakage from the event editor.

### Task 3: Make media states resilient and interactive

**Files:**
- Modify: `admin_app/app.js:1339-1368` (`loadEventHeroPreview`)
- Modify: `admin_app/app.js:3205-3215` (event banner binding)
- Test: `admin_app/tests/admin-events.test.mjs`

- [ ] Keep authenticated blob loading for existing event banners.
- [ ] On failure, replace the image element with a designed placeholder instead of exposing a broken-image icon.
- [ ] On file selection, show the selected filename and preview when possible; keep the existing upload API and `heroAssetId` assignment.
- [ ] Add assertions that failed media has a recovery state and file selection uses the custom upload surface.

### Task 4: Browser verification and regression checks

**Files:**
- Verify: `admin_app/app.js`
- Verify: `admin_app/styles.css`

- [ ] Run `node --test admin_app/tests/admin-events.test.mjs admin_app/tests/partner-access.test.mjs`.
- [ ] Run `git diff --check`.
- [ ] Refresh `http://127.0.0.1:4174/?cacheBust=event-admin-reference-20260818` in the Codex in-app Browser.
- [ ] Verify the event queue, detail panel, applicant module, editor drawer, custom upload card, related-card selection, and sticky footer at the current desktop viewport.
- [ ] Verify the existing event remains editable, applicant list remains loadable, and draw controls remain functional.
- [ ] Capture any remaining mismatch against the approved reference and make one focused CSS pass before handoff.
