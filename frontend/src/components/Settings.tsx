import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

import { apiFetch, changeFanPassword, deleteFanAccount, exportPersonalData, getConsentHistory, recordConsent, resolveApiUrl, type CatalogArtist, type CatalogMember, type ConsentRecord, type CurrentUser, type FanProgression } from '../api/client'
import profileDecorations from '../assets/profile-decorations-generated.png'
import { ProfileAvatar } from './ProfileAvatar'

type SettingsInfoScreen = 'language' | 'support' | 'terms' | 'privacy' | null

type ProfileForm = {
  nickname: string
  artistIds: string[]
  memberIds: string[]
  profileImageUrl: string | null
}

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

function SettingsInfoScreenView({
  screen,
  language,
  onLanguageChange,
  supportMode,
  supportSubject,
  supportCategory,
  supportBody,
  supportSaving,
  supportMessage,
  onSupportModeChange,
  onSupportSubjectChange,
  onSupportCategoryChange,
  onSupportBodyChange,
  onSupportSubmit,
  onPrivacyExport,
  onAccountDelete,
  privacyMessage,
  consentHistory,
  consentLoading,
  onRecordConsent,
  onBack,
}: {
  screen: Exclude<SettingsInfoScreen, null>
  language: 'ko' | 'en'
  onLanguageChange: (language: 'ko' | 'en') => void
  supportMode: 'faq' | 'form'
  supportSubject: string
  supportCategory: 'general' | 'card' | 'trade' | 'order' | 'report'
  supportBody: string
  supportSaving: boolean
  supportMessage: string
  onSupportModeChange: (mode: 'faq' | 'form') => void
  onSupportSubjectChange: (subject: string) => void
  onSupportCategoryChange: (category: 'general' | 'card' | 'trade' | 'order' | 'report') => void
  onSupportBodyChange: (body: string) => void
  onSupportSubmit: () => void
  onPrivacyExport: () => void
  onAccountDelete: (confirmation: string) => void
  privacyMessage: string
  consentHistory: ConsentRecord[]
  consentLoading: boolean
  onRecordConsent: (policyKey: ConsentRecord['policyKey']) => void
  onBack: () => void
}) {
  const titles = {
    language: '언어 설정',
    support: '고객센터',
    terms: '이용 약관',
    privacy: '개인정보 처리방침',
  }

  return (
    <section className="settings-info-screen" aria-label={titles[screen]}>
      <header className="settings-info-topbar">
        <button type="button" onClick={onBack} aria-label="마이페이지로 돌아가기">‹</button>
        <strong>{titles[screen]}</strong>
        <span aria-hidden="true" />
      </header>

      {screen === 'language' && (
        <div className="settings-info-content">
          <div className="settings-info-intro">
            <span className="settings-info-icon" aria-hidden="true">Aa</span>
            <h2>사용할 언어를 선택해 주세요</h2>
            <p>팬폴리오에서 표시할 언어를 설정할 수 있어요.</p>
          </div>
          <section className="settings-language-options" aria-label="언어 선택">
            {([['ko', '한국어', 'Korean'], ['en', 'English', 'English']] as const).map(([value, label, caption]) => (
              <button key={value} type="button" className={language === value ? 'settings-language-option is-selected' : 'settings-language-option'} onClick={() => onLanguageChange(value)}>
                <span><strong>{label}</strong><small>{caption}</small></span>
                <i aria-hidden="true" />
              </button>
            ))}
          </section>
          <p className="settings-info-note">언어 변경은 다음 화면부터 적용됩니다.</p>
        </div>
      )}

      {screen === 'support' && (
        <div className="settings-info-content">
          <div className="settings-support-hero">
            <span className="settings-info-icon" aria-hidden="true">?</span>
            <h2>무엇을 도와드릴까요?</h2>
            <p>팬폴리오 이용 중 궁금한 점을 확인해 보세요.</p>
          </div>
          <section className="settings-info-card settings-support-list" aria-label="고객센터 메뉴">
            <button type="button" className={supportMode === 'faq' ? 'is-selected' : ''} onClick={() => onSupportModeChange('faq')}><span><strong>자주 묻는 질문</strong><small>많이 찾는 도움말을 확인해 보세요.</small></span><Chevron /></button>
            <button type="button" className={supportMode === 'form' ? 'is-selected' : ''} onClick={() => onSupportModeChange('form')}><span><strong>문의하기</strong><small>답변은 알림과 이메일로 안내해 드려요.</small></span><Chevron /></button>
          </section>
          {supportMode === 'faq' ? <section className="settings-info-card settings-support-faq" aria-label="자주 묻는 질문">
            <details><summary>카드 등록이 완료되지 않아요</summary><p>QR 코드, 인증 코드, 카드 사진 중 하나를 선택해 다시 시도해 주세요. 계속 실패하면 문의를 남겨 주세요.</p></details>
            <details><summary>거래 제안은 어떻게 확인하나요?</summary><p>보관함에서 원하는 카드를 등록하면 거래 제안 화면에서 먼저 확인할 수 있어요.</p></details>
            <details><summary>알림을 받지 못했어요</summary><p>알림 설정과 브라우저 권한을 확인해 주세요. 중요한 안내는 알림함에서도 확인할 수 있습니다.</p></details>
          </section> : <form className="settings-info-card settings-support-form" aria-label="고객센터 문의 폼" onSubmit={event => { event.preventDefault(); onSupportSubmit() }}>
            <label htmlFor="support-category">문의 유형</label>
            <select id="support-category" value={supportCategory} onChange={event => onSupportCategoryChange(event.target.value as typeof supportCategory)}>
              <option value="general">일반 문의</option><option value="card">카드 등록</option><option value="trade">거래</option><option value="order">주문·교환</option><option value="report">신고</option>
            </select>
            <label htmlFor="support-subject">제목</label>
            <input id="support-subject" value={supportSubject} onChange={event => onSupportSubjectChange(event.target.value)} maxLength={160} required />
            <label htmlFor="support-body">문의 내용</label>
            <textarea id="support-body" value={supportBody} onChange={event => onSupportBodyChange(event.target.value)} maxLength={4000} rows={6} required />
            <button className="settings-support-submit" type="submit" disabled={supportSaving || supportSubject.trim().length < 2 || supportBody.trim().length < 2}>{supportSaving ? '접수 중...' : '문의 접수하기'}</button>
            {supportMessage && <p className="settings-info-note" role="status">{supportMessage}</p>}
          </form>}
          <section className="settings-info-card settings-support-hours">
            <strong>운영 안내</strong>
            <p>평일 10:00 - 18:00</p>
            <small>주말 및 공휴일은 답변이 늦어질 수 있어요.</small>
          </section>
        </div>
      )}

      {(screen === 'terms' || screen === 'privacy') && (
        <article className="settings-info-content settings-legal-content">
          <p className="settings-legal-date">시행일 2026년 8월 18일</p>
          {screen === 'terms' ? <>
            <h2>팬폴리오 서비스 이용 약관</h2>
            <p>팬폴리오는 좋아하는 아티스트의 콘텐츠와 이벤트를 한곳에서 안전하게 이용할 수 있는 팬 서비스입니다.</p>
            <h3>제1조 목적</h3>
            <p>이 약관은 팬폴리오가 제공하는 서비스의 이용 조건과 절차, 회원과 서비스 제공자의 권리와 의무를 정합니다.</p>
            <h3>제2조 서비스 이용</h3>
            <p>회원은 자신의 계정으로 서비스를 이용하며, 다른 사람의 개인정보나 권리를 침해하는 행위를 해서는 안 됩니다.</p>
            <h3>제3조 콘텐츠와 이벤트</h3>
            <p>서비스에서 제공되는 콘텐츠의 이용 범위는 각 콘텐츠와 이벤트에 안내된 조건을 따릅니다.</p>
          </> : <>
            <h2>개인정보 처리방침</h2>
            <p>팬폴리오는 회원의 개인정보를 소중하게 보호하고 관련 법령에 따라 안전하게 처리합니다.</p>
            <h3>개인정보의 수집 및 이용</h3>
            <p>회원가입과 서비스 제공을 위해 이메일, 닉네임, 관심 아티스트 정보를 수집하며, 안내된 목적 외에는 사용하지 않습니다.</p>
            <h3>보관 및 파기</h3>
            <p>개인정보는 보관 목적이 달성되거나 회원이 삭제를 요청한 경우 지체 없이 파기합니다.</p>
            <h3>문의</h3>
            <p>개인정보 처리방침에 관한 문의는 support@fanfolio.app으로 보내 주세요.</p>
            <section className="settings-info-card settings-privacy-actions" aria-label="개인정보 권리 행사">
              <strong>내 정보 관리</strong>
              <p>내 서비스 이용 정보를 JSON 파일로 내려받거나 계정을 삭제할 수 있어요.</p>
              <button type="button" onClick={onPrivacyExport}>개인정보 내보내기</button>
              <label htmlFor="account-delete-confirmation">계정 삭제 확인 문구</label>
              <input id="account-delete-confirmation" placeholder="DELETE MY ACCOUNT" onChange={event => { event.currentTarget.dataset.confirmation = event.target.value }} />
              <button type="button" className="settings-danger-action" onClick={event => onAccountDelete(event.currentTarget.parentElement?.querySelector<HTMLInputElement>('#account-delete-confirmation')?.value ?? '')}>계정 삭제</button>
              {privacyMessage && <p className="settings-info-note" role="status">{privacyMessage}</p>}
            </section>
            <section className="settings-info-card settings-consent-history" aria-label="개인정보 동의 이력">
              <strong>동의 이력</strong>
              <p>약관과 개인정보 처리방침에 대한 동의·철회 기록을 확인할 수 있어요.</p>
              {consentLoading ? <p role="status">동의 이력을 불러오는 중이에요.</p> : consentHistory.length ? <ul>{consentHistory.map(record => <li key={record.id}><span>{record.policyKey === 'terms' ? '이용 약관' : record.policyKey === 'privacy' ? '개인정보 처리방침' : '마케팅 알림'} · v{record.policyVersion}</span><small>{record.granted ? '동의' : '철회'} · {new Date(record.createdAt).toLocaleString('ko-KR')}</small></li>)}</ul> : <p>아직 기록된 동의 이력이 없어요.</p>}
              <div className="settings-consent-actions"><button type="button" onClick={() => onRecordConsent('terms')}>이용 약관 동의 기록</button><button type="button" onClick={() => onRecordConsent('privacy')}>개인정보 동의 기록</button></div>
            </section>
          </>}
        </article>
      )}
    </section>
  )
}

