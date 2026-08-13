# Browser Annotation Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all supplied browser annotations across Artist Studio, Operations Admin, and Fan app, verify responsive behavior, and redeploy the three production sites.

**Architecture:** Preserve each application's current single-page architecture and existing API contracts. Implement the UX corrections inside the current rendering/event modules, with test-first static/behavior regression coverage and responsive CSS changes scoped to each application.

**Tech Stack:** Vanilla JavaScript/CSS and Node test runner for Studio/Admin; React 19, TypeScript, Vite, CSS, and Node test runner for Fan; Vercel CLI for deployment.

---

### Task 1: Artist Studio upload-first editor and direct manipulation

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing regression tests**

Add assertions that `photoInspector()` no longer renders `추천 비주얼`, `designStage()` does not render the permanent `editor-media-library`, selected layers render `.layer-resize-handle` and `.layer-rotate-handle`, and pointer handlers update size/rotation rather than position only.

```js
assert.doesNotMatch(source, /추천 비주얼/)
assert.doesNotMatch(source, /class="editor-media-library"/)
assert.match(source, /layer-resize-handle/)
assert.match(source, /layer-rotate-handle/)
assert.match(source, /interaction\.mode === 'resize'/)
assert.match(source, /interaction\.mode === 'rotate'/)
```

- [ ] **Step 2: Run the Studio tests and confirm RED**

Run: `npm test --prefix builder_app`

Expected: the new upload-first and transform-handle assertions fail because the permanent library and recommendation samples still exist and transform modes are absent.

- [ ] **Step 3: Implement upload-first rendering**

Remove the permanent media library from `designStage()`. Replace the hard-coded recommendation grid in `photoInspector()` with the existing upload control and, only when `state.editor.imageSrc` exists, one compact current-image thumbnail. Do not add a fake paginated library without an API.

- [ ] **Step 4: Implement layer handles and responsive editor behavior**

Render two buttons for the selected layer:

```js
<button class="layer-transform-handle layer-resize-handle" data-layer-action="resize" aria-label="레이어 크기 조절"></button>
<button class="layer-transform-handle layer-rotate-handle" data-layer-action="rotate" aria-label="레이어 회전"></button>
```

Extend pointer interaction state to `{ mode, pointerId, startX, startY, startLayer }`. Resize from center using pointer distance and clamp to the existing slider bounds; rotate with `Math.atan2` around the canvas-space layer center. Keep drag-to-move behavior and sliders as keyboard fallback.

- [ ] **Step 5: Verify GREEN**

Run: `npm test --prefix builder_app`

Expected: all Studio tests pass.

### Task 2: Operations row activation and compact review workspace

