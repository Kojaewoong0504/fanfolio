# Fanfolio FastAPI Learning Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계약 테스트를 통과하면서 최신 FastAPI, Pydantic v2, SQLAlchemy 2 async 패턴을 학습할 수 있는 Fanfolio MVP 백엔드를 구현한다.

**Architecture:** `main.py`는 application factory와 lifespan만 담당한다. HTTP 해석은 `routers`, 요청/응답 검증은 `schemas`, SQLAlchemy async 테이블은 `models`, DB 트랜잭션과 상태 전이는 `services`에 둔다. 테스트 데이터는 `APP_ENV=test`에서만 등록되는 router가 생성한다.

**Tech Stack:** Python 3.11, FastAPI 0.141, Pydantic v2, SQLAlchemy 2.0 asyncio, SQLite + aiosqlite, Alembic, pytest, HTTPX

---

## File structure

```text
backend/app/
  main.py                 application factory, lifespan, exception handler
  core/config.py          pydantic-settings configuration
  db/session.py           async engine/session dependency
  models.py               SQLAlchemy 2 DeclarativeBase tables/enums
  schemas.py              Pydantic v2 request/response models
  dependencies.py         cookie session + role dependencies
  services.py             transactions, seed data, business rules
  routers/
    health.py auth.py test_support.py fan.py admin.py artist.py
```

### Task 1: async database foundation and application factory

**Files:**
- Create: `backend/app/core/config.py`, `backend/app/db/session.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/health.py`
- Modify: `backend/app/main.py`, `backend/pyproject.toml`
- Test: `backend/tests/contract/test_health.py`

- [ ] Add `aiosqlite` to backend dependencies and set `database_url` through `pydantic-settings`.
- [ ] Create a `DeclarativeBase`, `create_async_engine`, and `async_sessionmaker(..., expire_on_commit=False)`.
- [ ] Use a FastAPI `lifespan` context manager to call `Base.metadata.create_all` only for the tutorial SQLite database and dispose the engine on shutdown.
- [ ] Add `HealthData` and `SuccessResponse` Pydantic v2 models. Health returns `{"ok": True, "data": {"status": "healthy"}}`.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_health.py -q
```

Expected: `1 passed`.

### Task 2: common errors, tables, and test-only seed boundary

**Files:**
- Create: `backend/app/routers/test_support.py`
- Modify: `backend/app/main.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services.py`
- Test: `backend/tests/conftest.py`

- [ ] Define User, Session, Card, Drop, RedeemCode, UserCard, Notification, Asset, and BackgroundRemovalJob models with string primary keys for stable fixture IDs.
- [ ] Add an `AppError` exception and one handler that serializes all domain errors as `{"ok": false, "error": {"code": ..., "message": ...}}`.
- [ ] Register `/api/test/reset` and `/api/test/seed` only when `settings.app_env == "test"`.
- [ ] Make seed create sessions for fan/otherFan/admin/artist, published and draft cards, active/ended drops, five code states, one notification, and artist assets.
- [ ] Verify the fixture setup reaches the first unimplemented route instead of failing at reset/seed:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_auth.py -q
```

Expected: seed succeeds; magic-link request is the only remaining failure.

### Task 3: authentication and `Annotated` role dependencies

**Files:**
- Create: `backend/app/dependencies.py`, `backend/app/routers/auth.py`
- Modify: `backend/app/main.py`, `backend/app/schemas.py`, `backend/app/services.py`
- Test: `backend/tests/contract/test_auth.py`

- [ ] Implement `get_current_user` from the `fanfolio_session` cookie and aliases `FanUser`, `AdminUser`, `ArtistUser` with `Annotated[..., Depends(...)]`.
- [ ] Implement magic-link request as a provider-agnostic `202 {delivery: "queued"}` response; do not send a real email in the tutorial.
- [ ] Implement logout with a 204 response and cookie deletion.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_auth.py -q
```

Expected: `2 passed`.

### Task 4: atomic digital card redemption and collection

**Files:**
- Create: `backend/app/routers/fan.py`
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services.py`, `backend/app/main.py`
- Test: `backend/tests/contract/test_redemptions.py`

- [ ] In `redeem_code`, use one `async with session.begin()` block for code validation, `used_count` update, and UserCard creation.
- [ ] Map invalid, reused, expired, ended-drop, unpublished-card, and exhausted states to the contract’s exact status/code combinations.
- [ ] Implement collection read model from UserCard joined with Card, exposing official published card data only.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_redemptions.py -q
```

Expected: `4 passed`.

### Task 5: fan onboarding, ownership, catalog, notifications

**Files:**
- Modify: `backend/app/routers/fan.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services.py`
- Test: `backend/tests/contract/test_fan_experience.py`

- [ ] Implement profile PATCH and mark onboarding complete after nickname/favorites update.
- [ ] Query card detail by `user_card_id` and current user ID together; return `USER_CARD_NOT_FOUND` rather than revealing another fan’s card.
- [ ] Implement catalog query restricted to `published` and `is_official=True`; implement notification list and read-state update.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_fan_experience.py -q
```

Expected: `4 passed`.

### Task 6: admin and artist state boundaries

**Files:**
- Create: `backend/app/routers/admin.py`, `backend/app/routers/artist.py`
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services.py`, `backend/app/main.py`
- Test: `backend/tests/contract/test_admin_and_artist.py`

- [ ] Implement admin dashboard and one-time code batch creation; return a generated batch ID and `/api/admin/redeem-code-batches/{id}/export` URL.
- [ ] Implement artist draft creation and only allow `draft → pending_review` for the owning artist.
- [ ] Implement admin-only publish; artist attempts return `403 FORBIDDEN`.
- [ ] Implement background-removal request as a DB job with `queued` state and 202 response; document the later Celery enqueue point in code.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract/test_admin_and_artist.py -q
```

Expected: `4 passed`.

### Task 7: final tutorial verification and documentation

**Files:**
- Modify: `README.md`, `BACKEND_IMPLEMENTATION_CONTRACT.md`
- Test: all contract tests

- [ ] Add a concise learning order, async session rules, and the Celery handoff boundary to the README.
- [ ] Keep all educational comments focused on current patterns: Pydantic v2, `Annotated`, lifespan, request-scoped AsyncSession, eager loading, and transaction ownership.
- [ ] Verify:

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract -q
python3 -m uv run ruff check .
python3 -m uv run ruff format --check .
```

Expected: all contract tests and Ruff checks pass.
