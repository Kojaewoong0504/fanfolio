# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-06
- Primary product surfaces: 팬 앱, 관리자 운영 화면, 아티스트 스튜디오
- Evidence reviewed: `README.md`, `FANFOLIO_FRONTEND_API_SPEC_v0_2.md`, `prototype-assets/05-admin-screens.png`, `prototype-assets/07-artist-studio-screens.png`, `frontend/src/App.tsx`, `admin_app/`

## Brand
- Personality: 팬과 아티스트가 안심하고 오래 수집하는 따뜻한 디지털 굿즈 서비스
- Trust signals: 명확한 상태 배지, 검수 단계 표시, 발급 수량과 카드 소유권의 명시
- Avoid: 자유형 그래픽 편집기처럼 복잡한 전문 툴 UI, 과도한 게임화, 암호화폐 용어

## Product goals
- Goals: 코드/QR 기반 수집을 쉽게 만들고, 아티스트가 템플릿 기반 특별 카드를 안전하게 제작하게 한다.
- Non-goals: NFT, 지갑, 거래, 팬의 수동 카드 업로드, Photoshop 수준의 자유형 편집
- Success signals: 카드 발급 성공률, 카드 공개까지의 검수 완료율, 아티스트 제작 완료율

## Personas and jobs
- Primary personas: K-POP 팬, 공식 콘텐츠를 제작하는 아티스트/운영자
- User jobs: 팬은 카드를 받고 수집한다. 아티스트는 메시지와 손글씨가 포함된 특별 카드를 검수 요청한다.
- Key contexts of use: 팬은 모바일, 아티스트와 관리자는 데스크톱 중심

## Information architecture
- Primary navigation: 스튜디오 홈 / 카드 만들기 / 내 카드 / 팬 반응 / 설정
- Core routes/screens: 인증, 홈, 제작 단계, 미리보기·검수, 완료
- Content hierarchy: 카드 상태와 다음 행동을 가장 먼저 보여주고, 세부 설정은 그 아래에 둔다.

## Design principles
- Principle 1: 한 화면에는 하나의 제작 결정을 둔다.
- Principle 2: 검수 전후 상태를 색상만으로 구분하지 않고 텍스트와 단계로 함께 보여준다.
- Principle 3: 손글씨는 장식이 아니라 아티스트 메시지 자산으로 취급한다.
- Tradeoffs: MVP에서는 캔버스 손글씨와 작업 요청 UI를 우선하고, 고급 이미지 보정은 백엔드 작업 상태로 분리한다.

## Visual language
- Color: 보라색 primary `#5b45e6`, 파란색 action, 흰색 surface, 옅은 라벤더 보조 배경
- Typography: Noto Sans KR, 숫자와 코드에는 Manrope
- Spacing/layout rhythm: 8px 단위, 데스크톱 sidebar + 넓은 작업 영역
- Shape/radius/elevation: 9~14px radius, 얕은 border와 soft shadow
- Motion: 저장·제출·작업 요청은 짧은 toast와 상태 배지로 피드백
- Imagery/iconography: 카드 이미지는 세로형, 아이콘은 텍스트 기호 또는 단순 선형 아이콘

## Components
- Existing components to reuse: 팬 앱의 카드/버튼 스타일, 관리자 화면의 sidebar·metric·table·toast
- New/changed components: StudioShell, Stepper, CardCanvas, HandwritingPad, ReviewChecklist
- Variants and states: draft, pending_review, published, queued, processing, completed, failed
- Token/component ownership: 현재는 각 앱의 CSS 변수로 관리하고, 공통 디자인 토큰은 앱이 안정된 뒤 추출한다.

## Accessibility
- Target standard: WCAG 2.1 AA를 목표로 한다.
- Keyboard/focus behavior: 입력 순서와 단계 이동 순서를 일관되게 유지한다.
- Contrast/readability: 상태는 텍스트 라벨을 함께 제공한다.
- Screen-reader semantics: form label, button name, canvas 대체 설명을 제공한다.
- Reduced motion and sensory considerations: MVP는 필수 애니메이션을 사용하지 않는다.

## Responsive behavior
- Supported breakpoints/devices: 1100px 데스크톱, 768px 태블릿, 600px 모바일
- Layout adaptations: sidebar 축소, 카드 제작 패널 단일 열, 미리보기 우선 배치
- Touch/hover differences: 캔버스는 pointer 이벤트를 사용해 마우스·터치 입력을 모두 허용한다.

## Interaction states
- Loading: API 요청 버튼을 비활성화하고 진행 문구를 표시한다.
- Empty: 아직 만든 카드가 없으면 새 카드 만들기를 주 행동으로 보여준다.
- Error: API 오류는 작업을 잃지 않도록 입력 화면에 남겨 둔다.
- Success: 저장·검수 요청·배경 제거 요청 후 상태 배지와 toast를 갱신한다.
- Disabled: 필수 입력이 없으면 다음 단계와 제출을 비활성화한다.
- Offline/slow network, if applicable: 데모 fallback을 보여주되 실제 저장 완료로 오인시키지 않는다.

## Content voice
- Tone: 정중하고 격려하는 한국어
- Terminology: 카드, 손글씨, 배경 제거, 검수 요청, 공개
- Microcopy rules: 기술 용어 대신 다음 행동과 결과를 함께 쓴다.

## Implementation constraints
- Framework/styling system: 기존 팬 앱은 React/Vite, 현재 관리자·스튜디오는 독립 정적 앱으로 시작한다.
- Design-token constraints: 관리자 화면의 보라색·radius·sidebar 패턴을 재사용한다.
- Performance constraints: 이미지 원본은 브라우저에서 미리보기만 하고 업로드는 presigned URL 계약으로 분리한다.
- Compatibility constraints: 최신 Chrome/Safari/Edge, 모바일 pointer events
- Test/screenshot expectations: JS 구문 검사, 브라우저 smoke test, 기존 백엔드·팬 앱 회귀 검증

## Open questions
- [ ] 아티스트 인증의 실제 이메일/초대 코드 발급 방식 / Backend / 인증 API 확정 시 반영
- [ ] 이미지 배경 제거 워커와 결과 보정 옵션 / Backend / Celery 작업 계약 확정 시 반영
