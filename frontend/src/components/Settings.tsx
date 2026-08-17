import { useState, type ReactNode } from 'react'

import type { CurrentUser } from '../api/client'
import dreamscapeGroup from '../assets/login/dreamscape-group.png'

type MyPanel = 'notifications' | 'language' | 'support' | 'terms' | 'privacy' | null

function MyIcon({ children }: { children: ReactNode }) {
  return (
    <span className="my-setting-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

function Chevron() {
  return (
    <svg className="my-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function Settings({
  user,
  onUserUpdated,
  onLogout,
  onEvents,
  onNotificationSettings,
}: {
  user: CurrentUser
  onUserUpdated: (user: CurrentUser) => void
  onLogout: () => Promise<void>
  onEvents: () => void
  onNotificationSettings?: () => void
}) {
  const [panel, setPanel] = useState<MyPanel>(null)
  void user
  void onUserUpdated

  const panelTitle = {
    notifications: '알림 설정',
    language: '언어 설정',
    support: '고객센터',
    terms: '이용 약관',
    privacy: '개인정보 처리방침',
  }[panel ?? 'notifications']

  return (
    <section className="screen settings-screen">
      <div className="my-page">
        <article className="my-profile-card">
          <button className="my-profile-main" type="button" aria-label="프로필 보기">
            <img className="my-profile-image" src={dreamscapeGroup} alt="드림스케이프" />
            <span className="my-profile-copy">
              <strong>드리미</strong>
              <span className="my-profile-handle">@dreamy_0412</span>
              <span className="my-level-pill">
                <span aria-hidden="true">★</span>
                <b>LV. 12</b>
                <i aria-hidden="true" />
                <span>드림메이트</span>
              </span>
            </span>
            <Chevron />
          </button>

          <div className="my-profile-stats" aria-label="프로필 통계">
            <span><small>팔로잉</small><b>8</b></span>
            <span><small>팔로워</small><b>1,248</b></span>
            <span><small>보유 포인트</small><b><em>P</em> 3,450</b></span>
          </div>
        </article>

        <div className="my-settings-list">
          <button className="my-setting-row" type="button" onClick={onEvents}>
            <MyIcon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></MyIcon>
            <span>나의 이벤트</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => onNotificationSettings ? onNotificationSettings() : setPanel('notifications')}>
            <MyIcon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></MyIcon>
            <span>알림 설정</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setPanel('language')}>
            <MyIcon><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></MyIcon>
            <span>언어 설정</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setPanel('support')}>
            <MyIcon><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z" /></MyIcon>
            <span>고객센터</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setPanel('terms')}>
            <MyIcon><path d="M6 2h8l4 4v16H6zM14 2v5h5" /></MyIcon>
            <span>이용 약관</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setPanel('privacy')}>
            <MyIcon><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><rect x="9" y="10" width="6" height="5" rx="1" /><path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" /></MyIcon>
            <span>개인정보 처리방침</span>
            <Chevron />
          </button>
        </div>

        <button className="my-logout" type="button" onClick={() => void onLogout()}>로그아웃</button>
      </div>

      {panel && (
        <div className="my-panel-backdrop" role="presentation" onClick={() => setPanel(null)}>
          <section className="my-panel" role="dialog" aria-modal="true" aria-label={panelTitle} onClick={(event) => event.stopPropagation()}>
            <header><strong>{panelTitle}</strong><button type="button" onClick={() => setPanel(null)} aria-label="닫기">×</button></header>
            <p>{panel === 'language' ? '현재 언어는 한국어입니다.' : '해당 메뉴의 상세 내용은 준비 중입니다.'}</p>
          </section>
        </div>
      )}
    </section>
  )
}
