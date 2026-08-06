import { useEffect, useState } from 'react'
import './App.css'
import { apiFetch, type CollectionCard, type NotificationItem } from './api/client'

type Tab = 'collection' | 'discover' | 'alerts' | 'settings'

const cards = [
  { id: '#021', title: '컴백 기념 사인 카드', artist: '드림스케이프', member: '민호', image: '/src/assets/hero.png' },
  { id: '#022', title: 'NOVA 특별 카드', artist: '드림스케이프', member: '유준', image: '/src/assets/hero.png' },
  { id: '#023', title: '봄의 시작', artist: '드림스케이프', member: '하린', image: '/src/assets/hero.png' },
]

type Card = typeof cards[number]

function toCard(card: CollectionCard): Card {
  return {
    id: `#${String(card.serialNumber).padStart(3, '0')}`,
    title: card.name,
    artist: 'Fanfolio 아티스트',
    member: '공식 카드',
    image: card.imageUrl,
  }
}

function App() {
  const [tab, setTab] = useState<Tab>('collection')
  const [selectedCard, setSelectedCard] = useState<typeof cards[number] | null>(null)
  const [showRedeem, setShowRedeem] = useState(false)
  const [signedIn, setSignedIn] = useState(true)
  const [collectionCards, setCollectionCards] = useState<Card[]>(cards)
  const [apiConnected, setApiConnected] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const refreshCollection = async () => {
    try {
      const result = await apiFetch<{ ok: true, data: { cards: CollectionCard[] } }>('/me/collection')
      setCollectionCards(result.data.cards.map(toCard))
      setApiConnected(true)
    } catch {
      // Keep the reviewable sample state until the backend session is available.
      setApiConnected(false)
    }
  }

  useEffect(() => { void refreshCollection() }, [])

  useEffect(() => {
    void apiFetch<{ ok: true, data: { items: NotificationItem[] } }>('/notifications')
      .then(result => setNotifications(result.data.items))
      .catch(() => setNotifications([]))
  }, [])

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }) } finally { setSignedIn(false) }
  }

  const markNotificationRead = async (id: string) => {
    try {
      const result = await apiFetch<{ ok: true, data: NotificationItem }>(`/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      })
      setNotifications(items => items.map(item => item.id === id ? result.data : item))
    } catch {
      // Keep the notification visible if the API is unavailable during UI review.
    }
  }

  if (!signedIn) {
    return <Login onLogin={() => setSignedIn(true)} />
  }

  return (
    <main className="app-shell">
      <div className="phone-bar"><span>9:41</span><span>● ● ▰</span></div>
      <header className="app-header">
        <div><span className="eyebrow">FANFOLIO</span><h1>{tabTitle(tab)}</h1></div>
        <button className="icon-button" onClick={() => setShowRedeem(true)} aria-label="카드 등록">+</button>
      </header>

      <section className="screen">
        {tab === 'collection' && <Collection cards={collectionCards} onSelect={setSelectedCard} onRedeem={() => setShowRedeem(true)} />}
        {tab === 'discover' && <Discover onSelect={setSelectedCard} />}
        {tab === 'alerts' && <Alerts items={notifications} onRead={markNotificationRead} />}
        {tab === 'settings' && <Settings onLogout={logout} />}
      </section>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavItem active={tab === 'collection'} label="컬렉션" onClick={() => setTab('collection')} />
        <NavItem active={tab === 'discover'} label="탐색" onClick={() => setTab('discover')} />
        <NavItem active={tab === 'alerts'} label="알림" onClick={() => setTab('alerts')} />
        <NavItem active={tab === 'settings'} label="설정" onClick={() => setTab('settings')} />
      </nav>

      {showRedeem && <RedeemModal onClose={() => setShowRedeem(false)} onRedeemed={refreshCollection} />}
      <span className={apiConnected ? 'connection-status connected' : 'connection-status'}>{apiConnected ? '실시간 컬렉션' : '미리보기 데이터'}</span>
      <button className="floating-register" onClick={() => setShowRedeem(true)}>카드 등록</button>
      {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </main>
  )
}

function tabTitle(tab: Tab) { return { collection: '내 컬렉션', discover: '탐색', alerts: '알림', settings: '설정' }[tab] }

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const requestLink = async () => {
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/auth/magic-link/request', {
        method: 'POST',
        body: JSON.stringify({ email, purpose: 'login' }),
      })
      setRequested(true)
      setMessage(`${email}로 로그인 링크를 보냈습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인 링크 요청에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const verifyLink = async () => {
    setBusy(true)
    setMessage('')
    try {
      await apiFetch('/auth/magic-link/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      onLogin()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인 링크 검증에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-screen"><span className="brand-mark">F</span><p className="eyebrow">FANFOLIO</p><h1>내 손안의<br />팬 컬렉션</h1><p className="muted">좋아하는 아티스트의 순간을<br />디지털 카드로 간직하세요.</p><label className="field-label">이메일</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일을 입력하세요" type="email" disabled={requested} />{!requested ? <button className="primary" onClick={() => void requestLink()} disabled={!email.includes('@') || busy}>{busy ? '보내는 중...' : '로그인 링크 받기'}</button> : <><label className="field-label">로그인 토큰</label><input value={token} onChange={e => setToken(e.target.value)} placeholder="이메일의 로그인 토큰을 입력하세요" /><button className="primary" onClick={() => void verifyLink()} disabled={!token || busy}>{busy ? '확인 중...' : '로그인하기'}</button></>}<p className={message.includes('실패') ? 'form-message error-message' : 'form-message'}>{message}</p><p className="login-note">비밀번호 없이 이메일 링크로 안전하게 로그인합니다.</p></main>
}

function Collection({ cards: collectionCards, onSelect, onRedeem }: { cards: Card[], onSelect: (card: Card) => void, onRedeem: () => void }) {
  return <><div className="summary"><div><span className="muted">보유 카드 수</span><strong>{collectionCards.length} <small>/ 80</small></strong></div><button onClick={onRedeem} className="outline">+ 카드 등록</button></div><div className="section-heading"><h2>최근 수집한 카드</h2><button>전체 보기</button></div><div className="card-grid">{collectionCards.map(card => <button className="card-tile" key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="카드 이미지" /><span>{card.id}</span><b>{card.member}</b></button>)}</div><div className="empty-slot" onClick={onRedeem}><span>+</span><b>새 카드를 등록하세요</b><small>QR 또는 카드 코드를 사용합니다.</small></div></>
}

function Discover({ onSelect }: { onSelect: (card: typeof cards[number]) => void }) { return <><input className="search" placeholder="카드, 아티스트 검색" /><div className="section-heading"><h2>인기 카드</h2><button>전체 보기</button></div><div className="horizontal-cards">{cards.map(card => <button key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="" /><b>{card.member}</b></button>)}</div><div className="section-heading"><h2>새로운 카드</h2><button>전체 보기</button></div><div className="discover-list">{cards.map(card => <button key={card.id} onClick={() => onSelect(card)}><img src={card.image} alt="" /><span><b>{card.title}</b><small>{card.artist} · {card.member}</small></span><strong>›</strong></button>)}</div></> }

function Alerts({ items, onRead }: { items: NotificationItem[], onRead: (id: string) => Promise<void> }) { const sample = [['새 카드', '발행번호 #021', '새 카드가 공개되었습니다.'], ['컬렉션', '컬렉션이 업데이트되었습니다', '보유 카드가 18장으로 늘었어요.'], ['공지', '서비스 점검 안내', '5월 12일(월) 02:00 - 04:00']] as const; return <div className="alert-list">{(items.length ? items.map(item => [item.id, '새 소식', 'Fanfolio의 새로운 소식이 도착했습니다.', item.isRead] as const) : sample.map((item, index) => [`sample-${index}`, ...item, true] as const)).map(([id, tag, title, body, isRead]) => <button className={isRead ? 'alert-card read' : 'alert-card'} key={id} onClick={() => !isRead && void onRead(id)}><span className="tag">{tag}</span><h2>{title}</h2><p>{body}</p><small>{isRead ? '확인함' : '새 알림'}</small></button>)}</div> }

function Settings({ onLogout }: { onLogout: () => Promise<void> }) { const [busy, setBusy] = useState(false); const logout = async () => { setBusy(true); await onLogout(); setBusy(false) }; return <><div className="profile"><div className="avatar">팬</div><div><b>팬포리오</b><small>fanfolio_1234</small></div><span>›</span></div><div className="settings-list">{['프로필', '계정', '알림 설정', '앱 정보'].map(item => <button key={item}><span>{item}</span><strong>›</strong></button>)}</div><button className="logout" onClick={() => void logout} disabled={busy}>{busy ? '로그아웃 중...' : '로그아웃'}</button></> }

function CardDetail({ card, onClose }: { card: typeof cards[number], onClose: () => void }) { return <aside className="detail-panel"><button onClick={onClose}>닫기</button><img src={card.image} alt="카드 상세" /><dl><div><dt>아티스트</dt><dd>{card.artist}</dd></div><div><dt>멤버</dt><dd>{card.member}</dd></div><div><dt>발행번호</dt><dd>{card.id}</dd></div><div><dt>획득 경로</dt><dd>콘텐츠 코드 #1</dd></div></dl><button className="primary">컬렉션에 추가</button></aside> }

function RedeemModal({ onClose, onRedeemed }: { onClose: () => void, onRedeemed: () => Promise<void> }) { const [code, setCode] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false); const redeem = async () => { setSaving(true); setMessage(''); try { await apiFetch('/redemptions', { method: 'POST', body: JSON.stringify({ code, source: 'manual' }) }); await onRedeemed(); setMessage('카드가 컬렉션에 추가되었습니다.'); setCode(''); } catch (error) { setMessage(error instanceof Error ? error.message : '카드 등록에 실패했습니다.'); } finally { setSaving(false) } }; return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>카드 등록</h2><p className="muted">카드 패키지의 QR을 스캔하거나<br />코드를 직접 입력하세요.</p><div className="qr-box"><span>QR</span><b>QR 스캔</b><small>카메라로 코드를 비춰주세요.</small></div><div className="divider">또는 코드 입력</div><input value={code} onChange={e => setCode(e.target.value)} placeholder="예: NOVA-VALID-01" /><button className="primary" disabled={!code || saving} onClick={() => void redeem()}>{saving ? '등록 중...' : '카드 등록하기'}</button>{message && <p className="form-message">{message}</p>}</div></div> }

function NavItem({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><span className="nav-dot" />{label}</button> }

export default App
