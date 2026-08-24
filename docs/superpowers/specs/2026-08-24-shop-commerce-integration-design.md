# 상점 실제 상품 연동 설계

## 목표

팬앱의 상점 목업을 관리자에서 등록한 상품 데이터로 전환한다. 1차 상품은 기존 `CardPack`을 판매 대상으로 연결하고, 팬은 상품 목록과 상세를 확인한 뒤 포인트로 주문할 수 있으며 구매 이력을 확인할 수 있다.

## 범위와 비범위

- 범위: 카드팩 기반 `ShopProduct` 모델, 공개 카탈로그/상세 API, 포인트 주문과 구매 이력 API, 관리자 상품 목록·등록·수정·게시, 팬앱 상점 목록·상세·이력 연동
- 비범위: 외부 PG 승인, 실물 배송, 환불 자동화, 포인트 충전 결제, 카드팩 개봉 결과의 변경
- 카드팩 구성·확률·게시 상태는 기존 카드팩 관리가 소유하고, 상점 상품은 판매명·가격·노출·판매 기간을 소유한다.

## 데이터 모델

`shop_products`

- `id`: 문자열 PK
- `artist_id`: `artists.id` FK
- `product_type`: 현재 `card_pack`, 향후 `point_item`·`limited_item` 확장 가능
- `card_pack_id`: 카드팩 상품일 때 `card_packs.id` FK
- `name`, `description`, `image_url`
- `price_points`: 0보다 큰 정수
- `status`: `draft`, `published`, `archived`
- `starts_at`, `ends_at`, `created_at`, `updated_at`

`shop_orders`

- `id`, `user_id`, `product_id`
- 주문 시점의 `product_name`, `price_points` 스냅샷
- `payment_method`: 1차 구현은 `points`
- `status`: `completed` 또는 `failed`
- `created_at`

주문 생성은 하나의 DB 트랜잭션에서 상품 게시 상태·판매 기간·포인트 잔액을 검증하고, 기존 포인트 차감 서비스로 원장을 기록한 뒤 주문을 완료한다. 주문 실패 시 포인트와 주문을 함께 롤백한다.

## API와 화면 흐름

공개 API:

- `GET /catalog/shop/products?artistId=&productType=`: 게시된 판매 상품 목록
- `GET /catalog/shop/products/{productId}`: 상품 상세와 연결된 카드팩 요약

인증 API:

- `POST /me/shop/orders`: `{ productId, paymentMethod: "points" }`로 주문
- `GET /me/shop/orders`: 내 구매 내역

관리자 API:

- `GET /admin/shop/products`
- `POST /admin/shop/products`
- `GET /admin/shop/products/{productId}`
- `PATCH /admin/shop/products/{productId}`
- `POST /admin/shop/products/{productId}/publish`

팬앱은 상점 탭에서 로딩·빈 상태·오류를 구분하고 API 결과를 표시한다. 상품 카드를 누르면 `/shop/products/:productId` 상세로 이동한다. 상세의 포인트 결제는 성공 시 `/shop/history`로 이동하며, 실패 시 잔액 부족·판매 종료·상품 없음 메시지를 표시한다. 기존 프리뷰 URL은 시안 확인용으로 유지하고 실제 `/shop` 경로만 API를 사용한다.

관리자 상점 상품 화면은 기존 카드팩 관리 내비게이션과 같은 스타일로 추가한다. 카드팩을 선택하면 아티스트와 연결된 카드팩 정보를 재사용하고, 가격·판매 문구·노출 상태만 상품에서 관리한다.

## 오류와 일관성

- 비게시 상품과 기간 외 상품은 공개 API에서 노출하지 않는다.
- 관리자 수정은 카드팩 존재 여부와 상품 타입/연결 관계를 검증한다.
- 포인트 차감은 `with_for_update` 잔액 잠금과 기존 포인트 원장 규칙을 사용한다.
- 중복 요청은 주문 idempotency key를 받지 않는 1차 범위에서 UI 중복 제출을 막고, 서버는 동일 요청의 트랜잭션 원자성을 보장한다. 이후 외부 결제 도입 시 idempotency를 확장한다.
- 상품 이미지가 없거나 상품 API가 실패하면 깨진 이미지 대신 기존 디자인 시스템의 빈 상태를 표시한다.

## 검증

- 백엔드: 상품 CRUD 권한, 공개 필터, 주문 성공/잔액 부족/판매 종료 롤백, 구매 이력 테스트
- 프론트엔드: API 응답을 목록·상세·이력에 매핑하고 실제 라우트에서 목업 fallback을 사용하지 않는 계약 테스트
- 관리자: 상품 등록·수정·게시의 API 연결 테스트
- 전체 회귀: 기존 카드팩·포인트·거래 테스트, 프론트 테스트, 린트, 빌드
