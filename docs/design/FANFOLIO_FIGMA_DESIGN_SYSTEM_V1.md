# Fanfolio Figma Design System v1

> v2 설계 기준은 [FANFOLIO_DESIGN_SYSTEM_V2.md](./FANFOLIO_DESIGN_SYSTEM_V2.md)로 확장되었다. 이 문서는 기존 토큰과 코드 매핑의 기록이며, 새 컴포넌트 제작 시 v2의 역할·상태·사용 예시를 우선한다.

Figma draft: [Fanfolio Design System v1 · Personal Draft](https://www.figma.com/design/MJlrRlxwNenOp98jQTh88j)

## 운영 원칙

- 430px 모바일 프레임을 기본 기준으로 사용한다.
- 화면을 만들기 전에 Figma에서 토큰과 공통 컴포넌트를 먼저 확정한다.
- 구현에서는 같은 값을 임의로 다시 만들지 않고 CSS 변수로 연결한다.
- 아티스트·카드·배너 이미지는 컴포넌트의 콘텐츠 슬롯으로 취급하고, 레이아웃 토큰과 분리한다.
- Starter Draft에서는 개인 설계와 검토를 진행하고, 확정된 토큰만 코드에 반영한다.

## 생성된 Figma 변수

### Color · `Fanfolio / Color` · Light

| Figma variable | Code mapping | Use |
| --- | --- | --- |
| `brand/primary` | `--fan-brand-primary` | 주요 CTA, 활성 탭, 진행 상태 |
| `brand/primary-strong` | `--fan-brand-primary-strong` | pressed/강조 상태 |
| `text/strong` | `--fan-text-strong` | 제목, 핵심 숫자 |
| `text/muted` | `--fan-text-muted` | 설명, 보조 라벨 |
| `surface/canvas` | `--fan-surface-canvas` | 앱 배경 |
| `surface/card` | `--fan-surface-card` | 카드 및 패널 |
| `line/subtle` | `--fan-line-subtle` | 구분선, 입력 경계 |
| `state/locked` | `--fan-state-locked` | 잠긴 프리미엄 보상 |

### Spacing · `Fanfolio / Spacing` · Base

`xs=4`, `sm=8`, `md=12`, `lg=16`, `xl=20`, `2xl=24`, `3xl=32`

### Radius · `Fanfolio / Radius` · Base

`sm=8`, `md=12`, `lg=16`, `xl=20`, `2xl=24`, `pill=999`

### Layout · `Fanfolio / Layout` · Base

`mobile/width=430`

## 코드와의 차이 및 다음 적용 순서

현재 CSS는 동일한 보라색·간격·반경 값이 여러 파일에 직접 작성되어 있다. 이번 작업에서 전역 토큰과 성장 화면의 다중 그룹 선택 컨트롤을 먼저 연결했고, 다음 순서로 확장한다.

1. `App.css`의 전역 색상·폰트·앱 폭을 토큰으로 이동한다.
2. `FanGrowthReference.css`의 성장 화면 간격·반경·색상을 토큰으로 치환한다.
3. `AppHeader`, `BottomNavigation`, `SegmentedTabs`, `SurfaceCard`, `PrimaryButton`을 공통 계약으로 고정한다.
4. `/growth`와 `/growth/pass`를 Figma의 430px 기준 프레임과 비교한다.
5. 홈·탐색·보관함·상점에 같은 컴포넌트 계약을 확장한다.

## 폰트 메모

현재 코드와 Figma 시안 모두 `Noto Sans KR` 우선으로 맞춰 화면의 줄바꿈과 자간을 일치시킨다. `Pretendard`를 다시 도입할 때에는 폰트 로드 여부와 360/390/430px 줄바꿈을 함께 재검증한다.

## 현재 세션 상태

- P0: 완료
- P1.a~P1.b: 완료 — 색상·간격·반경·모바일 폭 변수 생성
- P1.c~P1.e: Figma Starter MCP 호출 한도 도달 — 브라우저의 인증된 Fanfolio Design System 파일에 직접 `DS · Foundations`, `DS · Components`, `DS · Patterns`, `DS · Screens` 페이지를 구성했다. MCP로 생성된 정식 변수/컴포넌트 라이브러리와 실제 이미지 업로드는 별도 작업으로 남아 있다.
- P2.a: 완료 — 코드 전역에 Figma 색상·간격·반경·레이아웃 토큰 추가
- P2.b: 완료 — 다중 그룹 성장 범위 선택을 세그먼트 컨트롤로 정리하고 전체 팬 레벨은 하단 상세 진입으로 유지
- P2.c: 완료 — 시즌 패스 콘텐츠가 안내 영역까지 스크롤되고 구매 전 프리미엄 잠금 상태를 유지하도록 레이아웃 보정
- P3.a: 기존 Components 페이지의 임시 샘플은 보관하고, 새 `DS · Components` 페이지에 버튼·세그먼트·캐러셀·콘텐츠 카드·잠금 상태 예시를 시각적으로 구성했다.
- P3.a.1: `DS · Patterns`에는 홈/탐색, 시즌 패스, 상점 조합과 캐러셀 dots·카드 rail·구매 전 잠금 안내를 추가했다.
- P3.a.2: `DS · Screens`에는 홈, 성장/시즌 패스, 상점의 430px 화면 조합과 360/390/430px 회귀 기준을 추가했다.
- P3.b: 부분 완료 — 제품 코드는 실제 로컬 아티스트·멤버·카드·배너 에셋을 사용한다. Figma 캔버스의 이미지 파일 직접 배치는 인증된 사용자 탭 부재와 Starter MCP 한도로 보류 중이다.
- 로컬 기준 화면: `http://127.0.0.1:15276/?preview=fan-pass`

## 브라우저 검증 기록 · 2026-08-27

- 로컬 프리뷰 경로를 순차 확인: 홈, 탐색, 내 컬렉션, 카드 컬렉션, 상점, 포인트 충전, 결제 정보, 팬 레벨, 시즌 패스
- 모든 경로에서 정상 콘텐츠가 렌더링되었고 이미지 로드 실패는 `0건`이었다.
- 시즌 패스는 무료/프리미엄 2열, 중앙 레벨 레일, 구매 전 프리미엄 잠금, 구매 CTA, 하단 안내 스크롤을 확인했다.
- 팬 레벨은 관심 그룹 선택 컨트롤과 전체 팬 레벨 상세 진입을 확인했다.
- 코드 검증: `npm test` 243 passed, `npm run lint` exit 0 (기존 경고 3건), `npm run build` exit 0.
