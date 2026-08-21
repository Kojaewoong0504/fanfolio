# Task 9 Studio Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let artist-studio users save validated effect versions, submit them for review, and expose only approved effect configurations to fan card details while preserving the existing front/back interaction rules.

**Architecture:** Keep the existing `Card.design_config` as the published fan-facing configuration and add `CardEffectVersion` as the draft/review history. Artist endpoints create and edit version snapshots; admin review endpoints approve or reject them and copy only approved configuration to the card. Existing `normalizeCardEffects`, `InteractiveCollectibleCard`, and admin review preview remain the single rendering path.

**Tech Stack:** FastAPI, SQLAlchemy/SQLite/Postgres, Pydantic v2, React/TypeScript, Node contract tests.

---

### Task 9.1: Lock the effect validation and visibility contract

**Files:**
- Create: `backend/tests/contract/test_studio_effect_versions.py`
- Create: `frontend/tests/studio-effect-contract.test.mjs`

- [x] Write backend tests for allowed presets, bounds, rejected media references, ownership checks, review submission, and fan non-disclosure before approval.
- [x] Write frontend source-contract tests for preset labels, back-side tilt-only behavior, and the approved effect payload reaching the existing card renderer.
- [x] Run the focused tests and confirm they fail because the version model/routes do not exist, then re-run them green after implementation.

### Task 9.2: Add versioned effect storage and schema validation

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0047_studio_effect_versions.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/artist.py`

- [x] Add `CardEffectVersion` with card/version/config/author/status/submitted_at/approved_at fields and a unique `(card_id, version)` constraint.
- [x] Add Pydantic schemas restricting presets to `light`, `glow`, `foil`, `hologram`, `particles`, and `motion`; clamp intensity/speed to `0..1`, particle count to `0..40`, colors to `#RRGGBB`, and back interaction to `tilt` only.
- [x] Validate referenced media IDs through the existing asset ownership checks and reject oversized/unknown media metadata.
- [x] Run the backend contract tests to confirm the validation behavior passes.

### Task 9.3: Connect artist editing and admin review APIs

**Files:**
- Modify: `backend/app/routers/artist.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/schemas.py`

- [x] Add artist create/list/update/submit-review routes for effect versions scoped to the artist-owned card.
- [x] Add admin list/detail/approve/reject routes scoped by existing organization/artist permissions.
- [x] On approval, update only the card's published `design_config`; leave draft/rejected versions available for audit.
- [x] Return effect-version data through the admin effect-version endpoints and only approved config in fan-facing card data.

### Task 9.4: Make the existing studio and review surfaces preset-driven

**Files:**
- Modify: `frontend/src/utils/cardEffects.ts`
- Modify: `frontend/src/components/InteractiveCollectibleCard.tsx`
- Modify: `admin_app/app.js`
- Modify: `admin_app/tests/partner-access.test.mjs`

- [x] Add typed preset/config helpers and accessible labels without changing existing front/back rendering behavior.
- [x] Ensure front supports tilt/effect preview and back supports tilt only, with no back-side light overlay.
- [x] Make admin review preview consume the stored effect configuration and show the preset-driven review state.
- [x] Add regression assertions for the shared renderer and review preview.

### Task 9.5: Verify and document Task 9

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-fanfolio-product-roadmap.md`
- Modify: `fanfolio-api-contract-map.html`

- [x] Run backend release/review and studio effect tests.
- [x] Run frontend effect tests, full test suite, build, and admin preview tests.
- [x] Update the roadmap checkboxes and API map after focused tests pass.
- [x] Run `git diff --check` and report any uncommitted or unrelated files separately.

Verification evidence: `backend/.venv/bin/pytest -q backend/tests/contract/test_studio_effect_versions.py backend/tests/unit/test_api_contract_map.py` (6 passed), `npm --prefix frontend test` (143 passed), `npm --prefix frontend run build`, `node --check admin_app/app.js`, and `node --test admin_app/tests/card-operations-preview.test.mjs` (10 passed). The full backend suite still has five pre-existing failures outside Task 9: three release/CSV contract expectations and two historical migration fixtures failing before revision 0047.
