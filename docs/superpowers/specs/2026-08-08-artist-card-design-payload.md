# 아티스트 카드 디자인 payload 계약

## 목적

아티스트 스튜디오의 비주얼 에디터가 만든 앞면·뒷면 구성을 카드 초안에 보존한다. 기존 `imageAssetId`, `signatureText`, `handwritingTransform` 필드는 유지하고, 새 디자인 값은 버전이 있는 JSON 필드로 분리한다.

권장 필드명은 `designConfig`다. 카드 생성과 카드 수정 요청에서 같은 구조를 사용한다.

## 요청 예시

```json
{
  "templateId": "template_signature_v1",
  "name": "컴백 기념 사인 카드",
  "seasonName": "2025 봄",
  "rarity": "SR",
  "imageAssetId": "asset_card_photo_01",
  "artistId": "artist_nova3",
  "memberId": "member_yuna",
  "signatureText": "항상 고마워요, 우리 함께해요!",
  "hasVoice": false,
  "issueLimit": 3000,
  "designConfig": {
    "version": 1,
    "front": {
      "image": {
        "assetId": "asset_card_photo_01",
        "x": 0,
        "y": 0,
        "scale": 100,
        "filter": "clean"
      },
      "text": {
        "value": "드림스케이프 · 유나",
        "x": 0,
        "y": 0,
        "size": 24,
        "color": "#ffffff"
      },
      "sticker": {
        "kind": "spark",
        "x": 0,
        "y": 0
      },
      "effect": "glow"
    },
    "back": {
      "templateId": "agency_back_v1",
      "background": "#f5efff",
      "effect": "glow"
    }
  }
}
```

## 필드 규칙

| 경로 | 타입 | 규칙 |
| --- | --- | --- |
| `designConfig.version` | `1` | 하위 호환을 위해 필수 |
| `front.image.assetId` | string | 카드의 `imageAssetId`와 동일해야 함 |
| `front.image.x`, `y` | number | 현재 에디터 stage 기준 이동값. 범위는 서버에서 제한 |
| `front.image.scale` | number | `70`–`140` |
| `front.image.filter` | enum | `clean`, `warm`, `mono` |
| `front.text.value` | string | 최대 60자 |
| `front.text.size` | number | `14`–`42` |
| `front.text.color` | hex string | 허용된 색상 형식만 허용 |
| `front.sticker.kind` | enum | `spark`, `star`, `heart`, `none` |
| `front.effect` | enum | `glow`, `grain`, `none` |
| `back.templateId` | string | 관리자/소속사 템플릿 ID만 허용 |
| `back.background` | hex string | 관리자 허용 팔레트 중 하나만 허용 |
| `back.effect` | enum | `glow`, `grain`, `none` |

## 서버 검증 및 권한

1. 아티스트는 자신에게 배정된 `back.templateId`만 사용할 수 있다.
2. 뒷면의 이미지, 레이아웃, 문구 구조는 아티스트 payload에서 받지 않는다.
3. 뒷면 색상은 관리자 템플릿이 정의한 팔레트에 포함되는지 검증한다.
4. 모든 숫자 범위와 문자열 길이는 Pydantic 스키마에서 검증한다.
5. `designConfig`는 검수 요청 시점에 서버가 보존하고, 공개 카드 렌더러도 동일한 버전을 사용한다.
6. 기존 카드 응답에는 `designConfig`를 포함해 스튜디오가 편집 재개 시 동일한 상태를 복원할 수 있게 한다.

## 응답 예시

```json
{
  "ok": true,
  "data": {
    "id": "card_abc123",
    "status": "draft",
    "designConfig": {
      "version": 1,
      "front": {},
      "back": {}
    }
  }
}
```

## 구현 순서

1. `Card.design_config` JSON 컬럼과 migration 추가
2. `ArtistCardRequest`·`ArtistCardUpdate`·관리자 카드 스키마에 `designConfig` 추가
3. `card_data()` 응답에 `designConfig` 포함
4. 생성·수정·검수 테스트에 앞면 레이어와 뒷면 템플릿 권한 검증 추가
5. 프론트에서 현재 브라우저 초안 저장값을 서버 응답의 `designConfig`로 대체

