import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

import { apiFetch, changeFanPassword, resolveApiUrl, type CatalogArtist, type CatalogMember, type CurrentUser, type FanProgression } from '../api/client'
import profileDecorations from '../assets/profile-decorations-generated.png'
import { ProfileAvatar } from './ProfileAvatar'

type MyPanel = 'notifications' | 'language' | 'support' | 'terms' | 'privacy' | null
type SettingsInfoScreen = 'language' | 'support' | 'terms' | 'privacy' | null

type ProfileForm = {
  nickname: string
  artistId: string
  memberId: string
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
  onBack,
}: {
  screen: Exclude<SettingsInfoScreen, null>
  language: 'ko' | 'en'
  onLanguageChange: (language: 'ko' | 'en') => void
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
            <button type="button"><span><strong>자주 묻는 질문</strong><small>많이 찾는 도움말을 확인해 보세요.</small></span><Chevron /></button>
            <button type="button"><span><strong>문의하기</strong><small>support@fanfolio.app</small></span><Chevron /></button>
          </section>
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
  onNotificationSettings?: () => void
}) {
  const [panel, setPanel] = useState<MyPanel>(null)
  const [infoScreen, setInfoScreen] = useState<SettingsInfoScreen>(null)
  const [language, setLanguage] = useState<'ko' | 'en'>('ko')
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => ({
    nickname: user.nickname ?? '',
    artistId: user.favoriteArtistIds[0] ?? '',
    memberId: user.favoriteMemberIds[0] ?? '',
    profileImageUrl: user.profileImageUrl,
  }))
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const profileImageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    setProfileForm({
      nickname: user.nickname ?? '',
      artistId: user.favoriteArtistIds[0] ?? '',
      memberId: user.favoriteMemberIds[0] ?? '',
      profileImageUrl: user.profileImageUrl,
    })
    setProfileMessage('')
    setProfileLoading(true)
    void apiFetch<{ ok: true; data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => setArtists(result.data.items))
      .catch(() => setProfileMessage('아티스트 목록을 불러오지 못했어요.'))
      .finally(() => setProfileLoading(false))
  }, [profileOpen, user.favoriteArtistIds, user.favoriteMemberIds, user.nickname, user.profileImageUrl])

  useEffect(() => {
    if (!profileOpen || !profileForm.artistId) {
      setMembers([])
      return
    }
    void apiFetch<{ ok: true; data: { items: CatalogMember[] } }>(`/catalog/members?artistId=${encodeURIComponent(profileForm.artistId)}`)
      .then(result => {
        setMembers(result.data.items)
        setProfileForm(current => ({
          ...current,
          memberId: result.data.items.some(item => item.id === current.memberId) ? current.memberId : (result.data.items[0]?.id ?? ''),
        }))
      })
      .catch(() => setProfileMessage('멤버 목록을 불러오지 못했어요.'))
  }, [profileForm.artistId, profileOpen])

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
    if (!profileForm.artistId || !profileForm.memberId) {
      setProfileMessage('아티스트와 멤버를 선택해 주세요.')
      return
    }
    setProfileSaving(true)
    setProfileMessage('')
    try {
      const result = await apiFetch<{ ok: true; data: { nickname: string; favoriteArtistIds: string[]; favoriteMemberIds: string[]; profileImageUrl: string | null; onboardingCompleted: boolean } }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: profileForm.nickname.trim(),
          favoriteArtistIds: [profileForm.artistId],
          favoriteMemberIds: [profileForm.memberId],
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
  const selectedArtist = artists.find(artist => artist.id === profileForm.artistId)
  const selectedMember = members.find(member => member.id === profileForm.memberId)

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
          <button className="my-setting-row" type="button" onClick={() => onNotificationSettings ? onNotificationSettings() : setPanel('notifications')}>
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

      {infoScreen && <SettingsInfoScreenView screen={infoScreen} language={language} onLanguageChange={setLanguage} onBack={() => setInfoScreen(null)} />}

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
              <label htmlFor="profile-edit-artist">좋아하는 아티스트</label>
              <div className="profile-select-card">
                {selectedArtist ? <img src={resolveApiUrl(selectedArtist.imageUrl)} alt="" /> : <span className="profile-select-avatar">♪</span>}
                <span className="profile-select-copy"><small>선택한 아티스트</small><strong>{selectedArtist?.name ?? '아티스트를 선택해 주세요'}</strong></span>
                <Chevron />
                <select id="profile-edit-artist" value={profileForm.artistId} disabled={profileLoading} onChange={event => setProfileForm(current => ({ ...current, artistId: event.target.value, memberId: '' }))} aria-label="좋아하는 아티스트">
                  <option value="">아티스트를 선택해 주세요</option>
                  {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
                </select>
              </div>
              <label htmlFor="profile-edit-member">좋아하는 멤버</label>
              <div className="profile-select-card">
                <span className="profile-select-avatar member">{selectedMember?.name.slice(0, 1) ?? '♪'}</span>
                <span className="profile-select-copy"><small>선택한 멤버</small><strong>{selectedMember?.name ?? '멤버를 선택해 주세요'}</strong></span>
                <Chevron />
                <select id="profile-edit-member" value={profileForm.memberId} disabled={profileLoading || members.length === 0} onChange={event => setProfileForm(current => ({ ...current, memberId: event.target.value }))} aria-label="좋아하는 멤버">
                  <option value="">멤버를 선택해 주세요</option>
                  {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </div>
              {profileMessage && <p className="profile-edit-message" role="alert">{profileMessage}</p>}
            </section>
            {user.hasPassword ? <button type="button" className="profile-security-link" onClick={() => { setPasswordMessage(''); setPasswordOpen(true) }}>계정 보안 · 비밀번호 변경</button> : <p className="profile-social-security">소셜 계정에서 비밀번호와 보안을 관리해요.</p>}
            <button type="button" className="profile-save-button" onClick={() => void saveProfile()} disabled={profileSaving || profileLoading}>{profileSaving ? '저장 중...' : '저장하고 완료'}</button>
            <button type="button" className="profile-later-button" onClick={closeProfileEditor}>나중에 하기</button>
          </div>}
        </section>
      )}

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
