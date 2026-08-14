# Fan Level Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the mobile fan-level page so its layout, typography, spacing, colors, and controls closely match the supplied reference while keeping live progression data and existing reward actions authoritative.

**Architecture:** Keep `FanGrowth` as the stateful feature boundary and split the rendered full view into small presentational sections inside the same component file to minimize API churn. Add a focused `FanGrowth.css` reference layer rather than extending the already-crowded global stylesheet; use existing app shell, navigation, icon, API, and asset patterns.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Node test runner, existing Fanfolio API client and icon components.

---

### Task 1: Lock the reference contract with targeted tests

**Files:**
- Modify: `frontend/tests/fan-growth.test.mjs`
- Test source: `frontend/src/components/FanGrowth.tsx`

- [x] **Step 1: Add assertions for the reference sections and live-data mapping**

Assert that the source includes the Korean title/subtitle, level card labels, mission/milestone/benefit section hooks, progression values, and existing claim/equipment handlers. Assert that the page still renders `completedAt` and `currentValue/targetValue` states rather than hard-coded reference numbers.

- [x] **Step 2: Run the focused test before implementation**

Run: `cd frontend && node --test tests/fan-growth.test.mjs`

Expected: the new reference assertions fail against the current compact growth markup, while existing API and navigation assertions continue to pass.

### Task 2: Recompose the full FanGrowth view around the reference layout

**Files:**
- Modify: `frontend/src/components/FanGrowth.tsx`
- Modify: `frontend/src/components/FanGrowth.css`

- [x] **Step 1: Preserve state, loading, error, claim, pass, equipment, and sheet handlers**

Keep the current props and callbacks unchanged. Keep `FanProgression` as the source for level, XP, achievements, rewards, seasons, and equipment.

- [x] **Step 2: Replace only the `mode="full"` visual composition**

Render a full-page `fan-growth-reference` wrapper with:

```tsx
<header className="fan-growth-reference-heading">
  <div><p className="fan-growth-brand">FANFOLIO</p><h1>팬 레벨</h1><p>팬 활동을 통해 레벨을 올리고 특별한 혜택을 받아보세요!</p></div>
</header>
<LevelHero ... />
<MissionSection ... />
<MilestoneSection ... />
<BenefitsSection ... />
```

The hero must calculate `nextXp`, `levelPercent`, and remaining XP from live values. Mission rows must use the first three achievements, show `완료` for completed records, and show bounded progress for active records. Section buttons open the existing sheets. The milestone and benefits sections may use stable presentation metadata for missing server fields, but must not invent XP entitlement or claim authority.

- [x] **Step 3: Use existing assets and icon components**

Reuse the repository’s existing fan/artist image asset for the benefit panel and `NavIcon`/current icon conventions for mission and milestone glyphs. Do not add inline SVG, emoji, or CSS-drawn artwork.

- [x] **Step 4: Add reference-specific CSS tokens and responsive rules**

Implement the reference’s 430px geometry: 16px page gutters, 28px heading, 366px-ish hero card, 170px circular progress ring, 20px section titles, 72px mission rows, 122px milestone cards, two-column benefits card, pale lavender borders, soft shadows, and fixed bottom-nav-safe padding. At `max-width: 640px`, retain the reference order while allowing the hero and benefits card to stack without overflow.

### Task 3: Make interactions visibly match the reference

**Files:**
- Modify: `frontend/src/components/FanGrowth.tsx`
- Modify: `frontend/src/components/FanGrowth.css`

- [x] **Step 1: Add accessible labels and state styling**

Label the progress ring with a readable percentage, mark current milestone and locked milestones, expose completed mission status in text, and preserve keyboard-visible focus states.

- [x] **Step 2: Connect reference CTAs to existing behavior**

Make `나의 레벨 혜택 보기`, `전체 보기`, and claimable reward controls open the current sheet or call the existing callback. Keep loading/claiming/inline-error messages visible without changing backend contracts.

- [x] **Step 3: Run the focused tests**

Run: `cd frontend && node --test tests/fan-growth.test.mjs`

Expected: PASS.

### Task 4: Verify build, lint, and visual fidelity

**Files:**
- Modify: `frontend/design-qa.md`
- Create: `design-qa.md` only if the project QA workflow requires a root report update

- [x] **Step 1: Run frontend validation**

Run: `cd frontend && npm test && npm run lint && npm run build`

Expected: all tests pass, lint reports no errors, and Vite production build completes.

- [x] **Step 2: Run the local app and open the fan-level route at a 430px viewport**

Use the existing Vite dev script and browser preview workflow. Verify the rendered heading, hero, missions, milestones, benefits, bottom navigation, scrolling, and claim/sheet interactions. Check the browser console for errors.

- [x] **Step 3: Compare against the supplied reference and record QA**

Open both `/Users/gojaewoong/Downloads/레퍼런스 이미지/exec-b17a2a1f-09ea-406c-95cd-7cb466274537.png` and the latest prototype capture. Fix P0–P2 differences in spacing, typography, card geometry, or overflow, then write `final result: passed` to the project QA report.

- [x] **Step 4: Re-run the complete validation after visual fixes**

Run: `cd frontend && npm test && npm run lint && npm run build`

Expected: PASS with no known errors.
