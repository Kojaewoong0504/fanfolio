import './App.css'

function App() {
  return (
    <main className="setup-page">
      <p className="eyebrow">FANFOLIO · DEVELOPMENT READY</p>
      <h1>Fanfolio 개발 환경이 준비되었습니다.</h1>
      <p>팬 앱, 관리자 웹, 아티스트 스튜디오를 이 프론트엔드에서 단계적으로 구현합니다.</p>
      <div className="setup-grid">
        <article><strong>팬 앱</strong><span>코드·QR 카드 발급, 컬렉션, 탐색, 알림</span></article>
        <article><strong>관리자 웹</strong><span>카드·드롭·리딤 코드 운영</span></article>
        <article><strong>아티스트 스튜디오</strong><span>특별 카드·손글씨 제작과 검수</span></article>
      </div>
    </main>
  )
}

export default App
