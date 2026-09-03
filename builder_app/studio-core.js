import { ALL_FOIL_PATTERN_IDS } from './effect-catalog.js'

export { ALL_FOIL_PATTERN_IDS, EFFECT_CATALOG, LEGACY_FOIL_PATTERN_IDS } from './effect-catalog.js'

const STATUS_KEYS = {
  draft: 'draft',
  pending_review: 'pendingReview',
  changes_requested: 'changesRequested',
  published: 'published',
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function numeric(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizedIntensity(value, fallback = 0.78) {
  const parsed = numeric(value, fallback)
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed))
}

const MATERIALS = new Set(['matte', 'pearl', 'chrome'])
const FOIL_PATTERNS = new Set(ALL_FOIL_PATTERN_IDS)
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

function clamped(value, minimum, maximum, fallback) {
  return Math.max(minimum, Math.min(maximum, numeric(value, fallback)))
}

export function responsiveStudioMode(width) {
  const viewport = numeric(width, 1280)
  if (viewport <= 720) return 'phone'
  if (viewport <= 1024) return 'tablet'
  return 'desktop'
}

export function spatialSceneLabel(status = 'idle') {
  if (status === 'processing') return 'AI 입체 카드 생성 중'
  if (status === 'completed' || status === 'ready') return 'AI 입체 카드 준비 완료'
  if (status === 'error' || status === 'failed') return 'AI 입체 카드 생성 실패'
  return 'AI 입체 카드 미생성'
}

export function spatialSceneMediaRoles() {
  return ['background', 'mask', 'depth']
}

export function normalizeCreativeLayer(layer = {}, index = 0) {
  const allowedTypes = new Set(['handwriting', 'drawing', 'sticker'])
  const color = /^#[0-9a-f]{6}$/i.test(String(layer.color || ''))
    ? String(layer.color).toLowerCase()
    : '#ffffff'
  return compactObject({
    id: String(layer.id || `creative-layer-${index + 1}`),
    type: allowedTypes.has(layer.type) ? layer.type : 'handwriting',
    side: layer.side === 'back' ? 'back' : 'front',
    assetId: layer.assetId || undefined,
    builtinId: layer.builtinId || undefined,
    x: clamped(layer.x, 0, 100, 50),
    y: clamped(layer.y, 0, 100, 50),
    width: clamped(layer.width, 8, 100, 36),
    rotation: clamped(layer.rotation, -180, 180, 0),
    opacity: clamped(layer.opacity, 0, 1, 1),
    color,
    zIndex:
      layer.zIndex === undefined ? undefined : clamped(layer.zIndex, 1, 99, index + 1),
  })
}

export function normalizeCardEffects(designConfig = {}) {
  const front = designConfig.front || {}
  const back = designConfig.back || {}
  const interaction = front.interaction || (front.effectMotion === false ? 'static' : 'tilt')
  const normalizedInteraction = oneOf(interaction, INTERACTIONS, 'static')

  return {
    version: 3,
    front: {
      material: oneOf(
        front.material,
        MATERIALS,
        oneOf(
          LEGACY_MATERIAL[
            front.effectFinish ?? (front.effect === 'holographic' ? 'glass' : undefined)
          ],
          MATERIALS,
          'matte',
        ),
      ),
      foilPattern: oneOf(
        front.foilPattern,
        FOIL_PATTERNS,
        oneOf(LEGACY_PATTERN[front.effectPreset], FOIL_PATTERNS, 'aurora-wave'),
      ),
      foilCoverage: oneOf(front.foilCoverage, FOIL_COVERAGES, 'full'),
      interaction: normalizedInteraction,
      intensity: normalizedIntensity(front.intensity ?? front.effectIntensity, 0.58),
      angle: normalizedAngle(front.angle ?? front.effectAngle, 135),
      lenticularAssetId:
        normalizedInteraction === 'lenticular' ? front.lenticularAssetId || null : null,
    },
    back: {
      material: oneOf(back.material, MATERIALS, 'matte'),
      edgeFoil: oneOf(back.edgeFoil, EDGE_FOILS, 'none'),
      spotUv: oneOf(back.spotUv, SPOT_UV_TARGETS, 'none'),
      hiddenMessage: Array.from(String(back.hiddenMessage ?? '')).slice(0, 40).join(''),
    },
  }
}

