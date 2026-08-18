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
