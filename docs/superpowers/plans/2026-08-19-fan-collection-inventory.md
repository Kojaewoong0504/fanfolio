# Fan Collection Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pass-reward archive with the approved source-first fan collection screen and a uniform two-column item-card system.

**Architecture:** Keep the existing `RewardInventory` route, progression data, equipment API, artwork helpers, and bottom navigation. Add small view-model helpers inside `App.tsx` to derive source and lifecycle labels from current reward metadata, then render one consistent card component shape for every owned item. Update only the inventory-specific CSS block and its source-based regression test.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node test runner, existing Fanfolio CSS and reward PNG assets.

---

### Task 1: Lock the approved inventory contract

**Files:**
- Modify: `frontend/tests/reward-inventory.test.mjs`

- [ ] **Step 1: Replace the old pass-archive assertions with failing fan-collection assertions**

```js
assert.match(appSource, /<div><h1>팬 컬렉션<\/h1><\/div>/)
assert.match(appSource, /드림스케이프 컬렉션/)
assert.match(appSource, /전체.*적용 중.*기간제.*1회성/s)
assert.match(appSource, /inventoryRewardLifecycle/)
assert.doesNotMatch(appSource, /현재 장착 중/)
assert.match(referenceCssSource, /\.reward-inventory-card\s*\{[^}]*min-height:/s)
assert.match(referenceCssSource, /\.reward-inventory-card-action/)
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --test-name-pattern="reward inventory|mobile inventory"`

Expected: FAIL because the screen still contains `패스 보상`, category filters, mixed equipped/list sections, and no lifecycle/card-action contract.

### Task 2: Implement source and lifecycle view models

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add lifecycle and source helpers next to the existing inventory helpers**

```ts
type InventoryLifecycle = 'equipped' | 'timed' | 'consumable' | 'owned'

function inventoryRewardLifecycle(reward: RewardGrant, equipment: ProfileEquipment | null): InventoryLifecycle {
  if (equipment && isRewardEquipped(reward, equipment)) return 'equipped'
  if (typeof reward.metadata?.expiresAt === 'string' || typeof reward.metadata?.durationDays === 'number') return 'timed'
  if (reward.metadata?.consumable === true || typeof reward.metadata?.quantity === 'number') return 'consumable'
  return 'owned'
}
```

- [ ] **Step 2: Derive readable labels without changing the backend contract**

Use metadata when present (`artistName`, `scope`, `expiresAt`, `durationDays`, `quantity`, `consumable`) and fall back to current reward type semantics. Keep equip-capable items on the existing `updateProfileEquipment` path and show digital bonuses as usable/detail items.

- [ ] **Step 3: Run the focused test and confirm it remains RED for missing markup**

Run: `npm test -- --test-name-pattern="reward inventory|mobile inventory"`

Expected: FAIL only on the new screen-copy and card-markup assertions.

### Task 3: Render the approved fan collection screen

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace the archive header and hero with the compact approved hierarchy**

Render `팬 컬렉션`, the compact total line, source selector cards for `드림스케이프`, `LUMI`, and `전체 레벨`, and the selected source heading with an owned count.

- [ ] **Step 2: Replace category filters with lifecycle filters**

Use the values `all`, `equipped`, `timed`, and `consumable` with visible labels `전체`, `적용 중`, `기간제`, and `1회성`.

- [ ] **Step 3: Render every visible reward through one equal card structure**

```tsx
<article className="reward-inventory-card">
  <span className="reward-inventory-art">...</span>
  <b>{reward.name}</b>
  <em className={`reward-inventory-status ${lifecycle}`}>{statusLabel}</em>
  <button className="reward-inventory-card-action">{actionLabel}</button>
</article>
```

Keep identical card geometry for equipped, timed, consumable, and permanently owned items. Remove the separate equipped strip and fixed selected-item action bar.

- [ ] **Step 4: Preserve loading, error, empty, back, bottom-tab, equip, and digital-item behavior**

Actions must remain keyboard-accessible and report success or errors through the existing status message pattern.

### Task 4: Match the selected image with inventory-only CSS

**Files:**
- Modify: `frontend/src/reference.css`

- [ ] **Step 1: Replace the old reward inventory CSS block**

Implement compact source cards, lifecycle tabs, and a two-column grid. Give every `.reward-inventory-card` the same minimum height, fixed art slot, fixed title/status areas, and bottom-anchored `.reward-inventory-card-action`.

- [ ] **Step 2: Keep mobile behavior stable at 360px and below**

Maintain two columns, reduce gaps and art size, and keep status labels readable without changing card heights by state.

- [ ] **Step 3: Run focused tests and confirm GREEN**

Run: `npm test -- --test-name-pattern="reward inventory|mobile inventory"`

Expected: PASS.

### Task 5: Verify behavior and visual fidelity

**Files:**
- Create: `design-qa.md`
- Create: `fan-collection-implementation.png`

- [ ] **Step 1: Run the complete automated checks**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

Run: `npm run lint`

Expected: no new lint errors.

- [ ] **Step 2: Open `/collection/rewards` in the existing local Fanfolio browser session**

Verify source tabs, lifecycle filters, equip/unequip actions, digital item action, back navigation, and all five bottom tabs.

- [ ] **Step 3: Capture and compare at the same mobile viewport**

Compare the rendered screen against `/Users/gojaewoong/.codex/generated_images/01a017bc-ad15-7ad0-b759-c015714ca742/exec-524fd624-6c81-4ffa-95e6-1502a98ee969.png`, fix P0-P2 differences, and write `design-qa.md` with `final result: passed` only after the comparison succeeds.
