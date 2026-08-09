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

function clamped(value, minimum, maximum, fallback) {
  return Math.max(minimum, Math.min(maximum, numeric(value, fallback)))
}

export function responsiveStudioMode(width) {
  const viewport = numeric(width, 1280)
  if (viewport <= 720) return 'phone'
  if (viewport <= 1024) return 'tablet'
  return 'desktop'
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

export function buildDesignConfig({ form = {}, editor = {} } = {}) {
  const existing = form.designConfig || editor.designConfig || {}
  const existingFront = existing.front || {}
  const existingBack = existing.back || {}
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

  const front = compactObject({
    ...existingFront,
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
    image:
      existingFront.image || imageAssetId
        ? compactObject({
            ...(existingFront.image || {}),
            assetId: imageAssetId ?? existingFront.image?.assetId,
            filter: editor.filter ?? existingFront.image?.filter,
          })
        : undefined,
  })

  return {
    ...existing,
    version: numeric(existing.version, 2) || 2,
    ...(creativeLayers ? { creativeLayers } : {}),
    front,
    back: compactObject({
      ...existingBack,
      effect: editor.backEffect ?? existingBack.effect,
      background: editor.background ?? existingBack.background,
      templateId: editor.backTemplateId ?? existingBack.templateId,
    }),
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

function readinessItem(enabled, complete, optionalLabel = '사용 안 함') {
  if (!enabled) return { status: 'optional', label: optionalLabel }
  return complete
    ? { status: 'ready', label: '준비 완료' }
    : { status: 'missing', label: '추가 필요' }
}

export function reviewReadiness(draft = {}) {
  const config = draft.designConfig || {}
  const voiceEnabled = Boolean(draft.hasVoice || config.voice?.enabled)
  const videoEnabled = Boolean(config.video?.enabled)
  const handwritingEnabled = Boolean(config.handwriting?.enabled)
  const items = {
    image: readinessItem(true, Boolean(draft.imageAssetId)),
    catalog: readinessItem(true, Boolean(draft.artistId && draft.memberId)),
    handwriting: readinessItem(
      handwritingEnabled,
      Boolean(draft.handwritingAssetId),
    ),
    voice: readinessItem(voiceEnabled, Boolean(draft.voiceAssetId)),
    video: readinessItem(videoEnabled, Boolean(draft.videoAssetId)),
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
