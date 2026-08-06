# Fanfolio 프론트엔드·기능·API 명세 v0.2

작성일: 2026-08-05  
기준: 현재 UI/UX 시안과 클로즈드 파일럿 요구사항  
대상: React/Vite 프론트엔드 + FastAPI 백엔드

## 1. 제품 범위와 역할

Fanfolio는 **공식 디지털 포토카드를 코드 또는 QR로 발급받아 수집하는 서비스**다. 팬이 이미지를 직접 업로드하거나 카드 정보를 수동으로 등록하는 기능은 제공하지 않는다.

| 역할 | 핵심 목적 | 주요 화면 |
| --- | --- | --- |
| Fan | 코드/QR로 카드를 받고 수집·탐색 | 모바일 웹 앱 |
| Admin | 카드, 드롭, 발급 코드, 사용자, 검수 운영 | 관리자 웹 |
| Artist | 특별 카드를 템플릿으로 만들고 검수 요청 | 아티스트 스튜디오 |

제외: NFT, 지갑, 토큰, 결제, 거래, 랜덤 뽑기, 팬의 수동 카드 업로드, 자유형 디자인 에디터.

## 2. 프론트엔드 기능 명세

### 2.1 Fan 모바일 앱

| 화면 | 필수 기능 | 필요한 API |
| --- | --- | --- |
| 로그인/회원가입 | 이메일 매직링크 요청·검증, 로그아웃 | Auth API |
| 최초 설정 | 좋아하는 그룹·멤버 선택, 닉네임 입력 | Me API, Catalog API |
| 컬렉션 | 보유 카드 그리드, 필터, 빈 상태, 카드 상세 이동 | Collection API |
| 카드 받기 | 코드 입력 또는 QR 스캔, 유효성 오류 안내 | Redemption API |
| 카드 공개 | 발급 직후 카드, 공식 배지, 발행번호, 컬렉션 이동 | User Card API |
| 카드 상세 | 카드·드롭·획득 정보, 사인/손글씨/보이스 특전 표시 | User Card API |
| 탐색 | 공개 카드/그룹/멤버 검색·필터·카드 미리보기 | Catalog API |
| 알림 | 새 카드, 컬렉션, 공지 목록·읽음 처리 | Notification API |
| 설정 | 프로필, 알림 수신 설정, 로그아웃 | Me API, Notification API |

**카드 발급 원칙**

- QR에는 서버가 발급한 불투명한 `redeemCode` 또는 일회용 `redeemToken`만 포함한다.
- QR을 스캔한 뒤에도 프론트는 코드 전체를 서버에 보내고, 서버만 사용 가능 여부를 판단한다.
- 코드 발급 성공은 `UserCard` 생성과 `RedeemCode.usedCount` 증가가 하나의 트랜잭션에서 완료되어야 한다.
- 동일 사용자가 같은 코드를 재사용하거나, 발급 수량을 초과하는 경우 카드가 추가 생성되어서는 안 된다.

### 2.2 관리자 웹

| 화면 | 필수 기능 | 필요한 API |
| --- | --- | --- |
| 로그인 | 관리자 세션 획득 | Auth API |
| 대시보드 | 카드/드롭/발급 수, 최근 활동, 운영 오류 | Admin Dashboard API |
| 카드 목록 | 검색, 상태 필터, 목록, 수정 진입 | Admin Card API |
| 카드 생성/수정 | 이미지, 메타데이터, 발행수량, 상태 관리 | Admin Card API, Upload API |
| 드롭 관리 | 기간, 상태, 연결 카드 관리 | Admin Drop API |
| 리딤 코드 관리 | 일괄 생성, 만료, 비활성화, CSV 내보내기, 사용 현황 | Admin Redemption API |
| 사용자/감사 로그 | 역할 확인, 운영 기록 조회 | Admin User/Audit API |

### 2.3 아티스트 스튜디오

아티스트 스튜디오는 Photoshop 같은 자유형 편집기가 아니라 **템플릿 기반 특별 카드 제작 도구**다.

