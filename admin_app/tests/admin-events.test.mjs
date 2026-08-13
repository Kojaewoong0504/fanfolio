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
})
