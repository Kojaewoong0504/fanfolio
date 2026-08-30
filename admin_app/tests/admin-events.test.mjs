import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

test('admin event navigation and paginated filters are present', () => {
  assert.match(source, /id: "events"/)
  assert.match(source, /\/admin\/events\?\$\{params\}/)
  assert.match(source, /pageSize/)
  assert.match(source, /event-status-filter/)
  assert.match(source, /event-type-filter/)
  assert.match(source, /event-artist-filter/)
})

test('event rows open details with mouse and keyboard', () => {
  assert.match(source, /data-event-row-id/)
  assert.match(source, /event\.key === "Enter" \|\| event\.key === " "/)
  assert.match(source, /selectedEvent/)
})

test('event editor and lifecycle actions call backend contracts', () => {
  assert.match(source, /id="event-form"/)
  assert.match(source, /POST.*\/admin\/events|\/admin\/events.*method: id \? "PATCH"/s)
  assert.match(source, /\/review/)
  assert.match(source, /publish: "publish"/)
  assert.match(source, /end: "end"/)
  assert.match(source, /eventTypeLabel/)
})

test('event registration control uses the shared drawer action before dynamic controls', () => {
  const bindStart = source.indexOf('function bind()')
  const eventBinding = source.indexOf('id="open-event-drawer"', source.indexOf('function eventsView'))
  const dynamicControlBinding = source.indexOf('document.querySelectorAll("[data-view]:not([data-open-drawer])")', bindStart)
  assert.ok(eventBinding > source.indexOf('function eventsView'))
  assert.ok(eventBinding < dynamicControlBinding)
})

  test('event registration uses the shared drawer action contract', () => {
    assert.match(source, /id="open-event-drawer"[^>]*data-open-drawer="event"/)
    assert.match(source, /const eventEditorOpen = .*state\.drawer === "event"/)
    assert.match(source, /if \(name === "event"\) state\.view = "events"/)
    assert.match(source, /initialUrlParams\.get\("drawer"\) === "event"/)
  })

test('event registration keeps the shared drawer binding for browser activation', () => {
    assert.match(source, /id="open-event-drawer"[^>]*data-open-drawer="event"/)
    assert.match(source, /document\.querySelectorAll\("\[data-open-drawer\]"\)/)
  })