| 화면 | 필수 기능 | 필요한 API |
| --- | --- | --- |
| 아티스트 인증 | 매직링크 로그인 및 artist 권한 확인 | Auth API, Me API |
| 스튜디오 홈 | 임시 저장/검수 중/공개 카드, 새 카드 만들기 | Artist Card API |
| 카드 제작 | 템플릿, 카드 이미지, 카드명, 시즌, 희귀도, 사인/보이스/발행수량 입력 | Artist Card API, Upload API |
| 손글씨 추가 | 직접 쓰기 또는 사진/스캔 업로드 | Handwriting API |
| 손글씨 보정 | 배경 제거, 투명 이미지 미리보기, 자르기, 명암, 위치/크기 조정 | Handwriting API |
| 미리보기/검수 | 데스크톱 카드·팬 모바일 화면 미리보기, 필수 항목 검증 | Artist Card API |
| 공개 요청 | 검수 요청, 상태 확인 | Artist Card API |

**손글씨 처리 원칙**

1. 직접 쓰기는 브라우저 캔버스에서 PNG/SVG가 아닌 PNG 이미지로 내보내 업로드한다.
2. 사진/스캔 업로드는 원본을 보관하고, 서버 작업으로 종이 배경을 제거한 투명 PNG를 만든다.
3. 아티스트는 결과를 확인하고 자르기·명암·위치·크기를 수정하거나 재처리할 수 있다.
4. 카드에는 원본이 아닌 확정된 투명 손글씨 자산과 배치 정보만 연결한다.

## 3. 공통 API 규약

Base URL: `/api`

성공 응답:

```json
{ "ok": true, "data": {} }
```

실패 응답:

```json
{
  "ok": false,
  "error": {
    "code": "REDEEM_CODE_ALREADY_USED",
    "message": "이미 사용한 코드입니다."
  }
}
```

공통 규칙:

- 모든 날짜는 ISO 8601 UTC 문자열이다.
- 인증이 필요한 API는 HTTP-only 세션 쿠키를 사용한다. 프론트는 토큰을 localStorage에 저장하지 않는다.
- 목록 API는 `page`, `pageSize`, `q`, `status` 같은 query parameter와 `meta.pagination`을 사용한다.
- `401`은 로그인 필요, `403`은 권한 없음, `404`는 대상 없음, `409`는 상태 충돌/중복, `422`는 입력 검증 오류, `429`는 요청 제한이다.
- 코드·QR 발급, 매직링크 요청, 손글씨 배경 제거 요청에는 rate limit을 적용한다.

## 4. API 명세

### 4.1 인증 및 사용자

| Method | Endpoint | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/auth/magic-link/request` | Public | 로그인/회원가입용 매직링크 요청 |
| POST | `/auth/magic-link/verify` | Public | 매직링크 토큰 검증 및 세션 발급 |
| POST | `/auth/logout` | Fan+ | 세션 종료 |
| GET | `/me` | Fan+ | 현재 사용자/역할/온보딩 상태 |
| PATCH | `/me/profile` | Fan+ | 닉네임, 좋아하는 그룹·멤버 수정 |
| PATCH | `/me/notification-preferences` | Fan+ | 알림 수신 설정 수정 |

`POST /auth/magic-link/request`

```json
{ "email": "fan@example.com", "purpose": "login" }
```

`PATCH /me/profile`

```json
{
  "nickname": "별빛팬",
  "favoriteArtistIds": ["artist_nova3"],
  "favoriteMemberIds": ["member_yuna"]
}
```

### 4.2 Fan: 코드·QR 발급, 컬렉션, 탐색

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/redemptions` | 코드 입력 또는 QR 스캔 결과로 공식 카드 발급 |
| GET | `/me/collection` | 보유 카드 컬렉션과 요약 |
| GET | `/me/collection/benefits` | 아티스트·시즌별 카드 조합 진행률과 디지털 특전 해금 상태, 클레임 후 다운로드 URL |
| POST | `/me/collection/benefits/{campaignId}/claim` | 완성된 활성 캠페인의 디지털 특전을 팬 계정에 1회 지급 |
| GET | `/me/collection/benefits/{campaignId}/download` | 클레임한 캠페인의 디지털 특전 파일 다운로드 |
| GET | `/me/cards/{userCardId}` | 보유 카드 상세 |
| GET | `/catalog/cards` | 공개 카드 탐색/검색 |
| GET | `/catalog/artists` | 그룹/아티스트 탐색 목록 |
| GET | `/catalog/members` | 멤버 탐색 목록 |
| GET | `/notifications` | 알림 목록 |
| PATCH | `/notifications/{notificationId}` | 읽음 상태 변경 |
| POST | `/notifications/read-all` | 전체 읽음 처리 |

