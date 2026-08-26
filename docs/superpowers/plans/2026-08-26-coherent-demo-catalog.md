# Coherent Demo Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inconsistent demo artist/member assets with one coherent four-member female DREAMSCAPE catalog used consistently by the fan app, admin app, artist studio, and hosted seed data.

**Architecture:** A versioned local character manifest is the single source for demo group/member identity, visual descriptors, and asset paths. Backend bootstrap data and frontend preview data reference the same stable IDs and asset filenames. The seed is idempotent and only owns explicitly prefixed demo records/assets; user accounts and collected inventory remain untouched.

**Tech Stack:** FastAPI/SQLAlchemy seed services, React/Vite frontend assets, vanilla admin/studio apps, Node tests, pytest, built-in image generation.

---

### Task 1: Establish the canonical DREAMSCAPE manifest

**Files:**
- Create: `docs/demo-catalog/dreamscape-character-bible.json`
- Create: `docs/demo-catalog/README.md`
- Test: `frontend/tests/coherent-demo-catalog.test.mjs`

- [ ] Define one group and four female members with stable IDs, names, roles, fixed visual descriptors, and allowed variation fields.
- [ ] Document that face shape, eye shape, skin tone, base hair silhouette, and identifying marks are invariant; outfit, pose, lighting, and hair color accents are variant fields.
- [ ] Add a source-level test that rejects unknown DREAMSCAPE member IDs and mismatched member/image mappings.

### Task 2: Generate and install the replacement asset set

**Files:**
- Create: `frontend/src/assets/demo/dreamscape/*`
- Modify: `frontend/src/assets/demo-catalog.ts`

- [ ] Generate a coherent group reference and four member reference portraits using the same visual bible.
- [ ] Generate derived event hero, card-pack, card, and shop campaign assets from the same reference direction.
- [ ] Store all selected assets in the repository with stable filenames and record their mapping in the manifest.

### Task 3: Make backend demo seed coherent and idempotent

**Files:**
- Modify: `backend/app/services.py`
- Test: `backend/tests/contract/test_catalog_bootstrap.py`

- [ ] Replace the inconsistent DREAMSCAPE member rows and image paths with the canonical four-member set.
- [ ] Update demo card, pack, product, event, and growth content to reference only canonical IDs and assets.
- [ ] Preserve existing records and update only owned demo catalog records; do not delete users, user cards, trades, or orders.
- [ ] Assert seed idempotency and referential integrity on a second run.

### Task 4: Make frontend previews use the same catalog

**Files:**
- Create: `frontend/src/assets/demo-catalog.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/utils/cardVisual.ts`
- Test: `frontend/tests/coherent-demo-catalog.test.mjs`

- [ ] Replace hard-coded mixed member/image pairs with canonical member records.
- [ ] Ensure home, discover, collection, growth, shop, event, reveal, and card-detail previews use the same member IDs and assets.
- [ ] Keep hosted API data authoritative when authenticated; use the canonical preview catalog only for explicit preview/fallback routes.

### Task 5: Align admin and studio sample content

**Files:**
- Modify: `admin_app/app.js`
- Modify: `builder_app/app.js`
- Test: `admin_app/tests/coherent-demo-catalog.test.mjs`
- Test: `builder_app/tests/coherent-demo-catalog.test.mjs`

- [ ] Remove stale sample labels and image paths that point to the old mixed catalog.
- [ ] Ensure card registration, review, preview, and studio home use the same group/member labels.
- [ ] Keep admin/studio API data authoritative after authentication.

### Task 6: Verify local and hosted replacement behavior

**Files:**
- Modify: `docs/audits/platform-hardening-2-12-2026-08-26.md`

- [ ] Run focused manifest, backend seed, admin, builder, frontend, lint, and build checks.
- [ ] Verify the fan, admin, and studio browser routes show the same group/member identity and no old asset mapping.
- [ ] Push through the existing PR workflow, wait for Render/Vercel deployment, and verify the hosted public screens.
- [ ] Record any credential-gated or provider-gated checks without claiming them as complete.
