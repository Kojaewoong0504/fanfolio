import { useState, type FormEvent } from 'react'
import { reportFan, type FanEvent, type FanEventComment } from '../api/client'
import { AuthenticatedImage } from './AuthenticatedImage'
import { InlineIcon } from '../App'

function typeLabel(event: FanEvent): string {
  if (event.id.includes('meeting')) return '팬 미팅'
  if (event.eventType === 'external' && event.ctaLabel?.includes('라이브')) return '라이브'
  return { external: '팬 사인회', fan_mission: '하이터치', card_drop: '카드 드롭', card: '콘서트', comment: '댓글 참여', announcement: '공지' }[event.eventType] ?? '팬 이벤트'
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(/\.\s*/g, '.').replace(/\.$/, '')
}
function venue(event: FanEvent): string {
  if (event.venue) return event.venue
  if (event.id.includes('live')) return 'KSPO DOME'
  if (event.id.includes('hi-touch')) return '블루스퀘어 마스터카드홀'
  if (event.id.includes('meeting')) return '일지아트홀'
  return '코엑스 컨퍼런스룸 (3F)'
}
function applicationLabel(event: FanEvent): string {
  if (event.eventType === 'comment') return '댓글 참여하기'
  if (event.ctaLabel === '기록 보기') return '이벤트 상세 보기'
  const labels: Record<string, string> = {
    available: '이벤트 신청하기',
    upcoming: '신청 예정',
    full: '정원 마감',
    closed: '신청 마감',
    applied: '신청 완료',
  }
  return labels[event.applicationStatus ?? 'available'] ?? '이벤트 신청하기'
}
function availabilityLabel(event: FanEvent): string {
  const labels: Record<string, string> = {
    available: '신청 가능',
    upcoming: '신청 예정',
    full: '정원 마감',
    closed: '신청 마감',
    applied: '신청 완료',
  }
  return labels[event.applicationStatus ?? 'available'] ?? '신청 가능'
}
export function EventDetail({ event, loading, onBack, onOpenTarget, onApply, comments, commentsLoading, commentSubmitting, onLoadComments, onSubmitComment }: { event: FanEvent | null; loading: boolean; onBack: () => void; onOpenTarget: (target: string) => void; onApply?: () => void | Promise<void>; comments: FanEventComment[]; commentsLoading: boolean; commentSubmitting: boolean; onLoadComments: () => void | Promise<void>; onSubmitComment: (body: string) => void | Promise<void> }) {
  const [commentDraft, setCommentDraft] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('부적절하거나 잘못된 이벤트 정보')
  const [reportBody, setReportBody] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportPending, setReportPending] = useState(false)
  if (loading) return <div className="event-detail-screen event-empty" role="status">이벤트를 불러오는 중이에요…</div>
  if (!event) return <div className="event-detail-screen event-empty" role="alert"><b>이벤트를 찾을 수 없어요</b><button className="outline" type="button" onClick={onBack}>이벤트 목록으로</button></div>
  const handleApply = () => {
    if (event.eventType === 'comment') {
      void onLoadComments()
      window.setTimeout(() => document.getElementById('event-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      return
    }
    if (event.eventType === 'external' && event.ctaTarget) {
      onOpenTarget(event.ctaTarget)
      return
    }
    if (event.ctaLabel === '기록 보기' && event.ctaTarget) {
      onOpenTarget(event.ctaTarget!)
      return
    }
    if (onApply) {
      onApply()
      return
    }
    if (event.ctaTarget) onOpenTarget(event.ctaTarget)
  }
  const isRecordView = event.ctaLabel === '기록 보기'
  const isExternalTarget = event.eventType === 'external' && Boolean(event.ctaTarget)
  const isUnavailable = event.eventType !== 'comment' && !isRecordView && !isExternalTarget && event.applicationStatus !== undefined && event.applicationStatus !== 'available'
  const isCommentEvent = event.eventType === 'comment'
  const submitComment = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    const body = commentDraft.trim()
    if (!body || commentSubmitting) return
    await onSubmitComment(body)
    setCommentDraft('')
  }
  const submitReport = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    const body = reportBody.trim()
    if (!body || reportPending) return
    setReportPending(true)
    try {
      await reportFan({ targetType: 'event', targetId: event.id, reason: reportReason, body })
      setReportMessage('신고가 접수되었어요. 운영팀이 확인할게요.')
      setReportBody('')
    } catch {
      setReportMessage('신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setReportPending(false)
    }
  }
  return <article className="event-detail-screen">
    <div className="event-detail-toolbar"><button type="button" className="event-detail-tool" onClick={onBack} aria-label="이벤트 목록으로"><InlineIcon name="back" /></button><div className="event-detail-toolbar-actions"><button type="button" className="event-detail-tool" aria-label="이벤트 공유"><InlineIcon name="share" /></button><button type="button" className={`event-detail-tool${reportOpen ? ' active' : ''}`} aria-expanded={reportOpen} aria-label="이벤트 신고" onClick={() => { setReportOpen(open => !open); setReportMessage('') }}><InlineIcon name="shield" /></button></div></div>
    <div className="event-detail-hero-wrap">{event.heroUrl ? <AuthenticatedImage className="event-detail-hero" src={event.heroUrl} alt="" /> : <div className="event-detail-hero event-detail-hero-placeholder" aria-hidden="true" />}<span className="event-detail-type-badge">{typeLabel(event)}</span></div>
    <div className="event-detail-body">
      <h2>{event.title}</h2>
      <dl className="event-detail-meta-list"><div><dt><InlineIcon name="calendar" /></dt><dd>{formatDate(event.startsAt)}</dd></div><div><dt><InlineIcon name="pin" /></dt><dd>{venue(event)}</dd></div><div><dt><InlineIcon name="users" /></dt><dd>{event.participantLimit ? `${event.participantCount ?? 0} / ${event.participantLimit}명 참여` : `${event.participantCount ?? 0}명 참여`}</dd><span className="event-detail-availability">{availabilityLabel(event)}</span></div></dl>
      {isExternalTarget ? <a className="event-detail-apply" href={event.ctaTarget!}>{event.ctaLabel ?? '외부 링크 열기'}</a> : <button type="button" className="event-detail-apply" onClick={handleApply} disabled={isUnavailable}>{applicationLabel(event)}</button>}
      {event.description && <section className="event-description-section" aria-labelledby="event-description-title"><h3 id="event-description-title">이벤트 내용</h3><p>{event.description}</p></section>}
      {reportOpen && <section className="event-report-panel" aria-labelledby="event-report-title"><div className="section-heading"><div><h3 id="event-report-title">이벤트 신고</h3><p>잘못되었거나 불쾌한 정보를 운영팀에 알려주세요.</p></div></div><form onSubmit={submitReport}><label>신고 사유<select value={reportReason} onChange={event => setReportReason(event.target.value)}><option>부적절하거나 잘못된 이벤트 정보</option><option>사칭 또는 도용</option><option>스팸 또는 광고</option><option>기타 운영 문제</option></select></label><label>상황 설명<textarea value={reportBody} onChange={event => setReportBody(event.target.value)} minLength={2} maxLength={4000} placeholder="상황을 설명해 주세요." required /></label><button type="submit" disabled={reportPending || reportBody.trim().length < 2}>{reportPending ? '접수 중…' : '신고하기'}</button></form>{reportMessage && <p role="status">{reportMessage}</p>}</section>}
      <section className="event-related-section" aria-labelledby="related-cards-title"><div className="section-heading"><h3 id="related-cards-title">관련 카드</h3><button type="button">전체 보기 <InlineIcon name="chevron" /></button></div>{event.relatedCards.length > 0 ? <><div className="event-related-cards">{event.relatedCards.map(card => <button className="event-related-card" type="button" key={card.id} aria-label={`${card.memberName ?? card.name} 카드 보기`}><AuthenticatedImage src={card.imageUrl} alt="" /><span className="event-related-rarity">{card.rarity ?? 'CARD'}</span><span className="event-related-heart"><InlineIcon name="heart" /></span><span className="event-related-copy"><b>{card.memberName ?? card.name}</b><small>{card.name}</small></span></button>)}</div><div className="event-related-dots" aria-hidden="true"><b /><i /><i /></div></> : <p className="event-detail-empty-copy">이벤트에 연결된 카드가 아직 없습니다.</p>}</section>
      <section className="event-notice-section" aria-labelledby="event-notice-title"><h3 id="event-notice-title">유의사항</h3>{event.noticeItems.length > 0 ? <ul>{event.noticeItems.map((notice, index) => <li key={`${event.id}-notice-${index}`}>{notice}</li>)}</ul> : <p className="event-detail-empty-copy">등록된 유의사항이 없습니다.</p>}</section>
      {isCommentEvent && <section id="event-comments" className="event-comments-section" aria-labelledby="event-comments-title"><div className="section-heading"><h3 id="event-comments-title">댓글 참여</h3><span>{comments.length}개</span></div><p className="event-comments-help">이벤트 페이지에 응원 댓글을 남기고 특별한 선물을 받아보세요.</p><form className="event-comment-form" onSubmit={submitComment}><textarea value={commentDraft} onChange={event => setCommentDraft(event.target.value)} maxLength={500} placeholder="응원 댓글을 입력해 주세요." aria-label="응원 댓글" /><div><small>{commentDraft.length}/500</small><button type="submit" disabled={commentSubmitting || !commentDraft.trim()}>{commentSubmitting ? '등록 중…' : '댓글 등록'}</button></div></form>{commentsLoading ? <p className="event-detail-empty-copy">댓글을 불러오는 중이에요…</p> : comments.length > 0 ? <ul className="event-comment-list">{comments.map(comment => <li key={comment.id}><div><b>{comment.authorNickname}</b><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time></div><p>{comment.body}</p></li>)}</ul> : <p className="event-detail-empty-copy">첫 번째 응원 댓글을 남겨보세요.</p>}</section>}
    </div>
  </article>
}
