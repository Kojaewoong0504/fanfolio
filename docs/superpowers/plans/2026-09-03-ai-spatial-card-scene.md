# AI Spatial Card Scene Implementation Plan

> Prototype plan, not a production readiness checklist. Service adoption follows [the production design](../specs/2026-09-03-spatial-card-production-design.md); do not infer completion from the tasks below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading single-depth fallback contract with a validated depth, person-mask, and inpainted-background AI scene bundle and a layered WebGL preview.

**Architecture:** Keep large vision models outside the primary API behind a private HTTP worker contract. Validate and persist aligned derived images in existing private storage, then render constrained parallax from separate background and foreground layers with a 2D fallback.

**Tech Stack:** FastAPI, httpx, Pillow, existing Asset storage, vanilla WebGL, Node and pytest tests.

---

### Task 1: Lock the AI bundle contract

**Files:**
- Modify: `backend/tests/unit/test_spatial_scene.py`
- Modify: `backend/app/spatial_scene.py`

- [ ] Add failing tests for three aligned image outputs, invalid dimensions, safe public metadata, and HTTP provider errors.
- [ ] Run `.venv/bin/python -m pytest -q tests/unit/test_spatial_scene.py` and confirm the new tests fail.
- [ ] Add focused bundle, provider, validation, and public-metadata functions.
- [ ] Re-run the test file and confirm it passes.

### Task 2: Persist all private derivatives

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/routers/artist.py`
- Test: `backend/tests/contract/test_admin_and_artist.py`

- [ ] Add settings for `SPATIAL_SCENE_PROVIDER`, worker URL, token, and timeout.
- [ ] Add a failing artist contract test that requires depth, mask, and background IDs without storage-path disclosure.
- [ ] Update generation to invoke the selected provider, save all derivatives, and persist version 2 metadata.
- [ ] Add authenticated endpoints for each derivative and run the targeted contract test.

### Task 3: Make Studio status truthful

**Files:**
- Modify: `builder_app/app.js`
- Modify: `builder_app/tests/studio-core.test.mjs`

- [ ] Add a failing test for version 2 metadata persistence.
- [ ] Update status and notifications to distinguish AI bundle completion from local preview.
- [ ] Run `node --test tests/*.test.mjs` from `builder_app`.

### Task 4: Render real layer separation without image-space warping

**Files:**
- Modify: `frontend/public/spatial-scene-preview-v4.html`
- Test: `frontend/tests/spatial-scene-preview.test.mjs`

- [ ] Add a failing regression test that rejects fragment-space UV displacement.
- [ ] Convert the aligned depth map into a smoothed indexed foreground mesh.
- [ ] Render the foreground mesh and reconstructed background plane through one perspective camera and z-buffer.
- [ ] Constrain yaw/pitch and portrait relief, and keep rounded clipping.
- [ ] Verify center pose, pointer motion, resize, and device-orientation fallback in the browser.

### Task 5: Regression verification

**Files:**
- Modify: `docs/design/card-effects-research-2026-09-02.md`

- [ ] Document the selected open-source model classes and deployment boundary.
- [ ] Run targeted backend tests, Ruff, Studio tests, and the frontend build.
- [ ] Open the preview in a real browser and capture the final visual state.
