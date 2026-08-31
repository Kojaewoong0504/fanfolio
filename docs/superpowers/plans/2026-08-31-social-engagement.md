# Social Engagement Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist fan-app artist interests, event likes, and card wishlist actions consistently across home and detail screens.

**Architecture:** Reuse the existing profile and wishlist contracts. Add a small event-like relation with idempotent GET/PUT/DELETE endpoints. Hydrate all home/detail controls from server state and commit successful mutations before updating UI; preview-only surfaces remain non-persistent.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React, TypeScript, pytest, Vitest.

---

### Task 1: Lock the event-like API contract

**Files:**
- Create: `backend/tests/contract/test_event_likes.py`
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0080_event_likes.py`
- Modify: `backend/app/routers/fan.py`

- [x] **Step 1: Write failing contract tests** for authenticated list, idempotent add/delete, and private/unknown event rejection.
- [x] **Step 2: Run the new contract tests and verify they fail** because the model and routes do not exist.
- [x] **Step 3: Add the user-event unique relation and migration.**
- [x] **Step 4: Add `GET /me/event-likes`, `PUT /me/event-likes/{event_id}`, and `DELETE /me/event-likes/{event_id}` with fan auth, public-event validation, and idempotent responses.
- [x] **Step 5: Run the event-like contract tests and verify they pass.**

### Task 2: Add frontend client contracts and hydration

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx` or the existing relevant frontend test file

- [x] **Step 1: Write failing client/UI tests** for loading event-like IDs and invoking mutations.
- [x] **Step 2: Run the targeted frontend tests and verify the new assertions fail.**
- [x] **Step 3: Add typed `getEventLikes`, `likeEvent`, and `unlikeEvent` client functions plus app-level event-like state loading.
- [x] **Step 4: Pass event-like state and mutation callbacks through the home route.**
- [x] **Step 5: Run targeted frontend tests and verify they pass.**

### Task 3: Persist home event and artist interests

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Settings.tsx` if the existing profile save callback needs extraction
- Modify: frontend tests covering `HomeContent`

- [x] **Step 1: Add failing tests** showing event and artist controls call the server-backed callbacks and retain success state.
- [x] **Step 2: Verify the tests fail with the current local-only `Set` state.**
- [x] **Step 3: Replace the event banner local toggle with the event-like callback and loading/rollback behavior.
- [x] **Step 4: Route the artist heart through the existing `/me/profile` update contract and synchronize the current user state.
- [x] **Step 5: Verify home interaction tests pass.**

### Task 4: Synchronize home cards and all card details with wishlist

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/CardDetail.tsx` only if its public contract needs a loading/error state
- Modify: relevant frontend tests

- [x] **Step 1: Add failing tests** for home-card wishlist hydration, add/remove, failed mutation rollback, and collection-detail behavior.
- [x] **Step 2: Verify the tests fail because home cards and collection detail use local-only state.**
- [x] **Step 3: Reuse the app wishlist state and callbacks for home cards and collection detail.
- [x] **Step 4: Keep the existing card-detail wishlist flow and expose pending/error state consistently.
- [x] **Step 5: Run targeted tests and verify they pass.**

### Task 5: Remove misleading preview-only persistence

**Files:**
- Modify: `frontend/src/components/FanSocialHub.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: relevant frontend tests

- [x] **Step 1: Add failing tests** that preview-only fan data does not claim a server-persisted follow/like result.
- [x] **Step 2: Verify the tests fail against the current optimistic preview toggle.**
- [x] **Step 3: Disable or label persistence controls when `initialItems` or demo event/card data is active.
- [x] **Step 4: Verify preview tests pass and real authenticated controls remain active.**

### Task 6: Regression verification and documentation

**Files:**
- Modify: `docs/audits/financial-operations-release-2026-08-31/report.md` only if evidence changes
- Test: backend event/social/wishlist contracts and frontend suite

- [x] **Step 1: Run backend targeted contracts.**
- [x] **Step 2: Run frontend tests, lint, and build.**
- [x] **Step 3: Run migration upgrade to head and `git diff --check`.**
- [x] **Step 4: Review the diff for accidental changes to unrelated UI or untracked user artifacts.**
- [x] **Step 5: Record only verified results in the release report.**
