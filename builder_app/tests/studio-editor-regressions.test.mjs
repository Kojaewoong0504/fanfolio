import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createEffectPreparation, spatialEffectReady, spatialEffectActive } from '../effect-preparation.js'
import { photoAnalysisReady } from '../photo-analysis.js'

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8')

test('local studio API follows the current loopback hostname', () => {
  assert.match(appSource, /`http:\/\/\$\{window\.location\.hostname\}:8000\/api`/)
  assert.doesNotMatch(appSource, /'http:\/\/localhost:8000\/api'/)
})

const appUrl = new URL('../app.js', import.meta.url)
const cssUrl = new URL('../styles.css', import.meta.url)

test('studio collaboration and settings controls have scoped accessible styling', async () => {
  const css = await readFile(cssUrl, 'utf8')
  assert.match(css, /\.card-comment-form\s+textarea[\s\S]*min-height/)
  assert.match(css, /\.card-comment-form\s+input[\s\S]*min-height/)
  assert.match(css, /\.card-comment-form\s+button[\s\S]*min-height/)
  assert.match(css, /\.check-row\.settings\s+input[\s\S]*accent-color/)
})

async function loadMotionHarness(options = {}) {
  const {
    reducedMotion = false,
    deviceMemory = 8,
    secureContext = true,
    permissionResult = 'granted',
    effectMotion = true,
  } = options
  const listeners = new Map()
  const styleWrites = []
  const card = {
    classList: {
      contains: (name) => name === 'effect-motion' && effectMotion,
      add: (name) => styleWrites.push(['class', name]),
      remove: () => {},
    },
    style: {
      setProperty: (name, value) => styleWrites.push([name, value]),
    },
  }
  let permissionRequests = 0
  const context = {
    createEffectPreparation, spatialEffectReady, spatialEffectActive, photoAnalysisReady,
    console,
    FormData: class FormData {},
    Image: class Image {
      addEventListener() {}
      set src(_value) {}
    },
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    buildCardPayload: () => ({}),
    navigationState: (destination) => ({ view: destination }),
    normalizeCardEffects: (value) => value || {},
    normalizeCreativeLayer: (value) => value || {},
    responsiveStudioMode: () => 'desktop',
    reviewReadiness: () => ({ ready: true, items: {} }),
    studioDashboard: () => ({ summary: {}, tasks: [] }),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    navigator: { deviceMemory },
    __listenerCount: (type) => listeners.get(type)?.size || 0,
    __permissionRequests: () => permissionRequests,
    __styleWrites: styleWrites,
    document: {
      body: { append: () => {} },
      createElement: () => ({
        setAttribute: () => {},
        classList: { add: () => {} },
        dataset: {},
      }),
      querySelector: (selector) => {
        if (selector === '#app') return { innerHTML: '', addEventListener: () => {} }
        if (selector === '.fan-card-wrap [data-hologram-card]') return card
        if (selector === '#studio-toast') return null
        return null
      },
      querySelectorAll: () => [],
    },
  }
  context.window = {
    location: { hostname: 'localhost', search: '' },
    isSecureContext: secureContext,
    DeviceOrientationEvent: {
      requestPermission: async () => {
        permissionRequests += 1
        return permissionResult
      },
    },
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: (callback) => callback(),
    clearTimeout: () => {},
    setTimeout: () => 0,
    addEventListener: (type, listener) => {
      const current = listeners.get(type) || new Set()
      current.add(listener)
      listeners.set(type, current)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
  }
  context.globalThis = context
  context.setTimeout = context.window.setTimeout
  context.clearTimeout = context.window.clearTimeout

  const source = (await readFile(appUrl, 'utf8'))
    .replace(/^import \{[\s\S]*?\} from '\.\/studio-core\.js(?:\?[^']*)?'\n\n/, '')
    .replace(/\nbootstrap\(\)\s*$/, '')
  vm.runInNewContext(
    `${source}
globalThis.__motionHarness = {
  state,
  enableDeviceMotion,
  applyDeviceOrientation,
  syncDeviceMotionLifecycle: typeof syncDeviceMotionLifecycle === 'function' ? syncDeviceMotionLifecycle : null,
  shortestSignedAngularDelta: typeof shortestSignedAngularDelta === 'function' ? shortestSignedAngularDelta : null,
  clampLayerRotation: typeof clampLayerRotation === 'function' ? clampLayerRotation : null,
  computeLayerResizeWidth: typeof computeLayerResizeWidth === 'function' ? computeLayerResizeWidth : null,
  listenerCount: __listenerCount,
  styleWrites: __styleWrites,
  permissionRequests: __permissionRequests,
}`,
    context,
  )
  return context.__motionHarness
}

