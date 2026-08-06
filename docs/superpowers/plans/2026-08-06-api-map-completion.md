# API Map Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every endpoint shown in `fanfolio-api-contract-map.html` satisfy its documented authorization, input, state, and persistence contract.

**Architecture:** Preserve the existing FastAPI router → service → SQLAlchemy async-session boundary. Add the missing persistence fields and transaction-backed services only where the API map promises durable behavior; keep `APP_ENV=test` fixtures deterministic. Contract tests exercise the HTTP boundary for every path and error state.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy 2 async, SQLite/aiosqlite, pytest, Ruff.

---

### Task 1: Lock auth and shared error behavior

**Files:**
- Modify: `backend/app/dependencies.py`, `backend/app/routers/auth.py`, `backend/app/services.py`, `backend/app/main.py`
- Test: `backend/tests/contract/test_auth.py`, `backend/tests/contract/test_health.py`

- [ ] Write failing tests showing Admin and Artist can log out, logout invalidates the server session, and malformed request bodies return `{ ok: false, error: { code: "VALIDATION_ERROR" } }`.
- [ ] Run `APP_ENV=test python3 -m uv run pytest tests/contract/test_auth.py tests/contract/test_health.py -q` and confirm failure.
- [ ] Change logout to depend on `current_user`, delete its `Session` row using the cookie token, then expire the cookie. Add a FastAPI `RequestValidationError` handler returning the shared error envelope.
- [ ] Re-run the focused tests and commit the auth/error boundary change.

### Task 2: Make fan catalog and collection contracts complete

**Files:**
- Modify: `backend/app/models.py`, `backend/app/routers/fan.py`, `backend/app/services.py`
- Test: `backend/tests/contract/test_fan_experience.py`, `backend/tests/contract/test_redemptions.py`

- [ ] Write failing tests for `q`, `memberId`, `page`, and `pageSize` catalog filtering while preserving published/official-only visibility.
- [ ] Run the focused fan tests and confirm failure.
- [ ] Persist `Card.member_id`; apply filtering and bounded pagination in the catalog query. Return pagination metadata without exposing drafts or unofficial cards.
- [ ] Re-run focused tests and commit the fan read-model change.

### Task 3: Make admin metrics, code batches, and publishing durable

**Files:**
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services.py`, `backend/app/routers/admin.py`
- Test: `backend/tests/contract/test_admin_and_artist.py`, `backend/tests/contract/test_redemptions.py`

- [ ] Write failing tests proving a batch creates redeemable one-time codes, dashboard counts database values, and Admin cannot publish a draft card before artist review.
- [ ] Run focused tests and confirm failure.
- [ ] Add a `RedeemCodeBatch` model, generate unique prefixed codes transactionally, calculate dashboard metrics from DB data, and allow publish only from `pending_review`.
- [ ] Re-run focused tests and commit the admin workflow change.

### Task 4: Preserve artist studio input and ownership rules

**Files:**
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/artist.py`
- Test: `backend/tests/contract/test_admin_and_artist.py`

- [ ] Write failing tests for card input persistence, invalid image ownership, and background-removal body validation.
- [ ] Run the focused artist tests and confirm failure.
- [ ] Store template, season, rarity, issue limit, and image asset reference on artist cards; reject an unowned asset; validate `{ "mode": "handwriting" }` for the asynchronous handwriting job.
- [ ] Re-run focused tests and commit the artist workflow change.

### Task 5: Verify map coverage and update the artifact

**Files:**
- Modify: `fanfolio-api-contract-map.html`, `BACKEND_IMPLEMENTATION_CONTRACT.md`
- Test: `backend/tests/contract/`

- [ ] Add explicit contract coverage for every map endpoint and its map-specific authorization/error expectation.
- [ ] Run `APP_ENV=test python3 -m uv run pytest tests/contract -q`, `python3 -m uv run ruff check .`, and `python3 -m uv run ruff format --check .`.
- [ ] Update the map notes/test links so no endpoint claims a behavior not backed by an implementation and test. Commit the documentation verification change.

## Coverage review

The plan covers all 19 map entries: health (Task 1/5), test fixtures (Task 5), auth (Task 1), fan collection/redemption/profile/catalog/notifications (Task 2), admin dashboard/batch/publish (Task 3), and artist card/review/background removal (Task 4). Real email delivery, a production background worker, and Alembic migrations are intentionally outside the map’s HTTP contract and remain integration follow-ups.
