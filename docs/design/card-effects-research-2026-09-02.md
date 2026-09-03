# 디지털 포토카드 3D·특수 효과 조사

## 결론

현재 프리뷰의 WebGL 광택은 이미지 텍스처 위에 색상과 빛을 합성하는 셰이더 효과다. 따라서 인물과 배경이 같은 평면에서 움직여 3D처럼 느껴지지 않는다. 애플의 Spatial Scene과 비슷한 결과를 내려면 카드 제작 시점에 깊이 정보를 생성하고, 인물·중간 배경·후면 배경을 분리한 뒤 시차 렌더링해야 한다.

## 온라인 레퍼런스에서 확인한 구조

- Apple `Spatial3DImage`는 2D 이미지를 깊이와 motion parallax를 가진 3D spatial scene으로 생성한다. 생성에는 수 초가 걸릴 수 있고, AI 기반 computational depth를 사용하므로 원본 2D 보기로 되돌리는 경로도 제공해야 한다.
- Apple의 spatial photo는 좌·우 눈용 이미지 쌍과 메타데이터를 저장하는 스테레오 방식이다. 일반 웹 카드의 기울기 전환과는 다른 포맷이다.
- 웹의 `DeviceOrientationEvent`는 사용자의 클릭 같은 일시적 활성화 이후 센서 권한을 요청해야 하며, HTTPS 같은 보안 컨텍스트가 필요하다.

## 구현 방식 비교

| 방식 | 입체감 | 준비물 | 모바일 부담 | 판단 |
| --- | --- | --- | --- | --- |
| 평면 텍스처 UV 이동 | 낮음 | 사진 1장 | 낮음 | 장식용으로만 사용 |
| 깊이맵 기반 2.5D | 중상 | 사진 1장 + 깊이맵 + 가려진 영역 보완 | 중간 | 팬앱 기본 전략 |
| 인물/배경 레이어 시차 | 높음 | 인물 분리 + 배경 보완 | 중간 | 희귀 카드에 적합 |
| 다중 시점 렌티큘러 | 높음 | 정면·좌·우 등 3~7장 | 중간 | 각도별 다른 사진 카드 |
| RealityKit Spatial3DImage | 높음 | iOS 네이티브 처리 | 기기 의존 | 네이티브 앱 단계에서 검토 |
| 완전한 3D GLB 모델 | 매우 높음 | 3D 모델·텍스처·리깅 | 높음 | 일반 카드에는 과함 |

## 권장 효과 조합

1. 기본 카드: 깊이맵 + 약한 카드 표면 반사
2. 희귀 카드: 인물 분리 + 2.5D 시차 + 홀로그램 포일
3. 시그니처 카드: 3~5개 시점 이미지 + 센서 기반 렌티큘러 전환
4. 한정판: 위 효과에 굴절·색수차·미세 글리터를 낮은 강도로 추가

과도한 입자, 강한 RGB 분리, 계속 흐르는 광선은 인물 인식과 가독성을 해치므로 기본값으로 사용하지 않는다. 효과는 단일 필터가 아니라 깊이·표면·조명·시점 입력의 조합으로 설계한다.

## 실제 구현 순서

### 1. 카드 생성 파이프라인

- 업로드 원본에서 깊이맵 생성
- 인물과 배경 마스크 생성
- 마스크 경계의 빈 영역을 보완
- 원본, 깊이맵, 마스크를 카드 에셋 세트로 저장
- 생성 실패 시 원본 2D 카드로 안전하게 폴백

### 2. 웹 렌더러

- WebGL/WebGPU에서 깊이값에 따라 UV를 이동
- 인물·중경·배경을 서로 다른 이동량으로 렌더링
- 카드 테두리와 반사광은 별도 레이어로 렌더링
- `prefers-reduced-motion`, 페이지 visibility, 기기 성능에 따라 애니메이션 제한

### 3. 휴대폰 동작

- 기본은 터치/드래그
- 사용자가 `기울기 센서 사용`을 누르면 권한 요청
- 권한 거부 시 터치 입력으로 즉시 대체
- 센서값은 필터링하고 회전 각도를 제한해 멀미와 과도한 왜곡 방지

### 4. 다중 시점 카드

- 시점 이미지 3장부터 시작: left / center / right
- 기울기값에 따라 인접 이미지 두 장을 블렌딩
- 5장 이상은 품질이 좋아지지만 저장 용량과 제작 비용 증가
- 같은 카드의 이미지인지 검증하는 asset group id 필요

## 현재 프리뷰의 한계와 다음 작업

`effects-gallery.html`과 `effects-3d-depth.html`은 실제 인물 이미지와 WebGL·센서 입력을 확인하는 데모다. 하지만 AI 깊이맵과 인물 마스크가 없기 때문에 애플 Spatial Scene과 같은 자연스러운 입체감은 아직 제공하지 않는다.

다음 구현은 기존 인물 카드에 대해 깊이맵·인물 마스크를 제작하는 카드 에셋 포맷을 먼저 만들고, 그 포맷을 읽는 WebGL 렌더러를 적용하는 순서가 안전하다. 그 후 같은 카드의 3개 시점 이미지를 추가해 각도별 다른 사진이 보이는 렌티큘러 효과를 검증한다.

## 2026-09-02 구현 상태

- 아티스트 자산에 `POST /api/artist/assets/{asset_id}/spatial-scene`를 호출하면 깊이맵 파생 자산과 `Asset.transform.spatialScene` 계약을 생성한다.
- 2026-09-03부터 계약 버전 2는 깊이맵만이 아니라 정렬된 인물 마스크와 인물이 제거된 복원 배경까지 함께 저장한다. 메인 API와 비전 모델을 분리해 Render API의 메모리/콜드 스타트를 보호하며, 운영 후보는 Apache-2.0인 Depth Anything V2 Small 깊이 추정, SAM 2 인물 분할, LaMa 계열 배경 복원 조합이다.
- 웹 런타임의 시점 범위는 yaw 약 ±4도, pitch 약 ±3도로 제한한다. 이는 360도 인물 생성이 아니라 Apple Spatial Scene과 유사한 작은 motion parallax를 목표로 하며, 저신뢰도/실패 시 반드시 원본 2D로 되돌린다.
- 스튜디오의 홀로그램 도구에 `깊이 장면 생성`을 연결했다. 생성 상태와 provider를 표시해 개발용 폴백을 AI 결과로 오인하지 않게 한다.
- 현재 로컬 환경에는 깊이 추정 모델 의존성이 없어 `local_fallback`이 실제 실행 provider다. 따라서 현재 결과는 AI 생성물이 아니다.
- 저장소 경로는 공개 카드 디자인 설정에 포함하지 않고, 아티스트 전용 깊이 자산 엔드포인트에서만 사용한다.
- 운영 전환 시 `ai_depth_estimator` provider를 서버 작업 큐에 연결하고, 팬 앱용 파생 자산은 별도의 공개/서명 URL 정책으로 전달해야 한다.

## 참고 자료

- Apple, [ImagePresentationComponent.Spatial3DImage](https://developer.apple.com/documentation/realitykit/imagepresentationcomponent/spatial3dimage)
- Apple, [Creating spatial photos and videos with spatial metadata](https://developer.apple.com/documentation/imageio/creating-spatial-photos-and-videos-with-spatial-metadata)
- Apple, [Presenting images in RealityKit](https://developer.apple.com/documentation/realitykit/presenting-images-in-realitykit)
- MDN, [DeviceOrientationEvent.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
