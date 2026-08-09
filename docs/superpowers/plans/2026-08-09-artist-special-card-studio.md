# Artist Special Card Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the artist studio so artists can create, save, preview, and submit cards containing handwriting, voice, holographic effects, and short video, then see the same media behavior in the fan app.

**Architecture:** Keep the static ES-module studio and existing FastAPI media contracts. Move pure draft and validation behavior into a small testable module, add one review-note database field, reuse existing asset upload endpoints, and make studio/fan renderers consume the same versioned `designConfig` values.

**Tech Stack:** Browser ES modules, Node test runner, React 19/Vite, FastAPI, Pydantic 2, SQLAlchemy 2 async, Alembic, pytest.

---

## File map

- Create `builder_app/package.json`: Node test command and ES-module boundary.
- Create `builder_app/studio-core.js`: pure draft normalization, design payload, review readiness, dashboard statistics.
- Create `builder_app/tests/studio-core.test.mjs`: studio domain regression tests.
- Modify `builder_app/app.js`: dashboard, unified media tools, autosave, preview, review-note submission, navigation.
- Modify `builder_app/styles.css`: dashboard, media panels, fan preview, accessible states, responsive layout.
- Modify `builder_app/index.html`: corrected favicon reference and asset metadata.
- Modify `backend/app/models.py`: latest artist review note.
- Modify `backend/app/schemas.py`: submit-review request model.
- Modify `backend/app/routers/artist.py`: media validation and review-note persistence.
- Modify `backend/app/routers/admin.py`: expose review note to operations.
- Create `backend/alembic/versions/0024_artist_review_note.py`: PostgreSQL migration.
- Modify `backend/tests/contract/test_admin_and_artist.py`: artist review media validation.
- Modify `backend/tests/contract/test_admin_management.py`: admin visibility of review note.
- Modify `frontend/src/components/CardDetail.tsx`: video, voice and hologram fan experience.
- Modify `frontend/src/index.css`: dynamic card media/effect styles.
- Modify `frontend/src/api/client.ts`: typed special-card detail fields if required.
- Create `frontend/tests/card-special-media-contract.test.mjs`: fan special-media UI contract.

### Task 1: Lock the artist review media contract

**Files:**
- Modify: `backend/tests/contract/test_admin_and_artist.py`
- Modify: `backend/tests/contract/test_admin_management.py`

- [ ] **Step 1: Write the failing artist review tests**

Add tests that create a draft with `hasVoice=true` but no `voiceAssetId` and expect:

```python
response = actors["artist"].post(
    f"/api/artist/cards/{draft['id']}/submit-review",
    json={"reviewNote": "컴백 주간에 맞춰 공개해 주세요."},
)
assert_error(response, 409, "CARD_MEDIA_INCOMPLETE")
```

Add a successful case with owned voice/video assets and assert the response contains the saved note:

```python
submitted = assert_success(
    artist.post(
        f"/api/artist/cards/{draft['id']}/submit-review",
        json={"reviewNote": "모션과 보이스 타이밍을 함께 확인해 주세요."},
    )
)
assert submitted["reviewNote"] == "모션과 보이스 타이밍을 함께 확인해 주세요."
```

- [ ] **Step 2: Verify the new tests fail for the missing contract**

Run:

```bash
cd backend && uv run pytest tests/contract/test_admin_and_artist.py -k "review" -q
```

Expected: failure because submit-review does not accept or return `reviewNote`, and incomplete enabled voice currently passes.

- [ ] **Step 3: Add the admin visibility test**

After an artist submits a note, assert:

```python
detail = assert_success(admin.get(f"/api/admin/cards/{draft['id']}"))
assert detail["reviewNote"] == "모션과 보이스 타이밍을 함께 확인해 주세요."
```

- [ ] **Step 4: Run the admin visibility test and verify RED**

Run:

```bash
cd backend && uv run pytest tests/contract/test_admin_management.py -k "review_note" -q
```

Expected: failure because admin card data has no review note.

### Task 2: Implement review-note persistence and media validation

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/artist.py`
- Modify: `backend/app/routers/admin.py`
- Create: `backend/alembic/versions/0024_artist_review_note.py`

- [ ] **Step 1: Add the schema and model field**

Use this request model:

```python
class ArtistReviewSubmitRequest(BaseModel):
    review_note: str | None = Field(default=None, alias="reviewNote", max_length=500)
    model_config = ConfigDict(populate_by_name=True)
```

Add to `Card`:

```python
review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

- [ ] **Step 2: Add migration 0024**

The upgrade adds `cards.review_note VARCHAR(500) NULL`; downgrade drops it. Set `down_revision` to the current migration head `0023_role_scoped_user_email` revision identifier.

- [ ] **Step 3: Validate active media before review**

Implement a helper with these rules:

