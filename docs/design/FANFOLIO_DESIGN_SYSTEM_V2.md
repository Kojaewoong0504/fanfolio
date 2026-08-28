# FANFOLIO Design System v2

## 목적

Fanfolio는 수집 카드와 시즌 콘텐츠가 중심인 모바일 서비스다. 따라서 디자인 시스템은 예쁜 화면 모음이 아니라 **콘텐츠 비율, 보상 상태, 탐색 행동을 반복해서 재사용하는 규칙**이어야 한다.

- 기준 프레임: 430px mobile / 좌우 gutter 20px / bottom navigation 74px
- 기본 폰트: Noto Sans KR, Apple SD Gothic Neo, Inter, system-ui
- 기본 밀도: 한 화면에서 핵심 카드 1개 + 보조 카드 2~4개가 읽히는 compact density
- 이미지 원칙: Artist·Member·Card·Banner를 서로 다른 슬롯으로 관리하고 비율을 변경하지 않는다

## 색상 팔레트 후보

### A. Nebula Violet — 기본안

현재 Fanfolio의 수집·성장·시즌 패스 경험과 가장 잘 맞는 기본 팔레트다.

| 역할 | Hex | 사용처 |
| --- | --- | --- |
| Brand 500 | `#5B50E8` | 주요 CTA, 활성 탭, 진행 상태 |
| Brand 700 | `#5344D7` | pressed, 강조 텍스트 |
| Lavender 50 | `#F4F1FF` | 선택 배경, 보상 아이콘 배경 |
| Canvas | `#FAFAFF` | 앱 전체 배경 |
| Ink | `#171E3C` | 제목, 가격, 핵심 숫자 |
| Muted | `#5D6682` | 설명, 메타 정보 |
| Line | `#E5E3F4` | 카드 경계, 구분선 |
| Premium | `#C88B27` | 프리미엄 라벨, 잠금 강조 |
| Success | `#16A77D` | 획득 완료, 성공 상태 |
| Warning | `#D88328` | 만료 임박, 주의 상태 |
| Locked | `#C7C7CC` | 잠긴 프리미엄 표면 |

### B. Aurora Lilac — 부드러운 대안

여성 팬덤과 아티스트 콘텐츠를 더 부드럽게 보여주는 대안이다. 기본안보다 CTA 대비가 약하므로 구매 플로우의 주색으로는 사용하지 않는다.

| 역할 | Hex |
| --- | --- |
| Brand 500 | `#7457E8` |
| Brand 700 | `#5A3CCB` |
| Accent | `#E7B9FF` |
| Canvas | `#FBF9FF` |
| Premium | `#B7832E` |

### C. Cosmic Indigo — 고대비 대안

카드 이미지와 어두운 아티스트 비주얼을 돋보이게 하는 대안이다. 홈 히어로와 카드 상세의 배경 테마로만 사용하고 전체 앱 기본색으로는 사용하지 않는다.

| 역할 | Hex |
| --- | --- |
| Brand 500 | `#4E5BD5` |
| Brand 700 | `#3441A8` |
| Canvas | `#F7F8FF` |
| Ink | `#121936` |
| Premium | `#D29A35` |

### 선택 기준

v2 기본값은 **A. Nebula Violet**으로 유지한다. Brand 500의 흰색 텍스트 대비, Premium의 잠금 의미, Success/Warning의 상태 구분이 가장 명확하며 기존 Fanfolio 화면과의 회귀 위험이 가장 낮다. B와 C는 캠페인·아티스트 테마 토큰으로만 허용한다.

## 토큰 계약

```css
--fan-brand-primary: #5B50E8;
--fan-brand-primary-strong: #5344D7;
--fan-brand-soft: #F4F1FF;
--fan-premium: #C88B27;
--fan-success: #16A77D;
--fan-warning: #D88328;
--fan-text-strong: #171E3C;
--fan-text-muted: #5D6682;
--fan-surface-canvas: #FAFAFF;
--fan-surface-card: #FFFFFF;
--fan-line-subtle: #E5E3F4;
--fan-state-locked: #C7C7CC;
```