export function buildDesignConfig({ form = {}, editor = {} } = {}) {
  const rawExisting = form.designConfig || editor.designConfig || {}
  const { lenticularAssetId: _topLevelLenticularAssetId, ...existing } = rawExisting
  const existingFront = existing.front || {}
  const { lenticularAssetId: _backLenticularAssetId, ...existingBack } = existing.back || {}
  const imageAssetId = editor.imageAssetId || form.imageAssetId
  const videoAssetId = editor.videoAssetId || form.videoAssetId
  const voiceEnabled = Boolean(
    editor.voiceEnabled ?? existing.voice?.enabled ?? form.hasVoice ?? form.voiceAssetId,
  )
  const videoEnabled = Boolean(
    editor.videoEnabled ?? existing.video?.enabled ?? form.videoEnabled ?? videoAssetId,
  )
  const handwritingEnabled = Boolean(
    editor.handwritingEnabled ??
      existing.handwriting?.enabled ??
      editor.handwritingAssetId ??
      editor.signatureAssetId ??
      form.handwritingAssetId,
  )
  const layerSource = editor.layers ?? existing.creativeLayers
  const creativeLayers = Array.isArray(layerSource)
    ? layerSource.map((layer, index) => normalizeCreativeLayer(layer, index))
    : undefined

  const frontSource = compactObject({
    ...existingFront,
    preset:
      existingFront.preset ??
      (editor.effect === 'none'
        ? 'none'
        : editor.tool === 'motion'
          ? 'motion'
          : 'hologram'),
    material: editor.material ?? existingFront.material,
    foilPattern: editor.foilPattern ?? existingFront.foilPattern,
    foilCoverage: editor.foilCoverage ?? existingFront.foilCoverage,
    interaction: editor.interaction ?? existingFront.interaction,
    intensity: editor.effectIntensity ?? existingFront.intensity,
    angle: editor.effectAngle ?? existingFront.angle,
    lenticularAssetId: Object.hasOwn(editor, 'lenticularAssetId')
      ? editor.lenticularAssetId
      : existingFront.lenticularAssetId,
    effect: editor.effect ?? existingFront.effect,
    effectPreset: editor.effectPreset ?? existingFront.effectPreset,
    effectIntensity:
      editor.effectIntensity !== undefined || existingFront.effectIntensity !== undefined
        ? normalizedIntensity(editor.effectIntensity ?? existingFront.effectIntensity)
        : undefined,
    effectAngle:
      editor.effectAngle !== undefined || existingFront.effectAngle !== undefined
        ? numeric(editor.effectAngle ?? existingFront.effectAngle, 135)
        : undefined,
    effectMotion: editor.effectMotion ?? existingFront.effectMotion,
    effectSpread:
      editor.effectSpread !== undefined || existingFront.effectSpread !== undefined
        ? normalizedIntensity(editor.effectSpread ?? existingFront.effectSpread, 0.64)
        : undefined,
    effectGrain:
      editor.effectGrain !== undefined || existingFront.effectGrain !== undefined
        ? normalizedIntensity(editor.effectGrain ?? existingFront.effectGrain, 0.38)
        : undefined,
    effectFinish: editor.effectFinish ?? existingFront.effectFinish,
    spatialScene: Object.hasOwn(editor, 'spatialScene') ? editor.spatialScene : existingFront.spatialScene,
    spatialEnabled: editor.spatialEnabled ?? existingFront.spatialEnabled,
    selectedEffect: editor.selectedEffect ?? existingFront.selectedEffect,
    photoAnalysis: Object.hasOwn(editor, 'photoAnalysis') ? editor.photoAnalysis : existingFront.photoAnalysis,
    image:
      existingFront.image || imageAssetId
        ? compactObject({
            ...(existingFront.image || {}),
            assetId: imageAssetId ?? existingFront.image?.assetId,
            filter: editor.filter ?? existingFront.image?.filter,
          })
        : undefined,
  })
  const backSource = compactObject({
    ...existingBack,
    material: editor.backMaterial ?? existingBack.material,
    edgeFoil: editor.backEdgeFoil ?? existingBack.edgeFoil,
    spotUv: editor.backSpotUv ?? existingBack.spotUv,
    hiddenMessage: editor.backHiddenMessage ?? existingBack.hiddenMessage,
    effect: editor.backEffect ?? existingBack.effect,
    background: editor.background ?? existingBack.background,
    templateId: editor.backTemplateId ?? existingBack.templateId,
  })
  const effects = normalizeCardEffects({ ...existing, front: frontSource, back: backSource })

  return {
    ...existing,
    version: 3,
    ...(creativeLayers ? { creativeLayers } : {}),
    front: compactObject({
      ...frontSource,
      ...effects.front,
      effectMotion: effects.front.interaction !== 'static',
    }),
    back: compactObject({ ...backSource, ...effects.back }),
    video: compactObject({
      ...(existing.video || {}),
      enabled: videoEnabled,
      posterTime: numeric(editor.videoPosterTime ?? existing.video?.posterTime, 0),
      loop: editor.videoLoop ?? existing.video?.loop ?? true,
    }),
    voice: compactObject({
      ...(existing.voice || {}),
      enabled: voiceEnabled,
      trimStart: numeric(editor.voiceTrimStart ?? existing.voice?.trimStart, 0),
      trimEnd:
        editor.voiceTrimEnd !== undefined || existing.voice?.trimEnd !== undefined
          ? numeric(editor.voiceTrimEnd ?? existing.voice?.trimEnd, 0)
          : undefined,
    }),
    handwriting: compactObject({
      ...(existing.handwriting || {}),
      enabled: handwritingEnabled,
    }),
  }
}