**Files:**
- Modify: `admin_app/tests/admin-responsive-layout.test.mjs`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`

- [ ] **Step 1: Write failing regression tests**

Assert that card rows carry a review-card id and keyboard semantics, `attachEvents()` binds row click and keydown, nested controls are excluded, and the laptop breakpoint retains a compact two-column review workspace.

```js
assert.match(source, /data-review-card-id=/)
assert.match(source, /tabindex="0"/)
assert.match(source, /event\.key === 'Enter' \|\| event\.key === ' '/)
assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(320px,420px\)/)
```

- [ ] **Step 2: Run the Admin tests and confirm RED**

Run: `node --test admin_app/tests/*.test.mjs`

Expected: the new row-interaction and compact-layout assertions fail.

- [ ] **Step 3: Implement row activation**

Add `data-review-card-id`, `tabindex="0"`, and an accessible row label in `cardRows()`. Bind click and Enter/Space to `openReview(id)`. Ignore `button`, `a`, `input`, and other interactive descendants so the overflow control does not double-trigger.

- [ ] **Step 4: Compact the review workspace**

At widths above 1024px, render the list and selected review as a master-detail grid with a 320–420px detail column. Reduce review padding/gaps, make preview width proportional, and display key metadata in two columns. Below 1024px, stack the detail but keep preview and metadata side by side until the phone breakpoint.

- [ ] **Step 5: Verify GREEN**

Run: `node --test admin_app/tests/*.test.mjs`

Expected: all Admin tests pass.

### Task 3: Fan navigation, settings, and card-side behavior

**Files:**
- Modify: `frontend/tests/fan-growth.test.mjs`
- Modify: `frontend/tests/card-detail-special-media.test.mjs`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/components/Settings.tsx`

- [ ] **Step 1: Write failing regression tests**

Assert five rendered `NavItem` entries, a dedicated `growth` tab rendering `FanGrowth`, no `FanGrowth` inside settings, consistent bottom-nav styles without `.home-shell .bottom-nav` overrides, a non-disabled back button with fallback data, and fixed-size preference/profile icons.

```js
assert.equal((app.match(/<NavItem /g) ?? []).length, 5)
assert.match(app, /tab === 'growth'.*<FanGrowth/s)
assert.doesNotMatch(app, /tab === 'settings'.*<FanGrowth/s)
assert.doesNotMatch(css, /\.home-shell \.bottom-nav/)
assert.doesNotMatch(detail, /disabled=\{!detail\}/)
assert.match(css, /\.preference-row \.setting-icon\{[^}]*flex:0 0/)
```

- [ ] **Step 2: Run the Fan tests and confirm RED**

Run: `npm test --prefix frontend`

Expected: the dedicated growth tab, consistent navigation, and fallback back-side assertions fail.

- [ ] **Step 3: Implement five-tab information architecture**

Add `'growth'` to the `Tab` type, route it as `/growth`, render `FanGrowth` in that tab, and render five persistent nav items: 컬렉션, 탐색, 보관함, 팬 레벨, 마이. Remove home-only bottom-nav overrides so every route uses the same component geometry.

- [ ] **Step 4: Fix settings alignment and ordering**

Give `SettingIcon` a dedicated class and fixed flex basis. Center profile/button row children. Keep notification copy in its own flexing content wrapper. With growth moved out, keep logout after the settings list and push it to the account screen's content end using a settings-specific layout class rather than absolute positioning.

- [ ] **Step 5: Fix front/back and collectible presentation**

Derive `cardBack` from `detail?.card` when available and otherwise from `card`. Keep the back button enabled and render a safe fallback back containing title, artist/member metadata, card type, and an unavailable-detail note only where fields truly do not exist. Use one 2:3 `.fan-card-collectible` frame for both sides and make `.fan-card-photo` fill and clip within the frame.

- [ ] **Step 6: Verify GREEN and build**

Run: `npm test --prefix frontend`

Expected: all Fan tests pass.

Run: `npm run build --prefix frontend`

Expected: TypeScript and Vite build exit successfully.

### Task 4: Cross-product verification and deployment

**Files:**
- Verify only: `builder_app/`, `admin_app/`, `frontend/`

- [ ] **Step 1: Run all tests and builds**

Run: `npm test --prefix builder_app`

Run: `node --test admin_app/tests/*.test.mjs`

Run: `npm test --prefix frontend`

Run: `npm run build --prefix frontend`

Expected: all commands exit 0 with no failed tests.

- [ ] **Step 2: Inspect responsive production-equivalent layouts**

Use the user's in-app browser and verify Studio at 1440px, 1024px, and 390px; Admin at 1440px, 1147px, and 390px; Fan at 390px and the desktop-hosted mobile shell. Confirm every browser annotation against the checklist in the design spec.

- [ ] **Step 3: Commit using Lore protocol**

Commit the verified files with a message whose intent line explains why the annotated UX corrections were needed and whose trailers include `Confidence`, `Scope-risk`, `Tested`, and `Not-tested`.

- [ ] **Step 4: Deploy all three projects**

Deploy the Fan, Admin, and Studio projects with their existing Vercel project configuration. Confirm all three production URLs return HTTP 200 and visually match the verified local build.

