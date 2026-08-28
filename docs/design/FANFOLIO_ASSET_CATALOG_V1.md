# Fanfolio Asset Catalog v1

Figma와 앱 구현에서 같은 에셋을 재사용하기 위한 역할 기준이다. 파일명은 임의로 바꾸지 않고, 슬롯의 비율과 콘텐츠 역할을 먼저 지킨다.

| 역할 | 기준 에셋 | 비율 | 적용 위치 |
| --- | --- | --- | --- |
| 그룹/아티스트 히어로 | `frontend/src/assets/dreamscape-hero-v2.png` | 16:9 | 홈 히어로, 아티스트 카드, 이벤트 배너 |
| 로그인 그룹 이미지 | `frontend/src/assets/login/dreamscape-group.png` | 1.57:1 | 로그인 랜딩 |
| 멤버 초상 | `frontend/src/assets/collection-card-*-generated.png` | 2:3 | 카드, 멤버 선택, 컬렉션 |
| 카드 사진 | `frontend/src/assets/card-*.jpg` | 2:3 | 카드 상세·카드 컬렉션 |
| 카드팩 | `frontend/src/assets/card-pack-dreamscape-generated.png` | 0.56:1 | 카드팩 목록·상점 |
| 시즌 패스 | `frontend/src/assets/fan-pass-card.png` | 1:1 | 시즌 패스 요약·보상 |
| 팬 레벨 장식 | `frontend/src/assets/fan-level-star-v2.png` | 1:1 | 레벨·보상 아이콘 |
| 이벤트 배너 | `frontend/src/assets/fan-week-*.png` | 16:9 | 홈·탐색 이벤트 |
| 상품 상세 | `frontend/public/shop/dreamscape-nebula-detail-hero.png` | 2:3 | 상점 상품 상세 |

## Figma 배치 규칙

- 그룹과 멤버 이미지는 DREAMSCAPE의 동일한 여성 4인 세트를 사용한다.
- 카드 슬롯은 2:3을 유지하고 `object-fit: cover` 기준으로 배치한다.
- 배너 슬롯은 16:9을 유지하며 텍스트는 이미지 위에 별도 레이어로 둔다.
- 잠금 상태는 원본 에셋을 삭제하지 않고 회색 오버레이와 잠금 라벨을 추가한다.
- Figma 컴포넌트의 이미지 슬롯 이름은 `Artist`, `Member`, `Card`, `Banner`로 통일한다.