export function buildCardPayload({ form = {}, editor = {} } = {}) {
  const imageAssetId = editor.imageAssetId || form.imageAssetId
  const voiceAssetId = editor.voiceAssetId || form.voiceAssetId
  const videoAssetId = editor.videoAssetId || form.videoAssetId
  const handwritingAssetId =
    editor.handwritingAssetId || editor.signatureAssetId || form.handwritingAssetId
  const designConfig = buildDesignConfig({
    form: { ...form, imageAssetId, voiceAssetId, videoAssetId },
    editor,
  })

  return compactObject({
    templateId: form.templateId,
    name: form.name,
    seasonName: form.seasonName,
    rarity: form.rarity,
    imageAssetId,
    artistId: form.artistId,
    memberId: form.memberId,
    signatureText: form.signatureText,
    handwritingAssetId,
    handwritingTransform: editor.handwritingTransform || form.handwritingTransform,
    voiceAssetId,
    videoAssetId,
    designConfig,
    hasVoice: Boolean(form.hasVoice || designConfig.voice.enabled),
    issueLimit: numeric(form.issueLimit, 0),
  })
}

export function buildSpatialSceneJobRequest(assetId, options = {}) {
  const normalizedAssetId = encodeURIComponent(String(assetId || ''))
  const motionPreset = options.motionPreset || 'portrait-parallax'
  const pipelineVersion = options.pipelineVersion || 'v1'
  return {
    path: `/artist/assets/${normalizedAssetId}/spatial-scene-jobs`,
    headers: {
      'Idempotency-Key': `spatial-scene:${String(assetId)}:${motionPreset}:${pipelineVersion}`,
    },
    body: { motionPreset, pipelineVersion },
  }
}

