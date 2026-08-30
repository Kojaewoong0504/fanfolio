# Event Upload Hero Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Precompute versioned WebP event-banner derivatives before uploads become ready while retaining lazy repair for historical assets.

**Architecture:** Move the deterministic derivative suffix and ensure operation into `image_processing.py`, then call it from both upload finalization paths and the public event media route. Direct uploads land in staging and are promoted to an immutable canonical source only after validation. Keep the database shape unchanged; the versioned derivative key remains the cache and regeneration contract.

**Tech Stack:** FastAPI, SQLAlchemy, Pillow, storage provider protocol, Pytest

---

### Task 1: Lock the upload contract with failing tests

**Files:**
- Modify: `backend/tests/contract/test_assets.py`
- Modify: `backend/tests/test_event_applications.py`

- [x] **Step 1: Add a contract test for image-only event banner presigns**

Add a request with `purpose: "event_banner"` and `contentType: "application/pdf"`, then assert HTTP 422 with `VALIDATION_ERROR`.

- [x] **Step 2: Add local upload derivative assertions**

Upload the existing 1600×800 event fixture, resolve `configured_asset_storage().asset_path(asset_id, "-event-hero-v1.webp")`, and assert the object exists and decodes as a 1200×600 WebP before any public event route is requested.

- [x] **Step 3: Add direct-storage derivative assertions**

Extend `FakeDirectStorage` with `save_derived_bytes`, complete a direct `event_banner` upload, and assert the derivative object is a valid 1200×600 WebP when completion returns `ready`.

- [x] **Step 4: Prove the new tests fail for the intended reason**

Run:

```bash
.venv/bin/python -m pytest tests/contract/test_assets.py tests/test_event_applications.py -q
```

Expected: failures show that event banners accept a non-image presign and that neither upload path has created `-event-hero-v1.webp` yet.

### Task 2: Centralize and invoke derivative generation

**Files:**
- Modify: `backend/app/image_processing.py`
- Modify: `backend/app/routers/assets.py`
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/schemas.py`

- [x] **Step 1: Add the versioned derivative contract**

Define `EVENT_HERO_DERIVATIVE_SUFFIX = "-event-hero-v1.webp"` and `ensure_event_hero_derivative(storage, asset_id, source_path, source_content=None)`. Return an existing derivative; otherwise read supplied/source bytes, optimize them, and call `save_derived_bytes`.

- [x] **Step 2: Generate during API uploads**

After the existing safety scan and original save, call the ensure helper in `run_in_threadpool` for `event_banner`. Set `upload_completed_at` only after it succeeds.

- [x] **Step 3: Generate during direct completion**

Read the direct-upload object once, use the bytes for both the safety scan and derivative generation, and mark the asset complete only after derivative persistence succeeds.

- [x] **Step 4: Reuse the helper in public media delivery**

Replace the duplicated suffix/existence/optimization code in `get_event_hero` with one thread-pool call to `ensure_event_hero_derivative`.

- [x] **Step 5: Restrict event banner MIME types**

Include `event_banner` in the existing image-purpose validator and rename the validator to describe all image-only purposes.

- [x] **Step 6: Make the targeted suite green**

Run:

```bash
.venv/bin/python -m pytest tests/contract/test_assets.py tests/test_event_applications.py -q
```

Expected: all selected tests pass.

### Task 3: Prove eager generation and fallback behavior

**Files:**
- Modify: `backend/tests/test_event_applications.py`

- [x] **Step 1: Prove first-view independence from the original**

After creating and publishing an event, delete its original `.bin` object and assert the first public hero request still returns the precomputed WebP.

- [x] **Step 2: Prove historical-asset fallback**

Delete only the derivative, leave the original object intact, request the public hero, and assert the WebP derivative is recreated and returned.

- [x] **Step 3: Run targeted regressions**

Run:

```bash
.venv/bin/python -m pytest tests/contract/test_assets.py tests/test_event_applications.py tests/unit/test_upload_safety.py -q
```

Expected: all selected tests pass.

### Task 4: Verify, integrate, and deploy

**Files:**
- Verify all modified backend and documentation files.

- [x] **Step 1: Format and lint**

Run:

```bash
.venv/bin/ruff format --check app tests
.venv/bin/ruff check app tests
```

Expected: both commands exit 0.

- [x] **Step 2: Run the full backend suite**

Run:

```bash
.venv/bin/python -m pytest -q
```

Expected: 499 or more tests pass, two tests skip, and no test fails.

- [ ] **Step 3: Review the final diff and commit with Lore trailers**

Confirm only scoped files changed, then commit the design, tests, implementation, and plan with recorded constraints and verification.

- [ ] **Step 4: Push, open a pull request, pass CI, and merge**

Push `codex/event-upload-hero-optimization`, create a PR against `main`, wait for required checks, and merge without modifying unrelated local files.

- [ ] **Step 5: Verify production behavior**

Upload a real event banner in the deployed administrator app, confirm completion succeeds, then verify the public hero response is WebP, bounded to 1200×600, substantially smaller than the original, cacheable, and available without first-request conversion.

### Review hardening: Preserve immutable and non-blocking media delivery

**Files:**
- Modify: `backend/app/storage.py`
- Modify: `backend/app/image_processing.py`
- Modify: `backend/app/routers/assets.py`
- Modify: `backend/app/routers/events.py`
- Modify: `backend/tests/contract/test_assets.py`
- Modify: `backend/tests/test_event_applications.py`
- Modify: `backend/tests/unit/test_storage.py`

- [x] Reject a second API upload after an asset is complete.
- [x] Stage direct uploads separately, promote accepted bytes to canonical storage, and detach completed assets from reusable presigned URLs.
- [x] Force derivative regeneration from newly accepted bytes during completion.
- [x] Move object-store operations used by direct completion and public hero delivery into a thread pool.
- [x] Store event derivatives with WebP object metadata.
- [x] Normalize missing or invalid legacy event media to `404 EVENT_ASSET_NOT_READY` without hiding provider outages.
- [x] Assert failure atomicity, immutable completion, decoded lazy fallback, and direct staging cleanup.