간격은 4px 단위(`4 / 8 / 12 / 16 / 20 / 24 / 32`), 반경은 `8 / 12 / 16 / 20 / 24 / pill`로 제한한다. 임의의 13px, 17px, 19px를 새 화면에서 추가하지 않는다.

## 컴포넌트 카탈로그

### Button

- `Primary / default`: 48px 이상, Brand 500 배경, 흰색 라벨
- `Primary / pressed`: Brand 700
- `Secondary`: 흰색 표면 + Line border
- `Tertiary`: 배경 없음, Brand 500 텍스트
- `Disabled`: Locked 표면, Muted 텍스트
- 구매 버튼은 반드시 가격과 단위를 함께 표시한다: `패스 구매 · 1,200 P`

### Segmented control

- 그룹 스코프 전환용이며 탭이 4개를 넘으면 가로 스크롤한다.
- 선택 상태는 Brand 500 fill + 흰색 텍스트, 비선택 상태는 투명 표면 + Muted 텍스트다.
- `전체 팬`은 별도 탭으로 반복하지 않고 팬 레벨 화면의 상세 진입으로 둔다.

### Carousel

- 콘텐츠는 16:9 배너 또는 2:3 카드만 사용한다.
- 한 번에 1개를 완전히 보여주고 다음 카드의 12px peek을 제공한다.
- 좌우 버튼은 이미지 위에 놓지 않고 하단 인디케이터 양옆 또는 접근 가능한 별도 컨트롤로 둔다.
- 자동 재생은 기본 비활성, 사용자가 스와이프하면 일시정지한다.
- 모든 이미지에는 대체 텍스트와 로딩/실패 상태를 둔다.

### Surface card

- 카드 내부 여백 16px, 기본 radius 16px, border 1px Line
- `Artist`, `Member`, `Card`, `Banner` 슬롯은 콘텐츠를 교체해도 레이아웃이 변하지 않는다.
- 빈 상태는 회색 박스만 보여주지 않고 제목·설명·행동 CTA를 함께 보여준다.

### Season reward lane

- 중앙 레벨 rail이 무료/프리미엄 두 lane을 분리한다.
- 무료 보상은 항상 원본 이미지와 획득 상태를 보인다.
- 프리미엄 미구매 상태는 원본 에셋 위에 Locked overlay와 `패스 구매 시 해금`을 표시한다.
- 구매 CTA는 각 보상 카드에 반복하지 않고 상단 요약 또는 현재 레벨 주변에 한 번만 둔다.

## 화면 사용 예시

| 화면 | 조합 |
| --- | --- |
| 홈 | App Header + 16:9 Hero Carousel + Artist Surface Card + 2:3 New Cards |
| 탐색 | Search Field + Segmented Control + Artist Card + Card Pack Entry |
| 보관함 | Collection Summary + Filter Trigger + 2:3 Card Grid |
| 팬 레벨 | Scope Segmented Control + Progress Ring + Mission Card + Season Entry |
| 시즌 패스 | Season Header + 중앙 Level Rail + Free/Premium Reward Lanes + Purchase CTA |
| 상점 | Artist Scope + Point Balance Card + Product Carousel + Checkout CTA |

## Figma 페이지 구조

1. `00 Cover` — 원칙, 기본 프레임, 팔레트 선택
2. `01 Foundations` — 색상 후보, 타입 스케일, 간격, 반경, 이미지 비율
3. `02 Components` — 버튼, 탭, 캐러셀, 카드, 잠금 상태, 네비게이션
4. `03 Patterns` — 홈, 탐색, 보관함, 팬 레벨, 시즌 패스, 상점 조합 예시
5. `04 Screens` — 430px 실화면과 360/390px 회귀 비교

이 구조에서 Foundations의 토큰을 먼저 바꾸고 Components와 Patterns가 그 토큰을 상속하도록 관리한다. 화면에서 색상값을 직접 입력하지 않는다.
