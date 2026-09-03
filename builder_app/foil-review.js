import { EFFECT_CATALOG } from './effect-catalog.js?v=atelier12-1'
import { createFoilRenderer, initFoilCards } from './foil-renderer.js?v=atelier12-1'

const DEFAULT_PHOTO = './assets/card-stardust-backstage.jpg'
const LIQUID_PATTERN_ID = 'liquid-silver'
const angles = {
  left: { x: 0.14, y: 0.5, rx: 0, ry: -10 },
  front: { x: 0.5, y: 0.5, rx: 0, ry: 0 },
  right: { x: 0.86, y: 0.5, rx: 0, ry: 10 },
  up: { x: 0.5, y: 0.18, rx: 9, ry: 0 },
  down: { x: 0.5, y: 0.82, rx: -9, ry: 0 },
}

const state = {
  pattern: EFFECT_CATALOG[0].id,
  angle: 'front',
  pointerAngle: null,
  intensity: 0.72,
  spread: 0.64,
  grain: 0.5,
  enabled: true,
  imageSrc: DEFAULT_PHOTO,
  imageLabel: '기본 샘플: card-stardust-backstage.jpg',
}

const heroCard = document.querySelector('[data-review-card]')
const heroPhoto = document.querySelector('#hero-photo')
const heroCanvas = document.querySelector('#hero-effect')
const patterns = document.querySelector('#patterns')
const contactSheet = document.querySelector('#contact-sheet')
const readyStatus = document.querySelector('#ready-status')
const drawStatus = document.querySelector('#draw-status')
const selectedNumber = document.querySelector('#selected-number')
const selectedName = document.querySelector('#selected-name')
const selectedDescription = document.querySelector('#selected-description')
const contactLayout = document.querySelector('#contact-layout')
const referenceToggle = document.querySelector('#reference-toggle')
const sheetToggle = document.querySelector('#sheet-toggle')
const comparisonClose = document.querySelector('#comparison-close')
const upload = document.querySelector('#photo-upload')

let heroRenderer = null
let sheetRenderer = null
let sheetSourceCanvas = null
let heroFrame = 0
let galleryFrame = 0
let galleryDebounce = 0
let objectUrl = ''

function percent(value) {
  return `${Math.round(value * 100)}%`
}

function currentEffect() {
  return EFFECT_CATALOG.find((effect) => effect.id === state.pattern) || EFFECT_CATALOG[0]
}

function effectSettings(pattern = state.pattern) {
  const angle = state.pointerAngle || angles[state.angle]
  return {
    pattern,
    intensity: state.enabled ? state.intensity : 0,
    spread: state.spread,
    grain: state.grain,
    material: pattern === LIQUID_PATTERN_ID ? 'chrome' : 'pearl',
    coverage: 'full',
    x: angle.x,
    y: angle.y,
  }
}

function setBlendMode(canvas, pattern = state.pattern) {
  canvas.style.mixBlendMode = pattern === LIQUID_PATTERN_ID ? 'normal' : 'screen'
}

function effectById(pattern) {
  return EFFECT_CATALOG.find((effect) => effect.id === pattern) || EFFECT_CATALOG[0]
}

function paintPhotoToCanvas(ctx, image, width, height) {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#a8a8b5'
  ctx.fillRect(0, 0, width, height)
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function withCanvasSize(canvas, width, height) {
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const targetWidth = Math.round(width * ratio)
  const targetHeight = Math.round(height * ratio)
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }
  return { width: targetWidth, height: targetHeight }
}

function renderCardMark(ctx, width, height) {
  const inset = width * 0.055
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.font = `800 ${Math.max(9, width * 0.028)}px system-ui`
  ctx.fillText('FANFOLIO', width / 2, height - inset * 1.4)
  ctx.restore()
}

function drawHero() {
  const effect = currentEffect()
  const angle = state.pointerAngle || angles[state.angle]
  selectedNumber.textContent = String(effect.number).padStart(2, '0')
  selectedName.textContent = effect.name
  selectedDescription.textContent = effect.description
  heroCard.classList.toggle('effect-liquid-silver', state.pattern === LIQUID_PATTERN_ID)
  document.body.classList.toggle('effect-off', !state.enabled)
  heroCard.style.setProperty('--rx', `${angle.rx}deg`)
  heroCard.style.setProperty('--ry', `${angle.ry}deg`)
  setBlendMode(heroCanvas)
  heroRenderer.draw(effectSettings())
}

