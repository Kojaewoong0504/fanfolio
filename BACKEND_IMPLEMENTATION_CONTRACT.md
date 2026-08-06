# Fanfolio 백엔드 구현 계약

이 문서는 프론트엔드와 계약 테스트가 기대하는 백엔드 API의 **입력·출력·권한·상태 변화**를 정의한다. 구현은 FastAPI를 권장하지만, 테스트에서 요구하는 것은 HTTP 계약뿐이다.

## 1. 테스트를 먼저 통과시키는 방법

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract -q
```

초기에는 `backend/app/main.py`가 없으므로 테스트가 실패한다. 아래 순서로 구현한다.

1. `app.main:app` FastAPI 인스턴스와 `/api/health`
2. 테스트 전용 fixture API
3. 팬 코드·QR 발급과 컬렉션
4. 팬 읽기 모델/알림
5. 관리자·아티스트 API

## 2. 공통 응답과 인증

성공:

```json
{ "ok": true, "data": {} }
```

실패:

```json
{
  "ok": false,
  "error": {
    "code": "REDEEM_CODE_ALREADY_USED",
    "message": "이미 사용한 코드입니다."
  }
}
```

- 세션 쿠키 이름: `fanfolio_session`
- 인증 실패: `401 AUTH_REQUIRED`
- 권한 실패: `403 FORBIDDEN`
- 입력 검증 실패: `422 VALIDATION_ERROR`
- 상태 충돌/중복: `409` + 명시적 오류 코드
- 모든 날짜: ISO 8601 UTC 문자열

## 3. 테스트 전용 fixture API

`APP_ENV=test`일 때만 등록한다. production에서 이 라우터가 노출되면 안 된다.

### POST /api/test/reset

- 입력: 없음
- 출력: `204 No Content`
- 동작: 테스트 DB/스토리지 상태를 비운다.

### POST /api/test/seed

입력:

```json
{ "scenario": "core" }
```

출력:

```json
{
  "ok": true,
  "data": {
    "sessions": {
      "fan": "test-session-fan",
      "otherFan": "test-session-other-fan",
      "admin": "test-session-admin",
      "artist": "test-session-artist"
    },
    "ids": {
      "publishedCardId": "card_published",
      "liveDropId": "drop_live",
      "templateId": "template_signature_v1",
      "imageAssetId": "asset_card_image",
      "handwritingAssetId": "asset_handwriting"
    },
    "codes": {
      "valid": "NOVA-VALID-01",
      "expired": "NOVA-EXPIRED-01",
      "endedDrop": "NOVA-ENDED-01",
      "unpublished": "NOVA-DRAFT-01",
      "exhausted": "NOVA-EXHAUSTED-01"
    }
  }
}
```

`core` fixture에는 다음이 반드시 포함되어야 한다.

- `fan`, `otherFan`, `admin`, `artist` 사용자와 유효한 session 값
- 공개 카드 1장, live 드롭 1개, 유효 코드 1개
- 만료 코드, ended 드롭 코드, draft 카드 코드, 수량 소진 코드
- 팬 알림 1개 이상
- 아티스트 카드 템플릿/이미지 자산/손글씨 자산

## 4. 인증 API

Fanfolio의 회원가입과 로그인은 이메일 매직링크를 같은 흐름으로 사용한다. 비밀번호 API는 만들지 않는다.

### POST /api/auth/magic-link/request

권한: Public

입력:

```json
{ "email": "fan@example.com", "purpose": "login" }
```

- `purpose`: `login` 또는 `signup`
- 최초 이메일도 허용하고, 계정 생성은 링크 검증 성공 시점에 완료한다.

성공 `202`:

```json
{ "ok": true, "data": { "delivery": "queued" } }
```

### POST /api/auth/magic-link/verify

권한: Public

입력: `{ "token": "..." }`

성공 `200`: 사용자 정보와 `onboardingCompleted`를 반환하고 HTTP-only `fanfolio_session` 쿠키를 설정한다. 만료·재사용 토큰은 `401 MAGIC_LINK_INVALID`.

### POST /api/auth/logout

권한: Fan, Admin, Artist

성공: `204 No Content`, `fanfolio_session` 쿠키를 만료시킨다.

## 5. P0 서비스 API

### GET /api/health

출력 `200`:

```json
{ "ok": true, "data": { "status": "healthy" } }
```

### POST /api/redemptions

권한: Fan

입력:

```json
{ "code": "NOVA-VALID-01", "source": "qr" }
```

`source`: `qr` 또는 `manual`.

성공 `201`:

```json
{
  "ok": true,
  "data": {
    "userCardId": "uc_123",
    "cardId": "card_published",
    "serialNumber": 1,
    "redirectTo": "/reveal/uc_123"
  }
}
```

오류:

| 상태 | code |
| --- | --- |
| 404 | `REDEEM_CODE_NOT_FOUND` |
| 409 | `REDEEM_CODE_ALREADY_USED` |
| 409 | `REDEEM_CODE_EXPIRED` |
| 409 | `REDEEM_CODE_DISABLED` |
| 409 | `REDEEM_LIMIT_REACHED` |
| 409 | `DROP_NOT_LIVE` |
| 409 | `CARD_NOT_PUBLISHED` |

성공한 경우에만 `UserCard`를 만들고 `usedCount`를 증가시킨다. 둘은 하나의 DB 트랜잭션이어야 한다.

### GET /api/me/collection

권한: Fan

성공 `200`:

```json
{
  "ok": true,
  "data": {
    "summary": { "ownedCount": 1, "totalSlots": 9, "completionRate": 11 },
    "cards": [
      {
        "userCardId": "uc_123",
        "cardId": "card_published",
        "name": "컴백 기념 사인 카드",
        "imageUrl": "https://...",
        "isOfficial": true,
        "serialNumber": 1,
        "acquiredAt": "2026-08-05T00:00:00Z"
      }
    ]
  }
}
```

### GET /api/me/cards/{userCardId}

권한: 카드 소유 Fan

성공 `200`:

```json
{
  "ok": true,
  "data": {
    "userCardId": "uc_123",
    "serialNumber": 1,
    "acquisitionSource": "redeem_code",
    "card": {
      "id": "card_published",
      "name": "컴백 기념 사인 카드",
      "isOfficial": true,
      "handwritingImageUrl": "https://...",
      "hasVoice": false
    }
  }
}
```

다른 팬이 요청하면 `404 USER_CARD_NOT_FOUND`를 반환한다.

### PATCH /api/me/profile

권한: Fan

입력:

```json
{
  "nickname": "별빛팬",
  "favoriteArtistIds": ["artist_nova3"],
  "favoriteMemberIds": ["member_yuna"]
}
```

성공 `200`의 `data`에는 `nickname`, `favoriteArtistIds`, `favoriteMemberIds`, `onboardingCompleted: true`를 포함한다.

### GET /api/catalog/cards

권한: Fan

- query: `artistId`, `memberId`, `q`, `page`, `pageSize`
- 성공 `200`의 `data.items`에는 `status: "published"`, `isOfficial: true` 카드만 들어간다.

### GET/PATCH /api/notifications

- `GET /api/notifications`: `data.items` 반환
- `PATCH /api/notifications/{id}` 입력: `{ "read": true }`
- 성공 응답에는 `readAt`이 null이 아닌 값으로 반환된다.

## 6. 관리자 API

### GET /api/admin/dashboard

권한: Admin. Fan이 요청하면 `403 FORBIDDEN`.

### POST /api/admin/redeem-code-batches

권한: Admin

입력:

```json
{
  "dropId": "drop_live",
  "cardId": "card_published",
  "quantity": 3,
  "maxUsesPerCode": 1,
  "expiresAt": "2026-12-31T23:59:59Z",
  "prefix": "NOVA-TEST"
}
```

성공 `201`:

```json
{
  "ok": true,
  "data": {
    "id": "batch_123",
    "quantity": 3,
    "maxUsesPerCode": 1,
    "csvExportUrl": "/api/admin/redeem-code-batches/batch_123/export"
  }
}
```

코드 배치 export CSV에는 `qr_image_url` 열도 포함한다. 관리자는 각 코드의
`GET /api/admin/redeem-codes/{codeId}/qr`에서 인쇄용 PNG를 내려받을 수 있다.
QR payload는 redeem code 문자열 자체이며, 팬 앱은 QR 결과를 기존 코드 등록 API로 전달한다.

## 7. 아티스트 스튜디오 API

### POST /api/artist/cards

권한: Artist

입력:

```json
{
  "templateId": "template_signature_v1",
  "name": "컴백 기념 사인 카드",
  "seasonName": "2026 SPRING",
  "rarity": "Special",
  "imageAssetId": "asset_card_image",
  "issueLimit": 3000
}
```

성공 `201`: `data.id`, `data.status: "draft"`.

### POST /api/artist/cards/{cardId}/submit-review

권한: Artist. 성공 `200`의 `data.status`는 `pending_review`.

### POST /api/assets/{assetId}/background-removal

권한: Artist

손글씨 사진/스캔에서 종이 배경을 제거하는 비동기 작업이다.

성공 `202`:

```json
{ "ok": true, "data": { "id": "job_123", "status": "queued" } }
```

Admin만 `POST /api/admin/cards/{cardId}/publish`로 공개할 수 있다. Artist가 호출하면 `403 FORBIDDEN`.

## 8. 테스트 파일

| 파일 | 검증 범위 |
| --- | --- |
| `tests/contract/test_auth.py` | 매직링크 요청·검증·재사용/만료 차단과 로그아웃 |
| `tests/contract/test_health.py` | 앱 실행과 공통 성공 응답 |
| `tests/contract/test_redemptions.py` | 코드/QR 발급, 중복·만료·드롭·수량 오류 |
| `tests/contract/test_fan_experience.py` | 온보딩, 컬렉션/상세 소유권, 탐색, 알림 |
| `tests/contract/test_admin_and_artist.py` | 권한, 코드 배치, 특별 카드 검수, 손글씨 누끼 작업 |
