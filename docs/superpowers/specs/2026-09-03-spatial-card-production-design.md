# Fanfolio 공간 카드 서비스 도입 설계

작성: 2026-09-03 · 상태: 설계 제안 완료, 구현·운영 성능 검증 전

이 문서는 기존 `2026-09-03-ai-spatial-card-scene-design.md`의 프리뷰/3종 이미지 번들 설계를 서비스 도입 관점에서 대체한다. 기존 코드나 운영 설정이 이 문서대로 변경되었다는 뜻이 아니다. 신규 인프라 구매·외부 이미지 전송·배포는 이번 설계 작업의 범위가 아니다.

## 1. 제품 계약과 선택한 접근

아티스트는 원본 사진 한 장을 올리고 공간 카드 생성을 요청한다. 인물 분리, 깊이 추정, 숨은 영역 복원, 시점별 검사는 서버에서 자동 처리한다. 사용자가 마스크나 배경 이미지를 직접 준비할 필요가 없다. 생성된 결과를 Studio에서 원본과 비교·승인한 후 기존 카드 발매 심사에 제출한다.

팬은 완성된 에셋을 내려받아 기기에서 재생한다. 카드 전체의 회전과 내부 인물/배경의 시차가 함께 움직인다. 팬의 포인터·센서 이벤트는 AI 요청을 발생시키지 않는다.

| 접근 | 장점 | 제약 | 결정 |
|---|---|---|---|
| 서버에서 1회 생성, 저장 후 기기 재생 | 품질·모델 버전 일관성, 팬 기기 부담 제한, 생성 비용 재사용 | 생성 대기와 별도 추론 자원 필요 | 초기 도입안 |
| 각 브라우저에서 AI 전처리 | 서버 추론 절약, 원본 외부 전송 감소 | 모델 다운로드·기기 메모리·호환성과 배터리 편차 | 초기 제외 |
| 네이티브 기기의 전용 처리 | 플랫폼 하드웨어 최적화 가능 | 플랫폼별 구현·검증, 현재 웹앱에 동일 적용 불가 | 추후 동일 번들 계약으로 연결 |

지원 범위는 작은 시점 변화의 2.5D 사진이다. 360도 인물 모델, 실제 촬영하지 않은 옆얼굴의 정확한 복원, Apple과 동일한 구현/품질을 보장하지 않는다. 인물 픽셀을 보존하더라도 깊이 추정 오류로 얼굴 형상이 왜곡될 수 있으므로 별도 시각 검사가 필요하다.

## 2. 현재 구현의 사실과 간극

아래는 로컬 코드 확인 결과이며 배포 상태 확인 결과가 아니다.

| 코드 | 현재 사실 | 서비스용 변경 |
|---|---|---|
| `backend/app/routers/assets.py` | 업로드 소유권·완료·검사 경로 존재 | 정규화 원본 revision/hash와 처리 예산 연결 |
| `backend/app/routers/artist.py` | `POST /artist/assets/{asset_id}/spatial-scene`에서 worker 결과까지 기다리고 순서대로 저장 | 202 작업 접수, immutable 결과 revision, 상태 조회 |
| `backend/app/spatial_scene.py` | version 2, 원본과 같은 크기의 depth/mask/background, `local_fallback` 존재 | 확장 캔버스/좌표계/품질 보고서를 가진 version 3 계약 |
| `spatial_worker/runtime.py` | Depth Anything V2 Small + IS-Net + OpenCV TELEA 코드 | 실모델 실행 검증, 숨은 영역 생성 모델 평가, 원본 보존 합성 |
| `spatial_worker/engine.py` | 순차 실행, mask 평균·depth 분산으로 confidence 계산 | 단계별 측정·실제 투영 검사; confidence를 성공 확률로 사용 금지 |
| `backend/app/tasks.py` | Celery와 인프로세스 BackgroundTasks 선택 기반 존재 | 공간 작업은 DB에 영속 저장, 재시작 복구; 무거운 작업은 API 프로세스 밖 |
| `builder_app/app.js`, `studio-core.js` | 생성 버튼, 메타데이터 저장 존재 | 상태 복구·취소·비교·검토·명시적 revision 선택 |
| `frontend/src/components/InteractiveCollectibleCard.tsx` | 카드 회전·뒷면·센서 기반 존재 | 공간 렌더러를 앞면 콘텐츠로 연결, 기존 회전 재사용 |
| `frontend/public/spatial-scene-preview-v4.html` | 독립 데모, 수동 준비 배경, 유나 깊이 프록시 | 제품 경로로 사용 금지; 자동 처리 회귀 사례로만 유지 |