function drawContactSheet() {
  const image = heroPhoto
  if (!image.complete || !image.naturalWidth) return
  const sourceCanvas = sheetSourceCanvas
  const sourceWidth = 360
  const sourceHeight = 540
  withCanvasSize(sourceCanvas, sourceWidth, sourceHeight)

  for (const figure of contactSheet.querySelectorAll('[data-contact-effect]')) {
    const pattern = figure.dataset.contactEffect
    const canvas = figure.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const { width, height } = withCanvasSize(canvas, sourceWidth, sourceHeight)
    paintPhotoToCanvas(ctx, image, width, height)
    sheetRenderer.draw(effectSettings(pattern))
    ctx.globalCompositeOperation = pattern === LIQUID_PATTERN_ID ? 'source-over' : 'screen'
    ctx.drawImage(sourceCanvas, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    renderCardMark(ctx, width, height)
  }
}

function scheduleHeroDraw() {
  if (heroFrame) return
  heroFrame = requestAnimationFrame(() => {
    heroFrame = 0
    const started = performance.now()
    drawHero()
    drawStatus.textContent = `Drawn ${currentEffect().name} · ${state.angle} · ${(
      performance.now() - started
    ).toFixed(1)}ms`
  })
}

function scheduleGalleryDraw() {
  if (galleryFrame) return
  galleryFrame = requestAnimationFrame(() => {
    galleryFrame = 0
    const started = performance.now()
    drawContactSheet()
    drawStatus.textContent = `Gallery updated · ${state.angle} · ${(
      performance.now() - started
    ).toFixed(1)}ms`
  })
}

function scheduleFullDraw() {
  scheduleHeroDraw()
  scheduleGalleryDraw()
}

function scheduleIdleGalleryDraw() {
  window.clearTimeout(galleryDebounce)
  galleryDebounce = window.setTimeout(scheduleGalleryDraw, 180)
}

function setReady(stateName, label) {
  readyStatus.dataset.rendererState = stateName
  readyStatus.textContent = label
}

function setPattern(pattern) {
  state.pattern = pattern
  for (const button of patterns.querySelectorAll('[data-pattern]')) {
    button.classList.toggle('active', button.dataset.pattern === pattern)
    button.setAttribute('aria-pressed', String(button.dataset.pattern === pattern))
  }
  for (const figure of contactSheet.querySelectorAll('[data-contact-effect]')) {
    figure.classList.toggle('active', figure.dataset.contactEffect === pattern)
  }
  scheduleFullDraw()
}

function setAngle(angle) {
  state.pointerAngle = null
  state.angle = angle
  for (const button of document.querySelectorAll('[data-angle]')) {
    button.classList.toggle('active', button.dataset.angle === angle)
    button.setAttribute('aria-pressed', String(button.dataset.angle === angle))
  }
  scheduleFullDraw()
}

function setReferenceComparison(enabled) {
  contactLayout.classList.toggle('with-reference', enabled)
  referenceToggle.classList.toggle('active', enabled)
  sheetToggle.classList.toggle('active', !enabled)
  referenceToggle.setAttribute('aria-pressed', String(enabled))
  sheetToggle.setAttribute('aria-pressed', String(!enabled))
}

function buildControls() {
  patterns.innerHTML = EFFECT_CATALOG.map(
    (effect) =>
      `<button type="button" data-pattern="${effect.id}" class="${
        effect.id === state.pattern ? 'active' : ''
      }" aria-pressed="${effect.id === state.pattern}" aria-label="${String(effect.number).padStart(
        2,
        '0',
      )} ${effect.name} 선택"><em>${String(effect.number).padStart(2, '0')}</em><strong>${
        effect.name
      }</strong></button>`,
  ).join('')

  contactSheet.innerHTML = EFFECT_CATALOG.map(
    (effect) =>
      `<figure class="effect-card ${effect.id === state.pattern ? 'active' : ''}" data-contact-effect="${effect.id}"><button type="button" data-snapshot-pattern="${
        effect.id
      }" aria-label="${String(effect.number).padStart(2, '0')} ${
        effect.name
      } 크게 보기"><canvas aria-hidden="true"></canvas></button><figcaption><em>${String(
        effect.number,
      ).padStart(2, '0')}</em><span>${effect.name}</span></figcaption></figure>`,
  ).join('')
}

function bindControls() {
  patterns.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pattern]')
    if (button) setPattern(button.dataset.pattern)
  })

  contactSheet.addEventListener('click', (event) => {
    const button = event.target.closest('[data-snapshot-pattern]')
    if (!button) return
    setPattern(button.dataset.snapshotPattern)
    const effect = effectById(button.dataset.snapshotPattern)
    drawStatus.textContent = `Focused ${String(effect.number).padStart(2, '0')} ${effect.name}`
  })

  document.querySelector('#angles').addEventListener('click', (event) => {
    const button = event.target.closest('[data-angle]')
    if (button) setAngle(button.dataset.angle)
  })

  for (const field of ['intensity', 'spread', 'grain']) {
    document.querySelector(`#${field}`).addEventListener('input', (event) => {
      state[field] = Number(event.target.value)
      document.querySelector(`#${field}-value`).textContent = percent(state[field])
      scheduleFullDraw()
    })
  }

  document.querySelector('#enabled').addEventListener('change', (event) => {
    state.enabled = event.target.checked
    scheduleFullDraw()
  })

  heroCard.addEventListener('pointermove', (event) => {
    const rect = heroCard.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    state.angle = 'front'
    state.pointerAngle = {
      x,
      y,
      rx: (0.5 - y) * 12,
      ry: (x - 0.5) * 16,
    }
    for (const button of document.querySelectorAll('[data-angle]')) {
      button.classList.toggle('active', button.dataset.angle === 'front')
      button.setAttribute('aria-pressed', String(button.dataset.angle === 'front'))
    }
    scheduleHeroDraw()
    scheduleIdleGalleryDraw()
  })

  heroCard.addEventListener('pointerleave', () => {
    state.pointerAngle = null
    setAngle('front')
  })

  upload.addEventListener('change', () => {
    const file = upload.files?.[0]
    if (!file) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(file)
    state.imageSrc = objectUrl
    state.imageLabel = `업로드 이미지: ${file.name}`
    document.querySelector('#image-caption').textContent = state.imageLabel
    heroPhoto.src = state.imageSrc
  })

  heroPhoto.addEventListener('load', scheduleFullDraw)

  referenceToggle.addEventListener('click', () => {
    setReferenceComparison(!contactLayout.classList.contains('with-reference'))
  })

  sheetToggle.addEventListener('click', () => {
    setReferenceComparison(false)
  })

  comparisonClose.addEventListener('click', () => {
    setReferenceComparison(false)
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setReferenceComparison(false)
  })

  window.addEventListener('resize', scheduleFullDraw)
  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(heroFrame)
      cancelAnimationFrame(galleryFrame)
      window.clearTimeout(galleryDebounce)
      heroRenderer?.dispose()
      sheetRenderer?.dispose()
      sheetSourceCanvas?.remove()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    },
    { once: true },
  )
}

async function awaitRenderer(renderer) {
  if (renderer.ready && typeof renderer.ready.then === 'function') {
    await renderer.ready
  }
  return renderer
}

async function boot() {
  buildControls()
  bindControls()
  initFoilCards(document)
  setReady('loading', 'Renderer loading')
  const offscreen = document.createElement('canvas')
  offscreen.style.cssText = 'position:fixed;left:-10000px;top:0;width:360px;height:540px;opacity:0;pointer-events:none'
  offscreen.setAttribute('aria-hidden', 'true')
  document.body.append(offscreen)
  sheetSourceCanvas = offscreen
  heroRenderer = createFoilRenderer(heroCanvas)
  sheetRenderer = createFoilRenderer(offscreen)
  await Promise.all([awaitRenderer(heroRenderer), awaitRenderer(sheetRenderer)])
  setReady('ready', 'Renderer ready')
  scheduleFullDraw()
}

boot().catch((error) => {
  setReady('failed', `Renderer failed: ${error.message}`)
  drawStatus.textContent = 'Draw unavailable'
  console.error(error)
})
