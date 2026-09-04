# Modal AI Worker Integration Implementation Plan

**Goal:** Move expensive artist-studio photo/spatial analysis behind a controlled Modal endpoint while preserving the existing API and local fallback.

**Architecture:** Keep the Render API responsible for authentication, job state, idempotency, and R2 persistence. Add a Modal adapter that speaks the existing worker payload contract, with explicit request limits and a safe local fallback for development.

**Tech Stack:** FastAPI, httpx, Python, Modal, existing spatial worker models, R2-compatible storage.

---

### Task 1: Lock provider configuration behavior

**Files:** `backend/app/core/config.py`, `backend/tests/unit/test_spatial_scene.py`, `backend/.env.example`

- [ ] Add a `modal` provider option that requires the same server-only URL/token settings as `http`.
- [ ] Add tests for accepted provider and missing URL failure.
- [ ] Keep `local_fallback` as the default.

### Task 2: Add Modal deployment artifact

**Files:** `modal_app.py`, `modal_requirements.txt`, `docs/MODAL_AI_WORKER.md`

- [ ] Expose `/generate` and `/analyze` with the existing base64 response contract.
- [ ] Limit concurrency and document secrets, R2 handling, cold starts, and budget limits.
- [ ] Keep all credentials server-side.

### Task 3: Connect and verify the backend

**Files:** `backend/app/spatial_scene.py`, `backend/tests/unit/test_spatial_scene.py`

- [ ] Route `modal` through the validated private HTTP provider.
- [ ] Run targeted tests, then backend tests and a local API smoke test.
- [ ] Do not change Render variables until the Modal endpoint has passed a real-image request.

### Task 4: Browser/provider setup gate

- [ ] Use the available in-app browser to inspect Modal workspace setup.
- [ ] Create or configure only the required Modal deployment settings after the endpoint artifact is validated.
- [ ] Verify the endpoint response before wiring Render.
