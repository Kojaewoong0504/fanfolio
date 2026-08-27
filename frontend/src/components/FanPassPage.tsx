import { useState } from 'react'
import { InlineIcon, NavItem } from '../App'
import type { FanProgression, PassTier, RewardType } from '../api/client'
import { rewardArtworkUrl } from './FanGrowth'
import { DetailTopBar } from './DetailTopBar'
import './FanPassPage.css'

type FanPassPageProps = { progression: FanProgression | null; loading: boolean; error: string; onRetry: () => void; onBack: () => void; onClaimPassTier: (tierId: string, track?: 'free' | 'premium') => Promise<unknown>; onPurchasePass?: (seasonId: string) => Promise<unknown>; onNavigate: (tab: 'discover' | 'collection' | 'home' | 'growth' | 'shop') => void; initialTierId?: string; isGlobal?: boolean }
const fallbackArtwork: Record<RewardType, string> = { badge: '/rewards/reward-ticket.png', title: '/rewards/reward-vip.png', profile_frame: '/rewards/reward-crystal.png', collection_theme: '/rewards/reward-crystal.png', digital_bonus: '/rewards/reward-music.png' }
function artworkForTier(tier: PassTier, premium = false): string { const reward = premium ? tier.premiumReward : tier.reward; return rewardArtworkUrl(reward) ?? fallbackArtwork[reward?.type ?? 'badge'] }

export function FanPassPage({ progression, loading, error, onRetry, onBack, onClaimPassTier, onPurchasePass, onNavigate, isGlobal = false }: FanPassPageProps) {
  const [purchaseBusy, setPurchaseBusy] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const season = progression?.pass.seasons[0] ?? null
  const tiers = season?.tiers ?? []
  const currentXp = season?.progress.currentXp ?? 0
  const maxXp = tiers.length > 0 ? Math.max(...tiers.map(tier => tier.requiredXp), 1) : 300
  const progress = Math.min(100, Math.round(currentXp / maxXp * 100))
  const premium = !isGlobal && Boolean(season?.premiumEnabled)
  if (loading && !progression) return <main className="app-shell fan-pass-shell"><div className="fan-pass-loading">팬 패스를 불러오는 중이에요</div></main>
  if (error && !progression) return <main className="app-shell fan-pass-shell"><div className="fan-pass-error" role="alert"><b>팬 패스를 불러오지 못했어요</b><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div></main>
  const purchase = async () => { if (!season || !onPurchasePass) return; setPurchaseError(''); setPurchaseBusy(true); try { await onPurchasePass(season.id) } catch { setPurchaseError('패스를 구매하지 못했어요. 포인트 잔액을 확인해 주세요.') } finally { setPurchaseBusy(false) } }
  return <main className="app-shell fan-pass-shell detail-screen-shell">
    <DetailTopBar title={isGlobal ? '전체 팬 레벨' : '시즌 패스'} onBack={onBack} backLabel="팬 레벨로 돌아가기" />
    <div className="fan-pass-content detail-screen-content">
      <section className="fan-pass-summary" aria-labelledby="fan-pass-title"><div className="fan-pass-summary-copy"><span className="fan-pass-eyebrow">{isGlobal ? '전체 팬 레벨' : (season?.title ?? '시즌 패스')}</span><h2 id="fan-pass-title">{isGlobal ? <>모든 팬 활동으로 <strong>레벨업</strong></> : <>시즌 패스로 <strong>보상 해금</strong></>}</h2><div className="fan-pass-xp"><strong>{currentXp.toLocaleString()}</strong><span> / {maxXp.toLocaleString()} XP</span></div><div className="fan-pass-progress" aria-label={`${progress}% 진행`}><i style={{ width: `${progress}%` }} /></div><p>{isGlobal ? '모든 아티스트 활동으로 XP를 모아 보상을 받아보세요.' : `시즌 종료까지 ${season?.endsAt ? formatRemainingDays(season.endsAt) : '기간 제한 없음'} · 무료 보상은 누구나 받을 수 있어요.`}</p></div></section>
      {premium && <div className="fan-pass-lane-headings"><span>무료 보상</span><span>프리미엄 보상</span></div>}
      {premium && !season?.isPurchased && <section className="season-pass-purchase-cue" aria-label="프리미엄 패스 구매"><div><b>프리미엄 보상 잠금</b><small>패스를 구매하면 현재 XP까지 보상을 바로 받을 수 있어요.</small>{purchaseError && <small role="alert">{purchaseError}</small>}</div><button type="button" onClick={() => void purchase()} disabled={purchaseBusy}>{purchaseBusy ? '구매 중...' : `패스 구매 · ${(season?.premiumPricePoints ?? 0).toLocaleString()} P`}</button></section>}
      <section className={`season-pass-journey${premium ? ' has-premium-lane' : ''}`} aria-label="시즌 패스 보상 여정"><div className="season-pass-journey-line" aria-hidden="true"><i style={{ height: `${Math.max(10, progress)}%` }} /></div>{tiers.length > 0 ? tiers.map(tier => <SeasonTierCard key={tier.id} tier={tier} premium={premium} purchased={Boolean(season?.isPurchased)} onClaim={onClaimPassTier} />) : <div className="fan-pass-empty-section"><span className="fan-pass-empty-icon" aria-hidden="true"><InlineIcon name="calendar" /></span><div><b>시즌 패스 보상 여정</b><p>현재 공개된 시즌 패스가 없어요.</p><small>새 시즌이 공개되면 이곳에서 보상 여정을 확인할 수 있어요.</small></div></div>}</section>
      <section className="fan-pass-more" aria-label="팬 패스 안내"><span><InlineIcon name="sparkles" /></span><div><b>{premium ? '무료 보상은 누구나 받을 수 있어요' : '더 많은 XP를 모아보세요!'}</b><small>팬 활동을 통해 XP를 획득하고 다음 보상을 해금하세요.</small></div><InlineIcon name="chevron" /></section>
    </div>
    <nav className="bottom-nav" aria-label="주요 메뉴"><NavItem active={false} label="탐색" onClick={() => onNavigate('discover')} /><NavItem active={false} label="보관함" icon="collection" onClick={() => onNavigate('collection')} /><NavItem active={false} label="홈" icon="home" onClick={() => onNavigate('home')} /><NavItem active label="팬 레벨" icon="growth" onClick={() => onNavigate('growth')} /><NavItem active={false} label="상점" icon="shop" onClick={() => onNavigate('shop')} /></nav>
  </main>
}

