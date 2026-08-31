# Financial Operations Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining 7~12 release-readiness items with durable PostgreSQL safeguards, scheduled balance reconciliation, unified point operations, authenticated admin E2E coverage, and verified hosted deployment evidence.

**Architecture:** Keep financial mutations append-only and transaction-scoped. Reconciliation remains read-only and is executed by the existing Celery Beat path, while admin operations expose the same service result used by tests. Deployment and production E2E remain evidence gates: they are recorded only after the hosted checks actually run.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, PostgreSQL/SQLite test fixtures, Celery Beat, Node test runner, GitHub Actions, Vercel/Render.

---

### Task 7: PostgreSQL role separation and concurrency evidence

**Files:**
- Create: `backend/alembic/versions/0079_point_ledger_privileges.py`
- Create: `backend/tests/integration/test_postgres_financial_integrity.py`
- Modify: `backend/tests/unit/test_migrations.py`
- Modify: `.env.production.example`
- Create: `docs/POSTGRES_FINANCIAL_OPERATIONS_RUNBOOK.md`

- [x] Add a production-only migration that revokes `UPDATE`, `DELETE`, and `TRUNCATE` on `point_ledger` from the configured application role while preserving `INSERT` and `SELECT`; no hard-coded credential or role is committed.
- [x] Add a PostgreSQL integration test that skips unless `FANFOLIO_POSTGRES_TEST_URL` is set, then verifies an attempted ledger mutation is rejected.
- [x] Add migration-source assertions and document the exact operator commands and the SQLite limitation.

### Task 8: Scheduled reconciliation and operator alert

**Files:**
- Modify: `backend/app/tasks.py`
- Modify: `backend/app/services.py`
- Create: `backend/tests/unit/test_point_reconciliation_task.py`
- Modify: `docs/POSTGRES_FINANCIAL_OPERATIONS_RUNBOOK.md`

- [x] Add a Celery task that runs the existing read-only reconciliation and emits a structured warning when drift exists.
- [x] Add the task to Beat with a configurable interval and test drift cases without external services.

### Task 9: Unified point command boundary

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/tests/unit/test_growth_economy_services.py`
- Modify: `docs/audits/service-completeness-security-recommendation-ledger-2026-08-31.md`

- [x] Route earn, spend, and reverse through one explicit command boundary while retaining existing idempotency keys and source provenance.
- [x] Preserve existing regression coverage for replay, insufficient balance, reversal, and zero-amount rejection.

### Task 10: Admin financial operations E2E

**Files:**
- Modify: `backend/tests/contract/test_support_tickets.py`
- Modify: `admin_app/tests/admin-statistics-production.test.mjs`
- Create: `scripts/financial-operations-smoke.sh`

- [x] Exercise approval, adjustment, refund, and reconciliation response shapes through the existing authenticated contract harness.
- [x] Add a one-command smoke script that fails closed when the hosted admin/API URLs or credentials are absent.

### Task 11: Hosted deployment gate

**Files:**
- Modify: `scripts/hosted-preflight.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/RENDER_PERSISTENCE_RUNBOOK.md`

- [ ] Verify GitHub checks, Render readiness, and the three Vercel deployment states in the browser or hosted preflight.
- [ ] If the provider quota is open, trigger the existing deployment workflow; otherwise record the exact quota blocker without claiming production deployment.

### Task 12: Production mobile, payment, points, and QR E2E

**Files:**
- Modify: `scripts/hosted-preflight.sh`
- Create: `docs/audits/financial-operations-release-2026-08-31/report.md`

- [ ] Run the hosted smoke sequence for mobile routes, point charge/refund, QR permission fallback, and event/card rendering.
- [ ] Record status per flow with URL, timestamp, and evidence; keep unavailable device or credential paths explicitly incomplete.