`POST /redemptions`

```json
{ "code": "NOVA-LIVE-01", "source": "qr" }
```

성공 응답:

```json
{
  "ok": true,
  "data": {
    "userCardId": "uc_123",
    "cardId": "card_123",
    "serialNumber": 21,
    "redirectTo": "/reveal/uc_123"
  }
}
```

필수 오류 코드: `REDEEM_CODE_NOT_FOUND`, `REDEEM_CODE_ALREADY_USED`, `REDEEM_CODE_EXPIRED`, `REDEEM_CODE_DISABLED`, `REDEEM_LIMIT_REACHED`, `DROP_NOT_LIVE`, `CARD_NOT_PUBLISHED`.

`GET /me/collection`은 `ownedCount`, `totalSlots`, `completionRate`, 카드 썸네일, 공식 카드 여부, 발행번호, 획득일을 반환한다. 개인 소유 카드만 반환한다.

`GET /catalog/cards`는 공개 카드의 메타데이터만 반환한다. 아직 보유하지 않은 카드는 상세 미리보기용이고 발급/소유 정보는 노출하지 않는다.
`sort`는 `recommended`(기본값), `name`, `rarity` 중 하나이며, 추천순은 최초 설정에서 선택한 멤버와 그룹을 우선한다.

### 4.3 파일 업로드와 손글씨 배경 제거

| Method | Endpoint | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/uploads/presign` | Admin, Artist | 카드 이미지/손글씨 원본용 업로드 URL 발급 |
| POST | `/assets/{assetId}/background-removal` | Artist | 손글씨 원본에서 투명 PNG 생성 작업 요청 |
| GET | `/background-removal-jobs/{jobId}` | Artist | 작업 상태/결과 조회 |
| PATCH | `/assets/{assetId}/transform` | Artist | 자르기, 명암, 배치 전 보정값 저장 |

`POST /uploads/presign` 요청과 응답은 다음과 같다. `purpose`는 `card`, `handwriting`, `voice` 중 하나이며, 응답의 `uploadUrl`로 파일 바이트를 `PUT`한 뒤 반환된 `assetId`를 카드/배경 제거 API에 전달한다.

```json
// request
{
  "fileName": "handwriting.png",
  "contentType": "image/png",
  "purpose": "handwriting"
}

// response: 201
{
  "ok": true,
  "data": {
    "assetId": "asset_123",
    "uploadUrl": "/api/uploads/asset_123/content",
    "expiresAt": "2026-08-06T03:15:00Z"
  }
}
```

개발 환경의 `uploadUrl`은 API 내부 PUT 엔드포인트이고, 운영 환경에서는 S3 등 오브젝트 스토리지의 presigned URL로 교체한다. 자산 소유권 검사는 두 환경에서 동일하게 유지한다.

`POST /assets/{assetId}/background-removal` 성공 응답은 비동기 작업 정보를 반환한다.

```json
{ "ok": true, "data": { "jobId": "bg_job_123", "status": "queued" } }
```

완료 상태에서는 `transparentImageUrl`과 `previewUrl`을 반환한다. 원본 이미지는 삭제하지 않고 접근 제어된 저장소에 유지한다.

개발 환경에서는 업로드된 PNG/JPEG를 로컬 저장소에 보관하고, 손글씨의 밝은 배경을 투명 처리한 PNG를 생성한다. `transparentImageUrl`은 처리 결과를 반환하는 이미지 URL이다.

### 4.4 Artist: 특별 카드 스튜디오

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/artist/templates` | 사용 가능한 카드 템플릿 목록 |
| GET | `/artist/cards` | 내 카드 목록(초안/검수 중/공개) |
| POST | `/artist/cards` | 특별 카드 초안 생성 |
| GET | `/artist/cards/{cardId}` | 카드 편집 데이터 조회 |
| PATCH | `/artist/cards/{cardId}` | 카드 내용/자산/손글씨 배치 수정 |
| POST | `/artist/cards/{cardId}/preview` | 팬 화면용 렌더 미리보기 생성/조회 |
| POST | `/artist/cards/{cardId}/submit-review` | 공개 검수 요청 |
| GET | `/artist/insights` | 내 카드별 팬 수집 수와 상태 요약 |
| GET | `/artist/profile` | 아티스트 계정 설정 조회 |
| PATCH | `/artist/profile` | 표시 이름·운영 알림 이메일 설정 수정 |

