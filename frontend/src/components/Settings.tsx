import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apiFetch, resolveApiUrl, type CatalogArtist, type CatalogMember, type CurrentUser } from '../api/client'
import { demoCardImage, keepCardVisual } from '../utils/cardVisual'
function useDialogFocus(open: boolean, closeSelector: string, dialogSelector: string): void {
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(closeSelector)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>(dialogSelector)
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], audio[controls]'))
        .filter(element => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      previousActiveElement.current?.focus()
      previousActiveElement.current = null
    }
  }, [closeSelector, dialogSelector, open])
}


export function Settings({ user, onUserUpdated, onLogout, onEvents }: { user: CurrentUser, onUserUpdated: (user: CurrentUser) => void, onLogout: () => Promise<void>, onEvents: () => void }) {
  const [busy, setBusy] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)
  const [preferenceAttempt, setPreferenceAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const [activePanel, setActivePanel] = useState<'profile' | 'favorites' | 'account' | 'info' | 'language' | 'support' | 'legal' | null>(null)
  const [nickname, setNickname] = useState(user.nickname ?? '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  useDialogFocus(Boolean(activePanel), '.settings-modal .modal-close', '.settings-modal[role="dialog"]')

  useEffect(() => {
    setPreferenceBusy(true)
    setPreferenceError(false)
    void apiFetch<{ ok: true, data: { emailEnabled: boolean } }>('/me/notification-preferences')
      .then(result => {
        setEmailEnabled(result.data.emailEnabled)
        setMessage('')
      })
      .catch(() => {
        setPreferenceError(true)
        setMessage('알림 설정을 불러오지 못했습니다.')
      })
      .finally(() => setPreferenceBusy(false))
  }, [preferenceAttempt])

  useEffect(() => {
    if (!activePanel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activePanel])

  useEffect(() => {
    const avatar = document.querySelector<HTMLElement>('.profile-button .avatar')
    if (!avatar) return
    const imageUrl = resolveApiUrl(user.profileImageUrl)
    avatar.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : ''
    avatar.classList.toggle('avatar-image', Boolean(imageUrl))
    avatar.textContent = imageUrl ? '' : (user.nickname ?? '팬').slice(0, 1)
  }, [user.nickname, user.profileImageUrl])

  const logout = async () => { setBusy(true); await onLogout(); setBusy(false) }
  const updateEmailPreference = async (enabled: boolean) => {
    setPreferenceBusy(true)
    setMessage('')
    try {
      const result = await apiFetch<{ ok: true, data: { emailEnabled: boolean } }>('/me/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ emailEnabled: enabled }),
      })
      setEmailEnabled(result.data.emailEnabled)
      setPreferenceError(false)
    } catch (error) {
      setPreferenceError(true)
      setMessage(error instanceof Error ? error.message : '알림 설정을 저장하지 못했습니다.')
    } finally { setPreferenceBusy(false) }
  }

  const saveProfile = async () => {
    if (!nickname.trim()) { setMessage('닉네임을 입력해 주세요.'); return }
    setProfileBusy(true)
    setProfileError('')
    try {
      const result = await apiFetch<{ ok: true, data: { nickname: string, favoriteArtistIds: string[], favoriteMemberIds: string[], onboardingCompleted: boolean } }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname: nickname.trim(), favoriteArtistIds: user.favoriteArtistIds, favoriteMemberIds: user.favoriteMemberIds }),
      })
      onUserUpdated({ ...user, ...result.data })
      setActivePanel(null)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필을 저장하지 못했습니다.')
    } finally { setProfileBusy(false) }
  }

  const roleLabel = user.role === 'fan' ? '팬' : user.role === 'artist' ? '아티스트' : '관리자'
  return <><button className="profile profile-button" onClick={() => { setNickname(user.nickname ?? ''); setProfileError(''); setActivePanel('profile') }}><div className="avatar">{(user.nickname ?? '팬').slice(0, 1)}</div><div className="profile-text"><b>{user.nickname || '팬포리오'}</b><small>{user.email ?? '이메일 미등록'}</small></div><span>›</span></button><div className="settings-list"><button onClick={() => { setNickname(user.nickname ?? ''); setProfileError(''); setActivePanel('profile') }}><SettingIcon name="profile" /><span>프로필</span><strong>›</strong></button><button onClick={() => setActivePanel('favorites')}><SettingIcon name="favorites" /><span>관심 아티스트</span><strong>›</strong></button><button onClick={() => setActivePanel('account')}><SettingIcon name="account" /><span>계정</span><strong>›</strong></button><button className="settings-events-link" onClick={onEvents}><SettingIcon name="events" /><span>이벤트</span><strong>›</strong></button><label className="preference-row" aria-busy={preferenceBusy}><SettingIcon name="notifications" /><span className="preference-copy"><b>알림 설정</b><small>{preferenceBusy ? '설정을 저장하는 중이에요.' : '새 카드와 드롭 소식을 이메일로 받아요.'}</small></span><input type="checkbox" aria-label="이메일 알림 받기" checked={emailEnabled} disabled={preferenceBusy} onChange={event => void updateEmailPreference(event.target.checked)} /></label><button onClick={() => setActivePanel('language')}><SettingIcon name="language" /><span>언어 설정</span><strong>한국어</strong></button><button onClick={() => setActivePanel('support')}><SettingIcon name="support" /><span>고객센터</span><strong>›</strong></button><button onClick={() => setActivePanel('legal')}><SettingIcon name="legal" /><span>이용 약관</span><strong>›</strong></button><button onClick={() => setActivePanel('info')}><SettingIcon name="info" /><span>앱 정보</span><strong>›</strong></button></div>{preferenceError && <div className="inline-retry" role="alert"><span>알림 설정을 불러오지 못했어요.</span><button type="button" onClick={() => setPreferenceAttempt(value => value + 1)}>다시 시도</button></div>}{message && !preferenceError && <p className="form-message error-message">{message}</p>}<button className="logout" onClick={() => void logout()} disabled={busy}>{busy ? '로그아웃 중...' : '로그아웃'}</button>{activePanel === 'profile' && <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActivePanel(null) }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><button className="modal-close" aria-label="프로필 수정 닫기" onClick={() => setActivePanel(null)}>×</button><h2 id="profile-title">프로필 수정</h2><p className="muted">컬렉션에 표시될 닉네임을 설정하세요.</p><label className="field-label" htmlFor="settings-nickname">닉네임</label><input id="settings-nickname" value={nickname} maxLength={40} onChange={event => { setNickname(event.target.value); setProfileError('') }} />{profileError && <div className="inline-retry" role="alert"><span>{profileError}</span><button type="button" onClick={() => void saveProfile()}>다시 시도</button></div>}<button className="primary" disabled={!nickname.trim() || profileBusy} onClick={() => void saveProfile()}>{profileBusy ? '저장 중...' : '저장하기'}</button></div></div>}{activePanel === 'favorites' && <FavoriteArtistsPanel user={user} onUserUpdated={onUserUpdated} onClose={() => setActivePanel(null)} />}{activePanel === 'account' && <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActivePanel(null) }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="modal-close" aria-label="계정 정보 닫기" onClick={() => setActivePanel(null)}>×</button><h2 id="account-title">계정 정보</h2><dl className="account-details"><div><dt>이메일</dt><dd>{user.email ?? '이메일 미등록'}</dd></div><div><dt>권한</dt><dd>{roleLabel}</dd></div><div><dt>계정 ID</dt><dd>{user.id}</dd></div></dl></div></div>}{activePanel === 'info' && <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setActivePanel(null) }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="app-info-title"><button className="modal-close" aria-label="앱 정보 닫기" onClick={() => setActivePanel(null)}>×</button><h2 id="app-info-title">앱 정보</h2><p className="muted">Fanfolio 디지털 카드 컬렉션</p><dl className="account-details"><div><dt>버전</dt><dd>0.2.0 MVP</dd></div><div><dt>언어</dt><dd>한국어</dd></div></dl></div></div>}{activePanel === 'language' && <SettingsInfoPanel title="언어 설정" onClose={() => setActivePanel(null)}><p className="muted">현재 Fanfolio는 한국어로 제공됩니다.</p><button className="language-option active">한국어 <span>✓</span></button></SettingsInfoPanel>}{activePanel === 'support' && <SettingsInfoPanel title="고객센터" onClose={() => setActivePanel(null)}><p className="muted">카드 등록이나 계정 이용에 문제가 있나요?</p><a className="support-link" href="mailto:support@fanfolio.example">support@fanfolio.example</a></SettingsInfoPanel>}{activePanel === 'legal' && <SettingsInfoPanel title="이용 약관" onClose={() => setActivePanel(null)}><p className="muted">Fanfolio 서비스 이용 약관과 개인정보 처리방침을 확인할 수 있습니다.</p><div className="legal-note">MVP 테스트 서비스에서는 실제 약관 문서가 연결되지 않았습니다.</div></SettingsInfoPanel>}</>
}

