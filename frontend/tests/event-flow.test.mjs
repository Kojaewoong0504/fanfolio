import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const list = await readFile(new URL('../src/components/EventList.tsx', import.meta.url), 'utf8')
const detail = await readFile(new URL('../src/components/EventDetail.tsx', import.meta.url), 'utf8')

test('fan event API exposes home, list, and detail contracts', () => {
  assert.match(client, /export function getFanHome/)
  assert.match(client, /export function getFanEvents/)
  assert.match(client, /export function getFanEvent/)
})

test('fan app has event list and detail routes', () => {
  assert.match(app, /pathname === '\/events' \|\| pathname\.startsWith\('\/events\/'\)/)
  assert.match(app, /<EventList /)
  assert.match(app, /<EventDetail /)
})

test('event list offers active, upcoming, and ended filters', () => {
  assert.match(list, /진행 중/)
  assert.match(list, /예정/)
  assert.match(list, /종료/)
})

test('event detail keeps external CTA target explicit', () => {
  assert.match(detail, /onOpenTarget\(event\.ctaTarget!\)/)
  assert.match(detail, /event-detail-hero/)
})
