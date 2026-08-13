# Managed Fan Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real event lifecycle from admin creation and review through scheduled fan-app visibility, without changing existing Drop or card-publication contracts.

**Architecture:** Add an `Event` persistence model and service-level transition/visibility rules. Expose scoped admin CRUD/review endpoints and public fan home/list/detail endpoints. Then connect the existing admin shell and fan React app to those contracts with server pagination, previews, and empty states.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic, vanilla admin JavaScript, React/Vite fan app, Node test runner, pytest.

---

### Task 1: Lock the backend contract with failing tests

**Files:**
- Create: `backend/tests/contract/test_events.py`
- Modify: `backend/tests/unit/test_api_contract_map.py`

- [ ] **Step 1: Write model and API contract tests**

```python
def test_event_workflow_and_public_status_contract():
    assert EventWorkflowStatus.__members__.keys() >= {
        "draft", "pending_review", "changes_requested", "approved",
        "scheduled", "published", "ended",
    }
    assert public_event_status("scheduled", starts_at=future, ends_at=later, now=now) == "upcoming"
    assert public_event_status("scheduled", starts_at=past, ends_at=later, now=now) == "active"

def test_event_type_accepts_only_one_link():
    with pytest.raises(ValueError, match="exactly one connection"):
        EventCreateRequest(event_type="card", card_id="card_1", drop_id="drop_1", ...)

def test_admin_event_routes_are_registered():
    assert {"/api/admin/events", "/api/admin/events/{event_id}/review"} <= route_paths()
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `cd backend && pytest tests/contract/test_events.py -q`

Expected: FAIL because the event schemas, model, route list, and status helper do not exist.

- [ ] **Step 3: Add only imports/test fixtures needed for the contract**

Use the existing `conftest.py` session/auth fixtures and keep all event assertions independent of network or object storage.

- [ ] **Step 4: Commit the red tests**

```bash
git add backend/tests/contract/test_events.py backend/tests/unit/test_api_contract_map.py
git commit -m "이벤트 운영 계약의 실패 테스트를 먼저 고정한다"
```

### Task 2: Add Event model, schemas, permissions, and migration

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/admin_access.py`
- Create: `backend/alembic/versions/0035_managed_events.py`
- Test: `backend/tests/contract/test_events.py`

- [ ] **Step 1: Add the `Event` model and enums**

Add string-backed status/type constants, nullable explicit links (`drop_id`, `card_id`, `achievement_id`), `hero_asset_id`, review fields, timestamps, and indexes exactly as defined in `docs/superpowers/specs/2026-08-13-managed-fan-events-design.md`.

- [ ] **Step 2: Add Pydantic request/response schemas**

Implement `EventCreateRequest`, `EventUpdateRequest`, `EventReviewRequest`, `AdminEventItem`, `FanEventItem`, `EventListResponse`, and `HomeResponse`; reject non-HTTPS external URLs, invalid time ranges, non-image `event_banner` assets, and multiple link fields.

- [ ] **Step 3: Add scoped permissions**

Add `events:read`, `events:write`, `events:submit`, `events:review`, and `events:publish` to `ROOT_ACTIONS`, `PLATFORM_ACTIONS`, and partner role sets. Do not grant publish to partner roles.

- [ ] **Step 4: Create an idempotent Alembic migration**

Create `events`, foreign keys, indexes, and nullable fields. The migration must inspect the table before creating or dropping it so test databases that already contain partial schemas remain safe.

- [ ] **Step 5: Run backend migration and contract tests**

Run: `cd backend && pytest tests/contract/test_events.py tests/unit/test_migrations.py -q`

Expected: PASS.

