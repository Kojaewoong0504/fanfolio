# Fanfolio JWT RTR Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace new Fanfolio authentication sessions with short-lived JWT access tokens and refresh-token rotation while preserving client-scoped fan/admin/artist behavior during migration.

**Architecture:** The backend issues a signed access JWT in the authentication response and a signed refresh JWT in an HttpOnly, client-scoped cookie. Every refresh request atomically consumes the presented refresh-token record, creates a replacement in the same family, and revokes the complete family on replay. The frontend keeps the access token in memory, attaches it as a Bearer token, and performs one coordinated refresh/retry after a 401.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, PyJWT HS256, React 19, TypeScript, pytest, Playwright smoke tests.

---

### Task 1: Add token configuration and the refresh-token persistence model

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0017_refresh_tokens.py`
- Modify: `backend/app/services.py`

- [ ] Add `PyJWT>=2.10.1` and settings for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_TTL_SECONDS`, and `JWT_REFRESH_TTL_SECONDS`; production validation must reject development secrets and non-positive TTLs.
- [ ] Add `RefreshToken` with `jti` primary key, `family_id`, `token_digest`, `user_id`, `client`, `expires_at`, `created_at`, `used_at`, `revoked_at`, and `replaced_by_jti`; add indexes for `(family_id)`, `(user_id, client)`, and `token_digest`.
- [ ] Create Alembic revision `0017_refresh_tokens` with an idempotent `upgrade()` and `downgrade()`.
- [ ] Update test seeding/reset cleanup to remove refresh-token rows and return no production credentials.
- [ ] Run `cd backend && .venv/bin/ruff check app tests` and `APP_ENV=test .venv/bin/pytest tests/unit/test_config.py -q`.

### Task 2: Implement JWT issuance, validation, and RTR service functions

**Files:**
- Create: `backend/app/auth_tokens.py`
- Modify: `backend/app/dependencies.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/unit/test_auth_tokens.py`

- [ ] Implement `issue_access_token(user, client)` with claims `sub`, `role`, `client`, `typ=access`, `iss`, `aud`, `iat`, `exp`, and `jti`.
- [ ] Implement `issue_refresh_token(session, user, client, family_id=None)`; store only the SHA-256 digest of the signed JWT and return the raw JWT once.
- [ ] Implement `rotate_refresh_token(session, raw_token, client)`; reject wrong type, issuer, audience, client, expiry, unknown jti, revoked row, or digest mismatch; if `used_at`/`replaced_by_jti` is present, revoke every row in the family and raise a replay error; otherwise mark the row used, create its replacement, and return a new access/refresh pair.
- [ ] Implement `revoke_refresh_family(session, family_id)` and `decode_access_token(raw_token, expected_client)` with explicit error codes.
- [ ] Update `current_user` to prefer `Authorization: Bearer` access JWT and use legacy `Session` lookup only outside production for existing fixture clients; role dependencies remain unchanged.
- [ ] Add `/api/auth/refresh` and update login/verification responses to return `accessToken` while setting the refresh cookie; logout revokes the current refresh family and clears the refresh cookie.
- [ ] Unit-test valid/expired/tampered access JWTs, refresh rotation, old-token replay family revocation, wrong-client rejection, and logout revocation.

### Task 3: Preserve the current contract suite during migration

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/contract/test_auth.py`
- Modify: `backend/tests/contract/test_fan_experience.py`
- Create or modify: `backend/tests/contract/test_jwt_rtr.py`

- [ ] Keep seeded legacy session clients working in `APP_ENV=test` so unrelated fan/admin/artist contract tests remain focused on their API behavior.
- [ ] Add contract tests that verify login response `data.accessToken`, client-scoped HttpOnly refresh cookies, `/api/auth/refresh` rotation, old refresh replay returning 401 and invalidating the family, and logout invalidation.
- [ ] Verify a fan access token cannot call an admin route and an admin token cannot be replayed as a fan token.
- [ ] Run the full backend contract suite and record the result before frontend edits.

### Task 4: Add frontend in-memory access-token transport and coordinated refresh

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`
- Test: `scripts/e2e-smoke.sh`

- [ ] Add module-scoped `accessToken`, `setAccessToken`, and `clearAccessToken`; do not persist access tokens in localStorage/sessionStorage.
- [ ] Make `apiFetch` attach `Authorization: Bearer` when present; on one 401, share a single refresh promise, call `/auth/refresh`, update memory, and retry the original request once; never recursively refresh auth endpoints.
- [ ] Store the access token returned by magic-link verification in the login callback and clear it on logout or terminal refresh failure.
- [ ] Let initial session probing use the refresh cookie after a page reload so a valid browser login remains signed in without storing the access JWT.
- [ ] Add smoke assertions for access-token refresh after reload, refresh-token rotation, logout, and no local-storage token persistence.
- [ ] Run `npm run lint && npm run build`.

### Task 5: Update environment and deployment documentation

**Files:**
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-07-fanfolio-commercial-auth-and-brand-design.md`
- Create: `backend/tests/unit/test_config_jwt.py`

- [ ] Document development secrets separately from production secrets and show the exact callback/cookie expectations.
- [ ] Add configuration tests proving production rejects default JWT secrets, insecure frontend URL, and non-positive TTLs.
- [ ] Document that refresh cookies require HTTPS and that secrets must be supplied by deployment secret management.

### Task 6: Verification and handoff

**Files:**
- No new implementation files; inspect all changed files.

- [ ] Run `git diff --check`.
- [ ] Run backend unit and contract tests.
- [ ] Run frontend lint/build.
- [ ] Run `PW_SESSION=fan-ui bash scripts/e2e-smoke.sh` with backend and frontend services running.
- [ ] Confirm no JWT or refresh-token value is written to browser storage or application logs.
- [ ] Report remaining OAuth-provider work separately; JWT/RTR must be complete before adding Kakao/Google callbacks.

