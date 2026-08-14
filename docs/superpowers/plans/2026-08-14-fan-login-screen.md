# Fan Login Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the unauthenticated fan login screen to faithfully match the approved portrait reference without changing authentication contracts.

**Architecture:** Keep the existing `Login` state and API calls in `App.tsx`, replace only the initial presentation structure, and reveal the existing email magic-link form on demand. Add source-derived raster assets for the hero and provider marks, then isolate all responsive styling under `.login-screen` in `reference.css`.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Vite.

---

### Task 1: Lock the login visual and behavior contract

**Files:**
- Modify: `frontend/tests/login-form-contract.test.mjs`

- [ ] **Step 1: Write the failing test** for the approved wordmark, four ordered providers, collapsed email CTA, and hero structure.
- [ ] **Step 2: Run `npm test -- --test-name-pattern="approved login"`** and confirm it fails because the new provider and CTA structure is absent.
- [ ] **Step 3: Preserve the existing autofill assertions** so the visual refactor cannot remove browser-safe email behavior.

### Task 2: Implement the approved initial state

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`
- Create: `frontend/src/assets/login-dreamscape-group.png`
- Create: `frontend/src/assets/login-provider-apple.png`
- Create: `frontend/src/assets/login-provider-google.png`
- Create: `frontend/src/assets/login-provider-kakao.png`
- Create: `frontend/src/assets/login-provider-naver.png`

- [ ] **Step 1: Extract source-faithful image assets** from the approved visual at their intended display density.
- [ ] **Step 2: Render the four provider buttons in the approved order** while retaining Google/Kakao redirects and an accessible pending message for Apple/Naver.
- [ ] **Step 3: Move the existing email controls into a revealable panel** opened by the approved gradient CTA.
- [ ] **Step 4: Add responsive login-only styling** for the 430px portrait composition, long screens, and narrow screens.
- [ ] **Step 5: Run the targeted test** and confirm it passes.

### Task 3: Verify interaction and visual fidelity

**Files:**
- Modify: `design-qa.md`

- [ ] **Step 1: Run `npm test`, `npm run lint`, and `npm run build`** in `frontend` and require zero failures.
- [ ] **Step 2: Start the local Vite preview and capture the unauthenticated screen** at the same portrait aspect ratio as the reference.
- [ ] **Step 3: Compare the source and implementation in one visual input**, fix P0-P2 differences, and repeat until passed or a concrete blocker remains.
- [ ] **Step 4: Record source path, implementation screenshot, viewport, interaction checks, comparison history, and exact final result** in `design-qa.md`.

