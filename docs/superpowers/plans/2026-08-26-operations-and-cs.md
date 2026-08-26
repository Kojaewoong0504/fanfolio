# Fanfolio 운영 안정화 및 CS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출시 게이트, CS 운영, 전달 실패 큐, 거래·소셜 안전성까지 우선순위 1~5를 운영 가능한 상태로 만든다.

**Architecture:** 기존 FastAPI·SQLAlchemy·Alembic 구조에 CS 티켓/메시지 테이블과 팬·관리자 API를 추가한다. 기존 Notification/NotificationDelivery/AuditLog를 재사용하고, 관리자 웹은 현재 정적 렌더링 패턴에 운영 큐 화면을 추가한다. 거래·소셜은 새 추상화를 만들지 않고 기존 잠금·차단 로직의 회귀 계약을 보강한다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pytest, vanilla admin app, Node test runner, Vite.

---

### Task 1: CS 데이터 모델과 마이그레이션

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/alembic/versions/0060_support_tickets.py`
- Test: `backend/tests/unit/test_support_models.py`

- [x] Write tests for ticket status/type constraints, message ordering, and ticket ownership fields.
- [x] Run the focused model test and confirm it fails because the models do not exist.
- [x] Add `SupportTicket` and `SupportMessage` models with indexed status/user fields and constrained status/type values enforced by service validation.
- [x] Add Alembic migration with foreign keys, indexes, and timestamps.
- [x] Run model and migration tests.

### Task 2: Fan CS API

**Files:**
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/services.py`
- Test: `backend/tests/contract/test_support_tickets.py`

- [x] Add failing tests for create/list/detail and rejecting another fan's ticket.
- [x] Implement `POST /api/me/support-tickets`, `GET /api/me/support-tickets`, and `GET /api/me/support-tickets/{ticket_id}`.
- [x] Validate category, subject, body length, and create the initial message atomically.
- [x] Add a single support-created notification for the user-visible timeline.
- [x] Run focused contract tests.

### Task 3: Admin CS queue and replies

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/admin_access.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/contract/test_admin_support.py`

- [x] Add failing tests for list filters, reply, status transitions, permission denial, and audit records.
- [x] Implement `GET /api/admin/support-tickets`, `GET /api/admin/support-tickets/{ticket_id}`, `POST /api/admin/support-tickets/{ticket_id}/messages`, and `PATCH /api/admin/support-tickets/{ticket_id}`.
- [x] Restrict transitions to `open -> in_progress -> answered -> closed` while allowing a closed ticket to reopen only through an explicit admin action.
- [x] Create an in-app notification and email outbox row for an answer when the fan has email notifications enabled.
- [x] Add audit records for replies and state changes.
- [x] Run focused admin contract tests.

### Task 4: Fan settings CS UI and admin queue UI

**Files:**
- Modify: `frontend/src/components/Settings.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Test: `frontend/tests/settings-support.test.mjs`
- Test: `admin_app/tests/admin-support.test.mjs`

- [x] Add failing source-contract tests for FAQ/inquiry actions and admin queue navigation.
- [x] Replace dead settings buttons with FAQ content and an inquiry form backed by the fan API.
- [x] Add admin navigation, list/detail rendering, reply form, status controls, loading, empty, and error states.
- [x] Run focused frontend/admin tests and syntax checks.

### Task 5: Delivery operations and social safety regression

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/notification_delivery.py`
- Modify: `backend/app/routers/social.py`
- Test: `backend/tests/contract/test_admin_notifications.py`
- Test: `backend/tests/contract/test_social_card_trading.py`
- Test: `backend/tests/contract/test_social_safety.py`

- [x] Add failing tests for delivery retry authorization, dead-letter visibility, trade double-accept, expiry, and block isolation.
- [x] Add an admin-only delivery retry endpoint that resets a failed delivery without exposing destination secrets.
- [x] Ensure block checks cover follow, search, collection, and trade creation.
- [x] Add explicit conflict assertions for a second trade accept.
- [x] Run focused tests.

### Task 6: Release verification and documentation

**Files:**
- Modify: `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`
- Modify: `docs/FAN_APP_IMPLEMENTATION_STATUS.md`
- Modify: `docs/CLOUDFLARE_FIREBASE_RESEND_SETUP.md`
- Test: existing backend/admin/frontend suites

- [x] Record the actual integrated card upload/review/publish verification boundary.
- [x] Record CS, delivery operations, and social safety as implemented or remaining verification items.
- [x] Run full backend tests, frontend tests/build, admin tests, lint, and diff checks.
