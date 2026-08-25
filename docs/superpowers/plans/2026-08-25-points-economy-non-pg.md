# Non-PG Points Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Fanfolio's point-based commerce without a PG by making point charge, spend, refund, and non-PG product fulfillment atomic and idempotent.

**Architecture:** Keep an append-only `PointLedger` as the source of truth and lock one `PointBalance` row for each mutation. Use durable engagement events plus idempotency keys for charge/refund/order replay, and commit the point mutation, order state, and fulfillment grant in one database transaction. PG/easy-payment methods remain rejected and are not simulated.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, SQLite/PostgreSQL, Alembic, pytest, existing Fanfolio React API client.

---

### Task 1: Lock the economy contract with failing backend tests

**Files:**
- Modify: `backend/tests/contract/test_shop_api.py`
- Create: `backend/tests/contract/test_points_economy.py`

- [x] **Step 1: Add tests for idempotent internal point charge and refund**

Assert that the same idempotency key creates one ledger row and one balance change, that a refund can only reverse one completed order, and that a second refund replay returns the original result without changing the balance again.

- [x] **Step 2: Add tests for atomic product fulfillment**

Seed a published card-pack product, purchase it twice with one idempotency key, and assert one order, one point spend, one pack entitlement, and a successful subsequent pack opening. Add point-item and limited-item cases that create one reward grant each and replay without duplication.

- [x] **Step 3: Run only the new tests and verify expected failures**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_points_economy.py backend/tests/contract/test_shop_api.py`

Expected: failures identify missing charge/refund endpoints, missing order idempotency/fulfillment, and missing refund state rather than fixture or import errors.

### Task 2: Add durable point transaction and fulfillment models

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0053_point_transactions_and_shop_refunds.py`
- Create: `backend/alembic/versions/0054_shop_product_fulfillment.py`
- Create: `backend/alembic/versions/0055_shop_order_entitlements.py`
- Create: `backend/alembic/versions/0056_reward_grant_revocation.py`
- Test: `backend/tests/unit/test_migrations.py`

- [x] **Step 1: Add a unique point transaction reference**

Add a `PointTransaction` table keyed by `(user_id, idempotency_key)` with operation (`charge`, `refund`, `adjustment`), requested amount, resulting ledger id, status, and timestamps. Keep `PointLedger` append-only and retain its foreign-key event provenance.

- [x] **Step 2: Add order refund/fulfillment state**

Extend `ShopOrder` with a unique idempotency key, optional source event id, refund ledger id, refunded timestamp, and fulfillment status. Add `ShopOrderEntitlement` for purchased card-pack access and revocation state on `RewardGrant` for reward/item refunds, each unique per order and target.

- [x] **Step 3: Add an Alembic migration compatible with fresh and legacy databases**

Create tables/columns only when absent, add unique indexes and status checks, and provide a downgrade that removes only these new objects.

- [x] **Step 4: Run migration tests**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py`

Expected: upgrade/downgrade and fresh-schema assertions pass.

### Task 3: Implement atomic point mutations

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/contract/test_points_economy.py`

- [x] **Step 1: Implement a single locked mutation helper**

Create a service that starts/uses one transaction, locks or creates the user's balance, inserts the durable transaction and engagement event idempotently, appends exactly one ledger row, rejects negative resulting balances, and returns the replayed result when the key already exists.

- [x] **Step 2: Add non-PG admin point charging**

Expose a root-admin-only endpoint for local/manual point issuance with explicit reason and idempotency key. It must be clearly labeled as an internal adjustment, not a payment capture, and must never call a PG.

- [x] **Step 3: Add fan-visible refund for eligible point orders**

Expose an authenticated refund endpoint that locks the order, verifies ownership and completed/refundable status, appends one reverse ledger row, marks the order refunded, and returns the resulting balance. Replays return the same refund result; concurrent requests cannot double refund.

- [ ] **Step 4: Run the focused economy tests**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_points_economy.py`

Expected: charge/refund atomicity and idempotency tests pass.

### Task 4: Make point orders fulfill all non-PG product types

**Files:**
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/contract/test_shop_api.py`
- Test: `frontend/tests/shop-preview.test.mjs`

- [x] **Step 1: Add order idempotency and use the atomic mutation**

Require `Idempotency-Key` for purchase creation, lock the sellable product/order reference, spend points once, and persist the order snapshot in the same transaction.

- [x] **Step 2: Fulfill card-pack products**

Create one pack entitlement and expose it through the fan inventory/opening path. Opening consumes the entitlement atomically and reuses the existing weighted, idempotent card-pack draw logic.

- [x] **Step 3: Fulfill point-item and limited-item products**

Resolve the product's reward metadata, create one durable reward grant or owned item grant, and reject products whose metadata is incomplete instead of charging without fulfillment.

- [x] **Step 4: Connect frontend checkout/history/refund state**

Send idempotency keys, display supported point-only payment, show refund status/actions where eligible, and surface server-provided order/fulfillment outcomes. Do not render fake card, KakaoPay, or Naver Pay success paths.

- [x] **Step 5: Run focused frontend/backend tests**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_shop_api.py backend/tests/contract/test_points_economy.py` and `cd frontend && npm test -- --runInBand`.

Expected: all focused tests and existing frontend tests pass.

### Task 5: Verify and document the non-PG boundary

**Files:**
- Modify: `docs/audits/fan-app-flow-audit-2026-08-25.md`
- Create: `docs/audits/non-pg-points-economy-2026-08-25.md`

- [x] **Step 1: Document supported and intentionally unsupported payment behavior**

Record that internal point issuance, point spending, product fulfillment, and order refunds are implemented atomically; PG capture, card storage, KakaoPay, Naver Pay, and real-money settlement remain unavailable by design.

- [x] **Step 2: Run full verification**

Run backend contract/unit tests, `cd frontend && npm test`, `npm run lint`, `npm run build`, and `git diff --check`.

- [x] **Step 3: Report evidence and remaining risks**

Report exact test results, migration status, and the remaining external prerequisite: a real PG and refund settlement adapter once business registration and provider credentials are available.
