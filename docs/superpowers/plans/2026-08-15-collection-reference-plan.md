# Collection Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the authenticated collection page to match the supplied mobile reference while preserving live card data and existing navigation/actions.

**Architecture:** Keep `Collection` as the route-level component and derive all displayed values from the existing `CollectionSummary` and `Card[]` inputs. Replace the legacy benefit/filter-first composition with a reference-scoped collection composition: progress card, recent card grid, management CTA, and four summary tiles; keep the existing full-collection controls available below the reference sections when additional cards exist.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Node test runner, oxlint.

---

### Task 1: Lock the reference composition with tests

**Files:**
- Modify: `frontend/tests/fan-home-collection-spotlight.test.mjs`
- Test data source: `frontend/src/App.tsx`, `frontend/src/reference.css`

- [x] **Step 1: Write the failing test**

Add assertions for the collection route markup and styles: `collection-reference`, `collection-progress-card`, `collection-recent-grid`, `collection-manage-card`, `collection-summary-grid`, four summary labels, four-column grid geometry, and reference card status labels.

- [x] **Step 2: Run the focused test to verify it fails**

Run `npm test -- --test-name-pattern='collection reference'` from `frontend/`.
Expected: FAIL because the current `Collection` component does not expose the reference section classes or summary tiles.

### Task 2: Replace the collection composition

**Files:**
- Modify: `frontend/src/App.tsx:1127-1152`

- [x] **Step 1: Add derived display data**

Compute recent cards from the first eight collection cards, duplicate counts by `card.title`, and summary values from `CollectionSummary`. Use the existing `onSelect`, `onRedeem`, `onDiscover`, and filter state callbacks rather than introducing new persistence.

- [x] **Step 2: Render the reference sections**

Render, in order:

```tsx
<section className="collection-reference">
  <div className="collection-progress-card">...</div>
  <section className="collection-recent-section">...</section>
  <button className="collection-manage-card" onClick={onRedeem}>...</button>
  <section className="collection-summary-section">...</section>
</section>
```

Each card remains a real button that opens `onSelect(card)`. Status pills use `신규` for the first occurrence and `중복 N` for repeated titles. The existing complete collection grid/filter/toggle remains available after the reference sections when `showAll` is selected.

- [x] **Step 3: Run the focused test**

Run `npm test -- --test-name-pattern='collection reference'`.
Expected: PASS for markup and data-driven status behavior.

### Task 3: Implement reference-matched collection styling

**Files:**
- Modify: `frontend/src/reference.css`

- [x] **Step 1: Add a final collection reference contract**

Scope rules under `.collection-shell .collection-reference` and define the 430px geometry, pale surface cards, 4-column recent grid, image aspect ratio, rarity pills, status footer, management CTA, four summary tiles, and fixed-nav-safe bottom spacing.

- [x] **Step 2: Add responsive fallback**

At `max-width: 360px`, reduce gutters and card gaps without changing the four-column composition or causing horizontal overflow.

- [x] **Step 3: Run lint and focused tests**

Run `npm run lint` and `npm test -- --test-name-pattern='collection reference'`.
Expected: both pass.

### Task 4: Verify the complete app and document visual QA

**Files:**
- Modify: `design-qa.md`

- [x] **Step 1: Run full verification**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check` from `frontend/` or repository root as appropriate.

- [x] **Step 2: Inspect the running collection route**

Refresh `http://127.0.0.1:4173/collection`, verify the reference section order, four-column card grid, management CTA, summary tiles, fixed bottom navigation, and card click behavior.

- [x] **Step 3: Record QA evidence**

Append a `Collection reference QA — passed` section to `design-qa.md` with the route, measured viewport, test/build results, and any remaining non-blocking differences.
