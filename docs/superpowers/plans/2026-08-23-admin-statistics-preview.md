# Admin Statistics Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive local-only statistics preview for ROOT and partner administrators using the existing Fanfolio admin design system.

**Architecture:** Add a standalone `?preview=statistics` renderer beside the existing card operations preview. Keep all sample metrics and filters in a dedicated preview state, generate charts with lightweight inline SVG, and isolate styling under a statistics preview namespace so production behavior remains unchanged.

**Tech Stack:** Vanilla JavaScript, HTML templates, CSS, Node test runner

---

### Task 1: Lock the preview contract with tests

**Files:**
- Create: `admin_app/tests/admin-statistics-preview.test.mjs`

- [x] **Step 1: Write a failing source-contract test**

Assert the local preview route, ROOT/partner role switch, period/filter controls, KPI cards, trend chart, pack performance, funnel, odds comparison, and responsive CSS selectors.

- [x] **Step 2: Run the targeted test and verify failure**

Run: `node --test admin_app/tests/admin-statistics-preview.test.mjs`

Expected: FAIL because the statistics preview functions and styles do not exist.

### Task 2: Implement preview state, views, and interactions

**Files:**
- Modify: `admin_app/app.js`

- [x] **Step 1: Add preview data and state**

Create ROOT and partner datasets, selected scope, period, entity filters, and comparison toggle.

- [x] **Step 2: Add reusable metric and chart renderers**

Render KPI cards, SVG line/area charts, bar comparisons, progress rows, funnel steps, and anomaly notices from preview data.

- [x] **Step 3: Add ROOT and partner dashboard composition**

Keep shared filters consistent while changing labels and panels to match each administrator's allowed scope.

- [x] **Step 4: Bind controls and local preview route**

Add `renderStatisticsPreview()` listeners and route `?preview=statistics` before session restoration.

- [x] **Step 5: Run the targeted test**

Run: `node --test admin_app/tests/admin-statistics-preview.test.mjs`

Expected: Function and route assertions pass; styling assertions may still fail.

### Task 3: Implement responsive Fanfolio styling

**Files:**
- Modify: `admin_app/styles.css`

- [x] **Step 1: Add dashboard layout and component styles**

Style the scope switch, filter bar, KPI cards, charts, tables, funnel, odds comparison, and monitoring panel with existing variables and spacing.

- [x] **Step 2: Add tablet and mobile layout rules**

Collapse multi-column grids and keep controls readable below 1180px, 820px, and 620px.

- [x] **Step 3: Run targeted and full admin tests**

Run: `node --test admin_app/tests/admin-statistics-preview.test.mjs`

Run: `node --test admin_app/tests/*.test.mjs`

Expected: PASS with no existing admin preview regressions.

### Task 4: Verify the local preview

**Files:**
- No code changes expected

- [x] **Step 1: Start the admin app**

Run the existing local admin development command and open `http://127.0.0.1:<port>/?preview=statistics`.

- [x] **Step 2: Exercise controls**

Verify ROOT/partner switching, period changes, entity filters, and comparison toggle update the visible data without errors.

- [x] **Step 3: Verify responsive layouts**

Inspect desktop and narrow widths for overflow, clipped labels, and chart readability.

- [x] **Step 4: Record verification evidence**

Capture the final preview URL and test counts in the handoff.