`PATCH /artist/cards/{cardId}` 핵심 본문:

```json
{
  "templateId": "template_signature_v1",
  "name": "컴백 기념 사인 카드",
  "seasonName": "2026 SPRING",
  "rarity": "Special",
  "imageAssetId": "asset_card_01",
  "artistId": "artist_nova3",
  "memberId": "member_yuna",
  "signatureText": "오래 기다려 줘서 고마워요.",
  "handwritingAssetId": "asset_handwriting_01",
  "handwritingTransform": { "x": 68, "y": 724, "width": 402, "rotation": -3 },
  "hasVoice": true,
  "issueLimit": 3000
}
```

`POST /artist/cards/{cardId}/preview`는 저장된 카드 레이어를 실제 PNG로 조합하고 미리보기 접근 경로를 반환한다. 개발 환경은 요청 시 로컬 Pillow compositor를 사용하며, 운영 환경에서는 이 처리 함수를 Celery 이미지 워커로 교체한다.

```json
{
  "ok": true,
  "data": {
    "cardId": "card_123",
    "previewUrl": "/api/artist/cards/card_123/preview",
    "layers": {
      "base": { "assetId": "asset_card_01" },
      "handwriting": {
        "assetId": "asset_handwriting_01",
        "text": "오래 기다려 줘서 고마워요.",
        "transform": { "x": 68, "y": 724, "width": 402, "rotation": -3 }
      }
    }
  }
}
```

카드 상태: `draft → pending_review → approved → published` 또는 `changes_requested`.

- Artist는 `draft`를 만들고 `pending_review`로 제출한다.
- Admin만 `approved`와 `published`로 전환한다.
- UI의 “공개하기”는 Artist에게는 “공개 요청”, Admin에게는 “공개”로 표시한다.

