# Fanfolio Card Material Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make artist-created cards look like premium physical collectibles, add rare-card lenticular interaction and meaningful back-side finishes, and render the same version 3 effect contract in the fan app.

**Architecture:** Keep the artist studio as a static ES-module app and the fan app as React. Normalize and serialize the version 3 effect contract in `builder_app/studio-core.js`; use a small typed normalizer in the fan app so both renderers map legacy version 2 fields to the same material, pattern, coverage, and interaction values. Render effects with CSS layers and variables, with pointer/touch input by default and device-orientation input only after explicit user activation.

**Tech Stack:** Browser ES modules, Node test runner, CSS masks/gradients, React 19, TypeScript 6, Vite 8, Vercel static deployments.

---

## File map

- Modify `builder_app/studio-core.js`: normalize and serialize the version 3 front/back effect contract and validate lenticular readiness.
- Modify `builder_app/tests/studio-core.test.mjs`: executable contract and backward-compatibility tests.
- Modify `builder_app/app.js`: studio state, inspectors, lenticular upload, front/back markup, pointer and optional device-orientation behavior.
- Modify `builder_app/styles.css`: sticker tiles, material/pattern/coverage layers, lenticular reveal, back finishes, responsive and reduced-motion behavior.
- Modify `builder_app/tests/studio-editor-regressions.test.mjs`: markup and CSS regression checks.
- Modify `backend/app/routers/artist.py`: reject cross-account lenticular asset references in card designs.
- Modify `backend/app/routers/fan.py`: expose the secondary image only to a fan who owns the card.
- Modify `backend/tests/contract/test_admin_and_artist.py`: lenticular asset ownership contract test.
- Modify `backend/tests/contract/test_fan_experience.py`: owned fan detail and protected lenticular image test.
- Create `frontend/src/utils/cardEffects.ts`: typed version 2-to-3 normalization for fan rendering.
- Modify `frontend/src/api/client.ts`: complete `designConfig` response type.
- Modify `frontend/src/components/CardDetail.tsx`: shared front/back collectible viewer, lenticular image, explicit motion permission, back metadata.
- Modify `frontend/src/App.css`: fan-side material/pattern/coverage/back rendering and reduced-motion rules.
- Create `frontend/tests/card-material-effects.test.mjs`: fan contract and interaction regression checks.
- Modify `frontend/tests/card-detail-special-media.test.mjs`: preserve existing media behavior while replacing the legacy hologram assumptions.

### Task 1: Lock the version 3 card effect contract

**Files:**
- Modify: `builder_app/tests/studio-core.test.mjs`
- Modify: `builder_app/studio-core.js`

- [ ] **Step 1: Write failing version 3 normalization tests**

Add the import and tests below to `builder_app/tests/studio-core.test.mjs`:

```js
import {
  buildCardPayload,
  buildDesignConfig,
  normalizeCardEffects,
  navigationState,
  normalizeCreativeLayer,
  responsiveStudioMode,
  reviewReadiness,
  studioDashboard,
} from '../studio-core.js'

test('normalizes legacy hologram fields into the version 3 material contract', () => {
  assert.deepEqual(
    normalizeCardEffects({
      version: 2,
      front: {
        effect: 'holographic',
        effectPreset: 'stardust',
        effectFinish: 'diamond',
        effectIntensity: 72,
        effectAngle: 210,
        effectMotion: false,
      },
    }),
    {
      version: 3,
      front: {
        material: 'chrome',
        foilPattern: 'micro-star',
        foilCoverage: 'full',
        interaction: 'static',
        intensity: 0.72,
        angle: 210,
        lenticularAssetId: null,
      },
      back: {
        material: 'matte',
        edgeFoil: 'none',
        spotUv: 'none',
        hiddenMessage: '',
      },
    },
  )
})

test('clamps and defaults unknown version 3 card effects safely', () => {
  const effects = normalizeCardEffects({
    version: 3,
    front: {
      material: 'plastic',
      foilPattern: 'laser-grid',
      foilCoverage: 'portrait-mask',
      interaction: 'spin',
      intensity: 800,
      angle: -20,
    },
    back: {
      material: 'paper',
      edgeFoil: 'bronze',
      spotUv: 'everything',
      hiddenMessage: '가'.repeat(50),
    },
  })

  assert.deepEqual(effects.front, {
    material: 'matte',
    foilPattern: 'aurora-wave',
    foilCoverage: 'full',
    interaction: 'static',
    intensity: 1,
    angle: 340,
    lenticularAssetId: null,
  })
  assert.deepEqual(effects.back, {
    material: 'matte',
    edgeFoil: 'none',
    spotUv: 'none',
    hiddenMessage: '가'.repeat(40),
  })
})

test('requires a secondary asset only when lenticular interaction is selected', () => {
  const missing = reviewReadiness({
    imageAssetId: 'asset_front',
    artistId: 'artist',
    memberId: 'member',
    issueLimit: 100,
    previewOpened: true,
    designConfig: { version: 3, front: { interaction: 'lenticular' } },
  })
  const ready = reviewReadiness({
    imageAssetId: 'asset_front',
    artistId: 'artist',
    memberId: 'member',
    issueLimit: 100,
    previewOpened: true,
    designConfig: {
      version: 3,
      front: { interaction: 'lenticular', lenticularAssetId: 'asset_alt' },
    },
  })

  assert.equal(missing.items.lenticular.status, 'missing')
  assert.equal(missing.ready, false)
  assert.equal(ready.items.lenticular.status, 'ready')
  assert.equal(ready.ready, true)
})
```

- [ ] **Step 2: Run the contract tests and verify the failure**

Run: `node --test builder_app/tests/studio-core.test.mjs`

