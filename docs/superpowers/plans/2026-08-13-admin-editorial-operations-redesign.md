# Admin Editorial Operations Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Fanfolio administrator card workflow into a commercial, dense three-panel review console without changing permissions or API behavior.

**Architecture:** Keep the existing single-page renderer and event bindings in `admin_app/app.js`. Add stable semantic hooks around the card queue, then use the existing design tokens and responsive breakpoints in `admin_app/styles.css` to create the navy navigation, review table, and persistent detail panel seen in the selected reference.

**Tech Stack:** Static HTML, browser ES modules, CSS, Material Symbols, Node test runner.

---

### Task 1: Lock the card review information architecture

**Files:**
- Modify: `admin_app/tests/admin-release-review.test.mjs`
- Modify: `admin_app/app.js`

- [x] **Step 1: Write the failing test**

Add source assertions for a review-console root, queue tabs with counts, selected queue item semantics, and a review detail region that retains the existing approve/reject action hooks.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/admin-release-review.test.mjs`
Expected: FAIL because the new review-console hooks are not present.

- [x] **Step 3: Implement the semantic review console**

Refactor only the card-list presentation in `cardsView()` and the existing review detail presentation. Reuse `state.cards`, current status labels, thumbnail URLs, permission checks, and the existing request/approve/reject actions.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/admin-release-review.test.mjs`
Expected: PASS.

### Task 2: Match the Editorial Collectible visual system

**Files:**
- Modify: `admin_app/styles.css`
- Test: `admin_app/tests/admin-responsive-layout.test.mjs`

- [x] **Step 1: Add a failing responsive style assertion**

Require the desktop review console to use a queue/detail grid and require existing tablet/mobile breakpoints to collapse it into a single-column flow.

- [x] **Step 2: Run the responsive test to verify it fails**

Run: `node --test tests/admin-responsive-layout.test.mjs`
Expected: FAIL on the new review-console selectors.

- [x] **Step 3: Add the production visual layer**

Apply ink-navy navigation, violet active states, compact 44–56 px queue rows, restrained borders, a sticky detail panel, clear status pills, and responsive stacking. Do not alter drawers, permissions, or unrelated workflows.

- [x] **Step 4: Run the complete admin suite**

Run: `node --test tests/*.test.mjs`
Expected: all tests PASS.

### Task 3: Browser verification

**Files:**
- Modify: `design-qa.md`
- Create: `audits/admin-editorial-operations.png`
- Create: `audits/admin-editorial-operations-comparison.png`

- [x] **Step 1: Open the card review route with realistic data**

Verify navigation, queue tabs, selection, approve/reject controls, card registration, notification panel, and mobile collapse.

- [x] **Step 2: Compare reference and implementation together**

Capture the same desktop state, compose it beside the cropped admin reference, and record visible spacing, hierarchy, and responsive findings.

- [x] **Step 3: Iterate until the QA verdict passes**

Append a section to `design-qa.md` ending with the exact line `final result: passed` only after the visible hierarchy and required interactions are verified.