test('collapsed navigation hides only labels and keeps every menu icon visible', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="nav-label"/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed \.studio-sidebar nav button \.nav-label,[\s\S]{0,420}display:\s*none/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed \.studio-sidebar nav button > \.material-symbols-rounded[\s\S]{0,220}display:\s*inline-grid/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed \.profile-chip\s*\{[\s\S]{0,260}display:\s*none/)
  assert.doesNotMatch(css, /\.sidebar-collapsed \.studio-sidebar nav button span,/)
})

test('review progress stays visible from partner review through fan release', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  for (const releaseStatus of [
    'pending_partner_review',
    'pending_platform_review',
    'changes_requested',
    'approved',
    'drop_ready',
    'published',
  ]) {
    assert.match(source, new RegExp(releaseStatus))
  }
  assert.match(source, /function releaseStatusBanner\(/)
  assert.match(source, /담당 운영자에게 알림이 전달됐어요/)
  assert.match(css, /\.release-status-banner/)
})

test('review submission ignores a second click while the first request is active', async () => {
  const source = await readFile(appUrl, 'utf8')
  const submitReviewBody = source.match(/async function submitReview\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(submitReviewBody, /^\s*if \(state\.busy\) return\s*\n/)
})

test('artist logout cancels pending autosave work before clearing the session', async () => {
  const source = await readFile(appUrl, 'utf8')
  const logoutBody = source.match(/async function logoutArtist\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(logoutBody, /^\s*cancelAutosave\(\)\s*\n/)
  assert.match(logoutBody, /const userId = state\.profile\?\.id/)
  assert.match(logoutBody, /clearDraft\(userId\)/)
})

test('artist drafts are scoped to the authenticated artist', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /function draftStorageKey\(userId = state\.profile\?\.id\) \{[\s\S]*?return `\$\{DRAFT_KEY\}:\$\{userId\}`/)
  assert.match(source, /function persistDraft\(\) \{[\s\S]*?const key = draftStorageKey\(\)[\s\S]*?if \(!key\) return/)
  assert.doesNotMatch(source, /const savedDraft = readDraft\(\)/)
  assert.match(source, /restoreDraftForUser\(state\.profile\.id, state\.cards\)/)
  assert.match(source, /normalizeCatalogSelection\(state\.form, state\.catalog\)/)
})

test('card save validates required fields before calling the API', async () => {
  const source = await readFile(appUrl, 'utf8')
  const saveDraftBody = source.match(/async function saveDraft\(\{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(saveDraftBody, /cardDraftErrors\(\{ form: state\.form, editor: state\.editor \}\)/)
  assert.match(saveDraftBody, /throw new Error\(draftErrors\.join\(' '\)\)/)
})

test('review readiness makes missing requirements actionable', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /data-readiness-key=\"\$\{esc\(key\)\}\"/)
  assert.match(source, /const readinessTarget = \{[\s\S]*voice: 'voice'/)
  assert.match(source, /state\.stage = 'design'/)
  assert.match(source, /state\.editor\.tool = \{[\s\S]*voice: 'voice'/)
})

test('read-only cards never become restorable or persistable editor drafts', async () => {
  const source = await readFile(appUrl, 'utf8')
  const restoreBody = source.match(/function restoreDraftForUser\(userId, cards = \[\]\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const openCardBody = source.match(/async function openCard\(cardId\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const editorViewBody = source.match(/function editorView\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const fanPreviewBody = source.match(/function fanPreviewStage\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(restoreBody, /cardEditorStage\(card\) === 'design'/)
  assert.match(restoreBody, /localStorage\.removeItem\(draftStorageKey\(userId\)\)/)
  assert.match(openCardBody, /if \(state\.stage === 'design'\) persistDraft\(\)/)
  assert.match(openCardBody, /else clearDraft\(\)/)
  assert.match(editorViewBody, /state\.stage === 'design' \? `.*초안 저장/s)
  assert.match(fanPreviewBody, /cardEditorStage\(activeCard\) === 'design'/)
  assert.match(fanPreviewBody, /if \(editable\) persistDraft\(\)/)
  assert.match(fanPreviewBody, /else clearDraft\(\)/)
})

test('read-only cards cannot re-enter the design stage from progress navigation', async () => {
  const source = await readFile(appUrl, 'utf8')
  const progress = source.match(/function editorProgress\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const clickHandler = source.match(/app\.addEventListener\('click',[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(progress, /cardEditorStage\(currentCard\) !== 'design'/)
  assert.match(clickHandler, /target === 'design'[\s\S]*?cardEditorStage\(currentCard\) !== 'design'/)
  assert.match(clickHandler, /공개된 카드는 디자인을 다시 수정할 수 없습니다\./)
})

test('collaboration comment mutations ignore duplicate submissions while busy', async () => {
  const source = await readFile(appUrl, 'utf8')
  const createBody = source.match(/async function createCollaborationComment\(form\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const resolveBody = source.match(/async function resolveCollaborationComment\(commentId\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(createBody, /if \(!state\.cardId \|\| state\.busy\) return/)
  assert.match(resolveBody, /if \(!state\.cardId \|\| state\.busy\) return/)
  assert.match(createBody, /state\.busy = true/)
  assert.match(resolveBody, /state\.busy = true/)
  assert.match(createBody, /finally \{[\s\S]*state\.busy = false/)
  assert.match(resolveBody, /finally \{[\s\S]*state\.busy = false/)
})

test('bootstrap surfaces a data-load failure after a restored session', async () => {
  const source = await readFile(appUrl, 'utf8')
  const bootstrapBody = source.match(/async function bootstrap\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(bootstrapBody, /let restoredSession = false/)
  assert.match(bootstrapBody, /restoredSession = true/)
  assert.match(bootstrapBody, /if \(restoredSession\) \{[\s\S]*state\.loginError = /)
})

test('profile save rejects a whitespace-only display name before the API call', async () => {
  const source = await readFile(appUrl, 'utf8')
  const profileBody = source.match(/async function saveProfile\(formElement\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(profileBody, /const nickname = form\.get\('nickname'\)\?\.toString\(\)\.trim\(\)/)
  assert.match(profileBody, /if \(!nickname\) \{[\s\S]*notify\('표시 이름을 입력해주세요\.'/)
})

test('layer color changes update the selected layer without replacing the open color input', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /function applyLayerLivePreview\(/)
  assert.match(source, /event\.target\.type === 'color'[\s\S]{0,900}applyLayerLivePreview\(/)
  assert.match(source, /data-editor="background"/)
  assert.match(source, /function applyEditorLivePreview\(/)
})

test('selected creative layers expose contextual delete controls and keyboard deletion', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /class="layer-context-toolbar"/)
  assert.match(source, /data-action="delete-layer"[^>]*>[\s\S]{0,120}삭제/)
  assert.match(source, /function deleteSelectedLayer\(/)
  assert.match(source, /window\.addEventListener\('keydown'/)
})

test('sticker inspector provides generated premium stickers in addition to uploads', async () => {
  const source = await readFile(appUrl, 'utf8')
  const stickerNames = [
    'sticker-opal-heart.png',
    'sticker-shooting-star.png',
    'sticker-opal-butterfly.png',
    'sticker-moon-tiara.png',
  ]

  assert.match(source, /const builtInStickers =/)
  assert.match(source, /data-built-in-sticker=/)
  assert.match(source, /기본 스티커/)
  await Promise.all(
    stickerNames.map((name) => access(new URL(`../assets/stickers/${name}`, import.meta.url))),
  )
})

test('built-in sticker tiles show the full name below a large preview', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="sticker-tile-name"/)
  assert.doesNotMatch(source, /data-built-in-sticker=[\s\S]{0,260}add_circle/)
  assert.match(css, /\.built-in-sticker-grid button\s*\{[\s\S]{0,420}grid-template-rows:\s*72px auto/)
  assert.match(css, /\.sticker-tile-name\s*\{[\s\S]{0,260}white-space:\s*normal/)
  assert.doesNotMatch(css, /\.built-in-sticker-grid button > span:not\([\s\S]{0,220}text-overflow:\s*ellipsis/)
})

test('hologram uses light-responsive layered foil instead of sliding one texture image', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /<div class="hologram-layer/)
  assert.match(source, /effectSpread/)
  assert.match(source, /effectGrain/)
  assert.match(source, /effectFinish/)
  assert.match(css, /\.hologram-layer::before/)
  assert.match(css, /\.hologram-layer::after/)
  assert.match(css, /preset-moonlight/)
  assert.match(css, /preset-rose-opal/)
  assert.doesNotMatch(css, /translate3d\(var\(--foil-shift/)
})

test('hologram second scene stays legible while its reveal region changes', async () => {
  const css = await readFile(cssUrl, 'utf8')
  const secondScene = css.match(/\.editor-card > \.lenticular-photo\s*\{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(secondScene, /opacity:\s*0/)
  assert.match(css, /\.editor-card > \.lenticular-canvas\s*\{[\s\S]*?z-index:\s*1/)
  assert.doesNotMatch(secondScene, /mask-image:\s*repeating-linear-gradient/)
})

test('hologram transition has an irregular mixed lens boundary instead of a clean wipe', async () => {
  const css = await readFile(cssUrl, 'utf8')
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /class="lenticular-canvas"/)
  assert.match(source, /function drawLenticularCanvas\(/)
  assert.match(source, /stripWidth/)
  assert.match(source, /lensPitch/)
  assert.match(source, /stripMix/)
  assert.match(source, /lenticularReveal[\s\S]*0\.08/)
})

test('hologram inspector exposes independent material pattern coverage and its second image', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /data-effect-material=/)
  assert.match(source, /data-foil-pattern=/)
  assert.match(source, /data-foil-coverage=/)
  assert.doesNotMatch(source, /data-effect-interaction=/)
  assert.match(source, /data-upload="lenticular"/)
})

test('effects inspector renders the atelier 12 catalog with numbered foil controls', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /import\s+\{\s*EFFECT_CATALOG\s*\}\s+from\s+'\.\/effect-catalog\.js/)
  assert.match(source, /'\.\/foil-renderer\.js\?v=atelier12-1'/)
  assert.match(source, /data-foil-swatch="\$\{value\}"/)
  assert.match(source, /data-foil-pattern="\$\{value\}"/)
  assert.match(source, /String\(number\)\.padStart\(2,\s*'0'\)/)
})

test('new cards start blank with tilt interaction enabled by default', async () => {
  const source = await readFile(appUrl, 'utf8')
  const initialEditor = source.match(/function initialEditor\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(initialEditor, /imageSrc:\s*''/)
  assert.match(initialEditor, /effect:\s*'none'/)
  assert.match(initialEditor, /interaction:\s*'tilt'/)
  assert.match(initialEditor, /effectMotion:\s*true/)
})

test('studio separates foil effects from two-image hologram editing', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /\['effects',\s*'[^']+',\s*'특수효과'\]/)
  assert.match(source, /\['hologram',\s*'[^']+',\s*'홀로그램'\]/)
  assert.match(source, /function effectsInspector\(\)/)
  assert.match(source, /function hologramInspector\(\)/)
  assert.match(source, /두 번째 장면 추가/)
  assert.match(source, /data-action="toggle-effects"/)
  assert.match(source, /data-action="toggle-hologram"/)
  assert.match(source, /aria-label="입체감 설정"/)
  assert.doesNotMatch(source, /<span><strong>AI 입체 카드<\/strong>/)
})

test('recipe starts preserve the selected workflow without seeding sample media', async () => {
  const source = await readFile(appUrl, 'utf8')
  const setRecipe = source.match(/function setRecipe\(recipeId\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.doesNotMatch(setRecipe, /editor\.imageSrc\s*=\s*sampleAssets/)
  assert.doesNotMatch(setRecipe, /editor\.lenticularSrc\s*=\s*sampleAssets/)
  assert.match(source, /function recipeGuide\(\)/)
  assert.match(source, /recipe-guide/)
  assert.match(source, /state\.recipeStarted\s*=\s*true/)
  assert.match(source, /if \(state\.recipeStarted\) return/)
})

test('special effects use a WebGL2 overlay with a safe fallback path', async () => {
  const source = await readFile(appUrl, 'utf8')
  const renderer = await readFile(new URL('../foil-renderer.js', import.meta.url), 'utf8')
  const review = await readFile(new URL('../foil-review.js', import.meta.url), 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /data-webgl-effect/)
  assert.match(source, /function initWebGL2EffectCards\(\)/)
  assert.match(source, /import.*initFoilCards.*foil-renderer/)
  assert.match(review, /import.*createFoilRenderer.*foil-renderer/)
  assert.match(renderer, /getContext\('webgl2'/)
  assert.match(renderer, /WebGL2 미지원/)
  assert.match(renderer, /premultipliedAlpha:false/)
  assert.match(renderer, /uniform float pattern/)
  assert.match(renderer, /FOIL_PATTERNS.indexOf\(pattern\)/)
  assert.match(renderer, /deleteTexture/)
  assert.match(renderer, /observer.disconnect\(\)/)
  assert.match(css, /hologram-layer::before[\s\S]{0,260}background-image:\s*none/)
})

test('editor rerenders preserve the inspector scroll position', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /const inspectorScrollTop = document\.querySelector\('\.inspector-body'\)\?\.scrollTop/)
  assert.match(source, /afterRender\(inspectorScrollTop\)/)
  assert.match(source, /const inspector = document\.querySelector\('\.inspector-body'\)[\s\S]{0,100}inspector\.scrollTop = inspectorScrollTop/)
})

test('home resumes the recovered local draft without replacing its photo', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /data-action="resume-local-draft"/)
  const action = source.match(/if \(action === 'resume-local-draft'\) \{([\s\S]*?)\n  \}/)?.[1] || ''
  assert.match(action, /readDraft/)
  assert.match(action, /state.view = 'editor'/)
  assert.doesNotMatch(action, /setRecipe|initialEditor|clearDraft/)
})

test('special effects are named by their actual rendering responsibility', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /PHOTO EFFECTS/)
  assert.match(source, /입체감 설정/)
  assert.match(source, /AI 입체 카드/)
  assert.match(source, /2장 홀로그램/)
  assert.match(source, /WebGL2 효과에 즉시 반영/)
})

test('empty card photo opens the shared photo uploader from the canvas', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.match(source, /class="card-photo card-photo-empty"[^>]*aria-label="카드 사진 없음 · 사진 업로드"[^>]*>.*data-upload="image"/s)
  assert.match(source, /function openPhotoUpload\(\)/)
  assert.match(source, /data-canvas-photo-upload/)
  assert.match(source, /querySelector\('\[data-upload="image"\]'\)/)
  assert.match(source, /card-photo-empty, \[data-upload\]/)
  const clickBody = source.match(/app\.addEventListener\('click', async \(event\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  assert.match(clickBody, /photoUploadAction[\s\S]{0,180}openPhotoUpload\(\)[\s\S]{0,220}const nav/)
  assert.ok(clickBody.indexOf('photoUploadAction') < clickBody.indexOf("const stage = event.target.closest('[data-editor-stage]')"))
  assert.match(css, /\.card-photo-empty input\s*\{[\s\S]{0,220}inset:\s*0[\s\S]{0,220}pointer-events:\s*auto/)
})

test('WebGL2 effect redraws when its editor controls change', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.match(source, /webgl-refresh/)
  assert.match(source, /effectIntensity.*effectAngle.*effectSpread.*effectGrain/)
})

test('gold signature uses the artist handwriting layer instead of a stock signature', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const shader = await readFile(new URL('../atelier-shader.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(app, /goldSource = layer\.side === 'front'/)
  assert.match(app, /foil-gold-source/)
  assert.match(shader, /material-only border and glints/)
  assert.doesNotMatch(shader, /else if\(atelier<2\.5\)\{rgb=lightGold\(p,l\);\}/)
  assert.match(css, /\.foil-gold-source \.creative-layer-mask/)
  assert.match(shader, /goldSheet/)
  assert.match(shader, /goldSweep/)
  assert.match(css, /\.foil-gold-source \.creative-layer-mask[\s\S]{0,420}linear-gradient/)
  assert.match(css, /\.foil-gold-source \.creative-layer-mask[\s\S]{0,420}--light-x/)
})

test('selected layer controls clear when the editor canvas or another tool is clicked', async () => {
  const app = await readFile(appUrl, 'utf8')
  const clickBody = app.match(/app\.addEventListener\('click', async \(event\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''

  assert.match(clickBody, /const tool = event\.target\.closest\('\[data-tool\]'\)/)
  assert.match(clickBody, /state\.editor\.selectedLayerId = null[\s\S]{0,220}state\.editor\.tool = tool\.dataset\.tool/)
  assert.match(clickBody, /const canvasStage = event\.target\.closest\('\.editor-stage'\)/)
  assert.match(clickBody, /canvasStage[\s\S]{0,520}state\.editor\.selectedLayerId = null/)
})

test('handwriting pad commits a real layer and restores the color control', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(app, /data-editor="drawingColor"/)
  assert.match(app, /color: state\.editor\.drawingColor \|\| '#171a3a'/)
  assert.match(app, /canvas\.addEventListener\('lostpointercapture', finish\)/)
  assert.match(app, /upsertCreativeLayer\('handwriting'/)
  assert.match(app, /data-action="apply-handwriting"/)
  assert.match(app, /const applyHandwriting = event\.target\.closest\('\[data-action="apply-handwriting"\]'\)/)
  assert.match(app, /function commitHandwritingPad\(\)/)
  assert.match(app, /state\.editor\.handwritingSrc = canvas\.toDataURL\('image\/png'\)/)
  assert.match(app, /canvas\.dataset\.hasStroke !== 'true'/)
  assert.match(app, /canvas\.dataset\.hasStroke = 'true'/)
  assert.match(css, /\.handwriting-options input\[type='color'\]/)
})

test('ambient surface effects have an idle shader animation loop', async () => {
  const shader = await readFile(new URL('../atelier-shader.js', import.meta.url), 'utf8')
  const renderer = await readFile(new URL('../foil-renderer.js', import.meta.url), 'utf8')
  assert.match(shader, /uniform float time/)
  assert.match(shader, /drift=vec2\(sin\(time\*\.75/)
  assert.match(renderer, /IDLE_FOIL_PATTERNS = \['blossom-depth', 'constellation'\]/)
  assert.match(renderer, /isIdlePattern=\(\)=>IDLE_FOIL_PATTERNS\.includes\(cardPattern\(\)\)/)
  assert.match(renderer, /requestAnimationFrame\(idleTick\)/)
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

test('lenticular reduced-motion controls guard missing matchMedia', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches === true/)
})

test('device orientation is requested only after an explicit preview action', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /data-action="enable-device-motion"/)
  assert.match(source, /DeviceOrientationEvent\.requestPermission/)
  assert.match(source, /async function enableDeviceMotion\(/)
  assert.match(source, /function prefersReducedEffects\(/)
  const initialSetup = source.slice(source.indexOf('function render('), source.indexOf('function markDirty('))
  assert.doesNotMatch(initialSetup, /enableDeviceMotion\(/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.editor-card\s*\{[\s\S]*?(animation|transition):/)
})

test('low reported device memory does not silently disable card tilt', async () => {
  const source = await readFile(appUrl, 'utf8')
  const reducedEffects = source.slice(source.indexOf('function prefersReducedEffects('), source.indexOf('function clampTilt('))
  assert.doesNotMatch(reducedEffects, /deviceMemory\s*!==\s*null\s*&&\s*deviceMemory\s*<=\s*2/)
})

test('device orientation behavior requires explicit enablement before permission request', async () => {
  const harness = await loadMotionHarness()

  assert.equal(harness.permissionRequests(), 0)
  await harness.enableDeviceMotion()
  assert.equal(harness.permissionRequests(), 1)
})

test('device orientation behavior does not duplicate listeners on repeated enable', async () => {
  const harness = await loadMotionHarness()
  harness.state.view = 'editor'
  harness.state.stage = 'preview'

  await harness.enableDeviceMotion()
  await harness.enableDeviceMotion()

  assert.equal(harness.permissionRequests(), 2)
  assert.equal(harness.listenerCount('deviceorientation'), 1)
})

test('device orientation behavior avoids permission request when reduced effects are preferred', async () => {
  const harness = await loadMotionHarness({ reducedMotion: true })

  await harness.enableDeviceMotion()

  assert.equal(harness.permissionRequests(), 0)
  assert.equal(harness.listenerCount('deviceorientation'), 0)
})

test('device orientation behavior tears down listener outside full fan preview', async () => {
  const harness = await loadMotionHarness()

  await harness.enableDeviceMotion()
  harness.state.view = 'editor'
  harness.state.stage = 'preview'
  harness.syncDeviceMotionLifecycle()
  assert.equal(harness.listenerCount('deviceorientation'), 1)

  harness.state.stage = 'details'
  harness.syncDeviceMotionLifecycle()

  assert.equal(harness.listenerCount('deviceorientation'), 0)
})

test('device orientation behavior ignores static cards without effect motion', async () => {
  const harness = await loadMotionHarness({ effectMotion: false })
  harness.state.deviceMotionEnabled = true

  harness.applyDeviceOrientation({ beta: 8, gamma: 7 })

  assert.deepEqual(harness.styleWrites, [])
})

test('device orientation behavior clamps numeric tilt and sanitizes invalid values', async () => {
  const harness = await loadMotionHarness()
  harness.state.deviceMotionEnabled = true

  harness.applyDeviceOrientation({ beta: 24, gamma: Number.NaN })

  assert.deepEqual(harness.styleWrites.slice(0, 5), [
    ['--tilt-x', '-15.00deg'],
    ['--tilt-y', '0.00deg'],
    ['--light-x', '50%'],
    ['--light-y', '100%'],
    ['--lenticular-reveal', '50%'],
  ])
  assert.equal(harness.styleWrites.flat().some((value) => String(value).includes('NaN')), false)
})

test('official back template visibly inherits the selected background color', async () => {
  const css = await readFile(cssUrl, 'utf8')

  assert.match(css, /\.back-card\s*\{[\s\S]{0,260}--back-color/)
  assert.match(css, /\.back-card > img\s*\{[\s\S]{0,220}mix-blend-mode:\s*luminosity/)
})

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

test('back creative layers render above decorative finish layers and below authenticity', async () => {
  const css = await readFile(cssUrl, 'utf8')

  assert.match(css, /\.back-card \.creative-layer\s*\{[\s\S]{0,180}z-index:\s*calc\(var\(--layer-z,\s*1\) \+ 10\)/)
  assert.match(css, /\.back-card > img\s*\{[\s\S]{0,160}z-index:\s*3/)
  assert.match(css, /\.back-spot-uv\s*\{[\s\S]{0,180}z-index:\s*3/)
  assert.match(css, /\.back-authenticity\s*\{[\s\S]{0,180}z-index:\s*130/)
})

test('back draft serial always starts at issue one even without an issue limit', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /const issueNumber = String\(1\)\.padStart\(4, '0'\)/)
  assert.match(source, /const issueLimit = String\(state\.form\.issueLimit \|\| 0\)\.padStart\(4, '0'\)/)
  assert.doesNotMatch(source, /state\.form\.issueLimit \? 1 : 0/)
})

test('back hidden message input allows emoji before code point clamping', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /maxlength="80" data-editor="backHiddenMessage"/)
  assert.match(source, /Array\.from\(event\.target\.value\)\.slice\(0, 40\)\.join\(''\)/)
  assert.doesNotMatch(source, /maxlength="40" data-editor="backHiddenMessage"/)
})

test('back hidden message updates the card preview while the artist is typing', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /if \(field === 'backHiddenMessage'\) \{[\s\S]{0,500}\.back-hidden-message/)
  assert.match(
    source,
    /if \(editorField === 'backHiddenMessage'\) \{[\s\S]{0,700}applyEditorLivePreview\(editorField, event\.target\)/,
  )
})

test('review readiness renders every dynamic item with an accurate total', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /lenticular:\s*'홀로그램 두 번째 이미지'/)
  assert.match(source, /Object\.values\(readiness\.items\)\.length/)
  assert.doesNotMatch(source, /readiness-score[\s\S]{0,260}\/7/)
})

test('media inspectors explain enabled media requirements before review', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

  assert.match(source, /const voiceRequirement = state\.editor\.voiceEnabled && !state\.editor\.voiceSrc/)
  assert.match(source, /검수 제출 전 음성 파일이 필요해요\./)
  assert.match(source, /const videoRequirement = state\.editor\.videoEnabled && !state\.editor\.videoSrc/)
  assert.match(source, /검수 제출 전 모션 영상이 필요해요\./)
})

test('studio upload flow rejects unsupported media and oversized files before upload', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

  assert.match(source, /const uploadRules = \{[\s\S]*?voice:/)
  assert.match(source, /if \(rule && file\.type && !rule\.types\.includes\(file\.type\)/)
  assert.match(source, /file\.size > 10 \* 1024 \* 1024/)
})

test('artist studio design stage uses upload-first photo workflow without permanent source library', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="editor-workbench/)
  assert.doesNotMatch(source, /추천 비주얼/)
  assert.doesNotMatch(source, /소스 라이브러리/)
  assert.doesNotMatch(source, /class="editor-media-library"/)
  assert.doesNotMatch(source, /data-sample=/)
  assert.doesNotMatch(css, /\.editor-media-library/)
  assert.doesNotMatch(css, /\.media-library-/)
  assert.match(source, /class="photo-upload-panel"/)
  assert.match(source, /uploadBox\('image'/)
  assert.match(source, /state\.editor\.imageFile \|\| state\.editor\.imageAssetId \|\| state\.editor\.imageName/)
  assert.match(source, /data-action="remove-photo"/)
  assert.match(source, /class="editor-canvas-shell"/)
  assert.match(source, /class="editor-actions-strip"/)
  assert.match(source, /data-action="save-draft"[\s\S]{0,220}초안 저장/)
  assert.match(source, /data-action="go-details"[\s\S]{0,220}다음 단계/)
  assert.match(css, /\.editor-design\s*\{[\s\S]{0,260}grid-template-columns:\s*72px minmax\(420px,\s*1fr\) minmax\(330px,\s*380px\)/)
  assert.match(css, /@media \(max-width: 1220px\)[\s\S]*?\.editor-design\s*\{[\s\S]{0,180}grid-template-columns:\s*68px minmax\(360px,\s*1fr\) 300px/)
  assert.doesNotMatch(css, /@media \(max-width: 1220px\)[\s\S]*?\.editor-design\s*\{[\s\S]{0,180}grid-template-columns:\s*68px minmax\(156px,\s*190px\)/)
  assert.match(css, /\.tool-rail\s*\{[\s\S]{0,360}background:\s*#101836/)
  assert.match(css, /\.photo-upload-panel\s*\{/)
  assert.match(css, /\.editor-canvas-shell\s*\{[\s\S]{0,420}background:\s*#fff/)
  assert.match(css, /\.editor-actions-strip\s*\{[\s\S]{0,420}justify-content:\s*space-between/)
})

test('selected creative layers expose direct resize and rotate handles with pointer interactions', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="layer-handle layer-resize-handle"/)
  assert.match(source, /class="layer-handle layer-rotate-handle"/)
  assert.match(source, /data-layer-handle="resize"/)
  assert.match(source, /data-layer-handle="rotate"/)
  assert.match(source, /data-layer-handle="resize"[^>]*aria-hidden="true"/)
  assert.match(source, /data-layer-handle="rotate"[^>]*aria-hidden="true"/)
  assert.doesNotMatch(source, /data-layer-handle="resize"[^>]*aria-label=/)
  assert.doesNotMatch(source, /data-layer-handle="rotate"[^>]*aria-label=/)
  assert.match(source, /function updateLayerFromHandleDrag\(/)
  assert.match(source, /handleType === 'resize'[\s\S]{0,900}--layer-width/)
  assert.match(source, /handleType === 'rotate'[\s\S]{0,900}--layer-rotation/)
  assert.match(source, /event\.target\.closest\?\.\('\[data-layer-handle\]'\)/)
  assert.match(css, /\.layer-handle\s*\{[\s\S]{0,260}touch-action:\s*none/)
  assert.match(css, /\.layer-resize-handle\s*\{[\s\S]{0,180}cursor:\s*nwse-resize/)
  assert.match(css, /\.layer-rotate-handle\s*\{[\s\S]{0,180}cursor:\s*grab/)
})

test('layer geometry helpers clamp resize and wrap rotation across the signed angle boundary', async () => {
  const harness = await loadMotionHarness()
  const nearlyEqual = (actual, expected) => Math.abs(actual - expected) < 1e-9

  assert.equal(typeof harness.shortestSignedAngularDelta, 'function')
  assert.equal(typeof harness.clampLayerRotation, 'function')
  assert.equal(typeof harness.computeLayerResizeWidth, 'function')
  assert.ok(
    nearlyEqual(
      harness.shortestSignedAngularDelta((179 * Math.PI) / 180, (-179 * Math.PI) / 180),
      (2 * Math.PI) / 180,
    ),
  )
  assert.ok(
    nearlyEqual(
      harness.shortestSignedAngularDelta((-179 * Math.PI) / 180, (179 * Math.PI) / 180),
      (-2 * Math.PI) / 180,
    ),
  )
  assert.equal(harness.clampLayerRotation(181), -179)
  assert.equal(harness.clampLayerRotation(-181), 179)
  assert.equal(harness.computeLayerResizeWidth(40, 20, 1), 8)
  assert.equal(harness.computeLayerResizeWidth(40, 20, 200), 100)
  assert.equal(harness.computeLayerResizeWidth(40, 20, 30), 60)
})

test('artist studio keeps editor usable on tablet and phone layouts', async () => {
  const css = await readFile(cssUrl, 'utf8')

  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1024px\)[\s\S]*?\.editor-design\s*\{[\s\S]{0,220}grid-template-columns:\s*58px minmax\(260px,\s*1fr\) minmax\(244px,\s*278px\)/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.editor-design\s*\{[\s\S]{0,220}grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.tool-rail\s*\{[\s\S]{0,260}flex-direction:\s*row/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.editor-inspector\s*\{[\s\S]{0,360}position:\s*fixed/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.editor-inspector\.open\s*\{[\s\S]{0,120}transform:\s*translateY\(0\)/)
})

test('artist studio editor removes dashboard chrome to keep the collectible canvas dominant', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(source, /editorFocused = state\.view === 'editor'/)
  assert.match(source, /editorFocused \? 'editor-focused' : ''/)
  assert.match(styles, /\.studio-shell\.editor-focused > \.studio-sidebar/)
  assert.match(styles, /\.studio-shell\.editor-focused \.studio-topbar/)
  assert.match(styles, /\.studio-shell\.editor-focused \.studio-content/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.editor-design/)
})
