# Event Application Real-Data Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fan event flow persist and reload real event/application state without production fallback fixtures.

**Architecture:** Keep the existing FastAPI event/application model and notification service as the source of truth. The React app will render explicit loading, empty, error, unavailable, and applied states from API responses, while the My page will open a real application list backed by `/me/event-applications`.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Alembic, React, TypeScript, Node test runner, pytest.

---

### Task 1: Lock the real-data contract with regression tests

**Files:**
- Modify: `frontend/tests/event-flow.test.mjs`
- Modify: `backend/tests/test_event_applications.py`

- [ ] Assert the event list never substitutes `fallbackEventList` when the API returns an empty list.
- [ ] Assert the completion view uses the submitted event data and the My page requests `/me/event-applications`.
- [ ] Assert an application is idempotent for repeated requests and safe under the database uniqueness boundary.
- [ ] Assert closed/full events reject new applications and expose the corresponding public status.

### Task 2: Make event application persistence race-safe and notification-backed

**Files:**
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/event_services.py` if the existing due-notification reconciliation needs the event reminder contract completed.
- Modify: `backend/app/schemas.py` only if response typing needs to match the public payload.

- [ ] Keep the existing unique `(event_id, user_id)` constraint.
- [ ] Re-check availability immediately before insert and convert uniqueness races into the existing idempotent success response.
- [ ] Create one confirmation notification per user/event and preserve the existing event notification reconciliation for upcoming deadlines.

### Task 3: Remove event production fallbacks and make detail/application state server-driven

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/EventList.tsx`
- Modify: `frontend/src/components/EventDetail.tsx`
- Modify: `frontend/src/api/client.ts`

- [ ] Render API items exactly, including an empty state when the server returns no events.
- [ ] Keep fallback fixtures available only for explicitly local/demo surfaces, never for the event list or a failed detail request in the signed-in app.
- [ ] Pass the submitted event into completion so title, date, venue, and event id are not static.
- [ ] Refresh detail/list/notifications after application and handle 401, 404, 409, and generic errors visibly.

### Task 4: Connect My → My events to persisted applications

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Settings.tsx` or add a focused event-application list component if needed.
- Modify: `frontend/tests/event-flow.test.mjs`

- [ ] Add a typed `getMyEventApplications` client function.
- [ ] Render a loading, error, empty, and populated application list from the API.
- [ ] Allow an application row to reopen its real event detail.

### Task 5: Verify the vertical slice

**Files:**
- No source changes unless verification exposes a regression.

- [ ] Run the targeted frontend event tests and backend event application tests.
- [ ] Run frontend lint, typecheck/build, and the relevant backend contract/unit tests.
- [ ] Inspect the final diff and confirm no unrelated local files were changed.
