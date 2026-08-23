# 관리자 통계 운영 연결 설계

## 목표

로컬 통계 프리뷰를 실제 Fanfolio 운영 데이터와 연결한다. ROOT 관리자는 전체 서비스 범위를, 파트너 관리자는 자기 조직과 배정된 아티스트 범위만 조회한다.

## 데이터 원칙

- 카드 발급, 카드팩 개봉, 컬렉션 등록, 공개 확률은 기존 원장 테이블에서 집계한다.
- 최초 인식, 컬렉션 확인처럼 기존에 저장하지 않던 행동은 불변 `analytics_events` 원장에 기록한다.
- 과거 데이터로 복원할 수 없는 퍼널 단계는 0으로 위조하지 않고 `trackingSince`와 함께 추적 시작 이후 수치로 표시한다.
- 활성 팬은 조회 기간에 XP 획득, 카드팩 개봉, 카드 획득 중 하나 이상을 수행한 고유 사용자로 정의한다.

## 권한과 범위

- 새 읽기 권한 `statistics:read`를 추가한다.
- ROOT는 모든 조직과 아티스트를 조회할 수 있다.
- 파트너 company admin은 자기 조직의 아티스트를, manager/editor/viewer는 배정된 아티스트만 조회할 수 있다.
- 파트너가 범위 밖 `organizationId` 또는 `artistId`를 요청하면 존재 여부를 숨기기 위해 404를 반환한다.
- 플랫폼 검수 운영자는 기본적으로 통계 권한을 갖지 않는다.

## API

`GET /api/admin/statistics`

Query:

- `period`: `7`, `30`, `90`
- `compare`: 이전 동일 기간 포함 여부
- `organizationId`: ROOT 전용 파트너 필터
- `artistId`: 권한 범위 내 아티스트 필터
- `packId`: 권한 범위 내 카드팩 필터

Response:

- `scope`, `period`, `trackingSince`
- `filters`: 화면 필터 선택지
- `kpis`: 활성 팬, 카드 발급, 카드팩 개봉, 등록 완료율
- `trend`: 일별 활성 팬과 카드팩 개봉
- `funnel`: 인증번호 발급, 최초 인식, 카드 등록, 컬렉션 확인
- `packPerformance`: 카드팩별 개봉, 등록 전환, 전기 대비
- `operationHealth`: 등록 실패, 중복 시도, 확률 편차
- `oddsIntegrity`: 공개 확률과 실제 발급 비율
- `artistActivity`, `collectionSummary`: 파트너 화면용 집계

## 이벤트 원장

`analytics_events`는 다음을 저장한다.

- `event_name`
- `user_id`
- `organization_id`
- `artist_id`
- `card_id`
- `pack_id`
- `source`
- `dedupe_key`
- `metadata`
- `created_at`

최소 이벤트:

- `redemption.recognized`
- `redemption.succeeded`
- `redemption.failed`
- `collection.card_viewed`
- `card_pack.opened`

`dedupe_key`가 있는 이벤트는 재시도 시 중복 저장하지 않는다.

## 관리자 웹

- 정식 내비게이션에 `통계`를 추가한다.
- 프리뷰 렌더러를 API 응답 기반 공용 통계 렌더러로 전환한다.
- ROOT/파트너 전환 버튼은 프리뷰에서만 유지하고, 운영 화면은 로그인한 역할로 자동 고정한다.
- 로딩, 오류, 빈 상태를 제공한다.
- `?preview=statistics`는 시각 개발용 고정 fixture로 유지한다.

## 검증

- ROOT와 파트너의 동일 요청이 서로 다른 범위를 반환한다.
- 범위 밖 파트너·아티스트·카드팩은 조회할 수 없다.
- 수동 인증번호 등록과 카드팩 개봉 후 KPI·퍼널·확률 집계가 증가한다.
- 카드 상세 조회 후 컬렉션 확인 단계가 증가한다.
- 7/30/90일과 이전 기간 비교가 날짜 경계를 정확히 적용한다.
- 관리자 화면이 하드코딩 수치가 아니라 API 응답을 표시한다.
