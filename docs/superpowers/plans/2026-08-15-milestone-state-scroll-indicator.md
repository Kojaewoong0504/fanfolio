# 마일스톤 상태 및 스크롤 인디케이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팬 레벨 마일스톤의 완료·현재 잠금·후속 잠금 상태를 정확히 보여주고 카드 레일의 실제 스크롤 위치를 하단 인디케이터에 반영한다.

**Architecture:** `FanGrowth.tsx`에서 마일스톤 상태와 레일 스크롤 진행률을 관리한다. 잠금 아이콘은 기존 아이콘 스타일을 재사용하는 작은 컴포넌트로 분리하고, CSS는 고정 카드 폭과 움직이는 인디케이터를 표현한다. 기존 API와 보상 데이터는 변경하지 않는다.

**Tech Stack:** React, TypeScript, CSS, Node test runner, Vite.

---

### Task 1: 상태·아이콘·스크롤 회귀 테스트 추가

**Files:**
- Modify: `frontend/tests/fan-growth.test.mjs:86-116`

- [ ] **Step 1: Write failing assertions**

  Add assertions that the current milestone renders a lock state, the lock markup is supplied by a named component (not an inline `<svg>`), and the rail binds `onScroll` plus a scroll-progress indicator with client/scroll width calculations.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- --test-name-pattern="milestone"`
  Expected: FAIL because the current card omits the lock state and the progress track is still tied to XP.

### Task 2: Implement data-driven milestone state and icon

**Files:**
- Modify: `frontend/src/components/FanGrowth.tsx:1-220`
- Modify: `frontend/src/components/FanGrowthReference.css:528-555`

- [ ] **Step 1: Add rail state and a scroll-progress calculation**

  Keep a `ref` to `.fan-growth-milestones`, store `{ ratio, viewportRatio }`, calculate `ratio = scrollLeft / maxScrollLeft` and `viewportRatio = clientWidth / scrollWidth`, and update it from `onScroll` and a resize observer.

- [ ] **Step 2: Add a named lock icon component and explicit milestone states**

  Render `complete`, `currentLocked`, and `locked` from the milestone model. The current card must render both the current badge and lock icon when it is not complete. The first prior card keeps the completion check.

- [ ] **Step 3: Replace the XP-width track with a scroll-position indicator**

  Render a fixed track with an active segment whose width is `viewportRatio * 100%` and whose `transform` uses the scroll ratio. Keep it `aria-hidden`.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm test -- --test-name-pattern="milestone"`
  Expected: PASS.

### Task 3: Browser verification and regression suite

**Files:**
- Modify: `design-qa.md`

- [ ] **Step 1: Run the complete automated checks**

  Run: `npm test`
  Run: `npm run lint`
  Run: `npm run build`
  Expected: all pass.

- [ ] **Step 2: Verify the mobile browser states**

  At `/growth`, inspect the initial, middle, and end rail positions. Confirm the current card has a lock icon, the following cards have lock icons, and the active lower indicator moves with horizontal scrolling and reaches the end with the final card visible. Confirm no console errors.

- [ ] **Step 3: Record QA evidence**

  Append the final geometry, interaction, and console results to `design-qa.md` and keep `final result: passed`.
