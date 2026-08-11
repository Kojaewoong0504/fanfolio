import { useEffect, useMemo, useState } from 'react'
import type { FanProgression, PassTierClaim, ProfileEquipment, RewardGrant } from '../api/client'
import './FanGrowth.css'

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

export function FanGrowth({ progression, loading, error, mode, onRetry, onClaim, onClaimPassTier, onEquip }: FanGrowthProps) {
  const [activeSheet, setActiveSheet] = useState<FanGrowthSheet>(null)
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null)
  const [claimingTierId, setClaimingTierId] = useState<string | null>(null)
  const [equipmentSaving, setEquipmentSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [draftEquipment, setDraftEquipment] = useState<ProfileEquipment | null>(null)

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

    {mode === 'full' && <div className="fan-growth-actions">
      <button type="button" onClick={() => setActiveSheet('pass')}>무료 팬 패스</button>
      <button type="button" onClick={() => setActiveSheet('equipment')}>장착 패널</button>
    </div>}

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

function RewardSelect({ label, value, rewards, onChange }: { label: string, value: string | null, rewards: RewardGrant[], onChange: (value: string | null) => void }) {
  return <label className="fan-growth-select"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value || null)} disabled={rewards.length === 0}><option value="">장착 안 함</option>{rewards.map(reward => <option key={reward.id} value={reward.id}>{reward.name}</option>)}</select></label>
}
