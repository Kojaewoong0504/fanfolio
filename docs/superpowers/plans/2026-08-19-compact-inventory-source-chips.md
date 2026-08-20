# Compact Inventory Source Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the selected compact source-chip reference while omitting a logo for the global-level source.

**Architecture:** Preserve the existing inventory source grouping and tab behavior. Simplify only the source-tab markup and CSS so artist sources retain a small logo while global sources render as text plus count.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Lock the compact source contract

**Files:**
- Modify: `frontend/tests/reward-inventory.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('inventory sources use compact chips and omit the global logo', () => {
  assert.match(appSource, /source\.kind !== 'global'/)
  assert.match(appSource, /reward-inventory-source-count/)
  assert.doesNotMatch(appSource, /reward-inventory-source-logo global/)
  assert.match(referenceCssSource, /min-height:46px/)
  assert.match(referenceCssSource, /\.reward-inventory-source-logo[^}]*width:28px[^}]*height:28px/s)
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="compact chips" tests/reward-inventory.test.mjs`

Expected: FAIL because the source controls still use 72px cards and render a global icon.

### Task 2: Implement compact chips

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`

- [ ] **Step 1: Simplify source markup**

```tsx
{source.kind !== 'global' && <ProfileAvatar className="reward-inventory-source-logo" imageUrl={source.logoUrl} fallback={source.label.slice(0, 1)} alt={`${source.label} 로고`} />}
<b>{source.label}</b>
<em className="reward-inventory-source-count">{source.count}</em>
```

- [ ] **Step 2: Apply compact geometry**

```css
.reward-inventory-sources button { display:flex; min-height:46px; padding:7px 10px; }
.reward-inventory-source-logo { width:28px; height:28px; }
.reward-inventory-source-count { min-width:22px; height:22px; border-radius:999px; }
```

- [ ] **Step 3: Verify GREEN**

Run: `node --test --test-name-pattern="compact chips" tests/reward-inventory.test.mjs`

Expected: PASS.

### Task 3: Verify the selected visual scope

**Files:**
- Verify: `frontend/src/App.tsx`
- Verify: `frontend/src/reference.css`
- Verify: `frontend/tests/reward-inventory.test.mjs`

- [ ] **Step 1: Run automated checks**

Run: `npm test && npm run build && npm run lint`

Expected: all tests and build pass with no new lint errors.

- [ ] **Step 2: Run browser and design QA**

Open `http://localhost:5173/?preview=reward-inventory`, verify artist logo retention, global logo omission, chip selection, and unchanged inventory content. Save a passed comparison in `design-qa.md`.

- [ ] **Step 3: Check whitespace**

Run: `git diff --check`

Expected: no output and exit code 0.