현재 R2 저장 클래스는 존재하지만 `/uploads/presign`의 직접 업로드 분기는 `s3`, `supabase`만 포함한다. R2 직접 업로드를 이미 구현했다고 가정하지 않는다. 초기 공간 생성은 기존 검증된 업로드 경로를 사용하며, 직접 업로드 확장은 별도 테스트 후 적용한다.

## 3. 책임 분리와 데이터 흐름

```text
Studio: 원본 업로드 완료 → 공간 생성 요청 → 작업 상태 표시
                              ↓
FastAPI: 소유권/한도 확인 → DB 작업 접수 → 즉시 202
                              ↓
별도 job runner: DB lease 획득 → private AI worker 호출
                              ↓
정규화 → 깊이/분리 → 이동범위 계산 → 누락 영역 생성 → 재투영 검사
                              ↓
private R2: revision별 결과 업로드 → DB ready 원자적 확정
                              ↓
Studio: 원본/공간/생성영역 검토 → draft에 revision 선택 → 기존 발매 심사
                              ↓
팬 API: 카드 공개/소유 정책 확인 → 승인된 번들만 제공
                              ↓
팬앱: 2D 먼저 표시 → 번들 전체 decode → 공간 효과 원자적 활성화
```

메인 API는 Torch 모델을 로드하지 않는다. 별도 runner가 작업 실행과 저장을 담당하며 AI worker는 추론만 수행한다. AI worker에 앱 전체 DB 권한이나 버킷 전체 쓰기 키를 주지 않는다. 초기에는 runner가 검증된 바이트를 전송하고 제한 크기의 결과를 받는다. 이후 전송 최적화 시 작업별 단기 read/write capability를 제공하고 manifest 허용 목록과 일치하는 결과만 수락한다.

## 4. 원본 보존과 회전 대응 전처리

### 4.1 입력과 공통 좌표계

- 단일 인물 사진부터 지원. 복수 인물, 투명 물체, 심한 가림은 자동 판정이 불확실하면 `needs_review`로 돌리고 초기 버전에서는 2D 권장.
- 기존 업로드 검사에 이어 EXIF 방향 적용, sRGB 변환, 메타데이터 제거, 디코딩 크기 검사. 초기 상한은 기존 업로드 바이트 제한과 24MP 중 먼저 도달하는 것. 이는 제안값이며 서비스 전체 업로드 정책을 변경하지 않는다.
- 저장 원본은 불변. 편집 crop/방향/색변환은 별도 normalized revision으로 기록한다. 아티스트가 2:3 crop을 선택한 뒤 그 프레이밍을 기준으로 생성한다. 자동 중앙 crop이나 몰래 확대하지 않는다.
- `sourceRect`(확장 캔버스 안의 원본 위치), `cropRect`(정규화 원본 안의 승인된 2:3 영역), `canvasSize`를 정수 픽셀로 저장한다. 모든 레이어는 공통 캔버스 좌표에 정렬한다.
- 마스크는 alpha, 깊이는 near-is-large의 정규화 상대 역깊이로 명시한다. 물리 거리로 표시하지 않는다. 모델별 출력을 공통 방향으로 변환하며 grayscale 밝기를 깊이로 대체하지 않는다.

### 4.2 필요한 영역만 생성

