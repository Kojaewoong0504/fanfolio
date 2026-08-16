import type { FanEvent } from '../api/client'
import { resolveApiUrl } from '../api/client'
import { InlineIcon } from '../App'

function eventDateParts(value: string): { month: string; day: string } {
  const date = new Date(value)
  return { month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase(), day: String(date.getDate()).padStart(2, '0') }
}

function eventTypeLabel(event: FanEvent): string {
  if (event.id.includes('meeting')) return '팬 미팅'
  return { external: '팬 사인회', fan_mission: '하이터치', card_drop: '카드 드롭', card: '콘서트', announcement: '공지' }[event.eventType]
}

function eventVenue(event: FanEvent): string {
  if (event.id.includes('live')) return 'KSPO DOME'
  if (event.id.includes('hi-touch')) return '블루스퀘어 마스터카드홀'
  if (event.id.includes('meeting')) return '일지아트홀'
  return '올림픽공원 K-아트홀'
}

function eventDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(/\.\s*/g, '.').replace(/\.$/, '')
}

export function EventCard({ event, onOpen }: { event: FanEvent; onOpen: (event: FanEvent) => void }) {
  const date = eventDateParts(event.startsAt)
  return <button type="button" className="event-card" onClick={() => onOpen(event)} aria-label={`${event.title} 이벤트 상세 보기`}>
    <div className="event-card-image">{event.heroUrl ? <img src={resolveApiUrl(event.heroUrl)} alt="" /> : <span aria-hidden="true">✦</span>}<small className={`event-status event-status-${event.status}`}>{event.status === 'active' ? '신청 중' : event.status === 'upcoming' ? '진행 예정' : '종료'}</small></div>
    <span className="event-card-date"><b>{date.month}</b><strong>{date.day}</strong></span>
    <span className="event-card-copy"><small className="event-type-badge">{eventTypeLabel(event)}</small><b>{event.title}</b><em>{event.artistName ?? event.summary}</em><small className="event-card-meta"><InlineIcon name="clock" />{eventDateTime(event.startsAt)}</small><small className="event-card-meta event-card-venue"><InlineIcon name="pin" />{eventVenue(event)}</small></span><span className="event-card-chevron" aria-hidden="true"><InlineIcon name="chevron" /></span>
  </button>
}
