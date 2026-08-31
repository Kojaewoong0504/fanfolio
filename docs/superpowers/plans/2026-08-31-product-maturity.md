# Fanfolio Product Maturity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the full-product audit findings into consistent, user-verifiable behavior across the admin web, artist studio, and fan app.

**Architecture:** Repair the existing shared contracts first: server-owned growth rewards, shared media fallback, route-level scroll restoration, and explicit public-card/read-model boundaries. Then add explainable recommendation and trade-intent data without replacing the existing product shell. Finish with release-readiness and performance safeguards so cross-app state is inspectable rather than inferred.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, React 19, TypeScript, Vite, Node test runner, pytest.

---

### Task 1: Make card-collection growth server-authoritative

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/contract/test_fan_growth.py`
- Test: `frontend/tests/p0-state-handling.test.mjs`

- [ ] Add a failing contract test asserting that card registration returns the awarded XP and a processing state, and that a later progression read exposes the same amount.
- [ ] Make the XP rule a named server policy value used by the event processor and response serializer; remove the client-only `100 XP` promise.
- [ ] Return `growthEventId`, `growthStatus`, and `awardedXp` from registration and have the client poll/reconcile before rendering a settled result.
- [ ] Verify targeted backend/frontend tests, then the complete backend and frontend suites.

### Task 2: Repair trust-critical fan and studio forms

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `builder_app/styles.css`
- Modify: `frontend/src/components/Settings.tsx`
- Test: `frontend/tests/settings-layout.test.mjs`
- Test: `builder_app/tests/studio-editor-regressions.test.mjs`

- [ ] Add failing DOM/CSS contract tests for support controls, studio collaboration controls, and settings checkboxes.
- [ ] Add scoped design-system styles with stable mobile geometry, labels, focus states, validation messages, and disabled states.
- [ ] Verify the forms at 320px, 390px, and desktop widths.

### Task 3: Unify public card media, routing, and scroll behavior

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AuthenticatedImage.tsx`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/components/PublicCollection.tsx`
- Test: `frontend/tests/card-detail-route.test.mjs`
- Test: `frontend/tests/image-loading-performance.test.mjs`

- [ ] Add failing tests for public artist-card navigation, image fallback, and new-detail scroll position.
- [ ] Add a public artist-card route/read model distinct from `/collection/cards`.
- [ ] Use one media resolver/fallback path and preserve fixed media dimensions on failure.
- [ ] Reset scroll for new route-level details while preserving list position for browser back.

### Task 4: Correct collection intent and explainable recommendations

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/social.py`
- Modify: `frontend/src/components/PublicCollection.tsx`
- Modify: `frontend/src/components/FanSocialHub.tsx`
- Modify: `frontend/src/components/TradeComposer.tsx`
- Test: `backend/tests/contract/test_social_card_trading.py`
- Test: `frontend/tests/social-collection.test.mjs`

- [ ] Add failing tests for separate interested/wanted/offered intent and ranked recommendation reasons.
- [ ] Preserve existing data through a migration/default mapping, then expose explainable score reasons and safe fallback results.
- [ ] Update fan UI copy and selection rules so wanted cards can be unowned catalog cards.

### Task 5: Add cross-app release readiness and offline event foundations

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/artist.py`
- Modify: `admin_app/app.js`
- Modify: `builder_app/app.js`
- Modify: `frontend/src/components/EventDetail.tsx`
- Create: `backend/alembic/versions/*_release_readiness_and_event_checkin.py`
- Test: `backend/tests/contract/test_card_release_workflow.py`
- Test: `backend/tests/test_event_applications.py`
- Test: `admin_app/tests/admin-release-review.test.mjs`

- [ ] Add failing contract tests for one release timeline, prerequisite checks, partner-selected allocation modes, dynamic check-in tokens, and foreign-fan verification fallback.
- [ ] Implement the minimal shared release state and event check-in primitives behind existing role permissions.
- [ ] Render actionable readiness blockers in admin/studio and attendee status in fan event detail.

### Task 6: Protect performance, accessibility, and completion evidence

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/App.tsx`
- Modify: `scripts/e2e-smoke.sh`
- Create: `docs/product/performance-budget.md`
- Test: `frontend/tests/fan-density-regressions.test.mjs`
- Test: `scripts/tests/hosted-preflight.test.mjs`

- [ ] Add failing checks for route chunk limits, reduced-motion behavior, accessible icon names, and mobile overflow.
- [ ] Add route-level lazy boundaries for non-home surfaces and explicit image loading/fetch-priority policy.
- [ ] Run typecheck, lint, full frontend/admin/studio/backend tests, production builds, and browser smoke evidence before completion.

---

## Completion audit

- [ ] Every P0/P1 finding has an automated regression test and a runtime verification record.
- [ ] Every new cross-app state has one authoritative API response and a visible status in its owning product.
- [ ] No known broken form, route mismatch, image fallback, or mobile overflow remains in the audited journeys.
- [ ] Production builds and the complete relevant test suites pass.
