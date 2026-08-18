import type { EventPagination, FanEvent, FanEventStatus } from '../api/client'
import { EventCard } from './EventCard'

type Props = {
  events: FanEvent[]
  loading: boolean
  error: string | null
  status: 'all' | FanEventStatus
  pagination: EventPagination
  onStatusChange: (status: 'all' | FanEventStatus) => void
  onPageChange: (page: number) => void
  onOpen: (event: FanEvent) => void
}

const filters: Array<{ value: 'all' | FanEventStatus; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '신청 중' },
  { value: 'upcoming', label: '진행 예정' },
  { value: 'ended', label: '종료' },
]

export function EventList({ events, loading, error, status, pagination, onStatusChange, onPageChange, onOpen }: Props) {
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
          {pagination.totalPages > 1 && <nav className="event-pagination" aria-label="이벤트 페이지">
            <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page <= 1}>이전 페이지</button>
            <span>{pagination.page} / {pagination.totalPages}</span>
            <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>다음 페이지</button>
          </nav>}
        </>
      )}
    </div>
  )
}
