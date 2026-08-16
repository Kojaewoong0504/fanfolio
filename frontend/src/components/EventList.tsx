import type { FanEvent, FanEventStatus } from '../api/client'
import { EventCard } from './EventCard'
import { InlineIcon } from '../App'

type Props = {
  events: FanEvent[]
  loading: boolean
  error: string | null
  status: 'all' | FanEventStatus
  onStatusChange: (status: 'all' | FanEventStatus) => void
  onOpen: (event: FanEvent) => void
}

const filters: Array<{ value: 'all' | FanEventStatus; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '신청 중' },
  { value: 'upcoming', label: '진행 예정' },
  { value: 'ended', label: '종료' },
]

export function EventList({ events, loading, error, status, onStatusChange, onOpen }: Props) {
  const visibleEvents = status === 'all' ? events : events.filter(event => event.status === status)
  return (
    <div className="events-screen">
      <div className="event-tabs" role="tablist" aria-label="이벤트 상태">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={status === item.value ? 'active' : ''}
            onClick={() => onStatusChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading && <div className="event-empty">이벤트를 불러오고 있어요.</div>}
      {!loading && error && <div className="event-empty error">{error}</div>}
      {!loading && !error && visibleEvents.length === 0 && (
        <div className="event-empty"><strong>아직 이벤트가 없어요</strong><span>새로운 소식이 등록되면 여기에서 알려드릴게요.</span></div>
      )}
      {!loading && !error && visibleEvents.length > 0 && (
        <>
          <div className="event-list">{visibleEvents.map((event) => <EventCard key={event.id} event={event} onOpen={onOpen} />)}</div>
          <button type="button" className="fan-event-promo" onClick={() => onOpen(visibleEvents[0])}>
            <span className="fan-event-promo-icon" aria-hidden="true"><InlineIcon name="gift" /></span><span><small>팬 이벤트</small><strong>드림스케이프 사인 폴라로이드 이벤트</strong><em>참여하고 사인 폴라로이드를 받아보세요!</em></span><b>참여하기</b><span className="fan-event-promo-chevron" aria-hidden="true"><InlineIcon name="chevron" /></span>
          </button>
        </>
      )}
    </div>
  )
}