function FavoriteArtistsPanel({ user, onUserUpdated, onClose }: { user: CurrentUser, onUserUpdated: (user: CurrentUser) => void, onClose: () => void }) {
  const [artists, setArtists] = useState<CatalogArtist[]>([])
  const [members, setMembers] = useState<CatalogMember[]>([])
  const [artistId, setArtistId] = useState(user.favoriteArtistIds[0] ?? '')
  const [memberId, setMemberId] = useState(user.favoriteMemberIds[0] ?? '')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [artistLoading, setArtistLoading] = useState(true)
  const [artistError, setArtistError] = useState(false)
  const [artistAttempt, setArtistAttempt] = useState(0)
  const [memberLoading, setMemberLoading] = useState(false)
  const [memberError, setMemberError] = useState(false)
  const [memberAttempt, setMemberAttempt] = useState(0)

  useEffect(() => {
    setArtistLoading(true)
    setArtistError(false)
    void apiFetch<{ ok: true, data: { items: CatalogArtist[] } }>('/catalog/artists')
      .then(result => {
        setArtists(result.data.items)
        setArtistId(current => result.data.items.some(item => item.id === current) ? current : (result.data.items[0]?.id ?? ''))
        setMessage('')
      })
      .catch(() => {
        setArtistError(true)
        setMessage('아티스트 목록을 불러오지 못했습니다.')
      })
      .finally(() => setArtistLoading(false))
  }, [artistAttempt])

  useEffect(() => {
    if (!artistId) { setMembers([]); setMemberId(''); return }
    setMemberLoading(true)
    setMemberError(false)
    void apiFetch<{ ok: true, data: { items: CatalogMember[] } }>(`/catalog/members?artistId=${encodeURIComponent(artistId)}`)
      .then(result => {
        setMembers(result.data.items)
        setMemberId(current => result.data.items.some(item => item.id === current) ? current : (result.data.items[0]?.id ?? ''))
        setMessage('')
      })
      .catch(() => {
        setMemberError(true)
        setMessage('멤버 목록을 불러오지 못했습니다.')
      })
      .finally(() => setMemberLoading(false))
  }, [artistId, memberAttempt])

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await apiFetch<{ ok: true, data: { nickname: string, favoriteArtistIds: string[], favoriteMemberIds: string[], onboardingCompleted: boolean } }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname: user.nickname, favoriteArtistIds: artistId ? [artistId] : [], favoriteMemberIds: memberId ? [memberId] : [] }),
      })
      onUserUpdated({ ...user, ...result.data })
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '관심 아티스트를 저장하지 못했습니다.')
    } finally { setBusy(false) }
  }

  const filteredArtists = artists.filter(artist => artist.name.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal settings-modal favorite-panel" role="dialog" aria-modal="true" aria-labelledby="favorite-title"><button className="modal-close" aria-label="관심 아티스트 닫기" onClick={onClose}>×</button><h2 id="favorite-title">관심 아티스트</h2><p className="muted">새 카드와 소식을 받을 아티스트를 선택하세요.</p><label className="field-label" htmlFor="favorite-artist-search">아티스트 검색</label><input id="favorite-artist-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="아티스트 이름을 검색하세요" disabled={artistLoading} />{artistLoading && <div className="catalog-loading" role="status">아티스트를 불러오는 중이에요…</div>}{!artistLoading && <div className="artist-grid favorite-artist-grid">{filteredArtists.map(artist => <button type="button" className={artistId === artist.id ? 'artist-choice selected' : 'artist-choice'} key={artist.id} onClick={() => setArtistId(artist.id)}><img src={demoCardImage(resolveApiUrl(artist.imageUrl), artist.id)} alt="" onError={event => keepCardVisual(event, artist.id)} /><span>{artist.name}</span>{artistId === artist.id && <b aria-hidden="true">✓</b>}</button>)}</div>}{artistError && <div className="inline-retry" role="alert"><span>아티스트 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setArtistAttempt(value => value + 1)}>다시 시도</button></div>}<p className="selection-caption">{artists.find(artist => artist.id === artistId)?.name ?? '아티스트'}의 멤버</p>{memberLoading && <div className="catalog-loading" role="status">멤버를 불러오는 중이에요…</div>}{!memberLoading && <div className="member-row">{members.map(item => <button type="button" className={memberId === item.id ? 'member selected' : 'member'} key={item.id} onClick={() => setMemberId(item.id)}>{item.name}</button>)}</div>}{memberError && <div className="inline-retry" role="alert"><span>멤버 목록을 불러오지 못했어요.</span><button type="button" onClick={() => setMemberAttempt(value => value + 1)}>다시 시도</button></div>}{message && !artistError && !memberError && <p className="form-message error-message">{message}</p>}<button className="primary" disabled={busy || !artistId || !memberId || artistLoading || memberLoading} onClick={() => void save()}>{busy ? '저장 중...' : '관심 설정 저장하기'}</button></div></div>
}