1. 깊이 추정과 인물 분리를 실행한다. 두 단계 병렬화는 메모리·시간 측정에서 유리할 때만 사용한다.
2. 이미지 경계를 만나는 인물 영역과 깊이 불연속을 기록한다. 눈·입·머리카락 경계에서 노이즈를 제한하고 전경/배경을 가로지르는 삼각형을 연결하지 않는다.
3. 카드 회전과 내부 카메라 움직임을 분리한 공통 scene transform으로 목표 시점들을 투영한다. 내부 카메라는 고정 주시점에 작은 orbit을 사용하며 현재 데모처럼 eye와 target을 반대 방향으로 동시에 이동시키는 방식은 그대로 채택하지 않는다.
4. 각 시점의 disocclusion(가림 해제 영역)과 사진 외부로 필요한 영역의 합집합을 계산한다. 배경 전체를 무조건 새로 생성하지 않는다. 마스크 오차/필터링 여유를 추가한다.
5. 가려진 배경을 복원하고, 사진 경계에 닿은 옷·머리카락의 부족한 부분은 별도 전경 확장으로 생성한다. 배경 복원만으로 전경 하단 절단을 해결했다고 판단하지 않는다.
6. 생성 결과 중 필요한 부분만 합성한다. 원본 얼굴/인물 내부의 관측 픽셀은 정규화 원본에서 다시 복사해 고정한다. 기존 픽셀의 resampling과 생성 픽셀을 구분한다. 원본 얼굴을 새로 그리는 정책은 초기 제외한다.
7. 새 영역의 alpha와 depth를 추정·정렬하고, 중심 시점에서 기존 관측 배경을 보존하는 composite를 만든다. 생성된 hidden plate를 기존 배경 전체 위에 덮어 중심 시점이 달라지지 않게 한다.
8. 원본과 실제 렌더 결과를 비교한다. 중립 시점은 원본 camera calibration에 맞춘다. 단순 전경 Z 이동으로 원본이 확대되는 것을 허용하지 않는다.

생성 영역이 확장 캔버스의 20%를 초과하면 자동 확장을 중단한다(초기 비용/품질 상한). 작은 움직임으로 재검사하되 변경된 범위를 Studio에 보여준다. 최소 내부 yaw ±2°, pitch ±1.5°도 품질 기준을 만족하지 못하면 공간 결과를 ready로 내지 않고 `needs_review` 또는 `unsupported` 처리한다. 이것은 원본 생성이 실패했을 때의 명시적 fallback이며 몰래 움직임을 제거하는 방식이 아니다.

### 4.3 모델 선정 정책