```python
if card.has_voice and not card.voice_asset_id:
    raise AppError(409, "CARD_MEDIA_INCOMPLETE", "보이스 파일을 추가해 주세요.")
video_enabled = bool((card.design_config or {}).get("video", {}).get("enabled"))
if video_enabled and not card.video_asset_id:
    raise AppError(409, "CARD_MEDIA_INCOMPLETE", "모션 영상을 추가해 주세요.")
```

For attached assets, call `owned_asset` so ownership and storage readiness use the existing path.

- [ ] **Step 4: Persist and expose the review note**

The submit endpoint accepts the request model, saves `card.review_note`, changes status to `pending_review`, and returns:

```python
{"ok": True, "data": {"id": card.id, "status": card.status, "reviewNote": card.review_note}}
```

Add `reviewNote` to artist and admin card data.

- [ ] **Step 5: Verify GREEN and run backend quality checks**

Run:

```bash
cd backend && uv run pytest tests/contract/test_admin_and_artist.py tests/contract/test_admin_management.py -q
cd backend && uv run ruff format --check app tests
cd backend && uv run ruff check app tests
```

Expected: all selected tests pass and Ruff exits 0.

- [ ] **Step 6: Commit the backend contract**

Commit only backend files with a Lore-format message that records the enabled-media validation constraint and test evidence.

### Task 3: Create the testable studio domain module

**Files:**
- Create: `builder_app/package.json`
- Create: `builder_app/studio-core.js`
- Create: `builder_app/tests/studio-core.test.mjs`

- [ ] **Step 1: Add failing draft and review-readiness tests**

Use Node's test runner:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCardPayload, reviewReadiness, studioDashboard } from '../studio-core.js'

test('uploads the visual-editor image instead of asking for it again', () => {
  const payload = buildCardPayload({ form: {}, editor: { imageAssetId: 'asset_card' } })
  assert.equal(payload.imageAssetId, 'asset_card')
})

test('blocks review when an enabled voice card has no voice asset', () => {
  const result = reviewReadiness({ hasVoice: true, voiceAssetId: null })
  assert.equal(result.ready, false)
  assert.equal(result.items.voice.status, 'missing')
})

test('blocks review when enabled motion has no video asset', () => {
  const result = reviewReadiness({ designConfig: { video: { enabled: true } } })
  assert.equal(result.items.video.status, 'missing')
})