test('event registration is a dialog button for browser activation', () => {
    assert.match(source, /id="open-event-drawer"[^>]*data-open-drawer="event"[^>]*type="button"[^>]*aria-haspopup="dialog"/)
  })

  test('event deep links do not trap later navigation in the event workspace', () => {
    assert.doesNotMatch(source, /if \(initialDrawer === "event"\) \{[\s\S]*state\.view = "events"/)
    assert.match(source, /const eventEditorOpen = state\.eventEditorOpen \|\| state\.drawer === "event"/)
  })

test('event workspace remains responsive', () => {
  assert.match(css, /\.event-workspace\s*\{[\s\S]*grid-template-columns/)
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*\.event-workspace\s*\{\s*grid-template-columns: 1fr/)
  assert.match(css, /\.workspace-event-body > \.event-sidecar\s*\{[\s\S]*display: flex[\s\S]*overflow: hidden/)
  assert.match(css, /@container event-list \(max-width: 560px\)/)
  assert.match(css, /\.event-list-panel > \.compact-toolbar \.search-field\s*\{\s*flex: 1 1 100%/)
  assert.match(css, /\.event-draw-box\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /@container event-detail \(max-width: 360px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /\.event-cell-icon\s*\{[\s\S]*flex: 0 0 34px/)
  assert.match(css, /\.event-cell-icon \.material-symbols-rounded\s*\{[\s\S]*font-size: 20px/)
  assert.match(css, /\.workspace-event-body \.event-workspace\s*\{[\s\S]*1\.18fr\)/)
  assert.match(css, /\.nav-brand-copy\s*\{[\s\S]*text-overflow: ellipsis/)
  assert.match(css, /#desktop-nav-toggle|\.nav-toggle[\s\S]*z-index: 40/)
  assert.match(css, /\.admin-shell\.nav-collapsed \.nav-brand-mark[\s\S]*flex: 0 0 32px/)
  assert.match(css, /\.admin-shell\.nav-collapsed \.nav-toggle[\s\S]*flex: 0 0 24px/)
  assert.match(css, /\.admin-shell\.nav-collapsed \.nav-section-toggle[\s\S]*display:\s*none/)
  assert.match(css, /\.admin-shell\.nav-collapsed \.nav-item > span:last-child[\s\S]*display:\s*none/)
  assert.match(css, /\.admin-shell\.nav-collapsed \.nav-item[\s\S]*white-space:\s*nowrap/)
})

test('event editor uploads a banner asset and offers managed connection choices', () => {
  assert.match(source, /event-banner-file/)
  assert.match(source, /uploadAsset\(.*event_banner/s)
  assert.match(source, /event-connection-select/)
  assert.match(source, /dropId|cardId|achievementId/)
  assert.match(source, /class="event-editor-form" id="event-form"/)
  assert.match(source, /class="drawer-body form event-form-body"/)
  assert.match(source, /event-form-body[\s\S]*<footer class="drawer-footer"/)
})

test('event editor resolves API-relative related-card thumbnails on the admin origin', () => {
  assert.match(source, /const resolvedThumbnailUrl = state\.cardThumbnailUrls\[card\.id\] \? thumbnailUrl : resolveAdminAssetUrl\(thumbnailUrl\)/)
  assert.match(source, /event-card-thumb[\s\S]*resolvedThumbnailUrl/)
})

test('event banner keeps the immediate local preview when upload fails', () => {
  const handlerStart = source.indexOf('document.querySelector("#event-banner-file")')
  const handlerEnd = source.indexOf('document.querySelector(\'#event-form [data-select-id="event-type"]', handlerStart)
  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(handler, /data-local-preview/)
  assert.doesNotMatch(handler, /catch \{[\s\S]*URL\.revokeObjectURL\(localPreviewUrl\)[\s\S]*data-local-preview/)
})

test('event editor captures the fields the fan application screen displays', () => {
  assert.match(source, /name="venue"/)
  assert.match(source, /name="participantLimit"/)
  assert.match(source, /name="applicationStartsAt"/)
  assert.match(source, /name="applicationEndsAt"/)
  assert.match(source, /participantLimit:/)
  assert.match(source, /applicationStartsAt:/)
  assert.match(source, /applicationEndsAt:/)
})

test('event editor manages notices and ordered related cards', () => {
  assert.match(source, /name="noticeItems"/)
  assert.match(source, /name="relatedCardIds"/)
  assert.match(source, /noticeItems:/)
  assert.match(source, /relatedCardIds:/)
  assert.match(source, /event\.workflowStatus.*published|published.*event\.workflowStatus/s)
})

test('event editor exposes comment participation as a first-class event type', () => {
  assert.match(source, /\["announcement", "comment", "card_drop"/)
  assert.match(source, /comment: "댓글 참여"/)
  assert.match(source, /comment: "chat_bubble"/)
})

test('event operations expose applicant review and winner draw actions', () => {
  assert.match(source, /\/admin\/events\/.*\/applications/)
  assert.match(source, /\/admin\/events\/.*\/draw/)
  assert.match(source, /신청자 보기/)
  assert.match(source, /추첨하기/)
})

test('local admin sessions use the active browser host for refresh cookies', () => {
  assert.match(source, /`http:\/\/\$\{window\.location\.hostname\}:8000\/api`/)
  assert.match(source, /credentials: "include"/)
})

test('event media previews share the authenticated loader in detail and editor views', () => {
  assert.match(source, /querySelectorAll\("\[data-event-hero\]"\)/)
  assert.match(source, /event-upload-thumbnail/)
})

test('event editor renders uploaded banner assets immediately after upload', () => {
  assert.match(source, /assets\/\$\{encodeURIComponent\(assetId\)\}\/content/)
  assert.match(source, /event-banner-file-name/)
  assert.match(source, /event-upload-thumbnail.*querySelector|querySelector\("\.event-upload-thumbnail"\)/s)
})

test('event banner file selection persists the asset id and replaces the thumbnail', () => {
  assert.match(source, /URL\.createObjectURL\(file\)/)
  assert.match(source, /data-local-preview/)
  assert.match(source, /const assetId = await uploadAsset\(file, "event_banner"\)/)
  assert.match(source, /event\.currentTarget\.form\.elements\.heroAssetId\.value = assetId/)
  assert.match(source, /event\.currentTarget\.form\.querySelector\("\.event-upload-thumbnail"\)/)
  assert.match(source, /URL\.revokeObjectURL\(localPreviewUrl\)/)
  assert.match(source, /innerHTML = `<img data-event-hero src=/)
})

test('related event cards render authenticated card thumbnails outside the card list view', () => {
  assert.match(source, /event-card-thumb.*cardThumbnailUrls/s)
  assert.match(source, /state\.view === "events"|state\.drawer === "event"/s)
})

test('related event cards keep a usable preview when a demo card has no stored asset', () => {
  assert.match(source, /function demoCardThumbnailUrl\(cardId\)/)
  assert.match(source, /state\.cardThumbnailUrls\[card\.id\] \|\| card\.imageUrl \|\| demoCardThumbnailUrl\(card\.id\)/)
  assert.match(source, /카드 미리보기/)
})

test('event banner upload keeps the save action recoverable after an upload failure', () => {
  assert.match(source, /finally[\s\S]*disabled = false/)
  assert.match(source, /배너 업로드 실패 원인|이벤트 배너 업로드에 실패했습니다\./)
})
