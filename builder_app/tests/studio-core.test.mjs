import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildCardPayload,
  buildDesignConfig,
  navigationState,
  normalizeCreativeLayer,
  responsiveStudioMode,
  reviewReadiness,
  studioDashboard,
} from '../studio-core.js'

test('uses the visual-editor image asset without asking for the same file again', () => {
  const payload = buildCardPayload({
    form: {
      name: '오로라 모션 카드',
      templateId: 'template_signature_v1',
      seasonName: '2026 SUMMER',
      rarity: 'UR',
      issueLimit: 100,
    },
    editor: { imageAssetId: 'asset_card' },
  })

  assert.equal(payload.imageAssetId, 'asset_card')
})

test('blocks review when an enabled voice card has no voice asset', () => {
  const result = reviewReadiness({ hasVoice: true, voiceAssetId: null })

  assert.equal(result.ready, false)
  assert.equal(result.items.voice.status, 'missing')
})

test('blocks review when enabled motion has no video asset', () => {
  const result = reviewReadiness({
    designConfig: { video: { enabled: true } },
    videoAssetId: null,
  })

  assert.equal(result.ready, false)
  assert.equal(result.items.video.status, 'missing')
})

test('summarizes cards requiring work without mutating the source list', () => {
  const cards = [
    { id: 'draft', status: 'draft' },
    { id: 'review', status: 'pending_review' },
    { id: 'revision', status: 'changes_requested' },
    { id: 'published', status: 'published' },
  ]

  const dashboard = studioDashboard(cards)

  assert.deepEqual(dashboard.counts, {
    draft: 1,
    pendingReview: 1,
    changesRequested: 1,
    published: 1,
  })
  assert.deepEqual(dashboard.actionable.map((card) => card.id), ['revision', 'draft'])
  assert.deepEqual(cards.map((card) => card.id), ['draft', 'review', 'revision', 'published'])
})

test('keeps studio home separate from the card creation flow', () => {
  assert.deepEqual(navigationState('home'), { view: 'home', step: 0 })
  assert.deepEqual(navigationState('create'), { view: 'create', step: 1 })
})

test('serializes voice, motion and hologram settings into the shared design contract', () => {
  const payload = buildCardPayload({
    form: {
      name: '오로라 모션 카드',
      templateId: 'template_signature_v1',
      seasonName: '2026 SUMMER',
      rarity: 'UR',
      voiceAssetId: 'asset_voice',
      videoAssetId: 'asset_video',
      hasVoice: true,
      issueLimit: 100,
    },
    editor: {
      imageAssetId: 'asset_card',
      effect: 'holographic',
      effectPreset: 'aurora',
      effectIntensity: 78,
      effectAngle: 135,
      effectMotion: true,
      videoEnabled: true,
      videoPosterTime: 0,
      videoLoop: true,
      voiceTrimStart: 0,
      voiceTrimEnd: 12,
    },
  })

  assert.deepEqual(payload.designConfig.front, {
    effect: 'holographic',
    effectPreset: 'aurora',
    effectIntensity: 0.78,
    effectAngle: 135,
    effectMotion: true,
    image: { assetId: 'asset_card' },
  })
  assert.deepEqual(payload.designConfig.video, {
    enabled: true,
    posterTime: 0,
    loop: true,
  })
  assert.deepEqual(payload.designConfig.voice, {
    enabled: true,
    trimStart: 0,
    trimEnd: 12,
  })
  assert.equal(payload.voiceAssetId, 'asset_voice')
  assert.equal(payload.videoAssetId, 'asset_video')
})

test('serializes handwriting state and transform into the shared design contract', () => {
  const payload = buildCardPayload({
    form: {
      templateId: 'template_signature_v1',
      name: '손글씨 카드',
      seasonName: '2026 SUMMER',
      rarity: 'SR',
      issueLimit: 300,
    },
    editor: {
      imageAssetId: 'asset_card',
      handwritingEnabled: true,
      handwritingAssetId: 'asset_handwriting',
      handwritingTransform: { x: 96, y: 1010, width: 520, rotation: -4 },
    },
  })

  assert.deepEqual(payload.designConfig.handwriting, { enabled: true })
  assert.equal(payload.handwritingAssetId, 'asset_handwriting')
  assert.deepEqual(payload.handwritingTransform, {
    x: 96,
    y: 1010,
    width: 520,
    rotation: -4,
  })
})

test('hosted studio routes authentication through its same-origin API proxy', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /https:\/\/fanfolio-api\.onrender\.com\/api/)
  assert.match(source, /:\s*'\/api'/)

  const config = JSON.parse(
    await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  )
  assert.ok(
    config.routes.some(
      (route) =>
        route.src === '/api/(.*)' &&
        route.dest === 'https://fanfolio-api.onrender.com/api/$1',
    ),
  )
})

test('selects a deliberate studio layout for laptop, tablet, and phone widths', () => {
  assert.equal(responsiveStudioMode(1280), 'desktop')
  assert.equal(responsiveStudioMode(900), 'tablet')
  assert.equal(responsiveStudioMode(430), 'phone')
})

test('normalizes creative layers for touch-safe front and back editing', () => {
  assert.deepEqual(
    normalizeCreativeLayer({
      id: 'layer-drawing',
      type: 'drawing',
      side: 'back',
      assetId: 'asset_drawing',
      x: 112,
      y: -8,
      width: 140,
      rotation: 225,
      opacity: 1.4,
      color: '#ff4fa3',
    }),
    {
      id: 'layer-drawing',
      type: 'drawing',
      side: 'back',
      assetId: 'asset_drawing',
      x: 100,
      y: 0,
      width: 100,
      rotation: 180,
      opacity: 1,
      color: '#ff4fa3',
    },
  )
})

test('serializes creative layer metadata without browser-only files or URLs', () => {
  const config = buildDesignConfig({
    editor: {
      layers: [
        {
          id: 'layer-sticker',
          type: 'sticker',
          side: 'front',
          assetId: 'asset_sticker',
          src: 'blob:https://studio.example/sticker',
          file: { name: 'sticker.png' },
          x: 76,
          y: 24,
          width: 28,
          rotation: -12,
          opacity: 0.84,
          color: '#ffffff',
        },
      ],
    },
  })

  assert.deepEqual(config.creativeLayers, [
    {
      id: 'layer-sticker',
      type: 'sticker',
      side: 'front',
      assetId: 'asset_sticker',
      x: 76,
      y: 24,
      width: 28,
      rotation: -12,
      opacity: 0.84,
      color: '#ffffff',
    },
  ])
  assert.equal('src' in config.creativeLayers[0], false)
  assert.equal('file' in config.creativeLayers[0], false)
})

test('studio shell exposes adaptive navigation, a mobile inspector, and interactive cards', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(source, /data-action="toggle-sidebar"/)
  assert.match(source, /class="sidebar-footer"/)
  assert.match(source, /class="mobile-editor-actions"/)
  assert.match(source, /mobile-inspector-backdrop/)
  assert.match(source, /data-action="close-inspector"/)
  assert.match(source, /data-hologram-card/)
  assert.match(source, /initInteractiveCards/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed/)
  assert.match(css, /\.sidebar-footer\s*\{[\s\S]*?margin-top:\s*auto/)
  assert.match(css, /\.editor-inspector\.open/)
  assert.match(css, /--tilt-x/)
  assert.match(css, /touch-action:\s*none/)
})
