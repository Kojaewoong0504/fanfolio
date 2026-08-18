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

test('event list keeps API pagination visible and reloads the selected page', () => {
  assert.match(client, /export type EventPagination = \{ page: number; pageSize: number; total: number; totalPages: number \}/)
  assert.match(app, /const \[fanEventPage, setFanEventPage\] = useState\(1\)/)
  assert.match(app, /getFanEvents\(\{ status: fanEventStatus, page: fanEventPage \}\)/)
  assert.match(app, /pagination=\{fanEventPagination\}/)
  assert.match(list, /onPageChange: \(page: number\) => void/)
  assert.match(list, /이전 페이지/)
  assert.match(list, /다음 페이지/)
})

test('event detail keeps external CTA target explicit', () => {
  assert.match(detail, /onOpenTarget\(event\.ctaTarget!\)/)
  assert.match(detail, /<a className="event-detail-apply" href=\{event\.ctaTarget!\}/)
  assert.match(detail, /event-detail-hero/)
})

test('event detail renders server-managed description, related cards, and notices', () => {
  assert.match(client, /noticeItems/)
  assert.match(client, /relatedCards/)
  assert.match(detail, /event\.description/)
  assert.match(detail, /event\.relatedCards/)
  assert.match(detail, /event\.noticeItems/)
  assert.doesNotMatch(detail, /const relatedCards = \[/)
})

test('comment events provide a real comment participation flow', () => {
  assert.match(client, /FanEventType = .*comment/)
  assert.match(client, /getFanEventComments/)
  assert.match(client, /postFanEventComment/)
  assert.match(detail, /event\.eventType === 'comment'/)
  assert.match(detail, /댓글 참여하기/)
  assert.match(detail, /event-comments/)
  assert.match(detail, /댓글 등록/)
  assert.match(app, /getFanEventComments/)
  assert.match(app, /postFanEventComment/)
})

test('event flow uses the API as the source of truth and exposes my applications', () => {
  assert.match(client, /getMyEventApplications/)
  assert.match(client, /\/me\/event-applications/)
  assert.match(app, /getMyEventApplications/)
  assert.doesNotMatch(app, /fanEvents\.length > 0 \? fanEvents : fallbackEventList/)
  assert.doesNotMatch(app, /events={fanEvents\.length > 0 \? fanEvents : fallbackEventList}/)
  assert.match(app, /event={selectedEvent}/)
  assert.match(app, /onEvents=\{\(\) => \{/)
  assert.match(app, /onClick=\{onEvents\}>이벤트 둘러보기/)
  assert.match(app, /fanfolio:refresh-notifications/)
})

test('notification stream uses the bearer token that EventSource cannot attach', () => {
  assert.match(client, /export async function connectNotificationStream/)
  assert.match(client, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.match(app, /connectNotificationStream\(/)
  assert.doesNotMatch(app, /new EventSource\(notificationStreamUrl\(\)/)
})

test('notification settings use the persisted backend preference contract', () => {
  assert.match(client, /export function getNotificationPreferences/)
  assert.match(client, /export function updateNotificationPreferences/)
  assert.match(client, /\/me\/notification-preferences/)
  assert.match(app, /getNotificationPreferences\(/)
  assert.match(app, /updateNotificationPreferences\(/)
  assert.match(app, /이메일 알림/)
})

test('profile image selection is part of the onboarding profile contract', () => {
  assert.match(app, /type="file"/)
  assert.match(app, /accept="image\/(png|jpeg|webp)/)
  assert.match(app, /profileImageUrl/)
  assert.match(app, /favoriteMemberIds: member \? \[member\] : \[\]/)
})

test('empty event feeds do not render a mock event or a fake promo card', () => {
  assert.match(app, /eventHome \? eventHome\.featuredEvent : import\.meta\.env\.DEV \? fallbackHomeEvent : null/)
  assert.match(list, /visibleEvents\.length === 0/)
  assert.doesNotMatch(list, /드림스케이프 사인 폴라로이드 이벤트/)
})
