import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const appUrl = new URL('../app.js', import.meta.url)
const cssUrl = new URL('../styles.css', import.meta.url)

test('collapsed navigation hides only labels and keeps every menu icon visible', async () => {
  const source = await readFile(appUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')

  assert.match(source, /class="nav-label"/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed \.studio-sidebar nav button \.nav-label,[\s\S]{0,420}display:\s*none/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed \.studio-sidebar nav button > \.material-symbols-rounded[\s\S]{0,220}display:\s*inline-grid/)
  assert.doesNotMatch(css, /\.sidebar-collapsed \.studio-sidebar nav button span,/)
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

test('official back template visibly inherits the selected background color', async () => {
  const css = await readFile(cssUrl, 'utf8')

  assert.match(css, /\.back-card\s*\{[\s\S]{0,260}--back-color/)
  assert.match(css, /\.back-card > img\s*\{[\s\S]{0,220}mix-blend-mode:\s*luminosity/)
})

test('review readiness renders every dynamic item with an accurate total', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(source, /lenticular:\s*'렌티큘러 이미지'/)
  assert.match(source, /Object\.values\(readiness\.items\)\.length/)
  assert.doesNotMatch(source, /readiness-score[\s\S]{0,260}\/7/)
})