function SettingsInfoPanel({ title, onClose, children }: { title: string, onClose: () => void, children: ReactNode }) {
  const content = title === '이용 약관' ? <div className="settings-document"><div className="legal-note">아래 내용은 MVP 검수용 서비스 안내입니다. 정식 출시 전 법률 검토와 최종 약관 고지가 필요합니다.</div><h3>서비스 이용 안내</h3><p>Fanfolio는 공식 디지털 카드를 코드 또는 QR로 등록하고, 개인 컬렉션으로 관리하는 서비스입니다.</p><h3>계정과 카드 등록</h3><p>이메일, 닉네임, 관심 아티스트 정보가 계정에 저장됩니다. 카드는 본인이 받은 코드나 QR을 통해서만 등록할 수 있습니다.</p><h3>안전한 이용</h3><p>다른 사람의 코드나 계정에 무단으로 접근하거나 서비스를 방해하는 행위는 제한될 수 있습니다.</p><h3>개인정보 요약</h3><p>수집한 정보는 로그인, 컬렉션 제공, 관심 아티스트와 카드 소식 안내를 위해 사용합니다. 보관 기간과 파기 방법은 정식 개인정보 처리방침에서 확정해 안내합니다.</p><h3>문의</h3><p>이용 중 문제가 있으면 <a className="support-link" href="mailto:support@fanfolio.example">support@fanfolio.example</a>로 알려 주세요.</p></div> : children
  return <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-info-title"><button className="modal-close" aria-label={`${title} 닫기`} onClick={onClose}>×</button><h2 id="settings-info-title">{title}</h2>{content}</div></div>
}


function SettingIcon({ name }: { name: 'profile' | 'favorites' | 'account' | 'events' | 'notifications' | 'language' | 'support' | 'legal' | 'info' }) {
  const paths = {
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
    favorites: 'm12 20-1.45-1.32C5.4 14.1 2 11 2 7.25A4.25 4.25 0 0 1 6.25 3c1.5 0 2.93.7 3.75 1.8A4.7 4.7 0 0 1 13.75 3 4.25 4.25 0 0 1 18 7.25c0 3.75-3.4 6.85-8.55 11.43L12 20Z',
    account: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM8 8h8M8 12h8M8 16h5',
    events: 'M4 5h16v15H4zM8 3v4M16 3v4M4 10h16',
    notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    language: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    support: 'M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 13v6h3v-6H4ZM12 21h3',
    legal: 'M6 3h9l3 3v15H6V3ZM15 3v4h3M9 11h6M9 15h6',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 10v6M12 7h.01',
  } as const
  return <span className="setting-row-icon" aria-hidden="true"><svg className="nav-icon" viewBox="0 0 24 24"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></span>
}
