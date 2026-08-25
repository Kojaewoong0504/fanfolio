import type { ReactNode } from 'react'

type DetailTopBarProps = {
  title: string
  onBack: () => void
  backLabel?: string
  right?: ReactNode
}

export function DetailTopBar({ title, onBack, backLabel = '뒤로 가기', right }: DetailTopBarProps) {
  return <header className="detail-topbar">
    <button type="button" className="detail-topbar-back" aria-label={backLabel} onClick={onBack}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
    </button>
    <div className="detail-topbar-title">
      <h1>{title}</h1>
    </div>
    <div className="detail-topbar-right">{right ?? <span aria-hidden="true" />}</div>
  </header>
}