export function Settings({
  user,
  progression,
  onUserUpdated,
  onLogout,
  onEvents,
  onNotificationSettings,
}: {
  user: CurrentUser
  progression: FanProgression | null
  onUserUpdated: (user: CurrentUser) => void
  onLogout: () => Promise<void>
  onEvents: () => void
  onNotificationSettings: () => void
}) {
  const [infoScreen, setInfoScreen] = useState<SettingsInfoScreen>(null)
  const [supportMode, setSupportMode] = useState<'faq' | 'form'>('faq')
  const [supportSubject, setSupportSubject] = useState('')
  const [supportCategory, setSupportCategory] = useState<'general' | 'card' | 'trade' | 'order' | 'report'>('general')
  const [supportBody, setSupportBody] = useState('')
  const [supportSaving, setSupportSaving] = useState(false)
  const [supportMessage, setSupportMessage] = useState('')
  const [privacyMessage, setPrivacyMessage] = useState('')
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([])
  const [consentLoading, setConsentLoading] = useState(false)
  const [language, setLanguage] = useState<'ko' | 'en'>('ko')
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => ({
    nickname: user.nickname ?? '',
    artistIds: user.favoriteArtistIds,
    memberIds: user.favoriteMemberIds,
    profileImageUrl: user.profileImageUrl,
  }))
  const [artistQuery, setArtistQuery] = useState('')
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [membersByArtist, setMembersByArtist] = useState<Record<string, CatalogMember[]>>({})
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const profileImageInputRef = useRef<HTMLInputElement>(null)

  const submitSupportTicket = async () => {
    setSupportSaving(true)
    setSupportMessage('')
    try {
      await apiFetch('/me/support-tickets', {
        method: 'POST',
        body: JSON.stringify({ category: supportCategory, subject: supportSubject.trim(), body: supportBody.trim() }),
      })
      setSupportSubject('')
      setSupportBody('')
      setSupportMessage('문의가 접수되었습니다. 답변이 등록되면 알림으로 알려드릴게요.')
    } catch {
      setSupportMessage('문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSupportSaving(false)
    }
  }

  const downloadPersonalData = async () => {
    try {
      const data = await exportPersonalData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fanfolio-personal-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setPrivacyMessage('개인정보 파일을 내려받았어요.')
    } catch {
      setPrivacyMessage('개인정보 내보내기에 실패했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  const requestAccountDeletion = async (confirmation: string) => {
    if (confirmation !== 'DELETE MY ACCOUNT') {
      setPrivacyMessage('계정 삭제 확인 문구를 정확히 입력해 주세요.')
      return
    }
    try {
      await deleteFanAccount(confirmation)
      await onLogout()
    } catch {
      setPrivacyMessage('계정 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  useEffect(() => {
    if (infoScreen !== 'privacy') return
    let cancelled = false
    setConsentLoading(true)
    void getConsentHistory().then(result => {
      if (!cancelled) setConsentHistory(result.data.items)
    }).catch(() => {
      if (!cancelled) setPrivacyMessage('동의 이력을 불러오지 못했어요.')
    }).finally(() => {
      if (!cancelled) setConsentLoading(false)
    })
    return () => { cancelled = true }
  }, [infoScreen])

  const saveConsent = async (policyKey: ConsentRecord['policyKey']) => {
    try {
      const result = await recordConsent(policyKey, '2026-08-18')
      setConsentHistory(history => [...history, result.data])
      setPrivacyMessage('동의 이력을 기록했어요.')
    } catch {
      setPrivacyMessage('동의 이력을 기록하지 못했어요.')
    }
  }

  useEffect(() => {
    if (!profileOpen) return
    setProfileForm({
      nickname: user.nickname ?? '',
      artistIds: user.favoriteArtistIds,
      memberIds: user.favoriteMemberIds,
      profileImageUrl: user.profileImageUrl,
    })
    setArtistQuery('')
    setProfileMessage('')
    setProfileLoading(true)
    void apiFetch<{ ok: true; data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => setArtists(result.data.items))
      .catch(() => setProfileMessage('아티스트 목록을 불러오지 못했어요.'))
      .finally(() => setProfileLoading(false))
  }, [profileOpen, user.favoriteArtistIds, user.favoriteMemberIds, user.nickname, user.profileImageUrl])

  useEffect(() => {
    if (!profileOpen || profileForm.artistIds.length === 0) {
      setMembersByArtist({})
      return
    }
    void Promise.all(profileForm.artistIds.map(async artistId => {
      const result = await apiFetch<{ ok: true; data: { items: CatalogMember[] } }>(`/catalog/members?artistId=${encodeURIComponent(artistId)}`)
      return [artistId, result.data.items] as const
    })).then(entries => {
      setMembersByArtist(Object.fromEntries(entries))
      const validMemberIds = new Set(entries.flatMap(([, items]) => items.map(item => item.id)))
      setProfileForm(current => ({ ...current, memberIds: current.memberIds.filter(id => validMemberIds.has(id)) }))
    })
      .catch(() => setProfileMessage('멤버 목록을 불러오지 못했어요.'))
  }, [profileForm.artistIds, profileOpen])

  const openProfileEditor = () => setProfileOpen(true)
  const closeProfileEditor = () => {
    if (profileSaving || passwordSaving) return
    setPasswordOpen(false)
    setProfileOpen(false)
  }

  const savePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordMessage('새 비밀번호는 8자 이상 입력해 주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('새 비밀번호가 서로 일치하지 않아요.')
      return
    }
    setPasswordSaving(true)
    setPasswordMessage('')
    try {
      await changeFanPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage('비밀번호를 변경했어요.')
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : '비밀번호를 변경하지 못했어요.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setProfileMessage('PNG, JPG, WEBP 이미지만 등록할 수 있어요.')
      return
    }
    if (file.size > 1_500_000) {
      setProfileMessage('프로필 이미지는 1.5MB 이하로 등록해 주세요.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileForm(current => ({ ...current, profileImageUrl: reader.result as string }))
        setProfileMessage('프로필 이미지를 선택했어요. 저장해 주세요.')
      }
    }
    reader.onerror = () => setProfileMessage('프로필 이미지를 읽지 못했어요.')
    reader.readAsDataURL(file)
  }

  const saveProfile = async () => {
    if (!profileForm.nickname.trim()) {
      setProfileMessage('닉네임을 입력해 주세요.')
      return
    }
    if (profileForm.artistIds.length === 0) {
      setProfileMessage('관심 아티스트를 한 팀 이상 선택해 주세요.')
      return
    }
    setProfileSaving(true)
    setProfileMessage('')
    try {
      const result = await apiFetch<{ ok: true; data: { nickname: string; favoriteArtistIds: string[]; favoriteMemberIds: string[]; profileImageUrl: string | null; onboardingCompleted: boolean } }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: profileForm.nickname.trim(),
          favoriteArtistIds: profileForm.artistIds,
          favoriteMemberIds: profileForm.memberIds,
          profileImageUrl: profileForm.profileImageUrl,
        }),
      })
      onUserUpdated({ ...user, ...result.data })
      setProfileOpen(false)
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : '프로필을 저장하지 못했어요.')
    } finally {
      setProfileSaving(false)
    }
  }

  const nickname = user.nickname?.trim() || '팬'
  const level = progression?.level.level
  const followingCount = user.followingCount ?? user.favoriteArtistIds.length + user.favoriteMemberIds.length
  const followerCount = user.followerCount ?? 0
  const points = user.points ?? 0
  const selectedArtists = artists.filter(artist => profileForm.artistIds.includes(artist.id))
  const filteredArtists = artists.filter(artist => artist.name.toLowerCase().includes(artistQuery.trim().toLowerCase()))

  return (
    <section className="screen settings-screen">
      <div className="my-page">
        <article className="my-profile-card">
          <button className="my-profile-main" type="button" aria-label="프로필 수정" onClick={openProfileEditor}>
            <ProfileAvatar className="my-profile-image" imageUrl={resolveApiUrl(user.profileImageUrl)} fallback={nickname} alt="프로필 이미지" />
            <span className="my-profile-copy">
              <strong>{nickname}</strong>
              <span className="my-profile-handle">{user.email ?? '이메일 미등록'}</span>
              <span className="my-level-pill">
                <span aria-hidden="true">★</span>
                <b>{level ? `LV. ${level}` : '레벨 확인 중'}</b>
                <i aria-hidden="true" />
                <span>팬 레벨</span>
              </span>
            </span>
            <Chevron />
          </button>

          <div className="my-profile-stats" aria-label="프로필 통계">
            <span><small>팔로잉</small><b>{followingCount.toLocaleString()}</b></span>
            <span><small>팔로워</small><b>{followerCount.toLocaleString()}</b></span>
            <span><small>보유 포인트</small><b><em>P</em> {points.toLocaleString()}</b></span>
          </div>
        </article>

        <div className="my-settings-list">
          <button className="my-setting-row" type="button" onClick={onEvents}>
            <MyIcon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></MyIcon>
            <span>나의 이벤트</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={onNotificationSettings}>
            <MyIcon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></MyIcon>
            <span>알림 설정</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setInfoScreen('language')}>
            <MyIcon><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></MyIcon>
            <span>언어 설정</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setInfoScreen('support')}>
            <MyIcon><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z" /></MyIcon>
            <span>고객센터</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setInfoScreen('terms')}>
            <MyIcon><path d="M6 2h8l4 4v16H6zM14 2v5h5" /></MyIcon>
            <span>이용 약관</span>
            <Chevron />
          </button>
          <button className="my-setting-row" type="button" onClick={() => setInfoScreen('privacy')}>
            <MyIcon><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><rect x="9" y="10" width="6" height="5" rx="1" /><path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" /></MyIcon>
            <span>개인정보 처리방침</span>
            <Chevron />
          </button>
        </div>

        <button className="my-logout" type="button" onClick={() => void onLogout()}>로그아웃</button>
      </div>

      {infoScreen && <SettingsInfoScreenView screen={infoScreen} language={language} onLanguageChange={setLanguage} supportMode={supportMode} supportSubject={supportSubject} supportCategory={supportCategory} supportBody={supportBody} supportSaving={supportSaving} supportMessage={supportMessage} onSupportModeChange={mode => { setSupportMode(mode); setSupportMessage('') }} onSupportSubjectChange={setSupportSubject} onSupportCategoryChange={setSupportCategory} onSupportBodyChange={setSupportBody} onSupportSubmit={() => void submitSupportTicket()} onPrivacyExport={() => void downloadPersonalData()} onAccountDelete={confirmation => void requestAccountDeletion(confirmation)} privacyMessage={privacyMessage} consentHistory={consentHistory} consentLoading={consentLoading} onRecordConsent={policyKey => void saveConsent(policyKey)} onBack={() => setInfoScreen(null)} />}

      {profileOpen && (
        <section className="profile-decorate-screen" aria-label={passwordOpen ? '비밀번호 변경' : '프로필 꾸미기'}>
          <header className="profile-decorate-topbar">
            <button type="button" onClick={closeProfileEditor} aria-label="마이페이지로 돌아가기">‹</button>
            <strong>{passwordOpen ? '비밀번호 변경' : '프로필 꾸미기'}</strong>
            {passwordOpen ? <button type="button" className="profile-decorate-save-top" onClick={() => setPasswordOpen(false)}>완료</button> : <button type="button" className="profile-decorate-save-top" onClick={() => void saveProfile()} disabled={profileSaving || profileLoading}>저장</button>}
          </header>
          {passwordOpen ? <div className="profile-password-screen-content">
            <div className="profile-password-intro">
              <span className="profile-password-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg></span>
              <h2>계정을 안전하게 지켜요</h2>
              <p>현재 비밀번호를 확인한 뒤 새 비밀번호를 설정해 주세요.</p>
            </div>
            <section className="profile-password-form" aria-label="비밀번호 변경 폼">
              <label htmlFor="profile-current-password">현재 비밀번호</label>
              <input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
              <label htmlFor="profile-new-password">새 비밀번호</label>
              <input id="profile-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} />
              <label htmlFor="profile-confirm-password">새 비밀번호 확인</label>
              <input id="profile-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              {passwordMessage && <p className={passwordMessage === '비밀번호를 변경했어요.' ? 'profile-edit-message success' : 'profile-edit-message'} role="alert">{passwordMessage}</p>}
              <button type="button" className="profile-save-button" onClick={() => void savePassword()} disabled={passwordSaving}>{passwordSaving ? '변경 중...' : '비밀번호 변경'}</button>
            </section>
          </div> : <div className="profile-decorate-content">
            <div className="profile-decorate-hero">
              <div className="profile-edit-image-wrap">
                <img className="profile-decorate-art" src={profileDecorations} alt="" aria-hidden="true" />
                <ProfileAvatar className="my-profile-detail-image" imageUrl={resolveApiUrl(profileForm.profileImageUrl)} fallback={profileForm.nickname || '팬'} alt="프로필 이미지" />
                <button type="button" className="profile-decorate-camera" onClick={() => profileImageInputRef.current?.click()} aria-label="프로필 이미지 변경">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
                    <circle cx="12" cy="12.5" r="3.2" />
                  </svg>
                </button>
                <input ref={profileImageInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="프로필 이미지 파일" onChange={handleProfileImageChange} />
              </div>
              <strong>{profileForm.nickname.trim() || '나의 팬 닉네임'}</strong>
              <span>{user.email ?? '소셜 로그인으로 가입'}</span>
            </div>
            <section className="profile-decorate-form" aria-labelledby="profile-decorate-form-title">
              <h2 id="profile-decorate-form-title" className="sr-only">프로필 정보</h2>
              <label htmlFor="profile-edit-nickname">닉네임</label>
              <input id="profile-edit-nickname" value={profileForm.nickname} maxLength={40} onChange={event => setProfileForm(current => ({ ...current, nickname: event.target.value }))} />
              <label>좋아하는 아티스트</label>
              <div className="profile-artist-search"><span aria-hidden="true">⌕</span><input value={artistQuery} onChange={event => setArtistQuery(event.target.value)} placeholder="아티스트 이름을 검색해 보세요" aria-label="아티스트 검색" disabled={profileLoading} /></div>
              <div className="profile-preference-grid" aria-label="좋아하는 아티스트 여러 개 선택">
                {filteredArtists.map(artist => {
                  const selected = profileForm.artistIds.includes(artist.id)
                  return <button type="button" key={artist.id} className={selected ? 'profile-preference-choice is-selected' : 'profile-preference-choice'} aria-pressed={selected} onClick={() => setProfileForm(current => ({ ...current, artistIds: selected ? current.artistIds.filter(id => id !== artist.id) : [...current.artistIds, artist.id], memberIds: selected ? current.memberIds.filter(memberId => !(membersByArtist[artist.id] ?? []).some(member => member.id === memberId)) : current.memberIds }))}><img src={resolveApiUrl(artist.imageUrl)} alt="" /><span>{artist.name}</span></button>
                })}
              </div>
              <label>좋아하는 멤버 <small className="profile-preference-hint">선택사항</small></label>
              <div className="profile-member-groups" aria-label="좋아하는 멤버 여러 개 선택">
                {selectedArtists.map(artist => <section key={artist.id}><strong>{artist.name}</strong><div className="profile-member-options">{(membersByArtist[artist.id] ?? []).map(member => <label key={member.id} className={profileForm.memberIds.includes(member.id) ? 'is-selected' : ''}><input type="checkbox" checked={profileForm.memberIds.includes(member.id)} onChange={() => setProfileForm(current => ({ ...current, memberIds: current.memberIds.includes(member.id) ? current.memberIds.filter(id => id !== member.id) : [...current.memberIds, member.id] }))} />{member.name}</label>)}</div></section>)}
              </div>
              {profileMessage && <p className="profile-edit-message" role="alert">{profileMessage}</p>}
            </section>
            {user.hasPassword ? <button type="button" className="profile-security-link" onClick={() => { setPasswordMessage(''); setPasswordOpen(true) }}>계정 보안 · 비밀번호 변경</button> : <p className="profile-social-security">소셜 계정에서 비밀번호와 보안을 관리해요.</p>}
            <button type="button" className="profile-save-button" onClick={() => void saveProfile()} disabled={profileSaving || profileLoading}>{profileSaving ? '저장 중...' : '저장하고 완료'}</button>
            <button type="button" className="profile-later-button" onClick={closeProfileEditor}>나중에 하기</button>
          </div>}
        </section>
      )}

    </section>
  )
}
