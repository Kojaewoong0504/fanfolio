import type { FanEvent } from '../api/client'
import { resolveApiUrl } from '../api/client'

function eventDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value))
}

export function EventCard({ event, onOpen }: { event: FanEvent; onOpen: (event: FanEvent) => void }) {
  return <button type="button" className="event-card" onClick={() => onOpen(event)} aria-label={`${event.title} 이벤트 상세 보기`}>
    <div className="event-card-image">{event.heroUrl ? <img src={resolveApiUrl(event.heroUrl)} alt="" /> : <span aria-hidden="true">✦</span>}<small className={`event-status event-status-${event.status}`}>{event.status === 'active' ? '진행 중' : event.status === 'upcoming' ? '예정' : '종료'}</small></div>
    <span className="event-card-copy"><b>{event.title}</b><small>{event.artistName ?? 'FANFOLIO'} · {eventDate(event.startsAt)}</small><em>{event.summary}</em></span>
  </button>
}
