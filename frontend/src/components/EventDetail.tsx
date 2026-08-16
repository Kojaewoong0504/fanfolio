import type { FanEvent } from '../api/client'
import { resolveApiUrl } from '../api/client'
import collectionCardHarinGenerated from '../assets/collection-card-harin-generated.png'
import collectionCardDoyunGenerated from '../assets/collection-card-doyun-generated.png'
import collectionCardJayGenerated from '../assets/collection-card-jay-generated.png'
import { InlineIcon } from '../App'

function typeLabel(event: FanEvent): string {
  if (event.id.includes('meeting')) return '팬 미팅'
  return { external: '팬 사인회', fan_mission: '하이터치', card_drop: '카드 드롭', card: '콘서트', announcement: '공지' }[event.eventType] ?? '팬 이벤트'
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(/\.\s*/g, '.').replace(/\.$/, '')
}
function venue(event: FanEvent): string {
  if (event.id.includes('live')) return 'KSPO DOME'
  if (event.id.includes('hi-touch')) return '블루스퀘어 마스터카드홀'
  if (event.id.includes('meeting')) return '일지아트홀'
  return '코엑스 컨퍼런스룸 (3F)'
}
const relatedCards = [
  { member: '하린', rarity: 'UR', image: collectionCardHarinGenerated },
  { member: '도윤', rarity: 'SR', image: collectionCardDoyunGenerated },
  { member: '제이', rarity: 'SR', image: collectionCardJayGenerated },
]

export function EventDetail({ event, loading, onBack, onOpenTarget }: { event: FanEvent | null; loading: boolean; onBack: () => void; onOpenTarget: (target: string) => void }) {
  if (loading) return <div className="event-detail-screen event-empty" role="status">이벤트를 불러오는 중이에요…</div>
  if (!event) return <div className="event-detail-screen event-empty" role="alert"><b>이벤트를 찾을 수 없어요</b><button className="outline" type="button" onClick={onBack}>이벤트 목록으로</button></div>
  return <article className="event-detail-screen">
    <div className="event-detail-toolbar"><button type="button" className="event-detail-tool" onClick={onBack} aria-label="이벤트 목록으로"><InlineIcon name="back" /></button><button type="button" className="event-detail-tool" aria-label="이벤트 공유"><InlineIcon name="share" /></button></div>
    <div className="event-detail-hero-wrap">{event.heroUrl ? <img className="event-detail-hero" src={resolveApiUrl(event.heroUrl)} alt="" /> : <div className="event-detail-hero event-detail-hero-placeholder" aria-hidden="true" />}<span className="event-detail-type-badge">{typeLabel(event)}</span></div>
    <div className="event-detail-body">
      <h2>{event.title}</h2>
      <dl className="event-detail-meta-list"><div><dt><InlineIcon name="calendar" /></dt><dd>{formatDate(event.startsAt)}</dd></div><div><dt><InlineIcon name="pin" /></dt><dd>{venue(event)}</dd></div><div><dt><InlineIcon name="users" /></dt><dd>150명 참여 예정</dd><span className="event-detail-availability">신청 가능</span></div></dl>
      <button type="button" className="event-detail-apply" onClick={() => event.ctaTarget && onOpenTarget(event.ctaTarget!)}>{event.ctaLabel === '기록 보기' ? '이벤트 상세 보기' : '이벤트 신청하기'}</button>
      <p className="event-detail-period">신청 기간: 2026.05.12 (화) 12:00 ~ 2026.05.26 (화) 23:59</p>
      <section className="event-related-section" aria-labelledby="related-cards-title"><div className="section-heading"><h3 id="related-cards-title">관련 카드</h3><button type="button">전체 보기 <InlineIcon name="chevron" /></button></div><div className="event-related-cards">{relatedCards.map(card => <button className="event-related-card" type="button" key={card.member} aria-label={`${card.member} 카드 보기`}><img src={card.image} alt="" /><span className="event-related-rarity">{card.rarity}</span><span className="event-related-heart"><InlineIcon name="heart" /></span><span className="event-related-copy"><b>{card.member}</b><small>Nebula Ver.</small></span></button>)}</div><div className="event-related-dots" aria-hidden="true"><b /><i /><i /></div></section>
      <section className="event-notice-section" aria-labelledby="event-notice-title"><h3 id="event-notice-title">유의사항</h3><ul><li>본 이벤트는 사전 신청자 중 추첨을 통해 선정된 분만 참여할 수 있습니다.</li><li>당첨자는 2026.05.27 (수) 오후 6시에 개별 안내됩니다.</li><li>신분증과 당첨 확인 메시지를 반드시 지참해 주세요.</li><li>사인회 중에는 사진 및 영상 촬영이 제한됩니다.</li><li>현장 운영 상황에 따라 일정은 변경될 수 있습니다.</li></ul></section>
    </div>
  </article>
}
