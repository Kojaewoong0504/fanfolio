# Shop History Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a faithful, interactive purchase/exchange history preview and a horizontally scrollable artist selector to the existing Fanfolio shop preview.

**Architecture:** Keep the preview implementation colocated with `ShopPreview` in `App.tsx` and introduce a focused `ShopHistoryPreview` component plus typed mock records. Extend the existing preview-only routing and add isolated CSS selectors so production routes and unrelated screens remain unchanged.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Vite

---

### Task 1: Lock preview behavior with tests

**Files:**
- Modify: `frontend/tests/shop-preview.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test('shop artist selector is a horizontal scroll rail', () => {
  assert.match(appCssSource, /\.shop-artist-list\{[^}]*overflow-x:auto/s)
  assert.match(appCssSource, /\.shop-artist-list\{[^}]*scroll-snap-type:x proximity/s)
})

test('shop history preview is routed and interactive', () => {
  assert.match(appSource, /preview === 'shop-history'/)
  assert.match(appSource, /function ShopHistoryPreview\(/)
  assert.match(appSource, /setFilter\(item\.id\)/)
  assert.match(appSource, /navigateAppPath\('\/?preview=shop-history'\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shop-preview.test.mjs`

Expected: FAIL because the history component, route, and scroll CSS do not exist.

### Task 2: Add shop history component and routing

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add typed preview records and filter state**

```tsx
type ShopHistoryFilter = 'all' | 'purchase' | 'exchange'
type ShopHistoryRecord = {
  id: string
  type: Exclude<ShopHistoryFilter, 'all'>
  month: string
  title: string
  date: string
  status: string
  points: string
  image: string
  cancelled?: boolean
}
```

- [ ] **Step 2: Add the detail component**

Implement `ShopHistoryPreview` with a top bar, summary card, filter tabs, grouped records, and informational footer. Use existing `dreamscapeCardPack`, `fanLevelStar`, and other product assets rather than placeholders.

- [ ] **Step 3: Connect routes**

Change the shop history button to `navigateAppPath('/?preview=shop-history')`, add `preview === 'shop-history'`, and return to `/?preview=shop` from the detail back button.

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- tests/shop-preview.test.mjs`

Expected: route and interaction source assertions pass; CSS assertions still fail until Task 3.

### Task 3: Implement responsive visual styling

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Convert artist grid to a scroll rail**

Use `display:flex`, fixed item bases, `overflow-x:auto`, `scroll-snap-type:x proximity`, touch momentum, and hidden scrollbars without introducing page-wide horizontal overflow.

- [ ] **Step 2: Style the history page**

Add `.shop-history-shell`, `.shop-history-topbar`, `.shop-history-summary`, `.shop-history-filters`, `.shop-history-group`, `.shop-history-card`, and `.shop-history-note` rules matching the selected design image.

- [ ] **Step 3: Run targeted tests**

Run: `npm test -- tests/shop-preview.test.mjs`

Expected: PASS.

### Task 4: Verify build and visual fidelity

**Files:**
- Modify: `design-qa.md`
- Create: `design-qa-shop-history-preview.png`
- Create: `design-qa-shop-history-comparison.png`

- [ ] **Step 1: Run automated verification**

Run: `npm test && npm run build && npm run lint`

Expected: tests and build pass; any pre-existing lint warnings are recorded separately.

- [ ] **Step 2: Verify browser interactions**

Open `http://127.0.0.1:5174/?preview=shop`, scroll the artist rail, open purchase/exchange history, switch filters, use back navigation, and check for console errors.

- [ ] **Step 3: Compare implementation to the selected image**

Capture the history page at the same mobile width, compose the source and implementation into one comparison artifact, fix any P0/P1/P2 differences, and update `design-qa.md` with `final result: passed` only after the comparison passes.
