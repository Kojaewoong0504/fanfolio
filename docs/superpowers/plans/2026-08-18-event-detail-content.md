# Event Detail Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators manage event descriptions, notice items, and multiple related cards, then render the saved content on the fan event detail page.

**Architecture:** Keep the existing `Event` aggregate as the source of truth. Store notices as a validated JSON list on `Event` and related cards in an ordered `EventRelatedCard` join table. Extend the existing admin event create/update contract, including published-event detail edits, and return the resolved related-card payload to the fan client.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Alembic, React, TypeScript, Node test runner, pytest.

---

### Task 1: Lock the content contract with failing tests

**Files:**
- Modify: `backend/tests/test_event_applications.py`
- Modify: `admin_app/tests/admin-events.test.mjs`
- Modify: `frontend/tests/event-flow.test.mjs`

- [ ] Add backend assertions that an admin event accepts `noticeItems` and ordered `relatedCardIds`, and that the fan detail returns `description`, `noticeItems`, and resolved `relatedCards`.
- [ ] Add an admin source test for notice editing and multiple related-card controls in the event drawer payload.
- [ ] Add a frontend source test that detail content comes from the event payload and does not use the current static related-card or notice fixture.
- [ ] Run the targeted tests and confirm they fail before implementation.

### Task 2: Add persistent event detail content

**Files:**
- Create: `backend/alembic/versions/0037_event_detail_content.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`

- [ ] Add `Event.notice_items` as a non-null JSON list with empty-list default and add `EventRelatedCard(event_id, card_id, position)` with unique event/card and event/position constraints.
- [ ] Add `noticeItems` and `relatedCardIds` to create/update schemas with bounded lengths and non-empty trimmed notice validation.
- [ ] Add the migration with foreign keys, indexes, and a safe downgrade.

### Task 3: Return and save related cards and notices through the API

**Files:**
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/event_services.py` if scope validation is extracted there.
- Modify: `backend/tests/test_event_applications.py`

- [ ] Include notices and related-card ids in admin event payloads.
- [ ] Validate every related card exists and is inside the administrator’s artist scope before saving.
- [ ] Replace related-card rows transactionally on create/update while preserving the submitted order.
- [ ] Resolve related card name, rarity, member, artist, and image URL for fan event detail responses.
- [ ] Allow an authorized administrator to update event detail fields for published events without silently changing the workflow status; retain stricter lifecycle controls for submit/review/publish/end.

### Task 4: Add administrator controls

**Files:**
- Modify: `admin_app/app.js`
- Modify: `admin_app/index.html` if the static cache version needs bumping.
- Modify: `admin_app/tests/admin-events.test.mjs`

- [ ] Add a multiline `유의사항` editor and a related-card checkbox/select group backed by loaded catalog cards.
- [ ] Send `description`, `noticeItems`, and ordered `relatedCardIds` in the event save payload.
- [ ] Show the edit action for published events and preserve the event workflow status after detail edits.
- [ ] Keep unavailable card selections visible as an explicit empty state instead of silently falling back to mock cards.

### Task 5: Render the saved content in the fan app

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/EventDetail.tsx`
- Modify: `frontend/tests/event-flow.test.mjs`

- [ ] Add typed `noticeItems` and `relatedCards` fields to `FanEvent`.
- [ ] Render the event description only when non-empty, render the API related-card list in order, and show an explicit no-related-cards state when empty.
- [ ] Render API notice items in the existing reference-styled notice section and show a clear no-notices state when empty.
- [ ] Keep card navigation targets and authenticated media loading compatible with the existing event card image loader.

### Task 6: Verify the vertical slice

**Files:**
- No source changes unless verification exposes a regression.

- [ ] Run targeted backend, admin, and frontend tests.
- [ ] Run the full backend event tests, all admin tests, frontend tests, and frontend build.
- [ ] Use the Codex in-app browser to edit the existing local event, attach related cards and notices, reload the fan detail page, and verify the values survive a refresh.
- [ ] Inspect `git diff --check` and report any pre-existing dirty files separately from this feature.
