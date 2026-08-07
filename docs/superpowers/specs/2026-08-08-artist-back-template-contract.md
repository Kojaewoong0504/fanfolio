# 아티스트 스튜디오 소속사 뒷면 템플릿 계약

## 목적

아티스트 스튜디오의 카드 뒷면은 아티스트가 레이아웃이나 이미지를 직접 만드는 영역이 아니다. 운영자 또는 소속사가 등록한 기본 템플릿을 받아 미리 보여주고, 아티스트에게는 허용된 색상과 효과만 노출한다.

## `/api/artist/templates` 응답 확장

기존 `items`, `artists`, `members`를 유지하고 `backTemplates`를 추가한다.

```json
{
  "ok": true,
  "data": {
    "items": [],
    "artists": [],
    "members": [],
    "backTemplates": [
      {
        "id": "agency_back_v1",
        "name": "기본 라벤더 템플릿",
        "imageUrl": "/assets/templates/agency-back-v1.png",
        "status": "active",
        "allowedBackgrounds": ["#f5efff", "#eaf8ff", "#ffeef6", "#f4f1e9"],
        "allowedEffects": ["glow", "grain", "none"]
      }
    ]
  }
}
```

## 필드 규칙

| 필드 | 규칙 |
| --- | --- |
| `id` | 서버가 발급한 템플릿 ID. 카드 `designConfig.back.templateId`에 저장한다. |
| `imageUrl` | 카드 비율에 맞는 뒷면 이미지. 아티스트가 교체하거나 업로드할 수 없다. |
| `status` | `active`만 스튜디오에 노출한다. |
| `allowedBackgrounds` | 아티스트가 선택할 수 있는 색상 팔레트의 hex 값 목록이다. |
| `allowedEffects` | `glow`, `grain`, `none` 중 템플릿에서 허용한 값이다. |

## 권한과 검증

1. 아티스트에게는 자신이 사용할 수 있는 템플릿만 반환한다.
2. 카드 생성·수정 요청의 `designConfig.back.templateId`가 허용 목록에 없으면 거부한다.
3. `designConfig.back.background`는 해당 템플릿의 `allowedBackgrounds`에 포함되어야 한다.
4. `designConfig.back.effect`는 해당 템플릿의 `allowedEffects`에 포함되어야 한다.
5. 뒷면 이미지, 레이아웃, 문구, QR 배치는 아티스트 요청 payload로 받지 않는다.
6. 템플릿이 비활성화되어도 이미 공개된 카드의 렌더링이 깨지지 않도록 기존 템플릿 자산은 보존한다.

## 프론트 fallback

백엔드가 `backTemplates`를 아직 반환하지 않는 로컬 개발 단계에서는 스튜디오가 `builder_app/agency-back-template-v1.png`를 임시 fallback으로 사용한다. 운영 배포에서는 반드시 API의 `imageUrl`을 사용해야 한다.
