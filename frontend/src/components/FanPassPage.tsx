import { useEffect, useState } from 'react'
import { InlineIcon, NavItem } from '../App'
import type { FanProgression, PassTier, RewardType } from '../api/client'
import fanPassCard from '../assets/fan-pass-card.png'
import { rewardArtworkUrl } from './FanGrowth'
import './FanPassPage.css'

type FanPassPageProps = {
  progression: FanProgression | null
  loading: boolean
  error: string
  onRetry: () => void
  onBack: () => void
  onClaimPassTier: (tierId: string) => Promise<unknown>
  initialTierId?: string
  isGlobal?: boolean
}

const fallbackArtwork: Record<RewardType, string> = {
  badge: '/rewards/reward-ticket.png',
  title: '/rewards/reward-vip.png',
  profile_frame: '/rewards/reward-crystal.png',
  collection_theme: '/rewards/reward-crystal.png',
  digital_bonus: '/rewards/reward-music.png',
}

function artworkForTier(tier: PassTier): string {
  return rewardArtworkUrl(tier.reward) ?? fallbackArtwork[tier.reward?.type ?? 'badge']
}

function rewardDescription(tier: PassTier): string {
  const description = tier.reward?.metadata?.description
  return typeof description === 'string' && description.trim().length > 0
    ? description
    : `팬 레벨 Lv.${Math.max(1, Math.floor(tier.requiredXp / 100) + 1)} 달성 시 획득할 수 있는 보상이에요.`
}

function tierStatus(tier: PassTier, currentXp: number, currentTierId: string | null): 'claimed' | 'current' | 'claimable' | 'locked' {
  if (tier.claimed) return 'claimed'
  if (tier.claimable) return 'claimable'
  if (tier.id === currentTierId) return 'current'
  return currentXp >= tier.requiredXp ? 'claimable' : 'locked'
}

