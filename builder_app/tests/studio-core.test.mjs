import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildCardPayload,
  buildDesignConfig,
  cardDraftErrors,
  cardEditorStage,
  normalizeCatalogSelection,
  navigationState,
  normalizeCardEffects,
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

test('emits a backend-supported effect preset for hologram recipes', () => {
  const payload = buildCardPayload({
    form: { name: '홀로그램 카드' },
    editor: { tool: 'hologram', effect: 'holographic', effectPreset: 'stardust' },
  })

  assert.equal(payload.designConfig.front.preset, 'hologram')
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

test('normalizes legacy version 2 holographic effects into the version 3 contract', () => {
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

test('normalizes unknown version 3 effect values back to supported defaults', () => {
  assert.deepEqual(
    normalizeCardEffects({
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
    }),
    {
      version: 3,
      front: {
        material: 'matte',
        foilPattern: 'aurora-wave',
        foilCoverage: 'full',
        interaction: 'static',
        intensity: 1,
        angle: 340,
        lenticularAssetId: null,
      },
      back: {
        material: 'matte',
        edgeFoil: 'none',
        spotUv: 'none',
        hiddenMessage: '가'.repeat(40),
      },
    },
  )
})

test('truncates back hidden messages by Unicode code point', () => {
  const hiddenMessage = `${'가'.repeat(39)}😀나`
  const normalized = normalizeCardEffects({
    version: 3,
    back: { hiddenMessage },
  })

  assert.equal(normalized.back.hiddenMessage, `${'가'.repeat(39)}😀`)
  assert.equal(Array.from(normalized.back.hiddenMessage).length, 40)
  assert.equal(
    Array.from(normalized.back.hiddenMessage).some((char) => {
      const codePoint = char.codePointAt(0)
      return codePoint >= 0xd800 && codePoint <= 0xdfff
    }),
    false,
  )
})

test('requires a lenticular asset only when version 3 interaction is lenticular', () => {
  const baseDraft = {
    imageAssetId: 'asset_card',
    artistId: 'artist_1',
    memberId: 'member_1',
    issueLimit: 100,
    previewOpened: true,
    designConfig: {
      version: 3,
      front: {
        material: 'chrome',
        foilPattern: 'prism',
        foilCoverage: 'full',
        interaction: 'lenticular',
        intensity: 0.8,
        angle: 135,
      },
    },
  }

  const missing = reviewReadiness(baseDraft)
  const ready = reviewReadiness({
    ...baseDraft,
    designConfig: {
      ...baseDraft.designConfig,
      front: {
        ...baseDraft.designConfig.front,
        lenticularAssetId: 'asset_alt',
      },
    },
  })

  assert.equal(missing.items.lenticular.status, 'missing')
  assert.equal(missing.ready, false)
  assert.equal(ready.items.lenticular.status, 'ready')
  assert.equal(ready.ready, true)
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

test('opens released cards in the read-only release status stage', () => {
  assert.equal(cardEditorStage({ status: 'draft', releaseStatus: 'draft' }), 'design')
  assert.equal(cardEditorStage({ status: 'draft', releaseStatus: 'changes_requested' }), 'design')
  assert.equal(cardEditorStage({ status: 'pending_review', releaseStatus: 'pending_partner_review' }), 'review')
  assert.equal(cardEditorStage({ status: 'published', releaseStatus: 'published' }), 'review')
})

test('returns actionable errors before saving an incomplete card draft', () => {
  assert.deepEqual(cardDraftErrors({ form: {}, editor: {} }), [
    '카드 이름을 입력해주세요.',
    '시즌명을 입력해주세요.',
    '카드 템플릿을 선택해주세요.',
    '아티스트와 멤버를 선택해주세요.',
    '카드 앞면 이미지를 추가해주세요.',
    '발행 수량을 1장 이상 입력해주세요.',
  ])
  assert.deepEqual(
    cardDraftErrors({
      form: {
        name: 'Aurora',
        seasonName: '2026 SUMMER',
        templateId: 'template_signature_v1',
        artistId: 'artist_dreamscape',
        memberId: 'member_rina',
        imageAssetId: 'asset_image',
        issueLimit: 300,
      },
      editor: {},
    }),
    [],
  )
  assert.deepEqual(
    cardDraftErrors({
      form: {
        name: 'Aurora',
        seasonName: '2026 SUMMER',
        templateId: 'template_signature_v1',
        artistId: 'artist_dreamscape',
        memberId: 'member_rina',
        issueLimit: 300,
      },
      editor: { imageSrc: 'data:image/png;base64,preview' },
    }),
    [],
  )
})

test('repairs stale catalog selections from a recovered draft', () => {
  assert.deepEqual(
    normalizeCatalogSelection(
      { artistId: 'missing-artist', memberId: 'missing-member' },
      {
        artists: [{ id: 'artist_dreamscape' }],
        members: [
          { id: 'member_rina', artistId: 'artist_dreamscape' },
          { id: 'member_yuna', artistId: 'artist_dreamscape' },
        ],
      },
    ),
    { artistId: 'artist_dreamscape', memberId: 'member_rina' },
  )
  assert.deepEqual(
    normalizeCatalogSelection(
      { artistId: 'artist_dreamscape', memberId: 'wrong-member' },
      { artists: [{ id: 'artist_dreamscape' }], members: [] },
    ),
    { artistId: 'artist_dreamscape', memberId: null },
  )
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

  assert.equal(payload.designConfig.version, 3)
  assert.deepEqual(payload.designConfig.front, {
    material: 'pearl',
    foilPattern: 'aurora-wave',
    foilCoverage: 'full',
    interaction: 'tilt',
    intensity: 0.78,
    angle: 135,
    preset: 'hologram',
    lenticularAssetId: null,
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

test('serializes premium hologram tuning so fan previews can match the studio', () => {
  const config = buildDesignConfig({
    editor: {
      effect: 'holographic',
      effectPreset: 'moonlight',
      effectIntensity: 0.72,
      effectAngle: 210,
      effectSpread: 0.64,
      effectGrain: 0.38,
      effectFinish: 'silk',
    },
  })

  assert.equal(config.version, 3)
  assert.deepEqual(config.front, {
    material: 'matte',
    foilPattern: 'aurora-wave',
    foilCoverage: 'full',
    interaction: 'tilt',
    intensity: 0.72,
    angle: 210,
    preset: 'hologram',
    lenticularAssetId: null,
    effect: 'holographic',
    effectPreset: 'moonlight',
    effectIntensity: 0.72,
    effectAngle: 210,
    effectSpread: 0.64,
    effectGrain: 0.38,
    effectFinish: 'silk',
    effectMotion: true,
  })
})

test('keeps lenticular assets scoped to the front effect contract', () => {
  const config = buildDesignConfig({
    form: {
      designConfig: {
        version: 3,
        lenticularAssetId: 'legacy_top_asset',
        customTopLevel: 'preserve-me',
        front: {
          interaction: 'lenticular',
          lenticularAssetId: 'asset_alt',
        },
        back: {
          lenticularAssetId: 'legacy_back_asset',
          background: 'midnight',
          templateId: 'back_template',
        },
      },
    },
  })

  assert.equal(config.front.lenticularAssetId, 'asset_alt')
  assert.equal('lenticularAssetId' in config, false)
  assert.equal('lenticularAssetId' in config.back, false)
  assert.equal(config.customTopLevel, 'preserve-me')
  assert.equal(config.back.background, 'midnight')
  assert.equal(config.back.templateId, 'back_template')
})

test('serializes explicit lenticular asset removal without reusing existing config', () => {
  const config = buildDesignConfig({
    form: {
      designConfig: {
        version: 3,
        front: {
          interaction: 'lenticular',
          lenticularAssetId: 'old-secondary',
          effectMotion: true,
        },
      },
    },
    editor: {
      interaction: 'lenticular',
      lenticularAssetId: null,
    },
  })

  assert.equal(config.front.interaction, 'lenticular')
  assert.equal(config.front.lenticularAssetId, null)
})

test('serializes inactive interactions without stale lenticular assets', () => {
  const staticConfig = buildDesignConfig({
    form: {
      designConfig: {
        version: 3,
        front: {
          interaction: 'lenticular',
          lenticularAssetId: 'old-secondary',
          effectMotion: false,
        },
      },
    },
    editor: {
      interaction: 'static',
      lenticularAssetId: 'old-secondary',
    },
  })
  const tiltPayload = buildCardPayload({
    form: {
      templateId: 'template_signature_v1',
      name: '프리즘 카드',
      seasonName: '2026 SUMMER',
      rarity: 'SR',
      issueLimit: 100,
      designConfig: {
        version: 3,
        front: {
          interaction: 'lenticular',
          lenticularAssetId: 'old-secondary',
        },
      },
    },
    editor: {
      imageAssetId: 'asset_card',
      interaction: 'tilt',
      lenticularAssetId: 'old-secondary',
    },
  })
  const lenticularConfig = buildDesignConfig({
    form: {
      designConfig: {
        version: 3,
        front: {
          interaction: 'static',
          effectMotion: false,
        },
      },
    },
    editor: {
      interaction: 'lenticular',
      lenticularAssetId: 'old-secondary',
    },
  })

  assert.equal(staticConfig.front.interaction, 'static')
  assert.equal(staticConfig.front.lenticularAssetId, null)
  assert.equal(staticConfig.front.effectMotion, false)
  assert.equal(tiltPayload.designConfig.front.interaction, 'tilt')
  assert.equal(tiltPayload.designConfig.front.lenticularAssetId, null)
  assert.equal(tiltPayload.designConfig.front.effectMotion, true)
  assert.equal(lenticularConfig.front.interaction, 'lenticular')
  assert.equal(lenticularConfig.front.effectMotion, true)
})

test('preserves existing lenticular asset while lenticular interaction remains active', () => {
  const config = buildDesignConfig({
    form: {
      designConfig: {
        version: 3,
        front: {
          interaction: 'lenticular',
          lenticularAssetId: 'old-secondary',
        },
      },
    },
    editor: {
      interaction: 'lenticular',
      lenticularAssetId: 'old-secondary',
    },
  })

  assert.equal(config.front.interaction, 'lenticular')
  assert.equal(config.front.lenticularAssetId, 'old-secondary')
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

test('preserves the built-in sticker identity while stripping its browser preview URL', () => {
  const config = buildDesignConfig({
    editor: {
      layers: [
        {
          id: 'layer-opal-heart',
          type: 'sticker',
          builtinId: 'opal-heart',
          src: './assets/stickers/sticker-opal-heart.png',
          side: 'front',
          x: 66,
          y: 30,
          width: 24,
        },
      ],
    },
  })

  assert.equal(config.creativeLayers[0].builtinId, 'opal-heart')
  assert.equal('src' in config.creativeLayers[0], false)
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
  assert.match(source, /drawingDraftSrc/)
  assert.match(source, /fetchProtectedBlob\(`\/assets\/\$\{layer\.assetId\}\/content`\)/)
  assert.match(source, /event\.pointerType === 'touch'/)
  assert.match(css, /\.studio-shell\.sidebar-collapsed/)
  assert.match(css, /\.sidebar-footer\s*\{[\s\S]*?margin-top:\s*auto/)
  assert.match(css, /\.editor-inspector\.open/)
  assert.match(css, /\.editor-card\s*\{[\s\S]*?touch-action:\s*pan-y/)
  assert.match(css, /--tilt-x/)
  assert.match(css, /touch-action:\s*none/)
})

test('local creative drafts keep recoverable image data across a refresh', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /key === 'handwritingSrc'[\s\S]{0,120}startsWith\('data:'\)/)
  assert.match(source, /layer\.src\?\.startsWith\('blob:'\)[\s\S]{0,80}undefined[\s\S]{0,80}layer\.src/)
  assert.match(source, /drawingDraftSrc = canvas\.toDataURL\('image\/png'\)/)
  assert.match(source, /context\.drawImage\(image, 0, 0, canvas\.width, canvas\.height\)/)
})