### 4.5 Admin: 운영 API

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/admin/dashboard` | 운영 지표와 최근 감사 활동 5건 |
| GET | `/admin/catalog` | 관리자 카드 등록용 그룹/멤버 목록 |
| GET/POST | `/admin/cards` | 카드 목록/생성 |
| GET/PATCH | `/admin/cards/{cardId}` | 카드 조회/수정 |
| POST | `/admin/cards/{cardId}/approve` | 검수 승인 |
| POST | `/admin/cards/{cardId}/publish` | 공개 |
| GET/POST | `/admin/drops` | 드롭 목록/생성 |
| GET/PATCH | `/admin/drops/{dropId}` | 드롭 조회/수정 |
| GET | `/admin/redeem-code-batches` | 코드 배치 목록 |
| POST | `/admin/redeem-code-batches` | 일회용 코드 일괄 생성 |
| GET | `/admin/redeem-code-batches/{batchId}/codes` | 배치 내 개별 코드와 상태 조회 |
| GET | `/admin/redeem-code-batches/{batchId}/export` | CSV 다운로드 |
| GET | `/admin/redeem-codes/{codeId}/qr` | 개별 코드 인쇄용 QR PNG 다운로드 |
| GET | `/admin/redeem-code-batches/{batchId}/qr.zip` | 배치 전체 QR PNG ZIP 다운로드 |
| PATCH | `/admin/redeem-codes/{codeId}` | 만료/비활성화/상태 수정 |
| GET | `/admin/users` | 사용자/역할 목록 (`q`, `role`, `page`, `pageSize` 지원; 응답 `meta.pagination`과 `isCurrentUser` 포함) |
| GET | `/admin/collection-campaigns` | 관리자 특전 캠페인 목록 |
| POST | `/admin/collection-campaigns` | 카드 조합·디지털 특전 캠페인 등록 |
| PATCH | `/admin/collection-campaigns/{campaignId}` | 캠페인 카드 구성·문구·활성 상태 수정 |
| GET | `/admin/audit-logs` | 감사 로그 (`action`, `q`, `page`, `pageSize` 지원; 응답 `meta.pagination` 포함) |

`POST /admin/redeem-code-batches`

```json
{
  "dropId": "drop_123",
  "cardId": "card_123",
  "quantity": 1000,
  "maxUsesPerCode": 1,
  "expiresAt": "2026-08-12T00:00:00Z",
  "prefix": "NOVA-LIVE"
}
```

## 5. 데이터 모델과 상태

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| User | id, email, nickname, role, onboardingCompleted | role: fan/admin/artist |
| ArtistProfile | userId, artistId, verificationStatus | Artist 권한과 소속 연결 |
| Artist, Member | 이름, 상태, 이미지 | 탐색/온보딩/카드 메타데이터 |
| CardTemplate | id, 이름, 레이아웃 버전, 상태 | Artist Studio 템플릿 |
| Card | 메타데이터, 이미지, 상태, 발행수량, 제작자 | 공식 카드 원본 |
| CardHandwriting | 원본 asset, 투명 asset, transform | 카드와 연결되는 손글씨 레이어 |
| Drop | 이름, 기간, 상태, 연결 카드 | 상태: draft/live/ended |
| RedeemCodeBatch | dropId, 생성 수량, CSV 정보 | 일괄 발급 단위 |
| RedeemCode | code, 상태, maxUses, usedCount, 만료 | 코드 단위 |
| UserCard | userId, cardId, redeemCodeId, serialNumber | `@@unique(userId, redeemCodeId)` |
| Notification | userId, type, payload, readAt | 새 카드/컬렉션/공지 |
| AuditLog | actorId, action, targetType, targetId, metadata | 운영 추적 |

## 6. 구현 우선순위

### P0: 클로즈드 파일럿 필수

1. 매직링크 로그인/로그아웃, 사용자 역할, 온보딩
2. 코드 입력·QR 스캔·리딤 트랜잭션·Reveal·Collection·Card Detail
3. 관리자 카드/드롭/코드 배치/CSV/기본 대시보드
4. 아티스트 카드 초안, 템플릿, 미리보기, 공개 요청
5. 이미지 업로드와 손글씨 직접 쓰기/사진 업로드/배경 제거/확인
6. 알림 목록과 새 카드 공개 알림

### P1: 파일럿 후 확장

- 보이스 실제 재생
- 세밀한 탐색 추천/정렬
- Admin 사용자 관리 강화
- 카드 공개 자동화 권한
- 카드 조합·특전 해금

## 7. 프론트엔드 완료 조건

- 팬은 코드 또는 QR 외의 방식으로 카드를 생성할 수 없다.
- 유효한 코드로 발급된 카드는 즉시 Reveal과 Collection에 나타난다.
- 중복·만료·비활성·종료 드롭·비공개 카드·수량 초과 오류가 한국어로 표시된다.
- Artist는 실제 손글씨를 직접 쓰거나 이미지로 올려, 투명 처리 결과를 확인·수정한 뒤 카드에 배치할 수 있다.
- Admin은 카드 공개, 드롭 진행, 코드 CSV 발급 상태를 확인하고 조작할 수 있다.
- 역할이 맞지 않는 사용자는 Admin/Artist API와 화면에 접근할 수 없다.