export function FanPassPage({ progression, loading, error, onRetry, onBack, onClaimPassTier, initialTierId, isGlobal = false }: FanPassPageProps) {
  const [expandedTierId, setExpandedTierId] = useState<string | null>(null)
  const season = progression?.pass.seasons[0] ?? null
  const tiers = season?.tiers ?? []
  const currentXp = season?.progress.currentXp ?? 0
  const maxXp = tiers.length > 0 ? Math.max(...tiers.map(tier => tier.requiredXp), 1) : 300
  const currentTier = tiers.find(tier => !tier.claimed && tier.requiredXp > currentXp) ?? tiers.at(-1) ?? null
  const progress = Math.min(100, Math.round(currentXp / maxXp * 100))

  useEffect(() => {
    if (!initialTierId || !tiers.some(tier => tier.id === initialTierId)) return
    setExpandedTierId(initialTierId)
    requestAnimationFrame(() => document.querySelector(`[data-pass-tier-id="${CSS.escape(initialTierId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [initialTierId, tiers])

  if (loading && !progression) return <main className="app-shell fan-pass-shell"><div className="fan-pass-loading">팬 패스를 불러오는 중이에요</div></main>
  if (error && !progression) return <main className="app-shell fan-pass-shell"><div className="fan-pass-error" role="alert"><b>팬 패스를 불러오지 못했어요</b><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div></main>

  return <main className="app-shell fan-pass-shell">
    <header className="fan-pass-header">
      <button type="button" className="fan-pass-back" aria-label="팬 레벨로 돌아가기" onClick={onBack}><InlineIcon name="back" /></button>
      <h1>{isGlobal ? '전체 팬 레벨' : '무료 팬 패스'}</h1>
      <span className="fan-pass-header-spacer" aria-hidden="true" />
    </header>

    <section className="fan-pass-summary" aria-labelledby="fan-pass-title">
      <div className="fan-pass-summary-copy">
        <span className="fan-pass-eyebrow">{isGlobal ? '전체 팬 레벨' : (season?.title ?? '드림스케이프 팬 레벨')}</span>
        <h2 id="fan-pass-title">{isGlobal ? <>모든 팬 활동으로 <strong>레벨업</strong></> : <>시즌 종료까지 <strong>34일</strong></>}</h2>
        <div className="fan-pass-xp"><strong>{currentXp.toLocaleString()}</strong><span> / {maxXp.toLocaleString()} XP</span></div>
        <div className="fan-pass-progress" aria-label={`${progress}% 진행`}><i style={{ width: `${progress}%` }} /></div>
        <p>{isGlobal ? '모든 아티스트 활동으로 XP를 모아 보상을 받아보세요.' : 'XP를 모아 챕터를 진행하고 보상을 받아보세요.'}</p>
      </div>
      <img src={fanPassCard} alt="무료 팬 패스 카드" />
    </section>

    <section className="season-pass-journey" aria-label="시즌 패스 보상 여정">
      <div className="season-pass-journey-line" aria-hidden="true"><i style={{ height: `${Math.max(10, progress)}%` }} /></div>
      {tiers.length > 0 ? tiers.map(tier => {
        const status = tierStatus(tier, currentXp, currentTier?.id ?? null)
        return <SeasonTierCard key={tier.id} tier={tier} status={status} expanded={expandedTierId === tier.id} onToggle={() => setExpandedTierId(current => current === tier.id ? null : tier.id)} onClaim={onClaimPassTier} />
      }) : <div className="fan-pass-empty">현재 공개된 시즌 패스가 없어요.</div>}
    </section>

    <section className="fan-pass-more" aria-label="팬 패스 안내"><span><InlineIcon name="sparkles" /></span><div><b>더 많은 XP를 모아보세요!</b><small>팬 활동을 통해 XP를 획득하고 다음 챕터로 나아가세요.</small></div><InlineIcon name="chevron" /></section>

    <nav className="bottom-nav" aria-label="주요 메뉴">
      <NavItem active={false} label="탐색" onClick={() => undefined} />
      <NavItem active={false} label="보관함" icon="collection" onClick={() => undefined} />
      <NavItem active={false} label="홈" icon="home" onClick={() => undefined} />
      <NavItem active label="팬 레벨" icon="growth" onClick={() => undefined} />
      <NavItem active={false} label="마이" icon="settings" onClick={() => undefined} />
    </nav>
  </main>
}

function SeasonTierCard({ tier, status, expanded, onToggle, onClaim }: { tier: PassTier; status: ReturnType<typeof tierStatus>; expanded: boolean; onToggle: () => void; onClaim: (tierId: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const [claimMessage, setClaimMessage] = useState('')
  const claim = async () => {
    setBusy(true)
    setClaimMessage('')
    try {
      await onClaim(tier.id)
      setClaimMessage('보상을 받았어요. 보관함에서 확인할 수 있어요.')
    } catch {
      setClaimMessage('보상 수령에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }
  return <article data-pass-tier-id={tier.id} className={`season-pass-tier-card is-${status}${expanded ? ' is-expanded' : ''}`} role="button" tabIndex={0} aria-expanded={expanded} aria-label={`Lv.${tier.tier} ${tier.reward?.name ?? '보상'} 상세 보기`} onClick={onToggle} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle() } }}>
    <span className="season-pass-node" aria-label={`Lv.${tier.tier}`}><strong>Lv.{tier.tier}</strong></span>
    <div className="season-pass-tier-content">
      <div className="season-pass-tier-topline"><span className="season-pass-tier-type">{status === 'current' ? '현재 챕터' : tier.reward?.type === 'digital_bonus' ? '팬 전용 콘텐츠' : '팬 보상'}</span><span className="season-pass-tier-status">{status === 'claimed' ? '획득 완료' : status === 'claimable' ? '받을 수 있어요' : status === 'current' ? `${tier.requiredXp.toLocaleString()} XP 필요` : '잠금'}</span></div>
      <div className="season-pass-tier-main"><img src={artworkForTier(tier)} alt="" /><div><h3>{tier.reward?.name ?? `팬 패스 ${tier.tier}단계`}</h3><p>팬 레벨 Lv.{Math.max(1, Math.floor(tier.requiredXp / 100) + 1)} 달성 시 획득</p>{status === 'current' && <small>필요 XP <b>{tier.requiredXp.toLocaleString()} XP</b></small>}</div></div>
      {(status === 'claimable' || status === 'current') && <button type="button" className="season-pass-claim" onClick={event => { event.stopPropagation(); void claim() }} disabled={busy || status === 'current'}>{status === 'current' ? '잠금' : busy ? '수령 중...' : '보상 받기'}</button>}
      {claimMessage && <p className={`season-pass-claim-message${claimMessage.startsWith('보상 수령') ? ' is-error' : ''}`} role="status">{claimMessage}</p>}
      {expanded && <div className="season-pass-tier-detail"><p>{rewardDescription(tier)}</p><dl><div><dt>필요 경험치</dt><dd>{tier.requiredXp.toLocaleString()} XP</dd></div><div><dt>상태</dt><dd>{tier.claimed ? '획득 완료' : tier.claimable ? '수령 가능' : '잠금'}</dd></div></dl></div>}
    </div>
  </article>
}
