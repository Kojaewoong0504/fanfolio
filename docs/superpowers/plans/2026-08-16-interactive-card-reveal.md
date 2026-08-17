# Interactive Card Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give newly revealed and already-owned Fanfolio cards the same accessible flip, tilt, lenticular, and material-effect experience.

**Architecture:** Extract the existing physical-card renderer and gesture logic from `CardDetail` into `InteractiveCollectibleCard`. Keep route/data responsibilities in `RevealCard` and `CardDetail`; pass display data and normalized design configuration into the shared component. Add a one-shot reveal presentation mode for the acquisition screen and keep reduced-motion behavior centralized.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Vite

---

### Task 1: Lock the shared collectible contract

**Files:**
- Create: `frontend/tests/interactive-collectible-card.test.mjs`
- Modify: `frontend/tests/card-registration-complete.test.mjs`

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that require:

```js
const collectibleSource = await readFile(new URL('../src/components/InteractiveCollectibleCard.tsx', import.meta.url), 'utf8')

assert.match(collectibleSource, /export function InteractiveCollectibleCard/)
assert.match(collectibleSource, /aria-label="카드 면 선택"/)
assert.match(collectibleSource, /onPointerMove/)
assert.match(collectibleSource, /normalizeCardEffects/)
assert.match(appSource, /presentation="reveal"/)
assert.match(cssSource, /collectible-reveal-enter/)
assert.match(cssSource, /prefers-reduced-motion:reduce[\s\S]*collectible-reveal-enter/)
```

- [ ] **Step 2: Run tests and confirm the new contract fails**

Run:

```bash
cd frontend && node --test tests/interactive-collectible-card.test.mjs tests/card-registration-complete.test.mjs
```

Expected: failure because `InteractiveCollectibleCard.tsx` and reveal-mode selectors do not exist.

### Task 2: Extract the reusable interactive card renderer

**Files:**
- Create: `frontend/src/components/InteractiveCollectibleCard.tsx`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/interactive-collectible-card.test.mjs`
- Test: `frontend/tests/card-detail-special-media.test.mjs`

- [ ] **Step 1: Define the shared props**

The component accepts:

```ts
type InteractiveCollectibleCardProps = {
  imageUrl: string
  imageAlt: string
  identity: string
  title: string
  artist: string
  member?: string | null
  serialLabel: string
  limitLabel: string
  sealLabel: string
  designConfig?: CardDesignConfig | null
  lenticularImageUrl?: string | null
  onImageError?: (event: SyntheticEvent<HTMLImageElement>) => void
  presentation?: 'detail' | 'reveal'
  enableDeviceMotion?: boolean
  initialSide?: 'front' | 'back'
}
```

- [ ] **Step 2: Move interaction ownership into the component**

Move without semantic changes:

```ts
const [visibleSide, setVisibleSide] = useState<VisibleSide>(initialSide)
const effects = normalizeCardEffects(designConfig)
const reducedEffects = prefersReducedEffects()
```

The shared component owns pointer capture thresholds, CSS custom properties, front/back markup, device orientation when enabled, and reduced-motion lenticular scene buttons.

- [ ] **Step 3: Replace the duplicated `CardDetail` renderer**

Render:

```tsx
<InteractiveCollectibleCard
  imageUrl={imageFor(resolveApiUrl(imageUrl), card.id)}
  imageAlt={cardImageAlt}
  identity={cardIdentity}
  title={safeBackDetail.title}
  artist={safeBackDetail.artist}
  member={safeBackDetail.member}
  serialLabel={safeBackDetail.serialLabel}
  limitLabel={safeBackDetail.limitLabel}
  sealLabel={safeBackDetail.sealLabel}
  designConfig={detail?.card.designConfig}
  lenticularImageUrl={detail?.card.lenticularImageUrl}
  onImageError={imageError}
  enableDeviceMotion
/>
```

- [ ] **Step 4: Run shared and detail tests**

Run:

```bash
cd frontend && node --test tests/interactive-collectible-card.test.mjs tests/card-detail-special-media.test.mjs
```

Expected: pass, with current special-media behavior unchanged.

### Task 3: Add the reveal animation and QA effect preset

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/tests/card-registration-complete.test.mjs`

- [ ] **Step 1: Add the demo design configuration**

For `qa-registration-complete`, pass a v3 configuration equivalent to:

```ts
{
  version: 3,
  front: {
    material: 'pearl',
    foilPattern: 'prism',
    foilCoverage: 'full',
    interaction: 'tilt',
    intensity: 0.72,
    angle: 135,
  },
  back: {
    material: 'matte',
    edgeFoil: 'silver',
    spotUv: 'serial',
    hiddenMessage: '드림스케이프 공식 컬렉션 카드',
  },
}
```

- [ ] **Step 2: Replace the reveal image with the shared component**

Render the shared card with `presentation="reveal"`, keep the current title/metadata/bonus/CTA sections, and remove the reveal-only legacy effect whitelist.

- [ ] **Step 3: Add one-shot entrance and reduced-motion styles**

Add a reveal wrapper with a single animation:

```css
@keyframes collectible-reveal-enter {
  0% { opacity: 0; transform: translateY(28px) rotateY(82deg) scale(.88); }
  58% { opacity: 1; transform: translateY(-4px) rotateY(-7deg) scale(1.035); }
  100% { opacity: 1; transform: translateY(0) rotateY(0) scale(1); }
}
```

The glow layer fades once and does not keep flashing. In reduced-motion mode, use opacity only and force all 3D transforms to none.

- [ ] **Step 4: Run reveal tests**

Run:

```bash
cd frontend && node --test tests/card-registration-entry.test.mjs tests/card-registration-complete.test.mjs tests/interactive-collectible-card.test.mjs
```

Expected: pass.

### Task 4: Update the design contract and verify the whole frontend

**Files:**
- Modify: `DESIGN.md`
- Verify: `frontend/src/components/InteractiveCollectibleCard.tsx`
- Verify: `frontend/src/components/CardDetail.tsx`
- Verify: `frontend/src/App.tsx`
- Verify: `frontend/src/App.css`

- [ ] **Step 1: Update motion and accessibility guidance**

Document that collectible cards share one renderer across reveal/detail views, entrance motion is one-shot, and reduced-motion uses opacity without tilt.

- [ ] **Step 2: Run targeted tests**

```bash
cd frontend && node --test tests/interactive-collectible-card.test.mjs tests/card-detail-special-media.test.mjs tests/card-registration-entry.test.mjs tests/card-registration-complete.test.mjs
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run complete verification**

```bash
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: all tests pass, lint exits zero, and Vite produces a successful production build.

- [ ] **Step 4: Inspect in the user's current browser**

Verify `/reveal/qa-registration-complete` at the current mobile viewport:

- mystery identity is hidden;
- pressing `카드 공개하기` plays once and settles;
- front/back selection works;
- horizontal pointer movement changes light/tilt;
- vertical scrolling remains usable;
- `컬렉션에 추가` still reaches the 4/4 completion screen;
- opening a collection card shows the same card renderer.

Do not commit automatically because this checkout contains user-owned in-progress changes; report the exact files changed and verification results.