- 깊이 1차 후보: 기존 코드의 Depth Anything V2 **Small**. 공식 저장소는 Small을 Apache-2.0, Base/Large/Giant를 CC-BY-NC-4.0로 구분한다. 큰 모델로 임의 교체하지 않는다. 상업 도입 전 정확한 weights revision과 의존성까지 검토한다. [공식 저장소](https://github.com/DepthAnything/Depth-Anything-V2#license)
- 분리 1차 평가: 현재 IS-Net 경로. 코드 라이선스와 체크포인트 라이선스를 각각 검토하고, 머리카락/반투명 의상의 alpha 품질을 평가한다. macOS Vision으로 만든 데모 마스크를 Linux worker 구현으로 간주하지 않는다.
- 배경/전경 확장: masked inpainting/outpainting을 지원하는 교체형 provider. 기존 TELEA는 기준선일 뿐 생성형 복원 완료로 표시하지 않는다. 후보 체크포인트의 사용 조건·보관 정책·비용과 고정 benchmark를 통과해야 production allowlist에 추가한다. 그 전에는 production 생성 기능을 비활성화한다.
- 하나의 모델이 depth·matting·outpainting 전부를 해결한다고 가정하지 않는다. provider/model revision, weights hash, preprocessing version, seed, renderer version을 결과에 남긴다.
- 레이어별 색과 깊이를 보완하는 접근의 근거는 [3D Photography 연구](https://shihmengli.github.io/3D-Photo-Inpainting/)다. 해당 논문과 Apple의 내부 구현이 같다는 뜻은 아니다.

## 5. 작업 실행, 멱등성, 실패 복구

### 데이터 모델 제안

`SpatialSceneJob`: id, owner_id, source_asset_id, source_revision/hash, normalized_settings, pipeline_version, generation_key, idempotency_key/request_digest, status, phase, attempts, lease_token, lease_expires_at, next_attempt_at, cancel_requested_at, error_code, stage_timings, result_revision_id, created/updated_at.

`SpatialSceneRevision`: id, owner_id, source_asset_id/revision, pipeline/model/renderer versions, private manifest, public manifest, quality_report, generated_regions, ready_at. 결과는 불변이며 교체 생성은 새 revision이다.

`SpatialSceneApproval`: scene_revision_id, source/crop digest, approved_by, approved_at, generated_content_ack. 승인 후 다른 revision이나 crop으로 변경하면 승인은 유효하지 않다. 카드 발매 심사는 별도이며 이 승인을 대신하지 않는다.

### 상태 전이

```text
queued → running → validating → ready
             ├→ retry_wait → running (최대 총 3회)
             ├→ needs_review
             ├→ failed
             └→ cancelled
queued/retry_wait → cancelled
```

`running.phase`는 normalize / depth_and_mask / coverage / synthesis / packaging. 퍼센트를 추측하지 않고 현재 단계를 표시한다. ready는 기술적 번들 준비 완료이지 발매 승인이 아니다. needs_review 결과는 검사 화면에서 볼 수 있지만 재검사 통과 전 발매용으로 승인할 수 없다. 사용자는 원본 유지·crop 수정·재생성을 선택한다.

- `(owner_id, idempotency_key)` unique. 동일 키/다른 요청은 409. generation_key는 owner + 원본 revision/hash + crop + 움직임 preset + 파이프라인 버전 + generation variant의 해시다. 동일 generation_key는 활성 작업/완성 revision을 재사용한다. 사용자 간 dedup은 하지 않는다.
- 명시적 재생성만 새로운 variant/seed와 비용 예약을 만든다. 네트워크 재시도는 같은 작업으로 돌아간다.
- DB 작업 행이 durable queue의 원본이다. runner는 초기 단일 동시 작업으로 조건부 원자적 lease를 획득한다. DB별 CAS 테스트로 두 runner의 중복 claim을 막는다. 긴 추론 중 DB 트랜잭션을 열어두지 않는다.
- 초기 lease 120초, heartbeat 20초. lease가 끝난 작업은 runner의 복구 sweep으로 재접수한다. attempt별 fencing token을 완료·상태 갱신 조건에 넣어 늦게 돌아온 과거 worker가 최신 결과를 덮지 못하게 한다.
- 별도 runner가 2초 간격으로 due job을 확인하는 저비용 시작 구성을 사용한다. 기존 Celery는 운영되어 있을 경우 작업 wake-up 용도로 재사용할 수 있지만 DB sweep이 누락 접수를 복구한다. 인프로세스 BackgroundTasks만으로 공간 작업을 운영하지 않는다.
- transport/5xx/일시적 capacity 실패만 5초, 30초 + jitter로 재시도한다. 입력 오류, unsupported, 품질 미달은 자동 비용 재시도하지 않는다. provider가 idempotency를 지원하지 않으면 응답 유실 후 중복 추론 비용 가능성을 지표에 기록한다. exactly-once 추론이라고 주장하지 않는다.
- revision/attempt별 고유 private 경로에 모든 결과 저장·checksum 검증 후 DB 트랜잭션으로 revision과 ready를 함께 확정한다. 실패 시 현재 승인 revision 유지. 고정 `-spatial-depth.png` 경로를 덮어쓰지 않는다.
- runner 중단/업로드 중단으로 생긴 미참조 attempt 결과는 24시간 후 정리한다. 승인·발매 참조가 있는 revision은 일반 정리 대상에서 제외한다. 원본 삭제/권한 철회 시 활성 작업 취소·노출 차단·관련 데이터 삭제 정책을 연계한다.
- 취소는 단계 사이에서 확인하고 진행 중 provider 지원 시 취소 요청한다. 취소 전 발생한 추론 비용이 회수된다고 약속하지 않는다. cancelled/삭제된 source 작업은 완료 응답이 늦게 와도 발행하지 않는다.

## 6. API와 번들 계약

신규 비동기 API를 추가하고 기존 version 2 동기 API와 혼합하지 않는다. 아래 경로는 `/api` 기준 제안이다.

| API | 계약 |
|---|---|
| `POST /artist/assets/{id}/spatial-scene-jobs` | Idempotency-Key 필수. body: sourceRevision, cropRect, motionPreset, synthesisPolicy, pipelineVersion. 202: jobId/statusUrl/status; 이미 ready인 결과 재사용은 200 |
| `GET /artist/spatial-scene-jobs/{id}` | 소유권 확인, status/phase/retryAt/errorCode/ready revision. ETag 지원 |
| `POST /artist/spatial-scene-jobs/{id}/cancel` | 멱등적 취소. terminal이면 상태 그대로 반환; ready 결과 삭제 의미 아님 |
| `GET /artist/spatial-scenes/{revision}` | 소유권 확인 후 검토용 manifest/qualityReport |
| `POST /artist/spatial-scenes/{revision}/approve` | ready·검사 통과·source/crop 일치 검증, 생성 영역 확인 기록 |
| `GET /cards/{cardId}/spatial-scene` | 기존 카드 공개/소유 정책 + 승인된 pinned revision 검증, fan manifest |
| `GET /cards/{cardId}/spatial-media/{revision}/{role}` | 카드 정책 재확인, pinned revision과 허용 role만 전달 |

공개 API가 클라이언트에서 받은 storagePath/provider URL을 사용하지 않는다. role은 poster/foreground/background/depth/mask만 허용한다. Studio 검토용 생성 영역 mask/보고서는 fan manifest에 포함하지 않는다.

version 3 public manifest의 필수 정보:

```json
{
  "version": 3,
  "sceneRevisionId": "scene_revision_id",
  "runtime": "layered-depth-mesh-v1",
  "rendererVersion": "1",
  "canvasSize": {"width": 920, "height": 1380},
  "sourceRect": {"x": 76, "y": 114, "width": 768, "height": 1152},
  "cropRect": {"x": 0, "y": 0, "width": 768, "height": 1152},
  "depthEncoding": "relative-inverse-depth-u16-near-is-large",
  "motion": {
    "cardTiltDeg": {"x": 5, "y": 6},
    "cameraOrbitDeg": {"yaw": 4, "pitch": 3},
    "safeInputBounds": {"left": -1, "right": 1, "up": -1, "down": 1},
    "preset": "balanced"
  },
  "media": {
    "poster": {"mediaId": "poster_revision_id", "format": "webp"},
    "foreground": {"mediaId": "foreground_revision_id", "format": "webp"},
    "background": {"mediaId": "background_revision_id", "format": "webp"},
    "depth": {"mediaId": "depth_revision_id", "format": "png"},
    "mask": {"mediaId": "mask_revision_id", "format": "png"}
  }
}
```

위 예시의 캔버스·좌표는 이미지별 계산값이다. 실제 media descriptor에는 각 파일의 width/height/byteLength/sha256도 포함한다. URL은 DB 저장 manifest와 분리해 권한 확인 후 응답 시 해석한다. depth 보관은 16bit lossless, 초기 WebGL 재생본은 lossless RG-packed 16bit PNG로 변환하고 shader가 두 채널을 복원한다. 일반 canvas grayscale decode가 16bit를 보존한다고 가정하지 않는다. mask는 독립 8bit lossless alpha이며 foreground RGB의 유일한 합성 alpha로 사용한다.

실제 v3 schema에는 `geometry`도 필수다: source crop 좌표 기준 `cameraIntrinsics`(fx/fy/cx/cy), 정규화 `depthToViewZ`(scale/offset), `layerDepths`, 검증된 `maxRelief`, `referencePose`, `meshPolicyVersion`. 각 media의 `canvasRect`로 낮은 해상도 depth/mask를 공통 캔버스에 사상한다. 숫자는 worker의 calibration 결과로 저장하고 renderer가 별도 임의값을 추정하지 않는다. API 검증은 유한수·양수 focal length·rect 포함관계·허용 relief/angle 상한·depth 방향을 확인한다. 입출력 왕복 테스트는 동일 manifest가 worker 검사기와 웹 renderer에서 같은 landmark 투영을 만드는지 검증한다.

`designConfig.front.spatialScene`은 `{version:3, sceneRevisionId, enabled, motionPreset}`만 참조한다. 서버가 소유권·원본/crop·ready·승인·revision 존재를 검증한다. 최신 asset 메타데이터를 발매 카드에 자동 적용하지 않는다. 기존 version 2와 알 수 없는 renderer version은 원본 2D로 fallback하고 Studio에서 재생성을 안내한다.

## 7. Studio, 관리자, 팬앱 경험

### Studio와 관리자

- 업로드 직후 원본은 바로 보인다. 공간 생성은 명시적 opt-in으로 한도를 안내한다.
- 탭을 닫았다 돌아와도 jobId로 상태를 복구한다. 앞쪽 탭에서 2초 polling, 대기 장기화 시 5초로 완화, 숨김 탭은 중단 후 복귀 시 재조회.
- 생성 중에도 2D 편집은 가능하나 source/crop 변경 시 이전 작업과 현재 draft를 구분한다. 예전 결과를 새 원본에 붙이지 않는다.
- 같은 2:3 프레이밍으로 원본/공간 토글, 카드 회전 on/off, 내부 시차 on/off, 생성된 영역 overlay, 중심/상하좌우/대각 프리셋을 제공한다.
- 배경 복원과 옷·머리카락 확장이 있었음을 보여주고 아티스트가 승인한다. 정확한 의상 디테일을 창작 부분에서 보장하지 않는다.
- 관리자 기존 카드 심사에 source/revision/생성영역/검사 결과 비교를 추가한다. 발매 이후 재생성은 draft 새 revision으로만 저장한다.

### 팬앱

- 목록·탐색은 정적 poster만 사용한다. 공간 기능은 카드 상세 앞면의 활성 카드 1장에 우선 적용한다.
- 기존 InteractiveCollectibleCard의 CSS 회전·뒤집기·센서 입력을 유지하고 WebGL은 앞면 내부만 담당한다. 단일 정규화 입력을 카드 tilt와 작은 내부 orbit으로 각각 변환해 중복 회전/과장 이동을 방지한다.
- 원본 먼저 표시 → 에셋 전체 fetch/decode/검증 → 다음 animation frame에서 공간 장면으로 교체. 일부 배경만 노출하거나 기본 더미 장면을 잠깐 보여주지 않는다.
- 중립 상태에서 자동 흔들기 없음. 포인터/센서 입력 변화 시 requestAnimationFrame 하나로 모으고 정지 시 루프 중단. 카드 경계가 아니라 고정 interaction surface에서 좌표를 계산해 회전 중 피드백 진동을 방지한다.
- 센서는 사용자 버튼·권한 요청 후 활성화. 거절 시 포인터/드래그 유지. reduced-motion·절약 모드는 기본 2D와 수동 opt-in을 제공한다.
- 스크롤을 막는 전역 touch-action:none 금지. 뒤집기 swipe와 시차 drag의 임계/우선순위는 기존 동작 회귀 테스트로 고정한다.
- 기본 DPR 상한 1.5, 충분한 기기만 2.0. 초기 mesh 상한 16K triangles. 비활성/숨김/뒷면에서는 렌더 중단. scene dispose 시 텍스처·버퍼·listener·Object URL 해제.
- context loss/manifest 미지원/일부 다운로드 실패에는 완성된 2D 유지. 자동 무한 재요청하지 않는다. 일시적 401은 기존 인증 갱신 1회, 접근 철회는 화면과 메모리 에셋 제거.

## 8. 저장소, 권한, 비용

- 원본과 depth/mask/hidden plate는 private R2. 공개 r2.dev/버킷 listing은 활성화하지 않는다. 공개 카드도 승인된 서비스 경로로 제공하며 버킷이 public일 필요는 없다. [R2 공개 접근 문서](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- 초기 전달은 기존 API 권한 게이트를 확장한다. 현재 `/cards/{id}/image`는 공개 카드 여부 확인 후 source를 제공하는 경로이므로, 공간 카드 활성화 시 해당 카드의 승인 poster만 제공하도록 제한한다. 그 외 카드 정책 변경은 별도 범위다.
- 공개 카탈로그 공간 카드는 published/visible 정책, 비공개·소유 전용 카드는 인증과 entitlement 정책을 적용한다. 추측한 revisionId만으로 다른 카드 파일에 접근할 수 없어야 한다.
- 초기 spatial-media는 private/no-store, 앱 세션 메모리 캐시만 사용한다. 기존 public image의 긴 CDN TTL을 재사용하지 않는다. 이후 Cloudflare edge 캐시를 도입하면 매 요청 권한 확인 뒤 revision/role별 내부 캐시 조회를 하며 공개 URL로 우회하지 못하게 한다.
- presigned URL은 소지자가 만료까지 접근 가능한 권한이다. 즉시 철회가 중요한 파일의 기본 전달법으로 쓰지 않는다. 도입 시 짧은 TTL·referrer/log 유출 방지·허용 method를 검토한다. [R2 presigned URL 문서](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- 브라우저에 표시한 이미지를 완전히 복사 불가능하게 만드는 것은 보장하지 않는다. 원본 비공개와 다운로드 불가능을 같은 의미로 설명하지 않는다.
- worker에 임의 URL fetch를 허용하지 않는다. MIME/바이트/픽셀 상한·출력 파일 수/총량·checksum을 검증한다. 예외/로그에 이미지 바이트·토큰·signed URL을 남기지 않는다.
- Cloudflare 저장·전달과 GPU 추론은 별도 비용이다. Workers AI 무료 할당이 있어도 필요한 체크포인트를 그대로 실행할 수 있다는 의미는 아니다. 외부 provider 연결은 모델 지원·라이선스·학습 이용/보관 정책을 확인한 뒤 별도 승인한다. [Workers AI 요금 문서](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- 초기 운영 플래그는 off. 내부 파일럿은 동시 추론 1, 계정 하루 3회/전체 하루 20회 신규 생성 상한을 제안한다. 캐시 재사용은 신규 생성으로 세지 않는다. 예산 예약을 접수 트랜잭션에 포함하고 실제 GPU초/외부 호출 비용을 사후 정산한다.
- 비용 상한은 `월 요청수 × (깊이+분리+생성+검사 추론 비용) + 재시도 + idle GPU + 저장/전송/runner 비용`으로 산출한다. 승인된 금액 예산이 없으면 유료 provider를 실행하지 않는다. 사용량·예상 재시도까지 예약하고 예산 부족은 결제 자동 업그레이드 대신 `capacity_unavailable`로 응답한다.

## 9. 성능 목표와 검증 기준

아래 수치는 아직 측정되지 않은 초기 파일럿 목표다. 충족 전 사용자에게 SLA로 약속하지 않는다.

| 항목 | 목표와 측정 조건 |
|---|---|
| 작업 접수 API | 업로드 제외 p95 500ms 이하; 추론을 기다리지 않음 |
| fast preview | warm GPU/동시 1/1024px 입력에서 처리 p95 10초 이내 목표; 검토용이며 배포 금지 |
| 완성 번들 | 같은 조건에서 생성+검사 p95 30초 이내 목표; cold start/queue wait/네트워크 별도와 E2E 함께 기록 |
| 무한 대기 방지 | 전체 처리 deadline 180초 초기값; 초과는 명시적 오류와 원본 유지 |
| 팬 전달 크기 | 기본 768px 폭 번들 압축 합계 2MiB 이하 목표; 원본 별도 비공개 |
| 공간 활성화 | 10Mbps/RTT 80ms/새 세션에서 상세 진입 후 p95 3초 이내 목표; poster 우선 |
| 기기 재생 | 대표 중급 Android/iPhone 각 30초 조작에서 프레임 p95 33ms 이하, 목표 60fps; 초과 시 품질 하향/2D |

모델 상시 로드는 cold start 감소와 idle 비용의 교환이다. 저비용 파일럿에서는 cold-start 지연을 허용하고 표시한다. CPU 처리도 가능성만 열어두며 GPU 목표 시간을 그대로 적용하지 않는다. 초기에는 완성 번들 1회 생성을 구현하고, fast preview는 phase timing에서 유의미한 개선이 입증되면 별도 tier로 추가한다. preview를 publishable revision으로 오인하지 않도록 서버 상태를 분리한다.

Benchmark는 권리 확보 사진 최소 60장: 긴/짧은 머리, 밝고 어두운 배경, 반투명 의상, 사진 경계에 닿은 신체, 안경/마이크, 가림, 다양한 피부 톤과 복수 인물 실패 사례를 포함한다. 미노/유나는 필수 회귀 사례다. 같은 사진을 cold/warm과 동시 1/2/4 조건으로 측정하고 raw CSV/하드웨어/model hash를 보관한다. 비용/속도 때문에 모델을 바꾸면 동일 세트로 재검사한다.

### 품질 게이트

- center/상하좌우/4대각 9점뿐 아니라 각 입력 축 -1..1의 9×9 격자와 연속 왕복 경로를 카드 tilt on/off에서 검사한다. 최종 viewport 330×495 및 430×645, DPR 1/2를 포함한다.
- 카드 내부 유효 표면 밖 hole 픽셀 0; rounded antialias 경계 1px은 검사 제외. 알려진 foreground source 경계가 카드 안으로 들어온 상태를 별도 ID pass로 검출한다. 배경이 구멍을 덮었다는 이유로 통과시키지 않는다.
- 비생성 원본 영역은 합성 전 픽셀 보존 검사. 중립 렌더는 색관리/압축 오차를 분리해 SSIM 0.99 이상을 초기 목표로 검증한다. 얼굴 rubber-sheet 왜곡은 SSIM만으로 판정하지 않고 원본 대조 사람 검토를 필수로 둔다.
- 생성 영역의 경계 seam, 추가 신체·텍스트·로고 생성, 얼굴 정체성 변화는 reject 또는 needs_review. 단순 mask 평균이나 confidence 숫자로 승인하지 않는다.
- 81점 검사는 연속 공간의 수학적 무결성 증명이 아니다. 재생 시에도 검증된 safeInputBounds, relief, renderer version을 강제하고 bounds 밖 입력은 clamp한다.
- raw AI confidence를 “신뢰도 95%”처럼 사용자에게 표시하지 않는다. 대신 검사 통과/검토 필요와 구체 사유를 표시한다.

## 10. 구현 단위와 출시 순서

다음은 설계의 연결 지도다. 각 단계는 별도 구현·실측 증거가 필요하며 완료 체크가 아니다.

| 단계 | 파일 연결점/신규 책임 | 완료 증거 |
|---|---|---|
| A. 실제 모델 benchmark | `spatial_worker/runtime.py`, `engine.py`; 신규 `benchmark.py`, `coverage.py`, `quality.py` | 수동 에셋 없는 60장 결과, 품질·latency·비용 보고서, 모델 라이선스 allowlist |
| B. 비동기 작업/불변 결과 | `backend/app/models.py`, 신규 Alembic migration, 신규 `spatial_jobs.py`/`spatial_job_runner.py`, `tasks.py`, `routers/artist.py` | 중복 요청·runner crash·stale lease·부분 업로드·삭제·예산 경쟁 테스트 |
| C. 번들 v3/보안 | `backend/app/spatial_scene.py`, `storage.py`, `routers/fan.py`, 신규 DTO/schema | 좌표 round-trip, EXIF, 잘못된 모델 출력, 소유권/미공개/만료/원본 비노출 테스트 |
| D. 공통 재생기 | 신규 `frontend/src/spatial/`의 manifest/geometry/controller와 renderer, `InteractiveCollectibleCard.tsx`, `api/client.ts`, `types.ts` | 원본 framing, 실제 카드 회전+시차, context loss/리소스 해제, 전체 각도 캡처 |
| E. Studio·심사 연결 | `builder_app/app.js`, `studio-core.js`, `backend/app/routers/admin.py`, 관리자 카드 심사 UI | 업로드→생성→새로고침→검토→저장→발매→팬 상세 실브라우저 E2E |
| F. 내부 파일럿 | `backend/app/core/config.py`, 환경 예시, 운영 runbook | kill switch, 쿼터/비용 알람, 두 실기기 성능, rollback 연습 |

기존 provider 단위 테스트 `backend/tests/unit/test_spatial_scene.py`, artist 계약 `backend/tests/contract/test_admin_and_artist.py`, Studio `builder_app/tests/studio-core.test.mjs`를 유지하며 추가한다. `frontend/tests/spatial-scene-preview.test.mjs`의 정규식 검사는 구조 회귀 보조만 담당한다. 렌더 품질/실모델 동작의 증거로 대체하지 않는다.

종합 출시 조건은 A~F 통과, 아티스트 검토 승인, 운영 예산·외부 provider 데이터 정책 확정이다. 단계 A의 품질 또는 비용이 기준 미달이면 공개 도입하지 않고 원본 2D를 유지한다. 카드 회전 자체는 공간 AI 성공과 독립적으로 작동해야 한다.

## 11. 결정 상태

- 제안 확정 범위: 서버 전처리/기기 재생 분리, 원본 보존, 회전범위 기반 생성, 불변 revision, 승인 게이트, private 저장, 자동 품질/비용 제한.
- 실측 후 확정할 범위: 분리/생성 체크포인트, GPU 종류/호스팅, 최종 허용 입력·해상도·각도·latency 예산. 이는 미완성 기능을 숨긴 항목이 아니라 production enable을 차단하는 명시적 평가 게이트다.
- 현재 수행한 것: 코드 연결점 조사와 서비스 설계 문서화. 수행하지 않은 것: 신규 모델 설치, 유료 자원 연결, 제품 코드 변경, 성능 실측, 운영 배포.