Expected: FAIL because `normalizeCardEffects` is not exported and `lenticular` readiness does not exist.

- [ ] **Step 3: Implement the normalizer and serialization**

Add the following constants and exported function to `builder_app/studio-core.js`, using the existing `normalizedIntensity`, `numeric`, and `compactObject` helpers:

```js
const MATERIALS = new Set(['matte', 'pearl', 'chrome'])
const FOIL_PATTERNS = new Set(['aurora-wave', 'prism', 'cracked-ice', 'micro-star'])
const FOIL_COVERAGES = new Set(['full', 'background', 'frame', 'signature'])
const INTERACTIONS = new Set(['static', 'tilt', 'lenticular'])
const EDGE_FOILS = new Set(['none', 'silver', 'gold'])
const SPOT_UV_TARGETS = new Set(['none', 'logo', 'symbol', 'serial'])

const LEGACY_MATERIAL = { glass: 'pearl', silk: 'matte', diamond: 'chrome' }
const LEGACY_PATTERN = {
  aurora: 'aurora-wave',
  moonlight: 'aurora-wave',
  'rose-opal': 'aurora-wave',
  prism: 'prism',
  crystal: 'cracked-ice',
  stardust: 'micro-star',
}

function oneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback
}

function normalizedAngle(value, fallback = 135) {
  const angle = numeric(value, fallback) % 360
  return angle < 0 ? angle + 360 : angle
}

export function normalizeCardEffects(designConfig = {}) {
  const front = designConfig.front || {}
  const back = designConfig.back || {}
  const interaction = front.interaction || (front.effectMotion === false ? 'static' : 'tilt')
  return {
    version: 3,
    front: {
      material: oneOf(front.material, MATERIALS, LEGACY_MATERIAL[front.effectFinish] || 'matte'),
      foilPattern: oneOf(front.foilPattern, FOIL_PATTERNS, LEGACY_PATTERN[front.effectPreset] || 'aurora-wave'),
      foilCoverage: oneOf(front.foilCoverage, FOIL_COVERAGES, 'full'),
      interaction: oneOf(interaction, INTERACTIONS, 'static'),
      intensity: normalizedIntensity(front.intensity ?? front.effectIntensity, 0.58),
      angle: normalizedAngle(front.angle ?? front.effectAngle, 135),
      lenticularAssetId: front.lenticularAssetId || null,
    },
    back: {
      material: oneOf(back.material, MATERIALS, 'matte'),
      edgeFoil: oneOf(back.edgeFoil, EDGE_FOILS, 'none'),
      spotUv: oneOf(back.spotUv, SPOT_UV_TARGETS, 'none'),
      hiddenMessage: String(back.hiddenMessage || '').slice(0, 40),
    },
  }
}
```

Update `buildDesignConfig()` so it sets `version: 3`, writes `editor.material`, `editor.foilPattern`, `editor.foilCoverage`, `editor.interaction`, `editor.effectIntensity`, `editor.effectAngle`, and `editor.lenticularAssetId` to the normalized front fields, and writes `editor.backMaterial`, `editor.backEdgeFoil`, `editor.backSpotUv`, and `editor.backHiddenMessage` to the normalized back fields. Preserve `effectPreset`, `effectFinish`, `effectIntensity`, `effectAngle`, and `effectMotion` for one compatibility cycle. Add `lenticularAssetId` only through `designConfig.front`; no new top-level card column is needed.

Update the two existing exact `designConfig.front` assertions so they include the new normalized fields. For the legacy aurora test, add:

```js
material: 'pearl',
foilPattern: 'aurora-wave',
foilCoverage: 'full',
interaction: 'tilt',
intensity: 0.78,
angle: 135,
lenticularAssetId: null,
```

For the legacy moonlight/silk test, add `material: 'matte'`, `foilPattern: 'aurora-wave'`, `foilCoverage: 'full'`, `interaction: 'tilt'`, `intensity: 0.72`, `angle: 210`, and `lenticularAssetId: null`. Assert `config.version === 3` in both tests while retaining the legacy fields in the expected object.

Extend `reviewReadiness()` with:

```js
const normalizedEffects = normalizeCardEffects(config)
const lenticularEnabled = normalizedEffects.front.interaction === 'lenticular'
items.lenticular = readinessItem(
  lenticularEnabled,
  Boolean(normalizedEffects.front.lenticularAssetId),
)
```

- [ ] **Step 4: Run the unit tests and verify they pass**

Run: `node --test builder_app/tests/studio-core.test.mjs`

Expected: all tests PASS, including the existing version 2 payload assertions.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add builder_app/studio-core.js builder_app/tests/studio-core.test.mjs
git commit -m "Keep collectible effects stable across card versions" \
  -m $'Constraint: Existing published cards still contain version 2 effect fields.\nRejected: Destructive one-time migration | deployed clients and stored drafts need backward compatibility\nConfidence: high\nScope-risk: narrow\nDirective: Normalize all card effects before rendering or readiness checks.\nTested: node --test builder_app/tests/studio-core.test.mjs\nNot-tested: Browser rendering is covered in later tasks'
