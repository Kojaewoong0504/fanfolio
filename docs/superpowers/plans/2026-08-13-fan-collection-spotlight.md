# Fan Collection Spotlight Implementation Plan

**Goal:** Implement the selected collection-first fan home without changing backend contracts.

**Architecture:** Keep data fetching and routing in `App.tsx`; replace the home presentation with a focused collection spotlight using existing `Card` and `CollectionSummary` data. Preserve all current flows, with alerts promoted to the header and a four-item bottom navigation.

**Tech stack:** React 19, TypeScript, Vite, CSS, Node test runner.

### Task 1: Lock the selected experience with source-contract tests

**Files:**
- Create: `frontend/tests/fan-home-collection-spotlight.test.mjs`
- Modify: `frontend/tests/fan-growth.test.mjs`

- Assert the personalized greeting, immersive featured card, accessible progress, recent collection rail, primary redemption CTA, and four-item navigation.
- Assert growth remains in settings and is removed from home.
- Run the focused tests and confirm they fail before implementation.

### Task 2: Implement the collection-first home

**Files:**
- Modify: `frontend/src/App.tsx`

- Pass the signed-in nickname into `Home`.
- Replace the current generic marketing hero and stats with the selected hierarchy.
- Keep loading, empty, recommendation, saved-card, detail, registration, and route behavior.
- Update tab labels and the bottom-navigation map.

### Task 3: Match the reference styling

**Files:**
- Modify: `frontend/src/App.css`

- Refine shell spacing, header scale, hero image overlay, progress, recent-card rail, CTA, and navigation.
- Add 360px constraints and safe-area behavior.

### Task 4: Verify behavior and visual quality

**Files:**
- Create: `design-qa.md`
- Create: `audits/fan-collection-spotlight-implementation.png`
- Create: `audits/fan-collection-spotlight-comparison.png`

- Run targeted tests, full tests, lint, and production build.
- Open the app at a 430px mobile viewport and verify hero, recent card, registration, collection navigation, bell, and profile interactions.
- Compare the reference and implementation in one image, fix material discrepancies, and record a passing QA verdict.