- [ ] **Step 6: Commit the persistence contract**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/admin_access.py backend/alembic/versions/0035_managed_events.py backend/tests
git commit -m "관리 가능한 이벤트 도메인과 권한을 추가한다"
```

### Task 3: Implement event workflow and public query services

**Files:**
- Create: `backend/app/event_services.py`
- Modify: `backend/app/services.py`
- Test: `backend/tests/contract/test_events.py`
- Test: `backend/tests/unit/test_event_services.py`

- [ ] **Step 1: Write service tests**

Cover `validate_event_links`, `transition_event`, `public_event_status`, scoped event queries, featured priority selection, and idempotent `event_started:{id}` notification creation.

- [ ] **Step 2: Implement pure status and validation helpers**

Keep time-derived display status pure and timezone-aware. Reject transitions outside the state diagram and ensure link ownership matches organization/artist scope.

- [ ] **Step 3: Implement transition service**

Use one transaction for review decision, publish/end, audit log, and `published_at`; call the existing `record_audit` helper and do not mutate linked Drop/Card/Achievement status.

- [ ] **Step 4: Implement public event query service**

Filter only approved public states, derive active/upcoming/ended, enforce the 90-day ended retention, select one featured event by priority/start/update order, and return sanitized fan fields.

- [ ] **Step 5: Run service tests**

Run: `cd backend && pytest tests/unit/test_event_services.py tests/contract/test_events.py -q`

Expected: PASS.

### Task 4: Add admin and fan API routes

**Files:**
- Create: `backend/app/routers/events.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/contract/test_events.py`

- [ ] **Step 1: Add admin list/detail/create/update routes**

Implement `GET/POST /api/admin/events`, `GET/PATCH /api/admin/events/{event_id}`, applying `CurrentAdmin` scope and server pagination query parameters.

- [ ] **Step 2: Add submit/review/publish/end/delete routes**

Implement the state transitions from the spec. `DELETE` must reject any event with `published_at`; review responses include the review note and current derived status.

- [ ] **Step 3: Add fan routes**

Implement `GET /api/home`, `GET /api/events`, `GET /api/events/{event_id}`, and the hero asset response using existing storage helpers. Keep internal organization, audit, and asset paths out of fan payloads.

- [ ] **Step 4: Register routes and upload purpose**

Register the router in `main.py` and extend `UploadPresignRequest.purpose` with `event_banner`; enforce image MIME types for that purpose.

- [ ] **Step 5: Add route tests for auth, pagination, filters, and 404 behavior**

Run: `cd backend && pytest tests/contract/test_events.py tests/contract/test_fan_experience.py -q`

Expected: PASS.

### Task 5: Build admin event management UI

**Files:**
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `admin_app/tests/admin-events.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert the sidebar has `이벤트`, list requests include `page/pageSize/q/status/type/artistId`, rows open details by click and Enter/Space, and the editor exposes event type-specific link fields.

- [ ] **Step 2: Add event state and API loaders**

Reuse the existing `api`, `state`, pagination, permission, and row-selection patterns from card review. Reset page to 1 whenever search/filter changes.

- [ ] **Step 3: Add list and detail/editor views**

Use the established dark navy/violet admin shell, dense rows, right detail panel, status chips, image upload, type-aware connection selector, preview toggle, and review action bar.

- [ ] **Step 4: Bind workflow actions and keyboard behavior**

Guard nested controls from triggering row navigation; support submit, review, schedule, publish, end, duplicate draft, and delete draft actions.

- [ ] **Step 5: Run admin tests and lint**

Run: `cd admin_app && node --test tests/*.test.mjs && npm run lint`

Expected: all existing and new tests pass.

### Task 6: Connect fan home, event list, and detail

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Create: `frontend/src/components/EventCard.tsx`
- Create: `frontend/src/components/EventList.tsx`
- Create: `frontend/src/components/EventDetail.tsx`
- Test: `frontend/src/components/EventFlow.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover no large `홈` heading, featured event rendering, active/upcoming/ended tabs, event CTA routing, sanitized external links, empty states, and five-item bottom navigation with home centered.

- [ ] **Step 2: Add typed event/home API clients**

Use the existing fetch/auth client and preserve card/artist query behavior. Add pagination metadata and typed CTA targets.

- [ ] **Step 3: Implement event components and routes**

Add `/events`, `/events/:id`, and home sections. Reuse existing cards, artist avatars, typography, and responsive shell; do not introduce a second design system.

- [ ] **Step 4: Add responsive behavior**

Keep 320px minimum width, prevent horizontal overflow, maintain five equal nav items, and preserve card detail front/back behavior.

- [ ] **Step 5: Run fan tests and build**

Run: `cd frontend && npm test && npm run build`

Expected: PASS and a successful Vite/TypeScript build.

### Task 7: End-to-end verification and rollout fixture

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/contract/test_event_rollout.py`
- Modify: `admin_app/tests/admin-events.test.mjs`
- Modify: `frontend/src/components/EventFlow.test.tsx`

- [ ] **Step 1: Add a seeded QA event fixture**

Create one scheduled `card_drop` event linked to the existing QA drop/card, with an `event_banner` asset, behind the existing demo seed flag.

- [ ] **Step 2: Add due-event notification reconciliation**

Expose an idempotent service callable from the deployment scheduler and call it opportunistically from public event reads; never block a read when notification delivery fails.

- [ ] **Step 3: Run the full verification matrix**

Run:

```bash
cd backend && pytest -q
cd ../admin_app && node --test tests/*.test.mjs
cd ../frontend && npm test && npm run build
git diff --check
```

Expected: all tests pass, build succeeds, and diff check is clean.

- [ ] **Step 4: Commit the integrated feature**

```bash
git add backend admin_app frontend docs/superpowers/plans/2026-08-13-managed-fan-events.md
git commit -m "관리자 이벤트를 팬앱 공개 흐름에 연결한다"
```

## Self-review checklist

- Spec coverage: data model/permissions/workflow/API/admin UI/fan UI/notifications/testing/rollout are covered by Tasks 1–7.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps appear in the plan.
- Type consistency: `workflow_status`, `event_type`, link fields, `event_started:{id}`, and pagination names are consistent across model, API, UI, and tests.