```

### Task 2: Make built-in stickers identifiable before selection

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write the failing sticker layout regression test**

Add this test to `builder_app/tests/studio-editor-regressions.test.mjs`:

```js
test('built-in sticker tiles show the full name below a large preview', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="sticker-tile-name"/)
  assert.doesNotMatch(source, /data-built-in-sticker=[\s\S]{0,260}add_circle/)
  assert.match(css, /\.built-in-sticker-grid button\s*\{[\s\S]{0,420}grid-template-rows:\s*72px auto/)
  assert.match(css, /\.sticker-tile-name\s*\{[\s\S]{0,260}white-space:\s*normal/)
  assert.doesNotMatch(css, /\.built-in-sticker-grid button > span:not\([\s\S]{0,220}text-overflow:\s*ellipsis/)
})
```

- [ ] **Step 2: Run the regression test and verify the failure**

Run: `node --test builder_app/tests/studio-editor-regressions.test.mjs --test-name-pattern="built-in sticker tiles"`

Expected: FAIL because the current tile uses a three-column row and ellipsis.

- [ ] **Step 3: Replace the tile markup and CSS**

Change `stickerInspector()` in `builder_app/app.js` so each button contains only the preview and full name:

```js
<button type="button" data-built-in-sticker="${esc(sticker.id)}" aria-label="${esc(sticker.name)} 스티커 추가">
  <span class="sticker-tile-preview"><img src="${esc(sticker.source)}" alt="" /></span>
  <span class="sticker-tile-name">${esc(sticker.name)}</span>
</button>
```

Replace the relevant sticker CSS with:

```css
.built-in-sticker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
  gap: 10px;
}