export function cardDraftErrors({ form = {}, editor = {} } = {}) {
  const errors = []
  if (!String(form.name || '').trim()) errors.push('카드 이름을 입력해주세요.')
  if (!String(form.seasonName || '').trim()) errors.push('시즌명을 입력해주세요.')
  if (!String(form.templateId || '').trim()) errors.push('카드 템플릿을 선택해주세요.')
  if (!form.artistId || !form.memberId) errors.push('아티스트와 멤버를 선택해주세요.')
  if (!(editor.imageAssetId || form.imageAssetId || editor.imageSrc || editor.imageFile)) {
    errors.push('카드 앞면 이미지를 추가해주세요.')
  }
  if (numeric(form.issueLimit, 0) <= 0) errors.push('발행 수량을 1장 이상 입력해주세요.')
  return errors
}

export function normalizeCatalogSelection(form = {}, catalog = {}) {
  const artists = Array.isArray(catalog.artists) ? catalog.artists : []
  const members = Array.isArray(catalog.members) ? catalog.members : []
  const artistId = artists.some((artist) => artist.id === form.artistId)
    ? form.artistId
    : artists[0]?.id || null
  const memberId = members.some(
    (member) => member.id === form.memberId && member.artistId === artistId,
  )
    ? form.memberId
    : members.find((member) => member.artistId === artistId)?.id || null
  return { artistId, memberId }
}

function readinessItem(enabled, complete, optionalLabel = '사용 안 함') {
  if (!enabled) return { status: 'optional', label: optionalLabel }
  return complete
    ? { status: 'ready', label: '준비 완료' }
    : { status: 'missing', label: '추가 필요' }
}

export function reviewReadiness(draft = {}) {
  const config = draft.designConfig || {}
  const normalizedEffects = normalizeCardEffects(config)
  const voiceEnabled = Boolean(draft.hasVoice || config.voice?.enabled)
  const videoEnabled = Boolean(config.video?.enabled)
  const handwritingEnabled = Boolean(config.handwriting?.enabled)
  const lenticularEnabled = normalizedEffects.front.interaction === 'lenticular'
  const items = {
    image: readinessItem(true, Boolean(draft.imageAssetId)),
    catalog: readinessItem(true, Boolean(draft.artistId && draft.memberId)),
    handwriting: readinessItem(
      handwritingEnabled,
      Boolean(draft.handwritingAssetId),
    ),
    voice: readinessItem(voiceEnabled, Boolean(draft.voiceAssetId)),
    video: readinessItem(videoEnabled, Boolean(draft.videoAssetId)),
    lenticular: readinessItem(
      lenticularEnabled,
      Boolean(normalizedEffects.front.lenticularAssetId),
    ),
    issueLimit: readinessItem(true, numeric(draft.issueLimit, 0) > 0),
    preview: readinessItem(true, Boolean(draft.previewOpened)),
  }

  return {
    ready: Object.values(items).every((item) => item.status !== 'missing'),
    items,
  }
}

export function studioDashboard(cards = []) {
  const counts = {
    draft: 0,
    pendingReview: 0,
    changesRequested: 0,
    published: 0,
  }
  for (const card of cards) {
    const key = STATUS_KEYS[card.status]
    if (key) counts[key] += 1
  }
  const priority = { changes_requested: 0, draft: 1, pending_review: 2, published: 3 }
  const ordered = [...cards].sort(
    (left, right) => (priority[left.status] ?? 9) - (priority[right.status] ?? 9),
  )

  return {
    counts,
    actionable: ordered.filter((card) => ['changes_requested', 'draft'].includes(card.status)),
    recent: [...cards].slice(0, 6),
  }
}

export function navigationState(destination) {
  if (destination === 'home') return { view: 'home', step: 0 }
  if (destination === 'create') return { view: 'create', step: 1 }
  return { view: destination, step: 0 }
}

export function cardEditorStage(card = {}) {
  const releaseStatus = card.releaseStatus || card.status || 'draft'
  return ['draft', 'changes_requested'].includes(releaseStatus) ? 'design' : 'review'
}
