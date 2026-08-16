import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { FanProgression, PassTierClaim, ProfileEquipment, RewardGrant } from '../api/client'
import './FanGrowth.css'
import './FanGrowthReference.css'
import dreamscapeGroup from '../assets/login/dreamscape-group.png'
import milestoneSprite from '../assets/fan-level-milestones.png'

type FanGrowthMode = 'summary' | 'full'
type FanGrowthSheet = 'achievements' | 'pass' | 'equipment' | null

type FanGrowthProps = {
  progression: FanProgression | null
  loading: boolean
  error: string
  mode: FanGrowthMode
  fanGrowthMode?: FanGrowthMode
  onRetry: () => void
  onClaim: (grantId: string) => Promise<RewardGrant>
  onClaimPassTier: (tierId: string) => Promise<PassTierClaim>
  onEquip: (equipment: ProfileEquipment) => Promise<void>
}

function MissionIcon({ kind }: { kind: 'event' | 'cards' | 'heart' }) {
  const paths = {
    event: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>,
    cards: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h8" /></>,
    heart: <path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20Z" />,
  }[kind]
  return <svg className="fan-growth-mission-svg" viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>
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

export function FanGrowth({ progression, loading, error, mode, onRetry, onClaim, onClaimPassTier, onEquip }: FanGrowthProps) {
  const [activeSheet, setActiveSheet] = useState<FanGrowthSheet>(null)
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null)
  const [claimingTierId, setClaimingTierId] = useState<string | null>(null)
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

  const claimableRewards = progression?.claimableRewards ?? []
  const claimedRewards = useMemo(
    () => progression?.claimedRewards.filter(reward => reward.claimedAt) ?? [],
    [progression?.claimedRewards],
  )
  const currentSeason = progression?.pass.seasons[0] ?? null
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

  const claimTier = async (tierId: string) => {
    setClaimingTierId(tierId)
    setMessage('')
    try {
      await onClaimPassTier(tierId)
      setMessage('팬 패스 보상을 수령했어요.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '팬 패스 보상을 수령하지 못했어요.')
    } finally {
      setClaimingTierId(null)
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

  if (mode === 'full') {
    const remainingXp = Math.max(0, nextXp - progression.level.totalXp)
    const referenceMissions = visibleAchievements.length > 0 ? visibleAchievements : [
      { id: 'preview-event', title: '이벤트 참여하기', description: '이벤트에 1회 참여하세요.', currentValue: 0, targetValue: 1, completedAt: null },
      { id: 'preview-card', title: '카드 5장 수집하기', description: '카드를 5장 수집하세요.', currentValue: 3, targetValue: 5, completedAt: null },
      { id: 'preview-like', title: '아티스트 콘텐츠 좋아요', description: '아티스트 콘텐츠에 좋아요를 10회 눌러보세요.', currentValue: 6, targetValue: 10, completedAt: null },
    ]
    const milestoneLevels = [
      { level: Math.max(1, progression.level.level - 2), label: '스페셜 포토카드', detail: 'SET A', status: 'complete' as const },
      { level: progression.level.level, label: '단독 디지털', detail: '포스터', status: 'currentLocked' as const },
      { level: progression.level.level + 2, label: '500', detail: 'FAN POINT', status: 'locked' as const },
      { level: progression.level.level + 4, label: '아티스트', detail: '메시지 (1회)', status: 'locked' as const },
      { level: progression.level.level + 6, label: '미공개 셀카', detail: '포토카드', status: 'locked' as const },
      { level: progression.level.level + 8, label: '프리미엄', detail: '포토북', status: 'locked' as const },
    ]
    const milestoneProgressPercent = Math.max(18, levelPercent)
    const visibleMilestoneIndex = Math.round(milestoneScroll.ratio * (milestoneLevels.length - 1))
    return <section className="fan-growth full fan-growth-reference" aria-label="팬 레벨">
      <article className="fan-growth-hero">
        <div className="fan-growth-ring-large" aria-label={`레벨 진행률 ${levelPercent}%`} style={{ '--fan-progress': `${levelPercent * 3.6}deg` } as CSSProperties}>
          <div><strong>Lv.{progression.level.level}</strong><b>{progression.level.level >= 10 ? 'DREAMER' : 'RISING FAN'}</b><span><em>{progression.level.totalXp.toLocaleString()}</em> / {nextXp.toLocaleString()} XP</span></div>
        </div>
        <div className="fan-growth-hero-copy">
          <span className="fan-growth-pill">현재 레벨</span>
          <h2>다음 레벨까지 <strong>{remainingXp.toLocaleString()} XP</strong> 남았어요!</h2>
          <p>더 많은 활동으로 다음 레벨에 도전해 보세요.</p>
          <button type="button" className="fan-growth-benefit-cta" onClick={() => setActiveSheet('equipment')}><span aria-hidden="true">✦</span> 나의 레벨 혜택 보기 <b aria-hidden="true">›</b></button>
        </div>
      </article>

      <section className="fan-growth-reference-section">
        <div className="fan-growth-reference-title"><h2>미션</h2><button type="button" onClick={() => setActiveSheet('achievements')}>전체 보기 <b aria-hidden="true">›</b></button></div>
        <div className="fan-growth-missions">
          {referenceMissions.slice(0, 3).map((item, index) => <article key={item.id} className={item.completedAt ? 'completed' : ''}>
            <span className={`fan-growth-mission-icon mission-icon-${index}`} aria-hidden="true"><MissionIcon kind={index === 0 ? 'event' : index === 1 ? 'cards' : 'heart'} /></span>
            <div><b>{item.title}</b><p>{item.description}</p></div>
            <strong>{item.completedAt ? '완료 ✓' : `${Math.min(item.currentValue, item.targetValue)} / ${item.targetValue} ›`}</strong>
          </article>)}
        </div>
      </section>

      <section className="fan-growth-reference-section">
        <div className="fan-growth-reference-title"><h2>레벨 마일스톤</h2><button type="button" onClick={() => setActiveSheet('pass')}>전체 보기 <b aria-hidden="true">›</b></button></div>
        <div ref={milestoneRailRef} className="fan-growth-milestones" role="list" aria-label="전체 레벨 마일스톤" tabIndex={0} onKeyDown={scrollMilestonesWithKeyboard} onScroll={handleMilestoneScroll}>
          {milestoneLevels.map(item => <article key={`${item.level}-${item.label}`} className={`fan-growth-milestone ${item.status === 'currentLocked' ? 'is-current is-locked' : ''} ${item.status === 'locked' ? 'is-locked' : ''}`} role="listitem">
            {item.status === 'currentLocked' && <span className="fan-growth-current-label">현재</span>}
            <span className={`fan-growth-milestone-state ${item.status === 'complete' ? 'is-complete' : 'is-locked'}`} aria-label={item.status === 'complete' ? '받은 보상' : '잠긴 보상'}>{item.status === 'complete' ? '✓' : <MilestoneLockIcon />}</span>
            <strong>Lv.{item.level}</strong><span className="fan-growth-milestone-art" style={{ backgroundImage: `url(${milestoneSprite})` }} aria-label={item.label} /><b>{item.label}</b><small>{item.detail}</small>
          </article>)}
        </div>
        <div className="fan-growth-milestone-track" aria-hidden="true">
          <b className="fan-growth-milestone-track-fill" style={{ '--milestone-fill-width': `${milestoneProgressPercent}%` } as CSSProperties} />
          <b className="fan-growth-milestone-track-viewport" style={{ '--milestone-viewport-left': `${milestoneScroll.ratio * 100}%` } as CSSProperties} />
          {milestoneLevels.map((item, index) => <i key={`${item.level}-${item.label}-dot`} className={`fan-growth-milestone-track-dot ${index <= visibleMilestoneIndex ? 'is-active' : ''}`} style={{ left: `${index / (milestoneLevels.length - 1) * 100}%` }} />)}
        </div>
      </section>

      <section className="fan-growth-reference-section">
        <div className="fan-growth-reference-title"><h2>나의 레벨 혜택</h2></div>
        <article className="fan-growth-benefits">
          <img src={dreamscapeGroup} alt="드림스케이프 아티스트" />
          <div><span className="fan-growth-pill">Lv.{progression.level.level} 혜택</span><ul><li>드림스케이프 전용 콘텐츠 열람</li><li>팬 이벤트 우선 참여 기회</li><li>FAN POINT 적립률 +20%</li></ul><button type="button" onClick={() => setActiveSheet('equipment')}>더 많은 혜택은 다음 레벨에서! <b aria-hidden="true">›</b></button></div>
        </article>
      </section>

      {error && progression && <div className="fan-growth-inline-error" role="alert"><span>성장 정보를 불러오지 못했어요.</span><button type="button" onClick={onRetry}>다시 시도</button></div>}
      {message && <p className="fan-growth-message" role="status">{message}</p>}
      {activeSheet && <GrowthSheet activeSheet={activeSheet} progression={progression} draftEquipment={draftEquipment} claimedRewards={claimedRewards} availableTitles={availableTitles} availableBadges={availableBadges} availableFrames={availableFrames} availableThemes={availableThemes} claimTier={claimTier} claimingTierId={claimingTierId} updateDraft={updateDraft} toggleBadge={toggleBadge} saveEquipment={saveEquipment} equipmentSaving={equipmentSaving} setActiveSheet={setActiveSheet} />}
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
        <h2 id="fan-growth-sheet-title">{activeSheet === 'achievements' ? '업적 전체 보기' : activeSheet === 'pass' ? '무료 팬 패스' : '장착 패널'}</h2>
        {activeSheet === 'achievements' && <div className="fan-growth-sheet-list">{progression.achievements.map(item => <article key={item.id}><div><b>{item.title}</b><p>{item.description}</p></div><span>{item.completedAt ? '완료' : `${Math.min(item.currentValue, item.targetValue)}/${item.targetValue}`}</span></article>)}</div>}
        {activeSheet === 'pass' && <div className="fan-growth-sheet-list">{progression.pass.seasons.length > 0 ? progression.pass.seasons.map(season => <article key={season.id} className="pass-season"><div><b>{season.title}</b><p>{season.progress.currentXp} XP 진행 중</p></div>{season.tiers.map(tier => <button type="button" key={tier.id} disabled={!tier.claimable || claimingTierId === tier.id} onClick={() => void claimTier(tier.id)}>{tier.claimed ? '수령 완료' : claimingTierId === tier.id ? '수령 중...' : tier.claimable ? `${tier.tier}단계 받기` : `${tier.requiredXp} XP 필요`}</button>)}</article>) : <p className="fan-growth-empty">진행 중인 무료 팬 패스가 없어요.</p>}</div>}
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

function GrowthSheet({ activeSheet, progression, draftEquipment, claimedRewards, availableTitles, availableBadges, availableFrames, availableThemes, claimTier, claimingTierId, updateDraft, toggleBadge, saveEquipment, equipmentSaving, setActiveSheet }: {
  activeSheet: Exclude<FanGrowthSheet, null>
  progression: FanProgression
  draftEquipment: ProfileEquipment | null
  claimedRewards: RewardGrant[]
  availableTitles: RewardGrant[]
  availableBadges: RewardGrant[]
  availableFrames: RewardGrant[]
  availableThemes: RewardGrant[]
  claimTier: (tierId: string) => Promise<void>
  claimingTierId: string | null
  updateDraft: (patch: Partial<ProfileEquipment>) => void
  toggleBadge: (rewardId: string) => void
  saveEquipment: () => Promise<void>
  equipmentSaving: boolean
  setActiveSheet: (sheet: FanGrowthSheet) => void
}) {
  return <div className="fan-growth-sheet-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActiveSheet(null) }}>
    <div className="fan-growth-sheet" role="dialog" aria-modal="true" aria-labelledby="fan-growth-sheet-title">
      <button className="fan-growth-sheet-close" type="button" aria-label="팬 성장 패널 닫기" onClick={() => setActiveSheet(null)}>×</button>
      <h2 id="fan-growth-sheet-title">{activeSheet === 'achievements' ? '미션 전체 보기' : activeSheet === 'pass' ? '무료 팬 패스' : '장착 패널'}</h2>
      {activeSheet === 'achievements' && <div className="fan-growth-sheet-list">{progression.achievements.map(item => <article key={item.id}><div><b>{item.title}</b><p>{item.description}</p></div><span>{item.completedAt ? '완료' : `${Math.min(item.currentValue, item.targetValue)}/${item.targetValue}`}</span></article>)}</div>}
      {activeSheet === 'pass' && <div className="fan-growth-sheet-list">{progression.pass.seasons.length > 0 ? progression.pass.seasons.map(season => <article key={season.id} className="pass-season"><div><b>{season.title}</b><p>{season.progress.currentXp} XP 진행 중</p></div>{season.tiers.map(tier => <button type="button" key={tier.id} disabled={!tier.claimable || claimingTierId === tier.id} onClick={() => void claimTier(tier.id)}>{tier.claimed ? '수령 완료' : tier.claimable ? '받기' : `${tier.requiredXp} XP 필요`}</button>)}</article>) : <p className="fan-growth-empty">진행 중인 무료 팬 패스가 없어요.</p>}</div>}
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