.built-in-sticker-grid button {
  min-width: 0;
  display: grid;
  grid-template-rows: 72px auto;
  justify-items: center;
  gap: 8px;
  padding: 10px 8px 11px;
  border: 1px solid #e2e3ef;
  border-radius: 14px;
  color: #3f4668;
  background: linear-gradient(145deg, #fff, #f7f5ff);
  text-align: center;
  cursor: pointer;
}

.sticker-tile-preview {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
}

.sticker-tile-preview img {
  width: 68px;
  height: 68px;
  object-fit: contain;
}

.sticker-tile-name {
  min-width: 0;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 380px) {
  .built-in-sticker-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run the studio regression suite**

Run: `npm --prefix builder_app test`

Expected: all studio tests PASS.

- [ ] **Step 5: Commit the sticker UX fix**

```bash
git add builder_app/app.js builder_app/styles.css builder_app/tests/studio-editor-regressions.test.mjs
git commit -m "Let artists recognize stickers before adding them" \
  -m $'Constraint: The inspector remains narrow on laptop and tablet layouts.\nRejected: Tooltip-only labels | touch users cannot discover hover-only text\nConfidence: high\nScope-risk: narrow\nDirective: Keep each sticker name visible without ellipsis at supported widths.\nTested: npm --prefix builder_app test\nNot-tested: Production browser smoke check follows deployment'
```

### Task 3: Add front material, pattern, coverage, and lenticular controls

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing inspector and renderer tests**

Add these assertions to `builder_app/tests/studio-editor-regressions.test.mjs`:

```js
test('hologram inspector exposes independent material pattern coverage and interaction controls', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /data-effect-material=/)
  assert.match(source, /data-foil-pattern=/)
  assert.match(source, /data-foil-coverage=/)
  assert.match(source, /data-effect-interaction=/)
  assert.match(source, /data-upload="lenticular"/)
})

test('card markup composes material pattern and coverage classes', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.match(source, /material-\$\{esc\(editor\.material\)\}/)
  assert.match(source, /pattern-\$\{esc\(editor\.foilPattern\)\}/)
  assert.match(source, /coverage-\$\{esc\(editor\.foilCoverage\)\}/)
  assert.match(source, /class="lenticular-photo"/)
  assert.match(css, /\.coverage-frame/)
  assert.match(css, /\.coverage-signature/)
  assert.match(css, /\.pattern-cracked-ice/)
  assert.match(css, /\.pattern-micro-star/)
})
```

- [ ] **Step 2: Run the targeted tests and verify failure**

Run: `node --test builder_app/tests/studio-editor-regressions.test.mjs --test-name-pattern="hologram inspector|card markup"`

Expected: FAIL because version 3 controls and classes do not exist.

- [ ] **Step 3: Add editor defaults and legacy hydration**

Add these keys to `initialEditor()`:

```js
material: 'pearl',
foilPattern: 'aurora-wave',
foilCoverage: 'full',
interaction: 'tilt',
lenticularSrc: '',
lenticularFile: null,
lenticularAssetId: null,
```

Add `normalizeCardEffects` to the existing import from `./studio-core.js`. In `openCard()`, call `normalizeCardEffects(card.designConfig)` and hydrate the keys above from `effects.front`. After the normal media hydration, load an existing secondary image with `fetchProtectedBlob(`/assets/${effects.front.lenticularAssetId}/content`)`; keep the preview empty but preserve the asset ID if the asset is still processing.

Add `lenticular` to `handleUpload()` as an image upload kind. It uses `lenticularSrc`, `lenticularFile`, and `lenticularAssetId`, but it does not replace `form.imageAssetId`. Update `ensureAsset()` so `lenticular` uses a PNG fallback extension and the existing `card` upload purpose. In `saveDraft()`, call `ensureAsset('lenticular')` whenever the selected interaction is `lenticular` and a secondary source exists.

- [ ] **Step 4: Replace the inspector with four explicit control groups**

Define these option arrays in `builder_app/app.js`:

```js
const materialOptions = [
  ['matte', '무광', '빛을 눌러 사진에 집중'],
  ['pearl', '펄', '은은한 진주광'],
  ['chrome', '크롬', '선명한 금속 반사'],
]
const foilPatternOptions = [
  ['aurora-wave', '오로라 웨이브'],
  ['prism', '프리즘'],
  ['cracked-ice', '크랙드 아이스'],
  ['micro-star', '마이크로 스타'],
]
const foilCoverageOptions = [
  ['full', '전체'],
  ['background', '배경'],
  ['frame', '프레임'],
  ['signature', '로고·사인'],
]
const interactionOptions = [
  ['static', '정적'],
  ['tilt', '기울임'],
  ['lenticular', '렌티큘러'],
]
```

Render each group as buttons with the corresponding data attribute and `aria-pressed`. When `interaction === 'lenticular'`, render:

```js
${uploadBox('lenticular', 'image/png,image/jpeg,image/webp', '두 번째 장면 추가', '기울일 때 전환될 사진')}
${state.editor.lenticularSrc
  ? `<div class="lenticular-source"><img src="${esc(state.editor.lenticularSrc)}" alt="렌티큘러 두 번째 장면" /><button type="button" data-action="remove-lenticular">삭제</button></div>`
  : '<p class="field-help">두 번째 장면을 추가해야 검수를 요청할 수 있어요.</p>'}
```

Add delegated click handlers for all four option attributes and `remove-lenticular`. Every selection calls `markDirty()` and `render()`.

When interaction changes, also set the compatibility field `effectMotion = interaction !== 'static'`. Build the card’s `effect-motion` class from `interaction !== 'static'` so a static material never tilts because of an old boolean.

- [ ] **Step 5: Render version 3 front layers**

Change the front card markup to include:

```js
${editor.interaction === 'lenticular' && editor.lenticularSrc
  ? `<img class="lenticular-photo" src="${esc(editor.lenticularSrc)}" alt="" />`
  : ''}
${editor.effect !== 'none'
  ? `<div class="card-material material-${esc(editor.material)}" aria-hidden="true"></div>
     <div class="hologram-layer pattern-${esc(editor.foilPattern)} coverage-${esc(editor.foilCoverage)} material-${esc(editor.material)}" aria-hidden="true"></div>`
  : ''}
```

Set `--lenticular-reveal:0%` on the card and update it from the horizontal pointer position in `initInteractiveCards()`.

Implement CSS so `.lenticular-photo` uses `clip-path: inset(0 calc(100% - var(--lenticular-reveal)) 0 0)` with a narrow repeating stripe mask, and so coverage classes use mask images rather than moving the full texture:

```css
.coverage-frame {
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 14px;
}
.coverage-signature { clip-path: inset(66% 5% 5% 5% round 14px); }
.coverage-background { clip-path: inset(8% 7% 24% 7% round 18px); }
.lenticular-photo { clip-path: inset(0 calc(100% - var(--lenticular-reveal, 0%)) 0 0); }
```

Write `--lenticular-reveal` as a percentage from JavaScript instead of multiplying CSS custom-property numbers. When motion reduction is active, show two buttons labelled `첫 장면` and `두 번째 장면`; each writes `0%` or `100%` so the secondary image remains accessible without animation.

Add separate material filters and pattern backgrounds. `cracked-ice` uses angular conic fragments; `micro-star` uses fixed-size radial star fields. Neither pattern uses a translating background animation.

- [ ] **Step 6: Run studio tests**

Run: `npm --prefix builder_app test`

Expected: all tests PASS.

- [ ] **Step 7: Commit the front effect editor**

```bash
git add builder_app/app.js builder_app/styles.css builder_app/tests/studio-editor-regressions.test.mjs
git commit -m "Give artists control over collectible surface treatments" \
  -m $'Constraint: The MVP must remain CSS-based and responsive without a GPU renderer.\nRejected: One large animated rainbow overlay | it does not resemble physical foil and obscures portraits\nConfidence: high\nScope-risk: moderate\nDirective: Keep material, pattern, coverage, and interaction independently selectable.\nTested: npm --prefix builder_app test\nNot-tested: Fan-side rendering is implemented in a later task'
```

### Task 4: Add premium back-side finishes and official metadata

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing back-side regression tests**

Add:

```js
test('back editor applies material edge foil spot UV and hidden message', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.match(source, /data-back-material=/)
  assert.match(source, /data-edge-foil=/)
  assert.match(source, /data-spot-uv=/)
  assert.match(source, /data-editor="backHiddenMessage"/)
  assert.match(source, /class="back-authenticity"/)
  assert.match(source, /class="back-hidden-message"/)
  assert.match(css, /\.edge-foil-gold/)
  assert.match(css, /\.spot-uv-logo/)
})
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run: `node --test builder_app/tests/studio-editor-regressions.test.mjs --test-name-pattern="back editor"`

Expected: FAIL because the controls and metadata do not exist.

- [ ] **Step 3: Add back defaults, inspector controls, and handlers**

Add to `initialEditor()`:

```js
backMaterial: 'matte',
backEdgeFoil: 'silver',
backSpotUv: 'logo',
backHiddenMessage: '',
```

Hydrate them from `normalizeCardEffects(card.designConfig).back` in `openCard()`. Add button groups for back material (`matte`, `pearl`, `chrome`), edge foil (`none`, `silver`, `gold`), and spot UV (`none`, `logo`, `symbol`, `serial`). Add a controlled text input:

```html
<label class="compact-field">
  숨은 메시지
  <input type="text" maxlength="40" data-editor="backHiddenMessage" value="..." />
  <small><span data-hidden-message-count>0</span>/40 · 기울이면 선명해져요.</small>
</label>
```

Add delegated handlers for `data-back-material`, `data-edge-foil`, and `data-spot-uv`.

- [ ] **Step 4: Render the back finish and official information**

Change the back card class to:

```js
back-card material-${esc(editor.backMaterial)} edge-foil-${esc(editor.backEdgeFoil)} spot-uv-${esc(editor.backSpotUv)}
```

Add this markup after the template image:

```js
<div class="back-surface" aria-hidden="true"></div>
<div class="back-spot-uv" aria-hidden="true"></div>
<div class="back-authenticity">
  <span>FANFOLIO OFFICIAL</span>
  <strong>No. ${String(state.form.issueLimit ? 1 : 0).padStart(4, '0')} / ${String(state.form.issueLimit || 0).padStart(4, '0')}</strong>
</div>
${editor.backHiddenMessage ? `<p class="back-hidden-message">${esc(editor.backHiddenMessage)}</p>` : ''}
```

Use an inset pseudo-element for gold/silver edge foil, a clipped highlight for spot UV, and `--light-x`/`--light-y` for the hidden-message contrast. Keep the protected logo/template above the selected background tint.

- [ ] **Step 5: Run studio tests**

Run: `npm --prefix builder_app test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the back-side editor**

```bash
git add builder_app/app.js builder_app/styles.css builder_app/tests/studio-editor-regressions.test.mjs
git commit -m "Make the card back carry trust and collectibility" \
  -m $'Constraint: Official template marks remain protected while artists control finish and message.\nRejected: Decorative back color only | it gives fans no authenticity or rarity signal\nConfidence: high\nScope-risk: moderate\nDirective: Keep authentication metadata readable when visual effects are disabled.\nTested: npm --prefix builder_app test\nNot-tested: Server-issued serial values are represented with available draft data until fan rendering'
```

### Task 5: Gate device motion behind an explicit user action

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`
- Modify: `builder_app/styles.css`

- [ ] **Step 1: Write failing permission and reduced-motion tests**

Add:

```js
test('device orientation is requested only after an explicit preview action', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.match(source, /data-action="enable-device-motion"/)
  assert.match(source, /DeviceOrientationEvent\.requestPermission/)
  assert.match(source, /async function enableDeviceMotion\(/)
  assert.match(source, /function prefersReducedEffects\(/)
  assert.doesNotMatch(source, /enableDeviceMotion\(\)[\s\S]{0,80}render\(\)/)
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.editor-card/)
})
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run: `node --test builder_app/tests/studio-editor-regressions.test.mjs --test-name-pattern="device orientation"`

Expected: FAIL because no opt-in motion action exists.

- [ ] **Step 3: Implement the opt-in motion controller**

Add state keys `deviceMotionStatus: 'idle'` and `deviceMotionEnabled: false`. Add `prefersReducedEffects()` that returns true for `prefers-reduced-motion` or for a device reporting at most 2GB through `navigator.deviceMemory`; this suppresses animated tilt but keeps a static material layer. Render a button in the full fan preview only when `window.isSecureContext` and `DeviceOrientationEvent` exist:

```html
<button type="button" class="motion-permission-button" data-action="enable-device-motion">
  기기 움직임으로 보기
</button>
```

Implement:

```js
async function enableDeviceMotion() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    notify('움직임 감소 설정에서는 터치로 카드를 확인할 수 있어요.')
    return
  }
  try {
    const permission = typeof DeviceOrientationEvent.requestPermission === 'function'
      ? await DeviceOrientationEvent.requestPermission()
      : 'granted'
    if (permission !== 'granted') throw new Error('denied')
    state.deviceMotionEnabled = true
    state.deviceMotionStatus = 'granted'
    window.addEventListener('deviceorientation', applyDeviceOrientation, { passive: true })
    render()
  } catch {
    state.deviceMotionStatus = 'denied'
    notify('기기 움직임 권한 없이도 손가락으로 카드를 기울일 수 있어요.')
    render()
  }
}
```

`applyDeviceOrientation()` clamps beta/gamma to ±15°, writes the same CSS variables as pointer input, and updates `--lenticular-reveal` as a percentage. Call `enableDeviceMotion()` only from the delegated click handler for `enable-device-motion`.

- [ ] **Step 4: Run studio tests**

Run: `npm --prefix builder_app test`

Expected: all tests PASS.

- [ ] **Step 5: Commit the permission-safe motion behavior**

```bash
git add builder_app/app.js builder_app/styles.css builder_app/tests/studio-editor-regressions.test.mjs
git commit -m "Keep motion immersive without surprising mobile users" \
  -m $'Constraint: Device orientation permission requires HTTPS and user activation on supported browsers.\nRejected: Requesting sensor access on page load | intrusive and rejected by browser policy\nConfidence: high\nScope-risk: narrow\nDirective: Preserve pointer and touch fallback when sensors are unavailable or denied.\nTested: npm --prefix builder_app test\nNot-tested: Physical-device sensor behavior requires production smoke testing'
```

### Task 6: Protect and serve lenticular assets through the API

**Files:**
- Modify: `backend/tests/contract/test_admin_and_artist.py`
- Modify: `backend/tests/contract/test_fan_experience.py`
- Modify: `backend/app/routers/artist.py`
- Modify: `backend/app/routers/fan.py`

- [ ] **Step 1: Write the failing artist ownership test**

Add to `backend/tests/contract/test_admin_and_artist.py`:

```python
def test_artist_cannot_attach_another_accounts_lenticular_asset(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    admin_asset = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "alternate.webp",
                "contentType": "image/webp",
                "purpose": "card",
            },
        ),
        201,
    )

    response = actors["artist"].post(
        "/api/artist/cards",
        json={
            "templateId": seeded["ids"]["templateId"],
            "name": "잘못 연결된 렌티큘러 카드",
            "seasonName": "2026 SUMMER",
            "rarity": "UR",
            "imageAssetId": seeded["ids"]["imageAssetId"],
            "designConfig": {
                "version": 3,
                "front": {
                    "interaction": "lenticular",
                    "lenticularAssetId": admin_asset["assetId"],
                },
            },
            "issueLimit": 100,
        },
    )

    assert_error(response, 404, "ASSET_NOT_FOUND")
```

- [ ] **Step 2: Write the failing fan entitlement test**

Extend the owned-card detail test in `backend/tests/contract/test_fan_experience.py` by creating and uploading a second `purpose="card"` image, placing its ID in `designConfig.front.lenticularAssetId`, and asserting:

```python
lenticular_url = detail["card"]["lenticularImageUrl"]
assert lenticular_url == f"/api/me/cards/{redeemed['userCardId']}/lenticular?client=fan"
alternate = fan.get(lenticular_url)
assert alternate.status_code == 200
assert alternate.content == b"alternate-card-image"
assert actors["otherFan"].get(lenticular_url).status_code == 404
```

- [ ] **Step 3: Run the two backend tests and verify failure**

Run:

```bash
backend/.venv/bin/pytest \
  backend/tests/contract/test_admin_and_artist.py::test_artist_cannot_attach_another_accounts_lenticular_asset \
  backend/tests/contract/test_fan_experience.py::test_owned_card_detail_exposes_handwriting_and_voice_entitlements -q
```

Expected: FAIL because artist validation ignores `lenticularAssetId` and the fan response has no protected URL.

- [ ] **Step 4: Validate the design asset on create and update**

Rename `validate_creative_layer_assets()` to `validate_design_assets()` in `backend/app/routers/artist.py`. Replace the current early return that depends on `"creativeLayers"` with `if not design_config: return`; validate creative layers only inside `if "creativeLayers" in design_config`, then independently validate the front object with:

```python
front = design_config.get("front")
if isinstance(front, dict):
    lenticular_asset_id = front.get("lenticularAssetId")
    if lenticular_asset_id is not None:
        if not isinstance(lenticular_asset_id, str) or not lenticular_asset_id:
            raise AppError(
                422,
                "INVALID_LENTICULAR_ASSET",
                "렌티큘러 이미지 정보를 확인해 주세요.",
            )
        await owned_asset(lenticular_asset_id, user, session)
```

Call `validate_design_assets()` from both card create and update paths.

- [ ] **Step 5: Add the owned fan URL and route**

In `backend/app/routers/fan.py`, resolve the design asset in card detail:

```python
lenticular_image_url = None
front_design = (card.design_config or {}).get("front")
lenticular_asset_id = (
    front_design.get("lenticularAssetId") if isinstance(front_design, dict) else None
)
if isinstance(lenticular_asset_id, str):
    lenticular_asset = await session.get(Asset, lenticular_asset_id)
    if lenticular_asset and (
        lenticular_asset.processed_storage_path or lenticular_asset.storage_path
    ):
        lenticular_image_url = (
            f"/api/me/cards/{uc.id}/lenticular?client=fan"
        )
```

Return it as `card.lenticularImageUrl`. Add an ownership-protected route following the existing voice/video pattern:

```python
@router.get("/me/cards/{user_card_id}/lenticular")
async def card_lenticular(
    user_card_id: str, user: FanUser, session: DbSession
) -> Response:
    row = await session.execute(
        select(UserCard, Card)
        .join(Card, UserCard.card_id == Card.id)
        .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    user_card, card = row.one_or_none() or (None, None)
    front = (card.design_config or {}).get("front") if card else None
    asset_id = front.get("lenticularAssetId") if isinstance(front, dict) else None
    if not user_card or not card or not isinstance(asset_id, str):
        raise AppError(404, "LENTICULAR_NOT_FOUND", "렌티큘러 이미지를 찾을 수 없습니다.")
    asset = await session.get(Asset, asset_id)
    path = asset.processed_storage_path or asset.storage_path if asset else None
    if not path:
        raise AppError(404, "LENTICULAR_NOT_READY", "렌티큘러 이미지가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "image/webp"
    )
```

- [ ] **Step 6: Run the targeted and full backend tests**

Run:

```bash
backend/.venv/bin/pytest \
  backend/tests/contract/test_admin_and_artist.py \
  backend/tests/contract/test_fan_experience.py -q
backend/.venv/bin/pytest backend/tests -q
```

Expected: targeted files and full backend suite PASS.

- [ ] **Step 7: Commit the protected asset path**

```bash
git add backend/app/routers/artist.py backend/app/routers/fan.py backend/tests/contract/test_admin_and_artist.py backend/tests/contract/test_fan_experience.py
git commit -m "Protect alternate card images as owned fan benefits" \
  -m $'Constraint: designConfig stores the secondary asset ID without adding a database column.\nRejected: Public asset URL | unreleased card imagery must remain entitlement-protected\nConfidence: high\nScope-risk: moderate\nDirective: Validate every asset ID embedded in designConfig before save.\nTested: full backend pytest suite\nNot-tested: Browser rendering is covered in later tasks'
```

### Task 7: Normalize version 3 effects in the fan app

**Files:**
- Create: `frontend/src/utils/cardEffects.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/tests/card-material-effects.test.mjs`

- [ ] **Step 1: Write the failing fan contract test**

Create `frontend/tests/card-material-effects.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const normalizer = await readFile(new URL('../src/utils/cardEffects.ts', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('fan card contract includes the complete version 3 material model', () => {
  assert.match(apiSource, /material\?: CardMaterial/)
  assert.match(apiSource, /foilPattern\?: FoilPattern/)
  assert.match(apiSource, /foilCoverage\?: FoilCoverage/)
  assert.match(apiSource, /interaction\?: CardInteraction/)
  assert.match(apiSource, /lenticularAssetId\?: string \| null/)
  assert.match(apiSource, /edgeFoil\?: EdgeFoil/)
  assert.match(apiSource, /spotUv\?: SpotUv/)
  assert.match(apiSource, /hiddenMessage\?: string/)
})

test('fan normalizer maps legacy effects to the same version 3 defaults as the studio', () => {
  assert.match(normalizer, /export function normalizeCardEffects/)
  assert.match(normalizer, /glass:\s*'pearl'/)
  assert.match(normalizer, /stardust:\s*'micro-star'/)
  assert.match(normalizer, /effectMotion === false \? 'static' : 'tilt'/)
  assert.match(normalizer, /hiddenMessage.*slice\(0, 40\)/s)
})
```

- [ ] **Step 2: Run the fan tests and verify failure**

Run: `npm --prefix frontend test`

Expected: FAIL because `cardEffects.ts` and the version 3 types do not exist.

- [ ] **Step 3: Add the typed contract and normalizer**

In `frontend/src/api/client.ts`, export:

```ts
export type CardMaterial = 'matte' | 'pearl' | 'chrome'
export type FoilPattern = 'aurora-wave' | 'prism' | 'cracked-ice' | 'micro-star'
export type FoilCoverage = 'full' | 'background' | 'frame' | 'signature'
export type CardInteraction = 'static' | 'tilt' | 'lenticular'
export type EdgeFoil = 'none' | 'silver' | 'gold'
export type SpotUv = 'none' | 'logo' | 'symbol' | 'serial'
```

Expand `UserCardDetail.card.designConfig` with version 3 fields and keep legacy optional fields. Add `lenticularImageUrl?: string | null` to the card response type so a protected fan asset URL can be consumed when the backend returns it.

Create `frontend/src/utils/cardEffects.ts` with `normalizeCardEffects()` that mirrors Task 1’s allowlists, legacy maps, angle normalization, intensity clamp, and 40-character message limit. Return a fully populated front/back value so the component never branches on unknown strings.

- [ ] **Step 4: Run tests and TypeScript build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`

Expected: tests PASS and Vite build completes without TypeScript errors.

- [ ] **Step 5: Commit the fan contract boundary**

```bash
git add frontend/src/api/client.ts frontend/src/utils/cardEffects.ts frontend/tests/card-material-effects.test.mjs
git commit -m "Keep fan previews faithful to artist material choices" \
  -m $'Constraint: Fan clients must render both legacy and version 3 cards during migration.\nRejected: Reading raw optional fields in the component | inconsistent defaults would drift from the studio\nConfidence: high\nScope-risk: narrow\nDirective: Route every fan card design through normalizeCardEffects before rendering.\nTested: npm --prefix frontend test; npm --prefix frontend run build\nNot-tested: Visual composition is implemented in the next task'
```

### Task 8: Render front, back, lenticular, and motion controls in card detail

**Files:**
- Modify: `frontend/tests/card-material-effects.test.mjs`
- Modify: `frontend/tests/card-detail-special-media.test.mjs`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Write failing fan renderer tests**

Append to `frontend/tests/card-material-effects.test.mjs`:

```js
const detailSource = await readFile(new URL('../src/components/CardDetail.tsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('fan detail composes material pattern coverage and back finish classes', () => {
  assert.match(detailSource, /normalizeCardEffects/)
  assert.match(detailSource, /material-\$\{effects\.front\.material\}/)
  assert.match(detailSource, /pattern-\$\{effects\.front\.foilPattern\}/)
  assert.match(detailSource, /coverage-\$\{effects\.front\.foilCoverage\}/)
  assert.match(detailSource, /edge-foil-\$\{effects\.back\.edgeFoil\}/)
  assert.match(detailSource, /spot-uv-\$\{effects\.back\.spotUv\}/)
  assert.match(cssSource, /\.fan-card-surface\.pattern-cracked-ice/)
  assert.match(cssSource, /\.fan-card-back\.edge-foil-gold/)
})

test('fan detail exposes back viewing and explicit device-motion permission', () => {
  assert.match(detailSource, /setVisibleSide/)
  assert.match(detailSource, />앞면</)
  assert.match(detailSource, />뒷면</)
  assert.match(detailSource, /requestDeviceMotion/)
  assert.match(detailSource, /DeviceOrientationEvent\.requestPermission/)
  assert.match(detailSource, />기기 움직임으로 보기</)
  assert.match(cssSource, /prefers-reduced-motion:\s*reduce[\s\S]*\.fan-card-collectible/)
})

test('lenticular cards render a second protected image and pointer-driven reveal progress', () => {
  assert.match(detailSource, /lenticularImageUrl/)
  assert.match(detailSource, /className="fan-card-lenticular"/)
  assert.match(detailSource, /--lenticular-reveal/)
  assert.match(cssSource, /\.fan-card-lenticular/)
})
```

Update the existing special-media test to assert the new `fan-card-collectible` class and reduced-motion behavior instead of the legacy texture-translation implementation.

- [ ] **Step 2: Run the fan tests and verify failure**

Run: `npm --prefix frontend test`

Expected: FAIL because the version 3 renderer, side switch, and permission button do not exist.

- [ ] **Step 3: Replace the legacy hologram block in `CardDetail.tsx`**

Import `normalizeCardEffects`, add `visibleSide`, `motionStatus`, and `motionEnabled` state, then normalize once:

```tsx
const effects = normalizeCardEffects(detail?.card.designConfig)
const hasSurface = Boolean(detail?.card.designConfig?.front?.effect === 'holographic' || detail?.card.designConfig?.version === 3)
const hasLenticular = effects.front.interaction === 'lenticular' && Boolean(detail?.card.lenticularImageUrl)
const [visibleSide, setVisibleSide] = useState<'front' | 'back'>('front')
```

Build the class strings from normalized values. Render front and back inside one `fan-card-collectible`; front contains base image, optional `.fan-card-lenticular`, `.fan-card-material`, and `.fan-card-surface`. Back contains the official template treatment, edge foil, spot UV, the real `detail.serialNumber`, `detail.card.issueLimit`, a short seal derived from `detail.card.id.slice(-8).toUpperCase()`, and the hidden message. Add an accessible front/back segmented control above the card.

The pointer handler updates:

```ts
element.style.setProperty('--tilt-x', `${((0.5 - y) * 10).toFixed(2)}deg`)
element.style.setProperty('--tilt-y', `${((x - 0.5) * 12).toFixed(2)}deg`)
element.style.setProperty('--light-x', `${Math.round(x * 100)}%`)
element.style.setProperty('--light-y', `${Math.round(y * 100)}%`)
element.style.setProperty('--lenticular-reveal', `${Math.round(x * 100)}%`)
```

Add `requestDeviceMotion()` only to the ‘기기 움직임으로 보기’ button. Denial changes helper text to ‘손가락으로 움직여 볼 수 있어요’ without blocking card use. Treat `prefers-reduced-motion` or `navigator.deviceMemory <= 2` as reduced effects and keep the material layers static. When reduced motion is active and the card is lenticular, render `첫 장면` and `두 번째 장면` buttons that set `--lenticular-reveal` to `0%` and `100%`.

- [ ] **Step 4: Add the fan collectible CSS**

Replace the translating texture rules with fixed layered surfaces that use the same semantic classes as the studio. Include:

```css
.fan-card-collectible {
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  --light-x: 50%;
  --light-y: 42%;
  --lenticular-reveal: 0%;
  position: relative;
  transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
  transform-style: preserve-3d;
}

.fan-card-lenticular {
  position: absolute;
  inset: 0;
  clip-path: inset(0 calc(100% - var(--lenticular-reveal)) 0 0);
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 3px, #0008 3px 5px);
  mask-image: repeating-linear-gradient(90deg, #000 0 3px, #0008 3px 5px);
}

@media (prefers-reduced-motion: reduce) {
  .fan-card-collectible { transform: none !important; transition: none; }
  .fan-card-surface { animation: none !important; }
}
```

Implement material, pattern, coverage, edge foil, spot UV, and hidden-message selectors with static fallbacks. Keep all effect layers `pointer-events:none` and keep the official badge readable above them.

Clamp the hidden message to two visible lines with `display:-webkit-box`, `-webkit-line-clamp:2`, and `overflow:hidden`. Use `touch-action:pan-y` on the collectible so vertical page scrolling remains available until the card captures an intentional drag.

- [ ] **Step 5: Run fan tests, lint, and build**

Run: `npm --prefix frontend test && npm --prefix frontend run lint && npm --prefix frontend run build`

Expected: all tests PASS, Oxlint reports no errors, and Vite build succeeds.

- [ ] **Step 6: Commit the fan renderer**

```bash
git add frontend/src/components/CardDetail.tsx frontend/src/App.css frontend/tests/card-material-effects.test.mjs frontend/tests/card-detail-special-media.test.mjs
git commit -m "Let fans experience the card the artist designed" \
  -m $'Constraint: Card detail must remain usable without motion or sensor permission.\nRejected: Always-on animation | distracting, inaccessible, and unlike handling a physical card\nConfidence: high\nScope-risk: moderate\nDirective: Keep front and back metadata readable above decorative effect layers.\nTested: npm --prefix frontend test; npm --prefix frontend run lint; npm --prefix frontend run build\nNot-tested: Production device-orientation behavior is verified after deployment'
```

### Task 9: Verify compatibility and deploy the three affected surfaces

**Files:**
- No planned source changes; failures return to the owning task before deployment.

- [ ] **Step 1: Run all local verification**

Run:

```bash
backend/.venv/bin/ruff format --check backend/app backend/tests
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests -q
npm --prefix builder_app test
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
git diff --check
git status --short
```

Expected: Ruff format/lint and the full backend suite PASS, studio and fan tests PASS, Oxlint has zero errors, Vite build succeeds, diff check is empty, and only the unrelated user-owned `audits/` directory remains untracked.

- [ ] **Step 2: Inspect the implementation diff against the approved spec**

Run:

```bash
git diff e2fa42a..HEAD -- backend builder_app frontend
```

Expected: the diff covers sticker labels, version 3 normalization, protected lenticular assets, front effects, back effects, explicit motion permission, reduced motion, and fan rendering without unrelated admin changes.

- [ ] **Step 3: Push the verified main branch**

Run:

```bash
git push origin main
```

Expected: GitHub accepts the new commits and the Vercel studio/fan projects begin production deployments from `main`.

- [ ] **Step 4: Verify production assets and health**

Run:

```bash
curl -fsS https://fanfolio-api.onrender.com/api/health
curl -fsS https://fanfolio-studio.vercel.app/app.js | rg "normalizeCardEffects|data-effect-material|data-back-material|enable-device-motion"
curl -fsS https://fanfolio-studio.vercel.app/styles.css | rg "sticker-tile-name|pattern-cracked-ice|edge-foil-gold"
curl -fsS https://fanfolio-fan.vercel.app/ | rg "assets/index-.*\.js"
```

Expected: API health returns an `ok` response, studio assets contain all new markers, and the fan deployment serves a new hashed bundle.

- [ ] **Step 5: Perform browser smoke checks**

In the deployed studio:

1. Open the sticker tool and confirm all four names are fully visible.
2. Select each material, pattern, coverage, and interaction option.
3. Upload a secondary image, drag the card horizontally, and confirm the image transition follows movement.
4. Open the back, change color/material/foil/spot UV/message, and confirm each is visible.
5. Deny device motion once and confirm touch interaction still works.

In the deployed fan app:

1. Open an owned version 2 card and confirm it renders without regression.
2. Open a version 3 card and switch front/back.
3. Verify pointer/touch motion and the reduced-motion static fallback.
