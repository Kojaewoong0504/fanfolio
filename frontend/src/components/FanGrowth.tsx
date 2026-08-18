import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { resolveApiUrl, type FanProgression, type PassTierClaim, type ProfileEquipment, type RewardGrant } from '../api/client'
import './FanGrowth.css'
import './FanGrowthReference.css'
import milestoneSprite from '../assets/fan-level-milestones.png'
import { AuthenticatedImage } from './AuthenticatedImage'

type FanGrowthMode = 'summary' | 'full'
type FanGrowthSheet = 'achievements' | 'equipment' | null

type FanGrowthProps = {
  progression: FanProgression | null
  globalProgression?: FanProgression | null
  artistScopes?: Array<{ id: string; name: string; imageUrl?: string | null }>
  selectedArtistId?: string | null
  onArtistChange?: (artistId: string | null) => void
  loading: boolean
  error: string
  mode: FanGrowthMode
  fanGrowthMode?: FanGrowthMode
  onRetry: () => void
  onClaim: (grantId: string) => Promise<RewardGrant>
  onClaimPassTier: (tierId: string) => Promise<PassTierClaim>
  onEquip: (equipment: ProfileEquipment) => Promise<void>
  onViewPass: (tierId?: string) => void
  onViewGlobalPass?: (tierId?: string) => void
}

function MissionIcon({ kind }: { kind: 'event' | 'cards' | 'heart' | 'flag' }) {
  const paths = {
    event: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>,
    cards: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h8" /></>,
    heart: <path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20Z" />,
    flag: <><path d="M6 20V4" /><path d="M7 5h10l-2.5 3L17 11H7" /></>,
  }[kind]
  return <svg className="fan-growth-mission-svg" viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>
}

function GrowthGlyph({ kind }: { kind: 'ticket' | 'globe' }) {
  const paths = kind === 'ticket'
    ? <><path d="M4.5 8.5a2.5 2.5 0 0 0 2.5-2.5h10a2.5 2.5 0 0 0 2.5 2.5v7a2.5 2.5 0 0 0-2.5 2.5H7a2.5 2.5 0 0 0-2.5-2.5Z" fill="currentColor" stroke="none" /><path d="m12 9.2.8 1.7 1.9.2-1.4 1.3.4 1.9-1.7-.9-1.7.9.4-1.9-1.4-1.3 1.9-.2Z" fill="#fff" stroke="none" /></>
    : <><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9M12 3c-2.2 2.4-3.3 5.4-3.3 9s1.1 6.6 3.3 9" /></>
  return <svg className={`fan-growth-glyph fan-growth-glyph-${kind}`} viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>
}

const rewardLabels: Record<RewardGrant['type'], string> = {
  badge: '배지',
  title: '칭호',
  profile_frame: '프로필 프레임',
  collection_theme: '컬렉션 테마',
  digital_bonus: '디지털 보너스',
}

function nextLevelXp(progression: FanProgression): number {
  return progression.level.nextLevelXp ?? Math.max(100, progression.level.level * 100)
}

function rewardLabel(reward: RewardGrant): string {
  return rewardLabels[reward.type] ?? reward.name
}

function rewardClaimLabel(reward: RewardGrant): string {
  if (reward.type === 'title') return '칭호 받기'
  return `${rewardLabel(reward)} 받기`
}

function rewardTypeLabel(type: string): string {
  return rewardLabels[type as RewardGrant['type']] ?? '팬 혜택'
}

function rewardArtworkUrl(reward: { id?: string; rewardId?: string; metadata?: Record<string, unknown> } | null | undefined): string | null {
  if (!reward?.metadata) return null
  const preset = typeof reward.metadata.imagePreset === 'string' ? reward.metadata.imagePreset : ''
  if (['ticket', 'vip', 'crystal', 'music'].includes(preset)) return `/rewards/reward-${preset}.png`
  if (reward.metadata.imageAssetId) {
    const rewardId = reward.rewardId || reward.id
    return rewardId ? resolveApiUrl(`/api/rewards/${encodeURIComponent(rewardId)}/image`) : null
  }
  return null
}

export { rewardArtworkUrl }

function progressPercent(current: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(current / target * 100)))
}

function scrollMilestonesWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 132 : -132, behavior: 'smooth' })
}

function MilestoneLockIcon() {
  return <svg className="fan-growth-lock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="14.5" r="1.2" /><path d="M12 15.7v1.7" /></svg>
}

type MilestoneScrollState = { ratio: number; viewportRatio: number }

export function FanGrowth({ progression, globalProgression = null, artistScopes = [], selectedArtistId = null, onArtistChange, loading, error, mode, onRetry, onClaim, onClaimPassTier: _onClaimPassTier, onEquip, onViewPass, onViewGlobalPass }: FanGrowthProps) {
  const [activeSheet, setActiveSheet] = useState<FanGrowthSheet>(null)
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null)
  const [equipmentSaving, setEquipmentSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [draftEquipment, setDraftEquipment] = useState<ProfileEquipment | null>(null)
  const milestoneRailRef = useRef<HTMLDivElement | null>(null)
  const [milestoneScroll, setMilestoneScroll] = useState<MilestoneScrollState>({ ratio: 0, viewportRatio: 1 })

  useEffect(() => {
    setDraftEquipment(progression?.equipment ?? null)
  }, [progression?.equipment])

  useEffect(() => {
    if (!activeSheet) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSheet(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeSheet])

  const handleMilestoneScroll = useCallback(() => {
    const rail = milestoneRailRef.current
    if (!rail) return
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth)
    setMilestoneScroll({
      ratio: maxScrollLeft > 0 ? Math.min(1, Math.max(0, rail.scrollLeft / maxScrollLeft)) : 0,
      viewportRatio: rail.scrollWidth > 0 ? Math.min(1, rail.clientWidth / rail.scrollWidth) : 1,
    })
  }, [])

  useEffect(() => {
    if (mode !== 'full') return
    const rail = milestoneRailRef.current
    if (!rail) return
    handleMilestoneScroll()
    rail.addEventListener('scroll', handleMilestoneScroll, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleMilestoneScroll)
    resizeObserver?.observe(rail)
    return () => {
      rail.removeEventListener('scroll', handleMilestoneScroll)
      resizeObserver?.disconnect()
    }
  }, [handleMilestoneScroll, mode, progression?.level.level])

  const claimableRewards = useMemo(
    () => progression?.claimableRewards ?? [],
    [progression?.claimableRewards],
  )
  const claimedRewards = useMemo(
    () => progression?.claimedRewards.filter(reward => reward.claimedAt) ?? [],
    [progression?.claimedRewards],
  )
  const visibleBenefits = useMemo(() => {
    const seen = new Set<string>()
    return [...claimedRewards, ...claimableRewards].filter(reward => {
      const key = reward.rewardId || reward.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [claimableRewards, claimedRewards])
  const nextXp = progression ? nextLevelXp(progression) : 100
  const levelPercent = progression ? progressPercent(progression.level.totalXp, nextXp) : 0
  const visibleAchievements = (progression?.achievements ?? []).slice(0, mode === 'summary' ? 3 : 5)
  const availableTitles = claimedRewards.filter(reward => reward.type === 'title')
  const availableBadges = claimedRewards.filter(reward => reward.type === 'badge')
  const availableFrames = claimedRewards.filter(reward => reward.type === 'profile_frame')
  const availableThemes = claimedRewards.filter(reward => reward.type === 'collection_theme')

  const claimRewardGrant = async (grantId: string) => {
    setClaimingRewardId(grantId)
    setMessage('')
    try {
      await onClaim(grantId)
      setMessage('보상을 수령했어요.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '보상을 수령하지 못했어요.')
    } finally {
      setClaimingRewardId(null)
    }
  }

  const updateDraft = (patch: Partial<ProfileEquipment>) => {
    setDraftEquipment(current => current ? { ...current, ...patch } : null)
  }

  const toggleBadge = (rewardId: string) => {
    setDraftEquipment(current => {
      if (!current) return current
      const badgeRewardIds = current.badgeRewardIds.includes(rewardId)
        ? current.badgeRewardIds.filter(id => id !== rewardId)
        : current.badgeRewardIds.length < 3
          ? [...current.badgeRewardIds, rewardId]
          : current.badgeRewardIds
      return { ...current, badgeRewardIds }
    })
  }

  const saveEquipment = async () => {
    if (!draftEquipment) return
    setEquipmentSaving(true)
    setMessage('')
    try {
      await onEquip(draftEquipment)
      setMessage('장착 정보를 저장했어요.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '장착 정보를 저장하지 못했어요.')
    } finally {
      setEquipmentSaving(false)
    }
  }

  if (loading && !progression) {
    return <section className="fan-growth-card" aria-label="나의 팬 활동" aria-busy="true"><span className="fan-growth-loader" aria-hidden="true" /><b>팬 활동을 불러오는 중이에요</b></section>
  }

  if (error && !progression) {
    return <section className="fan-growth-card fan-growth-error" aria-label="나의 팬 활동" role="alert"><b>성장 정보를 불러오지 못했어요</b><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></section>
  }

  if (!progression) return null

  const currentSeason = progression.pass.seasons[0] ?? null

  if (mode === 'full') {
    const isGlobalScope = selectedArtistId == null
    const selectedArtist = artistScopes.find(artist => artist.id === selectedArtistId)
    const scopeName = isGlobalScope ? '전체 팬 레벨' : `${selectedArtist?.name ?? '아티스트'} 팬 레벨`
    const scopeDescription = isGlobalScope
      ? '모든 아티스트와 FANFOLIO 활동을 기준으로 성장해요.'
      : `${selectedArtist?.name ?? '아티스트'}와 함께한 활동만 계산해요.`
    const remainingXp = Math.max(0, nextXp - progression.level.totalXp)
    const milestoneTiers = currentSeason?.tiers ?? []
    const firstUnclaimedTierIndex = milestoneTiers.findIndex(tier => !tier.claimed)
    const milestoneLevels = milestoneTiers.map(tier => ({
      tier,
      level: Math.max(1, Math.floor(tier.requiredXp / 100) + 1),
      label: tier.reward?.name ?? `팬 패스 ${tier.tier}단계`,
      detail: tier.reward ? rewardTypeLabel(tier.reward.type) : '보상 없음',
      reward: tier.reward,
      status: tier.claimed ? 'complete' as const : tier.tier - 1 === firstUnclaimedTierIndex ? 'currentLocked' as const : 'locked' as const,
    }))
    const nextPassTier = milestoneTiers.find(tier => !tier.claimed && tier.requiredXp > (currentSeason?.progress.currentXp ?? 0) && tier.reward)
    const milestoneProgressPercent = currentSeason && milestoneTiers.length > 0
      ? progressPercent(currentSeason.progress.currentXp, Math.max(...milestoneTiers.map(tier => tier.requiredXp)))
      : 0
    const visibleMilestoneIndex = Math.round(milestoneScroll.ratio * (milestoneLevels.length - 1))
    return <section className="fan-growth full fan-growth-reference" aria-label="팬 레벨">
      {artistScopes.length <= 1 && <div className="fan-growth-artist-heading"><strong>{scopeName}</strong></div>}
      {onArtistChange && (artistScopes.length > 1 || isGlobalScope) && <div className="fan-growth-scope" aria-label="팬 레벨 범위 선택">
        <div className="fan-growth-scope-heading">
          <span className={`fan-growth-scope-avatar ${isGlobalScope ? 'fan-growth-scope-avatar-global' : ''}`} aria-hidden="true">{isGlobalScope ? '전체' : selectedArtist?.name?.slice(0, 1) ?? '팬'}</span>
          <span className="fan-growth-scope-eyebrow">성장 기준</span>
          <strong>{scopeName}</strong>
          <p>{scopeDescription}</p>
        </div>
        <div className="fan-growth-scope-tabs" role="tablist" aria-label="팬 레벨 범위">
          {artistScopes.map(artist => <button type="button" role="tab" aria-selected={artist.id === selectedArtistId} className={artist.id === selectedArtistId ? 'is-active' : ''} key={artist.id} onClick={() => onArtistChange(artist.id)}>{artist.name}</button>)}
          <button type="button" role="tab" aria-selected={isGlobalScope} className={isGlobalScope ? 'is-active' : ''} onClick={() => onArtistChange(null)}>전체 팬</button>
        </div>
      </div>}
      <article className="fan-growth-hero">
        <div className="fan-growth-level-column">
          <div className="fan-growth-level-heading"><strong>Lv.{progression.level.level}</strong><b>{progression.level.level >= 10 ? 'DREAMER' : 'RISING FAN'}</b></div>
          <div className="fan-growth-ring-large" aria-label={`레벨 진행률 ${levelPercent}%`} style={{ '--fan-progress': `${levelPercent * 3.6}deg` } as CSSProperties}>
            <div><span><em>{progression.level.totalXp.toLocaleString()}</em> / {nextXp.toLocaleString()} XP</span></div>
          </div>
        </div>
        <div className="fan-growth-hero-copy">
          {selectedArtist?.imageUrl && <AuthenticatedImage className="fan-growth-artist-art" src={selectedArtist.imageUrl} alt={`${selectedArtist.name} 그룹 이미지`} />}
          <h2>다음 레벨까지 <strong>{remainingXp.toLocaleString()} XP</strong> 남았어요!</h2>
          <p>더 많은 활동으로 다음 레벨에 도전해 보세요.</p>
        </div>
      </article>

      <section className="fan-growth-reference-section fan-growth-mission-section" aria-label="진행 중 미션">
        <button type="button" className="fan-growth-mission-summary" onClick={() => setActiveSheet('achievements')}>
          <span className="fan-growth-mission-summary-icon" aria-hidden="true"><MissionIcon kind="flag" /></span>
          <strong>{visibleAchievements.length > 0 ? `미션 ${visibleAchievements.length}개 진행 중` : '진행 중인 미션 없음'}</strong>
          <b aria-hidden="true">›</b>
        </button>
      </section>

      <section className="fan-growth-reference-section fan-growth-milestone-section">
        <div className="fan-growth-reference-title"><h2>레벨 마일스톤</h2><button type="button" onClick={() => onViewPass()}>전체 보기 <b aria-hidden="true">›</b></button></div>
        {milestoneLevels.length > 0 ? <>
          <div ref={milestoneRailRef} className="fan-growth-milestones" role="list" aria-label="전체 레벨 마일스톤" tabIndex={0} onKeyDown={scrollMilestonesWithKeyboard} onScroll={handleMilestoneScroll}>
            {milestoneLevels.map(({ tier, ...item }) => <article className="fan-growth-pass-tier fan-growth-milestone" key={`${item.level}-${item.label}`} data-tier-id={tier.id} data-state={item.status} role="listitem">
              {item.status === 'currentLocked' && <span className="fan-growth-current-label">현재</span>}
              <span className="fan-growth-milestone-art" aria-label={item.label}>{rewardArtworkUrl(tier.reward) && <img src={rewardArtworkUrl(tier.reward) ?? ''} alt="" />}{!rewardArtworkUrl(tier.reward) && <img src={milestoneSprite} alt="" />}{(item.status === 'locked' || (item.status === 'currentLocked' && tier.requiredXp > (currentSeason?.progress.currentXp ?? 0))) && <span className="fan-growth-milestone-lock" aria-label="잠긴 보상"><MilestoneLockIcon /></span>}</span>
              <strong>Lv.{item.level}</strong><b>{item.label}</b><small>{item.detail}</small>
            </article>)}
          </div>
          <div className="fan-growth-milestone-track" aria-hidden="true">
            <b className="fan-growth-milestone-track-fill" style={{ '--milestone-fill-width': `${milestoneProgressPercent}%` } as CSSProperties} />
            <b className="fan-growth-milestone-track-viewport" style={{ '--milestone-viewport-left': `${milestoneScroll.ratio * 100}%` } as CSSProperties} />
            {milestoneLevels.length > 1 && milestoneLevels.map((item, index) => <i key={`${item.level}-${item.label}-dot`} className={`fan-growth-milestone-track-dot ${index <= visibleMilestoneIndex ? 'is-active' : ''}`} style={{ left: `${index / (milestoneLevels.length - 1) * 100}%` }} />)}
          </div>
        </> : <div className="fan-growth-milestone-placeholder" aria-label="관리자가 공개한 레벨 마일스톤 준비 중">
          <div className="fan-growth-placeholder-milestones" aria-hidden="true">
            <article className="is-current"><strong>Lv.1</strong><b>팬 시작 배지</b></article>
            <article><strong>Lv.2</strong><b>미공개 콘텐츠</b></article>
            <article><strong>Lv.3</strong><b>팬 전용 배지</b><span aria-hidden="true">⌕</span></article>
          </div>
          <div className="fan-growth-placeholder-track" aria-hidden="true"><i /><b /><b /><b /></div>
          <p>관리자가 레벨 마일스톤을 공개하면 보상을 확인할 수 있어요.</p>
        </div>}
      </section>

      <section className="fan-growth-reference-section fan-growth-next-reward-section">
        <div className="fan-growth-reference-title"><h2>다음 보상</h2></div>
        <button type="button" className="fan-growth-next-reward" onClick={() => onViewPass(nextPassTier?.id)}>
          <span className="fan-growth-next-reward-icon" aria-hidden="true">{rewardArtworkUrl(visibleBenefits[0] ?? nextPassTier?.reward) ? <img src={rewardArtworkUrl(visibleBenefits[0] ?? nextPassTier?.reward) ?? ''} alt="" /> : <GrowthGlyph kind="ticket" />}</span>
          <span className="fan-growth-next-reward-copy"><b>{visibleBenefits[0]?.name ?? nextPassTier?.reward?.name ?? `${scopeName} 다음 보상`}</b><small>{visibleBenefits[0] ? rewardLabel(visibleBenefits[0]) : nextPassTier ? `Lv.${Math.max(1, Math.floor(nextPassTier.requiredXp / 100) + 1)} 달성 시 획득` : `Lv.${progression.level.level + 1} 달성 시 확인`}</small></span>
          <b className="fan-growth-next-reward-arrow" aria-hidden="true">›</b>
        </button>
      </section>

      {selectedArtistId && globalProgression && <section className="fan-growth-global-section" aria-label="계정 전체 성장">
        <div className="fan-growth-reference-title"><h2>계정 전체 성장</h2><span>아티스트 활동을 아우르는 레벨</span></div>
        <button type="button" className="fan-growth-global-card" onClick={() => onViewGlobalPass?.()}>
          <span className="fan-growth-global-icon" aria-hidden="true"><GrowthGlyph kind="globe" /></span>
          <span className="fan-growth-global-copy">
            <b>전체 팬 레벨</b>
            <small>모든 아티스트 활동을 아우르는 계정 성장</small>
            <span className="fan-growth-global-level"><strong>Lv.{globalProgression.level.level}</strong><small>GLOBAL FAN</small></span>
            <span className="fan-growth-global-progress"><i style={{ width: `${progressPercent(globalProgression.level.totalXp, nextLevelXp(globalProgression))}%` }} /></span>
            <span className="fan-growth-global-footer"><em><strong>{globalProgression.level.totalXp.toLocaleString()}</strong> / {nextLevelXp(globalProgression).toLocaleString()} XP</em><b>전체 마일스톤 보기 <span aria-hidden="true">›</span></b></span>
          </span>
        </button>
      </section>}

      {error && progression && <div className="fan-growth-inline-error" role="alert"><span>성장 정보를 불러오지 못했어요.</span><button type="button" onClick={onRetry}>다시 시도</button></div>}
      {message && <p className="fan-growth-message" role="status">{message}</p>}
      {activeSheet && <GrowthSheet activeSheet={activeSheet} progression={progression} draftEquipment={draftEquipment} claimedRewards={claimedRewards} availableTitles={availableTitles} availableBadges={availableBadges} availableFrames={availableFrames} availableThemes={availableThemes} updateDraft={updateDraft} toggleBadge={toggleBadge} saveEquipment={saveEquipment} equipmentSaving={equipmentSaving} setActiveSheet={setActiveSheet} />}
    </section>
  }

  return <section className={`fan-growth ${mode}`} aria-label="나의 팬 활동">
    <div className="fan-growth-card fan-growth-level">
      <div>
        <p className="eyebrow">FAN LEVEL</p>
        <strong>Lv. {progression.level.level}</strong>
        <span>{progression.level.totalXp} XP · 다음 레벨 {nextXp} XP</span>
      </div>
      <div className="fan-growth-ring" aria-label={`레벨 진행률 ${levelPercent}%`}><span>{levelPercent}%</span></div>
      <progress value={Math.min(progression.level.totalXp, nextXp)} max={nextXp}>레벨 진행률 {levelPercent}%</progress>
    </div>

    {claimableRewards.length > 0 && <div className="fan-growth-card fan-growth-rewards">
      <div><b>수령 가능한 보상 {claimableRewards.length}개</b><span>업적과 팬 패스 보상을 확인해 보세요.</span></div>
      {claimableRewards.slice(0, mode === 'summary' ? 1 : 3).map(reward => <button type="button" key={reward.id} onClick={() => void claimRewardGrant(reward.id)} disabled={claimingRewardId === reward.id}>{claimingRewardId === reward.id ? '수령 중...' : rewardClaimLabel(reward)}</button>)}
    </div>}

    <div className="fan-growth-card fan-growth-achievements">
      <div className="fan-growth-heading"><h2>진행 중 업적</h2><button type="button" onClick={() => setActiveSheet('achievements')}>전체 보기</button></div>
      <div className="fan-growth-list">{visibleAchievements.map(item => <article key={item.id} className={item.completedAt ? 'completed' : ''}><div><b>{item.title}</b><span>{item.description}</span></div><em>{Math.min(item.currentValue, item.targetValue)}/{item.targetValue}</em></article>)}</div>
    </div>

    {currentSeason && mode === 'summary' && <div className="fan-growth-card fan-growth-pass">
      <span>무료 팬 패스</span>
      <b>{currentSeason.title}</b>
      <small>{currentSeason.progress.currentXp} XP · 수령 가능 {currentSeason.tiers.filter(tier => tier.claimable).length}개</small>
    </div>}

    {error && progression && <div className="fan-growth-inline-error" role="alert"><span>성장 정보를 불러오지 못했어요.</span><button type="button" onClick={onRetry}>다시 시도</button></div>}
    {message && <p className="fan-growth-message" role="status">{message}</p>}

    {activeSheet && <div className="fan-growth-sheet-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActiveSheet(null) }}>
      {/* bottom sheet */}
      <div className="fan-growth-sheet" role="dialog" aria-modal="true" aria-labelledby="fan-growth-sheet-title">
        <button className="fan-growth-sheet-close" type="button" aria-label="팬 성장 패널 닫기" onClick={() => setActiveSheet(null)}>×</button>
        <h2 id="fan-growth-sheet-title">{activeSheet === 'achievements' ? '업적 전체 보기' : '장착 패널'}</h2>
        {activeSheet === 'achievements' && <div className="fan-growth-sheet-list">{progression.achievements.map(item => <article key={item.id}><div><b>{item.title}</b><p>{item.description}</p></div><span>{item.completedAt ? '완료' : `${Math.min(item.currentValue, item.targetValue)}/${item.targetValue}`}</span></article>)}</div>}
        {activeSheet === 'equipment' && draftEquipment && <div className="fan-growth-equipment">
          <RewardSelect label="칭호" value={draftEquipment.titleRewardId} rewards={availableTitles} onChange={value => updateDraft({ titleRewardId: value })} />
          <div className="fan-growth-badge-picker"><b>배지</b><span>배지 3개까지 장착할 수 있어요.</span>{availableBadges.map(reward => <label key={reward.id}><input type="checkbox" checked={draftEquipment.badgeRewardIds.includes(reward.id)} disabled={!draftEquipment.badgeRewardIds.includes(reward.id) && draftEquipment.badgeRewardIds.length >= 3} onChange={() => toggleBadge(reward.id)} />{reward.name}</label>)}</div>
          <RewardSelect label="프로필 프레임" value={draftEquipment.frameRewardId} rewards={availableFrames} onChange={value => updateDraft({ frameRewardId: value })} />
          <RewardSelect label="컬렉션 테마" value={draftEquipment.themeRewardId} rewards={availableThemes} onChange={value => updateDraft({ themeRewardId: value })} />
          {claimedRewards.length === 0 && <p className="fan-growth-empty">수령 완료한 보상만 장착할 수 있어요.</p>}
          <label className="fan-growth-public-toggle"><span>공개 프로필에 표시</span><input type="checkbox" checked={draftEquipment.publicProfileEnabled} onChange={event => updateDraft({ publicProfileEnabled: event.target.checked })} /></label>
          <button type="button" className="fan-growth-save" onClick={() => void saveEquipment()} disabled={equipmentSaving}>{equipmentSaving ? '저장 중...' : '장착 저장하기'}</button>
        </div>}
      </div>
    </div>}
  </section>
}

function GrowthSheet({ activeSheet, progression, draftEquipment, claimedRewards, availableTitles, availableBadges, availableFrames, availableThemes, updateDraft, toggleBadge, saveEquipment, equipmentSaving, setActiveSheet }: {
  activeSheet: Exclude<FanGrowthSheet, null>
  progression: FanProgression
  draftEquipment: ProfileEquipment | null
  claimedRewards: RewardGrant[]
  availableTitles: RewardGrant[]
  availableBadges: RewardGrant[]
  availableFrames: RewardGrant[]
  availableThemes: RewardGrant[]
  updateDraft: (patch: Partial<ProfileEquipment>) => void
  toggleBadge: (rewardId: string) => void
  saveEquipment: () => Promise<void>
  equipmentSaving: boolean
  setActiveSheet: (sheet: FanGrowthSheet) => void
}) {
  return <div className="fan-growth-sheet-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActiveSheet(null) }}>
    <div className="fan-growth-sheet" role="dialog" aria-modal="true" aria-labelledby="fan-growth-sheet-title">
      <button className="fan-growth-sheet-close" type="button" aria-label="팬 성장 패널 닫기" onClick={() => setActiveSheet(null)}>×</button>
      <h2 id="fan-growth-sheet-title">{activeSheet === 'achievements' ? '미션 전체 보기' : '장착 패널'}</h2>
      {activeSheet === 'achievements' && <div className="fan-growth-sheet-list">{progression.achievements.map(item => <article key={item.id}><div><b>{item.title}</b><p>{item.description}</p></div><span>{item.completedAt ? '완료' : `${Math.min(item.currentValue, item.targetValue)}/${item.targetValue}`}</span></article>)}</div>}
      {activeSheet === 'equipment' && draftEquipment && <div className="fan-growth-equipment">
        <RewardSelect label="칭호" value={draftEquipment.titleRewardId} rewards={availableTitles} onChange={value => updateDraft({ titleRewardId: value })} />
        <div className="fan-growth-badge-picker"><b>배지</b><span>배지 3개까지 장착할 수 있어요.</span>{availableBadges.map(reward => <label key={reward.id}><input type="checkbox" checked={draftEquipment.badgeRewardIds.includes(reward.id)} disabled={!draftEquipment.badgeRewardIds.includes(reward.id) && draftEquipment.badgeRewardIds.length >= 3} onChange={() => toggleBadge(reward.id)} />{reward.name}</label>)}</div>
        <RewardSelect label="프로필 프레임" value={draftEquipment.frameRewardId} rewards={availableFrames} onChange={value => updateDraft({ frameRewardId: value })} />
        <RewardSelect label="컬렉션 테마" value={draftEquipment.themeRewardId} rewards={availableThemes} onChange={value => updateDraft({ themeRewardId: value })} />
        {claimedRewards.length === 0 && <p className="fan-growth-empty">수령 완료한 보상만 장착할 수 있어요.</p>}
        <button type="button" className="fan-growth-save" onClick={() => void saveEquipment()} disabled={equipmentSaving}>{equipmentSaving ? '저장 중...' : '장착 저장하기'}</button>
      </div>}
    </div>
  </div>
}

function RewardSelect({ label, value, rewards, onChange }: { label: string, value: string | null, rewards: RewardGrant[], onChange: (value: string | null) => void }) {
  return <label className="fan-growth-select"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value || null)} disabled={rewards.length === 0}><option value="">장착 안 함</option>{rewards.map(reward => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select></label>
}
