import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, claimFanMission, getFanMissions, type FanMission } from '../api/client'
import './FanMissionPage.css'

type MissionStatus = 'active' | 'completed' | 'ended'

type FanMissionPageProps = {
  onBack: () => void
  onClaimed?: () => void | Promise<void>
  initialMissions?: FanMission[]
}

const statusTabs: Array<{ id: MissionStatus; label: string }> = [
  { id: 'active', label: '진행 중' },
  { id: 'completed', label: '완료' },
  { id: 'ended', label: '종료' },
]

function rewardValue(reward: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = reward[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function MissionReward({ mission }: { mission: FanMission }) {
  const xp = rewardValue(mission.reward, ['xp', 'rewardXp', 'experience'])
  const points = rewardValue(mission.reward, ['points', 'point', 'rewardPoints'])
  if (!xp && !points) return <span className="mission-page-reward">미션 보상</span>
  return <span className="mission-page-reward">{xp > 0 && <b>+{xp} XP</b>}{points > 0 && <b>+{points} P</b>}</span>
}

function MissionGlyph({ kind }: { kind: 'flag' | 'comment' | 'pack' | 'calendar' | 'star' | 'back' | 'chevron' }) {
  const path = {
    flag: <><path d="M6 20V4" /><path d="M7 5h10l-2.5 3L17 11H7" /></>,
    comment: <><path d="M5 5h14v10H9l-4 3Z" /><path d="M9 10h.01M12 10h.01M15 10h.01" /></>,
    pack: <><path d="M7 4h10l1 3v13H6V7Z" /><path d="M6 8h12M10 12l2-1 2 1-.5 2.3 1.5 1.5-2.2.2-.8 2-.8-2-2.2-.2 1.5-1.5Z" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /><path d="m12 12 .7 1.4 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2Z" /></>,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
    back: <path d="m15 5-7 7 7 7" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  }[kind]
  return <svg className={`mission-glyph mission-glyph-${kind}`} viewBox="0 0 24 24" aria-hidden="true">{path}</svg>
}

export function FanMissionPage({ onBack, onClaimed, initialMissions }: FanMissionPageProps) {
  const [status, setStatus] = useState<MissionStatus>('active')
  const [missions, setMissions] = useState<FanMission[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage('')
    if (initialMissions) {
      setMissions(initialMissions.filter(mission => status === 'active' ? !mission.completedAt : status === 'completed' ? Boolean(mission.completedAt) : false))
      setLoading(false)
      return
    }
    try {
      const result = await getFanMissions(status)
      setMissions(result.data.items)
    } catch (error) {
      setMissions([])
      if (!(error instanceof ApiError && error.status === 401)) setMessage('미션 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [initialMissions, status])

  useEffect(() => { void refresh() }, [refresh])

  const recentRewards = useMemo(() => initialMissions?.filter(mission => Boolean(mission.completedAt)).slice(0, 1) ?? [], [initialMissions])
  const claim = async (mission: FanMission) => {
    setClaimingId(mission.id)
    setMessage('')
    try {
      if (!initialMissions) await claimFanMission(mission.id)
      await onClaimed?.()
      setMessage('미션 보상을 받았어요.')
      if (initialMissions) setMissions(current => current.filter(item => item.id !== mission.id))
      else await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '미션 보상을 받을 수 없어요.')
    } finally {
      setClaimingId(null)
    }
  }

  return <main className="app-shell mission-page-shell">
    <header className="mission-page-topbar">
      <button type="button" aria-label="팬 레벨로 돌아가기" onClick={onBack}><MissionGlyph kind="back" /></button>
      <h1>미션</h1>
      <span className="mission-page-topbar-spacer" aria-hidden="true" />
    </header>
    <section className="mission-page-body">
      <article className="mission-page-hero">
        <span className="mission-page-hero-icon"><MissionGlyph kind="flag" /></span>
        <div><h2>미션으로 XP와 포인트를 모아보세요</h2><p>다양한 미션을 완료하고 보상을 받아보세요!</p></div>
      </article>

      <div className="mission-page-tabs" role="tablist" aria-label="미션 상태">
        {statusTabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={status === tab.id} className={status === tab.id ? 'is-active' : ''} onClick={() => setStatus(tab.id)}>{tab.label}</button>)}
      </div>

      <section className="mission-page-list" aria-live="polite">
        {loading && <div className="mission-page-state" role="status">미션을 불러오는 중이에요.</div>}
        {!loading && missions.length === 0 && <div className="mission-page-state"><span><MissionGlyph kind="star" /></span><strong>{status === 'active' ? '진행 중인 미션이 없어요' : status === 'completed' ? '완료한 미션이 없어요' : '종료된 미션이 없어요'}</strong><p>새로운 미션이 공개되면 이곳에서 확인할 수 있어요.</p></div>}
        {!loading && missions.map((mission, index) => {
          const progress = Math.min(mission.currentValue, mission.targetValue)
          const percent = mission.targetValue > 0 ? Math.round(progress / mission.targetValue * 100) : 0
          return <article className={`mission-page-card ${mission.completed ? 'is-complete' : ''}`} key={mission.id}>
            <span className="mission-page-card-icon"><MissionGlyph kind={index % 3 === 0 ? 'comment' : index % 3 === 1 ? 'pack' : 'calendar'} /></span>
            <div className="mission-page-card-copy"><h3>{mission.title}</h3><span className="mission-page-card-count">{progress} / {mission.targetValue}</span><MissionReward mission={mission} /><div className="mission-page-progress"><i style={{ width: `${percent}%` }} /></div></div>
            <div className="mission-page-card-action">{status === 'active' && mission.completed ? <button type="button" onClick={() => void claim(mission)} disabled={claimingId === mission.id}>{claimingId === mission.id ? '받는 중…' : '보상 받기'}</button> : <em>{mission.completed ? '완료' : status === 'ended' ? '종료' : progress === 0 ? '시작하기' : '진행 중'}</em>}</div>
          </article>
        })}
      </section>
      {message && <p className="mission-page-message" role="status">{message}</p>}
      {status === 'active' && recentRewards.length > 0 && <section className="mission-page-history"><div className="mission-page-history-heading"><h2>최근 획득 기록</h2><button type="button">전체 보기 <MissionGlyph kind="chevron" /></button></div>{recentRewards.map(mission => <article key={mission.id}><span><MissionGlyph kind="star" /></span><div><strong>{mission.title} 보상</strong><small>{new Date(mission.completedAt ?? '').toLocaleDateString('ko-KR')} · 완료</small></div><MissionReward mission={mission} /><MissionGlyph kind="chevron" /></article>)}</section>}
    </section>
  </main>
}