function formatRemainingDays(endsAt: string): string { return `${Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000))}일 남음` }

function SeasonTierCard({ tier, premium, purchased, onClaim }: { tier: PassTier; premium: boolean; purchased: boolean; onClaim: (tierId: string, track?: 'free' | 'premium') => Promise<unknown> }) {
  const [busy, setBusy] = useState<'free' | 'premium' | null>(null)
  const freeClaimable = Boolean(tier.claimable); const premiumClaimable = Boolean(tier.premiumClaimable) && purchased
  const claim = async (track: 'free' | 'premium') => { setBusy(track); try { await onClaim(tier.id, track) } finally { setBusy(null) } }
  return <article data-pass-tier-id={tier.id} className={`season-pass-tier-card${tier.claimed ? ' is-claimed' : ''}${freeClaimable ? ' is-claimable' : ''}`}><span className="season-pass-node" aria-label={`Lv.${tier.tier}`}><strong>Lv.{tier.tier}</strong></span>{premium ? <div className="season-pass-lanes"><RewardLane tier={tier} premium={false} claimable={freeClaimable} claimed={Boolean(tier.claimed)} busy={busy === 'free'} onClaim={() => void claim('free')} /><RewardLane tier={tier} premium purchased={purchased} claimable={premiumClaimable} claimed={Boolean(tier.premiumClaimed)} busy={busy === 'premium'} onClaim={() => void claim('premium')} /></div> : <RewardLane tier={tier} premium={false} claimable={freeClaimable} claimed={Boolean(tier.claimed)} busy={busy === 'free'} onClaim={() => void claim('free')} />}</article>
}

function RewardLane({ tier, premium, purchased = false, claimable, claimed, busy, onClaim }: { tier: PassTier; premium: boolean; purchased?: boolean; claimable: boolean; claimed: boolean; busy: boolean; onClaim: () => void }) {
  const reward = premium ? tier.premiumReward : tier.reward
  return <div className={`season-pass-lane season-pass-tier-main${premium ? ' is-premium' : ''}${claimable ? ' is-claimable' : ''}${premium && !purchased ? ' is-locked-lane' : ''}`}><div className="season-pass-lane-label">{premium ? '프리미엄 보상' : '무료 보상'}</div><img src={artworkForTier(tier, premium)} alt="" /><h3>{reward?.name ?? (premium ? '프리미엄 보상' : '팬 패스 보상')}</h3><small>{tier.requiredXp.toLocaleString()} XP</small>{premium && !purchased ? <div className="season-pass-premium-overlay"><span className="season-pass-locked"><InlineIcon name="lock" /> 패스 구매 시 해금</span></div> : claimed ? <span className="season-pass-claimed" title="보상을 받았어요. 보관함에서 확인할 수 있어요.">획득 완료</span> : claimable ? <button type="button" className="season-pass-claim" onClick={event => { event.stopPropagation(); onClaim() }} disabled={busy}>{busy ? '수령 중...' : '보상 받기'}</button> : <span className="season-pass-locked"><InlineIcon name="lock" /> 잠금</span>}</div>
}
