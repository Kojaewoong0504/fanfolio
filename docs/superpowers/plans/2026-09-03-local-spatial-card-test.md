# Local Spatial Card Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the real spatial-scene worker locally so one uploaded source image can be processed and previewed without Render or production infrastructure.

**Architecture:** Keep the existing local PostgreSQL/Redis/Celery stack unchanged. Add a local-only Compose overlay that starts the real `spatial_worker` HTTP service on `localhost:8080`; the host FastAPI/Celery processes use the existing asynchronous job API and call that worker through `SPATIAL_SCENE_PROVIDER=http`. The browser consumes the persisted result through the existing Studio flow.

**Tech Stack:** Docker/Podman Compose, FastAPI, Celery, Python worker, Depth Anything V2 Small, rembg/IS-Net, OpenCV, Node test runner.

---

### Task 1: Lock the local worker contract

**Files:**
- Create: `scripts/tests/local-spatial-worker-compose.test.mjs`
- Create: `docker-compose.spatial-worker.local.yml`

- [ ] **Step 1: Write the failing test**

Assert that the local overlay defines a `spatial-worker` service, exposes port 8080, uses the existing worker Dockerfile, and passes the local worker token.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/local-spatial-worker-compose.test.mjs`

Expected: FAIL because the overlay and test do not exist yet.

- [ ] **Step 3: Add the minimal Compose overlay**

Define only the worker service so it can be combined with the existing local infrastructure. Bind `8080:8080`, set a development-only token, and add a health check for `/health`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/tests/local-spatial-worker-compose.test.mjs`

Expected: PASS.

### Task 2: Add an explicit local real-AI configuration

**Files:**
- Create: `backend/.env.spatial-local.example`
- Modify: `README.md`

- [ ] **Step 1: Write the failing configuration test**

Extend the Compose contract test to assert that the documented local environment selects the HTTP provider, points to `http://localhost:8080/generate`, and uses Celery with local Redis.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/local-spatial-worker-compose.test.mjs`

Expected: FAIL because the environment example and local run instructions are absent.

- [ ] **Step 3: Add the local environment example and runbook**

Keep the existing `backend/.env` untouched. Add an opt-in example with `SPATIAL_SCENE_PROVIDER=http`, the local worker URL/token, Celery Redis URLs, and local storage. Document the exact commands to start infrastructure, start the worker overlay, run migrations, start API, start Celery worker/beat, and verify `/health` before using Studio.

- [ ] **Step 4: Run the test and Markdown/config checks**

Run: `node --test scripts/tests/local-spatial-worker-compose.test.mjs`

Expected: PASS with the local commands and values present.

### Task 3: Verify the real local path

**Files:**
- Modify: none unless verification reveals a local wiring defect.

- [ ] **Step 1: Validate Compose syntax**

Run: `docker compose -f docker-compose.local.yml -f docker-compose.spatial-worker.local.yml config`

Expected: valid merged configuration. If Docker is unavailable, run the equivalent Podman Compose command.

- [ ] **Step 2: Run targeted backend tests**

Run: `cd backend && .venv/bin/python -m pytest -q tests/unit/test_spatial_scene.py tests/unit/test_tasks.py`

Expected: PASS.

- [ ] **Step 3: Verify worker health and real generation when model dependencies are available**

Start the local worker and call `/health`; then run the existing spatial-scene job flow against a real uploaded image. Record whether model download, memory, or runtime availability prevents the end-to-end run. Do not claim the real model path is verified from unit tests alone.

- [ ] **Step 4: Report the exact local result**

Report changed files, commands that passed, and any environment-specific blocker such as missing Docker or unavailable model weights.
