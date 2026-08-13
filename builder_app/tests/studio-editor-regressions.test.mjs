import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import vm from 'node:vm'

const appUrl = new URL('../app.js', import.meta.url)
const cssUrl = new URL('../styles.css', import.meta.url)

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
    .replace(/^import \{[\s\S]*?\} from '\.\/studio-core\.js'\n\n/, '')
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

  assert.match(source, /lenticular:\s*'렌티큘러 이미지'/)
  assert.match(source, /Object\.values\(readiness\.items\)\.length/)
  assert.doesNotMatch(source, /readiness-score[\s\S]{0,260}\/7/)
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