test('summarizes draft, review, revision and published cards', () => {
  assert.deepEqual(studioDashboard([
    { status: 'draft' }, { status: 'pending_review' },
    { status: 'changes_requested' }, { status: 'published' },
  ]).counts, { draft: 1, pendingReview: 1, changesRequested: 1, published: 1 })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm --prefix builder_app test
```

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement pure functions**

`buildCardPayload` must preserve existing API aliases and use editor asset IDs. `reviewReadiness` returns one item each for base image, catalog, handwriting, voice, video, issue limit and preview. `studioDashboard` returns counts and recent/actionable cards without mutating input.

- [ ] **Step 4: Verify GREEN**

Run `npm --prefix builder_app test`; expected all tests pass.

### Task 4: Replace the false home route with a working studio dashboard

**Files:**
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`
- Modify: `builder_app/tests/studio-core.test.mjs`

- [ ] **Step 1: Add a failing navigation-state test**

Add a pure reducer test proving `home` resolves to `{ view: 'home', step: 0 }` and `create` resolves to the recipe/editor start state.

- [ ] **Step 2: Verify RED**

Run `npm --prefix builder_app test`; expected failure because no navigation reducer exists.

- [ ] **Step 3: Implement dashboard rendering**

Add a home view with:

- four status summary cards
- ‘새 스페셜 카드 만들기’ primary action
- recent drafts with thumbnail, status, saved context and edit action
- changes-requested queue with review note
- three recipe shortcuts using the existing visual language

The sidebar home action and review-complete button must set the home view instead of reopening card details.

- [ ] **Step 4: Add responsive styles and accessible states**

Use existing color, radius and typography variables. Buttons need visible focus, `aria-current` on active navigation, and text labels alongside icons.

- [ ] **Step 5: Run studio tests and static syntax validation**

Run:

```bash
npm --prefix builder_app test
node --check builder_app/app.js
node --check builder_app/studio-core.js
```

Expected: exit 0.

### Task 5: Complete voice, motion and hologram editing

**Files:**
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`
- Modify: `builder_app/studio-core.js`
- Modify: `builder_app/tests/studio-core.test.mjs`

- [ ] **Step 1: Add failing media serialization tests**

Assert the payload contains:

```js
assert.deepEqual(payload.designConfig.front, {
  effect: 'holographic',
  effectPreset: 'aurora',
  effectIntensity: 0.78,
  effectAngle: 135,
  effectMotion: true,
  // existing image/text/sticker fields remain present
})
assert.deepEqual(payload.designConfig.video, {
  enabled: true, posterTime: 0, loop: true,
})
assert.deepEqual(payload.designConfig.voice, {
  enabled: true, trimStart: 0, trimEnd: 12,
})
```

- [ ] **Step 2: Verify RED then implement serialization**

Run the studio tests, confirm missing fields, then implement the smallest serialization/restore behavior and rerun GREEN.

- [ ] **Step 3: Build the Voice tool**

Add upload, record, play/pause, remove, duration and upload-state controls. Use `MediaRecorder` only after explicit user action. Store the resulting asset through `uploadAsset(file, 'voice')`; set both `form.voiceAssetId` and `form.hasVoice` after success.

- [ ] **Step 4: Build the Motion tool**

Add MP4/WebM upload, poster preview, play/pause, loop control, mute status, duration validation and remove action. Upload through `uploadAsset(file, 'video')` and store `editor.videoAssetId`.

- [ ] **Step 5: Build the Hologram Lab**

Expose four named presets, intensity, angle and motion controls. Render the same values in editor and full-screen fan preview. Respect `prefers-reduced-motion`.

- [ ] **Step 6: Verify the editor tests and syntax**

Run `npm --prefix builder_app test` and `node --check builder_app/app.js`.

### Task 6: Unify image and handwriting persistence

**Files:**
- Modify: `builder_app/app.js`
- Modify: `builder_app/studio-core.js`
- Modify: `builder_app/tests/studio-core.test.mjs`

- [ ] **Step 1: Add failing image/handwriting state tests**

Assert a local editor image is identified as pending upload, and both direct drawing and uploaded handwriting populate the same `editor.signatureSrc`/`signatureAssetId` fields.

- [ ] **Step 2: Verify RED**

Run the studio tests and confirm the current duplicate state fails.

- [ ] **Step 3: Upload the editor image automatically**

Before card create/update, if `form.imageAssetId` is absent and `editor.imageSrc` is a data URL, call `editorImageFile()` and upload it as `card`. Keep the editor state intact if upload fails.

- [ ] **Step 4: Remove the separate handwriting page behavior**

Direct drawing creates the transparent editor handwriting layer without background removal. Uploaded handwriting alone offers background removal. Card payload always uses the editor handwriting state.

- [ ] **Step 5: Verify GREEN**

Run studio tests and syntax checks; expected exit 0.

### Task 7: Make preview and review reflect real assets

**Files:**
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`
- Modify: `builder_app/tests/studio-core.test.mjs`

- [ ] **Step 1: Add failing review checklist tests**

Cover valid static, voice, motion and combined cards. Confirm enabled-but-missing assets prevent submission and disabled features show `사용 안 함`.

- [ ] **Step 2: Verify RED**

Run studio tests; expected current metadata-only checklist to fail.

- [ ] **Step 3: Build the fan-app preview modal**

Preview front/back, hologram, video controls, voice controls, handwriting and metadata. Mark `previewOpened=true` when displayed.

- [ ] **Step 4: Submit actual review data**

Send:

```js
await api(`/artist/cards/${state.cardId}/submit-review`, {
  method: 'POST',
  body: JSON.stringify({ reviewNote: document.querySelector('#review-note').value.trim() || null }),
})
```

Disable the submit button until `reviewReadiness` reports ready.

- [ ] **Step 5: Verify studio tests and syntax**

Run the builder tests and `node --check` commands.

### Task 8: Render the special card consistently in the fan app

**Files:**
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/tests/card-special-media-contract.test.mjs`

- [ ] **Step 1: Add the failing fan-media contract test**

Check the component source contains accessible video and voice controls, effect-preset mapping and reduced-motion styling. The contract must fail before implementation.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test frontend/tests/card-special-media-contract.test.mjs
```

Expected: failure because the current detail view has no video or dynamic hologram rendering.

- [ ] **Step 3: Implement fan special-media rendering**

- Wrap the card image/video in a class derived from the validated effect preset.
- Show video only for owned cards with `videoUrl`; require user play and expose pause/mute.
- Keep static image as poster and fallback.
- Keep voice as an explicit user-controlled audio element.
- Add visible media badges and loading/error fallback.
- Respect `prefers-reduced-motion` by disabling effect animation and video autoplay.

- [ ] **Step 4: Verify frontend tests, lint and build**

Run:

```bash
node --test frontend/tests/*.test.mjs
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all tests pass, lint exits 0, Vite build exits 0.

### Task 9: Correct the studio brand icon asset

**Files:**
- Modify: `builder_app/fanfolio-app-icon.png`
- Modify: `builder_app/index.html`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Produce the correct asset variants**

Use the approved Fanfolio mark as the source. The in-studio/favicon asset must have a transparent background and no white matte. Keep a separate opaque, full-bleed app icon for install surfaces rather than reusing the transparent mark.

- [ ] **Step 2: Apply the transparent mark to login and sidebar**

Measure the current 48px login and 28px sidebar slots, preserve the mark aspect ratio, and remove CSS that reveals a white image rectangle.

- [ ] **Step 3: Verify file metadata and appearance**

Run `file builder_app/fanfolio-app-icon.png` and confirm RGBA or indexed transparency, then inspect login and authenticated sidebar in the in-app browser at desktop and mobile widths.

### Task 10: Full verification and handoff

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run the complete backend suite**

```bash
cd backend && uv run pytest -q
```

- [ ] **Step 2: Run all lint/build/static checks**

```bash
cd backend && uv run ruff format --check app tests && uv run ruff check app tests
npm --prefix builder_app test
node --check builder_app/app.js
node --test frontend/tests/*.test.mjs
npm --prefix frontend run lint
npm --prefix frontend run build
pre-commit run --all-files
```

- [ ] **Step 3: Run browser acceptance flow**

Use an isolated database and synthetic artist account. In the user-selected in-app browser, complete login, dashboard, photo, handwriting, voice, hologram, motion upload, save/reload, fan preview, review note, submit, and home return. Capture desktop and mobile evidence.

- [ ] **Step 4: Inspect the final diff**

Confirm only intended source, migration, tests, plan and generated brand assets changed. Do not stage `audits/` unless explicitly requested.

- [ ] **Step 5: Commit the verified implementation**

Use a Lore-format commit that records media constraints, rejected external embeds, full test commands and any browser limitation.

### Task 11: Add adaptive studio navigation and editor layout

**Files:**
- Modify: `builder_app/studio-core.js`
- Modify: `builder_app/tests/studio-core.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing responsive-mode and source-contract tests**

Assert `responsiveStudioMode(1280) === 'desktop'`, `responsiveStudioMode(900) === 'tablet'`, and `responsiveStudioMode(430) === 'phone'`. Assert the shell exposes `toggle-sidebar`, an accessible collapsed label, a sidebar footer, a mobile inspector sheet, and a mobile editor action bar.

- [ ] **Step 2: Run `npm --prefix builder_app test` and confirm RED**

Expected: missing `responsiveStudioMode` export and missing adaptive shell markers.

- [ ] **Step 3: Implement adaptive navigation**

Persist the desktop/tablet collapsed preference, keep the profile in a sidebar footer, expose labels as tooltips when collapsed, use bottom navigation on phones, and open editor properties as a bottom sheet on phones.

- [ ] **Step 4: Implement laptop, tablet, and phone editor grids**

Use a three-pane desktop grid, compact three-pane tablet grid, and canvas-first single-column phone layout. Constrain back-template previews and keep all touch controls at least 44px.

- [ ] **Step 5: Run studio tests and syntax checks**

Run `npm --prefix builder_app test` and `node --check builder_app/app.js`; expected exit 0.

### Task 12: Add front/back creative layers

**Files:**
- Modify: `builder_app/studio-core.js`
- Modify: `builder_app/tests/studio-core.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing layer normalization and serialization tests**

Cover `handwriting`, `drawing`, and `sticker` layers with `side`, `x`, `y`, `width`, `rotation`, `opacity`, and `color`. Verify transient browser URLs and `File` values are not written to `designConfig`.

- [ ] **Step 2: Run studio tests and confirm RED**

Expected: missing layer exports and no `creativeLayers` serialization.

- [ ] **Step 3: Implement the shared layer model and controls**

Render layers on both card sides, support pointer drag and selection, add position/size/rotation/opacity/color/side controls, and provide delete/duplicate actions.

- [ ] **Step 4: Add drawing and sticker tools**

Use a pen-capable canvas for drawings and real uploaded PNG/WebP assets for stickers. Do not substitute emoji or CSS-drawn stickers.

- [ ] **Step 5: Verify GREEN**

Run studio tests and syntax checks; expected exit 0.

### Task 13: Make hologram motion user-controlled on studio and fan cards

**Files:**
- Modify: `builder_app/tests/studio-core.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`
- Modify: `frontend/tests/card-detail-special-media.test.mjs`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Write failing interaction contract tests**

Assert studio and fan card sources expose pointer move/leave handlers and shared tilt/light CSS variables, and retain reduced-motion fallbacks.

- [ ] **Step 2: Run studio and fan tests and confirm RED**

Expected: missing interaction handlers and CSS variables.

- [ ] **Step 3: Implement pointer and touch hologram response**

Map pointer position to bounded `rotateX`, `rotateY`, light X/Y, and texture shift. Reset to center on pointer leave/cancel; skip transforms when reduced motion is requested.

- [ ] **Step 4: Run all frontend checks**

Run builder tests, frontend tests, frontend lint, frontend build, and JavaScript syntax checks; expected exit 0.
