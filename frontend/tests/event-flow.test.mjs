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
  assert.match(app, /pathname === '\/collection'/)
  assert.match(app, /<EventList /)
  assert.match(app, /<EventDetail /)
})

test('non-home pages share the same title and description header contract', () => {
  assert.match(app, /className="app-header-description"/)
  assert.match(app, /collection: '내가 수집한 모든 카드와 컬렉션을 관리해요\.'/)
  assert.match(app, /events: '드림스케이프의 다양한 이벤트에 참여해보세요\.'/)
  assert.match(app, /growth: '팬 활동을 통해 레벨을 올리고 특별한 혜택을 받아보세요!'/)
})

test('event list offers application, upcoming, and ended filters', () => {
  assert.match(list, /신청 중/)
  assert.match(list, /예정/)
  assert.match(list, /종료/)
})

test('event list filters fallback and API events by selected status', () => {
  assert.match(list, /const visibleEvents = status === 'all' \? events : events\.filter\(event => event\.status === status\)/)
})

test('event detail keeps external CTA target explicit', () => {
  assert.match(detail, /onOpenTarget\(event\.ctaTarget!\)/)
  assert.match(detail, /event-detail-hero/)
})
