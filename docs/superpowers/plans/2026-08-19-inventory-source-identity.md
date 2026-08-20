# Inventory Source Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate artist and global inventory sources while reserving source artwork for artist logos or a Fanfolio global symbol.

**Architecture:** Extend the inventory source view model with an optional logo URL and a source kind. Resolve logos only from source metadata, then render a deterministic text or Fanfolio-symbol fallback. Keep reward artwork exclusively inside item cards.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Lock the source identity contract

**Files:**
- Modify: `frontend/tests/reward-inventory.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that preview metadata marks the ticket as global, source records expose `logoUrl`, the source tab renders `reward-inventory-source-logo`, and source construction no longer uses `inventoryRewardArtwork(reward)`.

```js
test('inventory source identity separates artist logos from global rewards', () => {
  assert.match(appSource, /name: '랜덤 카드 뽑기권',[\s\S]*scope: 'global'/)
  assert.match(appSource, /logoUrl:/)
  assert.match(appSource, /className="reward-inventory-source-logo"/)
  assert.match(appSource, /source\.kind === 'global'/)
  assert.doesNotMatch(appSource, /artwork: inventoryRewardArtwork\(reward\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="source identity" tests/reward-inventory.test.mjs`

Expected: FAIL because the source logo contract and global preview reward are missing.

### Task 2: Implement source logo and global grouping

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`

- [ ] **Step 1: Write minimal implementation**

Change the preview ticket metadata to `scope: 'global'`. Build source records with `kind`, `logoUrl`, and `fallback`, render the optional logo through `AuthenticatedImage`, and otherwise render either the artist initial or Fanfolio star symbol.

```tsx
type InventorySource = {
  id: string
  label: string
  kind: 'artist' | 'global' | 'activity'
  count: number
  logoUrl: string | null
}

<span className="reward-inventory-source-logo">
  {source.logoUrl
    ? <AuthenticatedImage src={source.logoUrl} fallback="" alt="" />
    : source.kind === 'global'
      ? <InlineIcon name="sparkles" />
      : <span>{source.label.slice(0, 1)}</span>}
</span>
```

- [ ] **Step 2: Preserve uniform styling**

Add fixed-size styles for `.reward-inventory-source-logo`, its image, initial fallback, and global symbol without changing source-card geometry.

```css
.reward-inventory-source-logo{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;overflow:hidden}
.reward-inventory-source-logo img{width:100%;height:100%;object-fit:contain}
```

- [ ] **Step 3: Run focused tests**

Run: `node --test --test-name-pattern="source identity" tests/reward-inventory.test.mjs`

Expected: PASS.

### Task 3: Verify the complete change

**Files:**
- Verify: `frontend/src/App.tsx`
- Verify: `frontend/src/reference.css`
- Verify: `frontend/tests/reward-inventory.test.mjs`

- [ ] **Step 1: Run all checks**

Run: `npm test && npm run build && npm run lint`

Expected: 116 or more tests pass, build succeeds, and lint has no new errors.

- [ ] **Step 2: Inspect the preview**

Open `http://localhost:5173/?preview=reward-inventory`, confirm two source tabs, confirm counts 3 and 1, and confirm the global ticket is shown only under 전체 레벨.

- [ ] **Step 3: Check the diff**

Run: `git diff --check`

Expected: no whitespace errors.
