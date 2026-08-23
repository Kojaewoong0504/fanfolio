import { useEffect, useState } from 'react'
import { ApiError, claimFanMission, getFanMissions, type FanMission } from '../api/client'

export function FanMissions() {
  const [missions, setMissions] = useState<FanMission[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await getFanMissions('active')
      setMissions(result.data.items)
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 401 ? '' : '미션 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const claim = async (mission: FanMission) => {
    try {
      await claimFanMission(mission.id)
      setMessage('미션 보상을 받았어요.')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '미션 보상을 받을 수 없어요.')
    }
  }

  if (!loading && missions.length === 0 && !message) return null
  return <section className="fan-growth-reference-section fan-missions-panel" aria-label="미션">
    <div className="fan-growth-reference-title"><h2>미션</h2><span>활동을 완료하고 보상을 받아요</span></div>
    {loading ? <p className="fan-growth-empty-state">미션을 불러오는 중이에요.</p> : missions.map(mission => {
      const progress = Math.min(mission.currentValue, mission.targetValue)
      return <article className="fan-mission-row" key={mission.id}>
        <div><strong>{mission.title}</strong><small>{mission.description ?? '팬 활동 미션'}</small><progress value={progress} max={mission.targetValue} aria-label={`${mission.title} 진행률`} /></div>
        <span>{progress}/{mission.targetValue}</span>
        {mission.completed && <button type="button" onClick={() => void claim(mission)}>보상 받기</button>}
      </article>
    })}
    {message && <p className="fan-growth-message" role="status">{message}</p>}
  </section>
}
