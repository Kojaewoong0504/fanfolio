import type { FanEvent } from '../api/client'
import { resolveApiUrl } from '../api/client'

export function EventDetail({ event, loading, onBack, onOpenTarget }: { event: FanEvent | null; loading: boolean; onBack: () => void; onOpenTarget: (target: string) => void }) {
  if (loading) return <div className="event-detail-screen event-empty" role="status">이벤트를 불러오는 중이에요…</div>
  if (!event) return <div className="event-detail-screen event-empty" role="alert"><b>이벤트를 찾을 수 없어요</b><button className="outline" type="button" onClick={onBack}>이벤트 목록으로</button></div>
  return <article className="event-detail-screen"><button type="button" className="event-back" onClick={onBack}>‹ 이벤트 목록</button>{event.heroUrl && <img className="event-detail-hero" src={resolveApiUrl(event.heroUrl)} alt="" />}<div className="event-detail-copy"><small className={`event-status event-status-${event.status}`}>{event.status === 'active' ? '진행 중' : event.status === 'upcoming' ? '예정' : '종료'}</small><p className="eyebrow">{event.artistName ?? 'FANFOLIO'}</p><h2>{event.title}</h2><p className="event-detail-summary">{event.summary}</p><p className="event-detail-description">{event.description}</p>{event.ctaTarget && <button type="button" className="primary" onClick={() => onOpenTarget(event.ctaTarget!)}>{event.ctaLabel ?? '자세히 보기'}</button>}</div></article>
}
