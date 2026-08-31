# Fanfolio 서비스 완성도 검토

- 작성일: 2026-08-31
- 범위: 비-NFT 디지털 카드 소유권·보안, 팬 팔로우 추천, 결제·포인트 원장, 오프라인 사전녹화 이벤트 모집·현장 운영
- 목적: 이미 동작하는 기능과 상용 서비스에 필요한 보장을 구분하고 성능·보안·개인정보·운영 효율을 포함한 다음 고도화 순서를 결정한다.

## 1. 최종 요약

Fanfolio는 검토한 네 영역 모두 **기능의 뼈대 또는 확장 기반은 있으나 상용 출시 기준의 보장과 운영 증거가 아직 부족하다.** 현재 상태를 한 문장으로 정리하면 다음과 같다.

> 비-NFT 디지털 카드와 포인트 경제를 운영할 수 있는 트랜잭션 기반은 갖췄지만, 독립적으로 검증 가능한 소유권 증거, 실제 개인화 추천, 실결제 상태 머신·대사 체계, 대규모 오프라인 이벤트의 안전하고 빠른 현장 운영까지는 완성되지 않은 제한 베타 단계다.

| 영역 | 현재 결론 | 현재 단계 | 다음 출시 게이트 |
| --- | --- | --- | --- |
| 카드 소유권·보안 | NFT는 필요하지 않다. 다만 현재 DB 원장만으로는 운영 DB 침해나 내부자 변조 뒤의 독립 증명이 어렵다. | 제한 베타 | DB 권한 분리, 변조 탐지 체크포인트, 거래 재인증, 세션 일괄 폐기, 외부 백업·복구 증적 |
| 팬 추천 | 현재는 후보 정보 제공과 필터·정렬이지 개인화 추천 알고리즘이 아니다. | 알파 | 노출·클릭·팔로우·거절 이벤트 수집, 설명 가능한 V1 점수, 안전·다양성 재정렬, 품질 지표 |
| 포인트 상점 | 내부 포인트 차감·주문·지급·환불은 상당 부분 원자적으로 구현되어 있다. | 제한 베타 후보 | 멱등키-요청 결합, 동시성 회귀, 원장 대사, 운영 샌드박스 차단 |
| 실결제 | 카드·카카오·네이버 표시는 샌드박스이고 PG 승인·취소·webhook·정산은 없다. | 데모 | PG 상태 머신, 서명 webhook, 중복 이벤트 inbox, 이중원장, 일일 대사, 환불·분쟁 운영 |
| 오프라인 사녹 운영 | 이벤트 신청·추첨 기반은 있으나 선택 정책, 도착·신원·입장 상태, 현장 QR, 디지털 대기열과 대리 참석 방지가 없다. | 기획·기반 단계 | 행사별 모집 정책, 일괄 도착 확인, 짧은 대면 신원 확인, 비양도성 입장 표식, 입장·참석 감사 원장, 내·외국인 예외 경로 |

따라서 **NFT 도입이나 추천 ML 도입보다 먼저 포인트 무결성과 운영 샌드박스 경계를 닫는 것이 우선**이다. 이후 추천 V1 계측, 소유권 독립 증명, 오프라인 행사 운영 파일럿을 병행하고, 실제 유료 판매를 결정한 시점에 PG·회계 원장을 추가한다.

## 2. 서비스 완성도를 판단하는 방법

기능 존재 여부만으로 완료를 판단하지 않는다. 각 기능은 다음 세 종류의 증거를 모두 구분해 기록한다.

1. **구현 증거**: 코드와 DB 제약이 의도한 규칙을 표현하는가.
2. **검증 증거**: 정상·실패·재시도·동시 요청·롤백을 자동 테스트가 증명하는가.
3. **운영 증거**: 배포 DB, 실제 브라우저·폰, 외부 공급자, 백업 복구에서 같은 결과를 확인했는가.

서비스 단계는 다음처럼 정의한다.

| 단계 | 필요한 조건 |
| --- | --- |
| 데모 | 정상 경로가 보이고 한 번 동작한다. 데이터 보존·재시도·장애 복구는 보장하지 않는다. |
| 알파 | 서버 데이터와 오류 처리가 연결되고 주요 계약 테스트가 있다. 운영·보안·동시성은 제한적이다. |
| 제한 베타 | 핵심 불변식, 재시도, 권한, 감사, 복구 절차를 갖추고 제한된 사용자를 운영할 수 있다. |
| 상용 출시 | 실결제·법적 고지·분쟁·대사·관측·재해 복구와 외부 공급자 장애까지 운영 가능하다. |
| 고신뢰 서비스 | 플랫폼 침해 뒤에도 외부 증거로 소유권과 거래를 검증·복구할 수 있다. |

이 문서는 즉시 구현할 기능 목록이 아니라 **서비스 고도화 위험 등록부와 의사결정 기록**으로 사용한다. 새 기능은 화면 수가 아니라 현재 기반, 보안·개인정보 위험, 성능 목표, 실패·복구 경로, 자동 검증과 실제 운영 증거를 함께 정의한 뒤 구현 우선순위에 넣는다.

## 3. 결론 A — NFT 없이 소유권을 보장하는 방법

### 3.1 제품 결정

NFT를 사용하지 않는다. NFT는 토큰의 체인상 귀속을 보여줄 수 있지만 다음을 자동으로 보장하지 않는다.

- 카드 이미지의 저작권이나 아티스트 IP 사용권
- 계정 탈취·피싱으로 잘못 발생한 이전의 복구
- 서비스 화면과 메타데이터의 영구 제공
- 분실 지갑 키의 복구와 일반 사용자 UX

Fanfolio가 보장할 대상은 다음처럼 명확히 정의해야 한다.

> 사용자는 특정 카드 에디션과 일련번호에 연결된 **Fanfolio 디지털 수집품 이용·보유 권리**를 가진다. 저작권은 별도 권리자에게 있으며, 거래 가능 여부와 서비스 종료 시 증명·이전·복구 정책은 약관과 원장 규칙으로 보장한다.

### 3.2 현재 확보된 기반

| 보장 | 구현 증거 | 판단 |
| --- | --- | --- |
| 카드 중복 지급 방지 | `backend/app/services.py:157-223` | 카드와 소유권 이벤트를 호출자 트랜잭션 안에서 함께 생성하고 지급 출처를 멱등키처럼 사용한다. |
| 카드팩 개봉 | `backend/app/routers/fan.py:1224-1415` | 개봉·카드 지급·성장 이벤트를 트랜잭션으로 연결한다. |
| 거래 중 소유권 경쟁 방지 | `backend/app/routers/social.py:779-917` | 제안과 카드 행을 `FOR UPDATE`로 잠그고 현재 소유자를 다시 확인한 뒤 양쪽 소유자를 한 번에 변경한다. |
| 거래 이력 | `backend/app/models.py:1112-1147` | 지급·이전 이벤트에 카드, 이전 소유자, 새 소유자, 출처를 기록한다. |
| 토큰 재사용 대응 | `backend/app/auth_tokens.py:165-213` | refresh token 재사용 탐지 시 같은 rotation family를 폐기한다. |
| 운영 DB 강제 | `backend/app/core/config.py:245-260` | hosted 환경에서 PostgreSQL과 Alembic 사용을 강제한다. |

2026-08-31 진행분으로 신규 소유권 이벤트에는 `previous_hash`와 `record_hash`를 기록하고, 카드 이력 API에서도 두 값을 반환한다(`backend/app/services.py:170-247`, migration `0076_ownership_ledger_hash_chain`). 기존 레거시 행은 nullable로 보존되므로, 외부 서명 체크포인트와 전체 체인 검증기는 후속 작업이다.

### 3.3 아직 부족한 보장

1. **원장은 애플리케이션 관례상 append-only일 뿐 DB가 강제하지 않는다.**
   - `CardOwnershipLedger`와 `AuditLog`는 일반 테이블이다.
   - 애플리케이션 DB 계정의 `UPDATE`, `DELETE`, `TRUNCATE`를 분리했다는 마이그레이션이나 운영 증거가 없다.
   - 동일 DB를 장악한 공격자는 카드 현재 소유자, 원장, 감사 로그를 함께 바꿀 수 있다.

2. **해시 체인만 같은 DB에 추가하는 것으로는 충분하지 않다.**
   - DB 전체 권한을 가진 공격자는 과거 행과 해시를 다시 계산할 수 있다.
   - 독립 저장소에 주기적으로 서명한 체크포인트가 있어야 변조 전 시점을 입증할 수 있다.

3. **과거 영수증만으로 현재 소유자를 증명할 수 없다.**
   - 거래 이후에도 예전 소유자가 과거 영수증을 보관할 수 있다.
   - 영수증에는 시점과 원장 체크포인트가 필요하고, 검증기는 이후 이전·회수 이벤트까지 확인해야 한다.

4. **고위험 거래 재인증이 없다.**
   - 로그인 세션을 가진 공격자가 그대로 거래를 확정할 수 있다.
   - 비밀번호 변경·팬 비밀번호 재설정 뒤 모든 기존 세션을 폐기하는 흐름도 일관되지 않다. 팬 비밀번호 재설정은 비밀번호와 링크만 변경한다(`backend/app/routers/auth.py:342-375`).

5. **재해 복구가 운영 증거로 완료되지 않았다.**
   - 로컬 격리 PostgreSQL 백업·복원 리허설은 통과했으나 운영 PostgreSQL 백업을 사용한 복원 증적은 남아 있다(`docs/audits/platform-hardening-2-12-2026-08-26.md:62-78`).

### 3.4 목표 구조

NFT 대신 다음 다섯 층을 사용한다.

1. **권리 계약**: 에디션, 일련번호, 거래 가능 조건, 저작권 비포함, 서비스 종료 시 내보내기·검증 정책을 약관과 카드 메타데이터에 고정한다.
2. **현재 상태**: `user_cards.user_id`는 빠른 조회를 위한 현재 소유자 projection으로 유지한다.
3. **불변 이벤트**: 지급·이전·회수·복구를 새 이벤트로만 추가한다. 과거 이벤트는 수정하지 않는다.
4. **독립 체크포인트**: 일정 구간의 이벤트로 Merkle root 또는 누적 해시를 만들고 KMS/HSM 키로 서명해 별도 immutable storage에 보관한다.
5. **검증·복구**: 사용자가 서명 영수증을 내려받고, 별도 검증기가 최신 체크포인트까지 소유권 연속성을 확인하며, PITR·오프라인 백업으로 복구한다.

거래 확정, 이메일·비밀번호 변경, 고가 카드 이전에는 passkey/WebAuthn 기반 step-up 인증을 적용한다. 관리자 보정은 요청자와 승인자를 분리하고 금융·소유권 전용 권한을 사용한다. 현재 승인 API가 `audit:read`로 생성·승인까지 허용하는 구조(`backend/app/routers/admin.py:1460-1541`)는 분리해야 한다.

### 3.5 이 영역의 완료 기준

- 애플리케이션 DB 역할은 소유권 원장에 `INSERT`, `SELECT`만 가능하고 `UPDATE`, `DELETE`, `TRUNCATE`는 불가하다.
- 이전·회수·복구는 모두 새 이벤트이며 현재 소유자 projection과 원장을 대사할 수 있다.
- 서명 체크포인트와 사용자 영수증을 운영 DB 밖에서 검증한다.
- 거래 확정에 step-up 인증과 transaction-bound challenge가 적용된다.
- 비밀번호·passkey 복구 시 기존 세션과 고위험 거래 승인을 폐기한다.
- 운영 백업으로 격리 복원 후 카드 현재 소유자와 원장 root를 대사한 증적이 있다.

## 4. 결론 B — 팬 팔로우 추천 알고리즘

### 4.1 현재 결론

현재 팬 찾기는 추천에 필요한 일부 특징을 계산하지만 **추천 모델은 아니다.** 백엔드는 팬 후보를 닉네임 순으로 반환하고, 프론트가 보유 카드 수와 팔로워 수로 다시 정렬하거나 조건별로 필터링한다.

| 현재 동작 | 구현 증거 | 한계 |
| --- | --- | --- |
| 후보 조회 | `backend/app/routers/social.py:459-511` | 본인과 차단 사용자는 제외하지만 삭제 계정 조건, 페이지네이션, 후보 제한이 없다. |
| 후보 특징 | `backend/app/routers/social.py:213-299` | 공통 아티스트, 공개 카드, 거래 가능 카드, 위시리스트 일치 수는 계산한다. |
| 홈 추천 정렬 | `frontend/src/App.tsx:3551-3579` | `ownedCount`, `followerCount`, 닉네임 순으로 정렬한 상위 2명이다. 개인별 종합 점수는 없다. |
| 팬 찾기 필터 | `frontend/src/components/FanSocialHub.tsx:17-42` | 같은 아티스트·거래 가능·위시리스트·최근 카드 획득을 각각 필터링할 뿐 점수를 결합하지 않는다. |
| 선호 데이터 | `backend/app/models.py:54-66` | 관심 아티스트와 멤버가 있으나 팬 추천은 `favorite_member_ids`를 사용하지 않는다. |
| 행동 데이터 | `backend/app/routers/social.py:418-456` | 팔로우는 이벤트를 남기지만 노출, 프로필 열기, 추천 거절, 언팔로우 사유는 추천 학습 이벤트로 남지 않는다. |

즉 현재 결과는 활동량이 많고 이미 인기 있는 팬을 반복 노출하기 쉽고, 신규 팬·소규모 취향·다양성을 충분히 보장하지 못한다. 추천 정확도를 평가할 노출 분모도 없어 “추천이 잘된다”는 운영 지표를 계산할 수 없다.

### 4.2 지금 선택할 방법

당장은 외부 ML 서비스나 벡터 DB를 도입하지 않는다. 데이터가 적은 시기에는 PostgreSQL/FastAPI 안에서 설명 가능한 규칙 기반 V1을 먼저 운영하는 편이 더 빠르고 검증 가능하다.

#### 후보 생성

- 본인, 삭제·정지 계정, 양방향 차단, 최근 신고 제재 계정 제외
- 이미 팔로우한 팬은 별도 탭으로 분리하거나 큰 감점
- 공통 아티스트·멤버
- 내가 찾는 카드를 보유하면서 거래 가능한 팬
- 공통 팔로우 또는 2-hop 관계
- 최근 정상 활동과 거래 완료 이력
- 신규 팬 노출용 탐색 후보

#### 초기 설명 가능 점수

아래 가중치는 확정 정책이 아니라 첫 실험 가설이다.

```text
score = 0.25 * 공통 아티스트·멤버
      + 0.25 * 위시리스트·거래 적합도
      + 0.15 * 공통 팔로우
      + 0.10 * 최근 정상 활동
      + 0.10 * 성공 거래 품질
      + 0.10 * 신규 팬 탐색 보너스
      + 0.05 * 프로필·컬렉션 완성도
      - 차단·신고·반복 노출·이미 팔로우 감점
```

최종 정렬에서는 같은 아티스트·같은 인기 팬만 연속되지 않게 다양성 재정렬을 적용한다. 사용자에게는 “같은 아티스트를 좋아해요”, “내가 찾는 카드 2장을 보유했어요”처럼 실제 점수 근거만 표시한다.

### 4.3 먼저 수집할 이벤트

각 노출에 `recommendation_id`, `algorithm_version`, `position`, `reason_codes`를 함께 기록한다.

- `fan_recommendation_impression`
- `fan_profile_opened`
- `fan_followed_from_recommendation`
- `fan_recommendation_dismissed`
- `fan_unfollowed`
- `fan_blocked` / `fan_reported`
- `trade_proposed_from_recommendation`
- `trade_completed_from_recommendation`

핵심 지표는 추천 노출 대비 팔로우 전환율, 7일·30일 유지 팔로우율, 차단·신고율, 상위 아티스트 편중도, 신규 팬 노출률, 동일 후보 반복 노출률이다. 팔로우 수만 최적화하면 스팸·인기 편향이 커질 수 있으므로 안전 지표를 동등한 출시 게이트로 둔다.

### 4.4 외부 도구 도입 시점

- 행동 데이터가 쌓이면 [`implicit`](https://benfred.github.io/implicit/)의 ALS/BPR로 후보 점수를 실험할 수 있다.
- AWS Personalize는 이벤트 수집·운영 비용을 감당할 규모가 된 뒤 검토한다. AWS는 최소 데이터 요건과 별도로 더 많은 사용자·상호작용을 품질 권장치로 제시한다.
- `pgvector`, TensorFlow Recommenders, RecBole은 콘텐츠 임베딩이나 학습 파이프라인이 실제 병목으로 확인되기 전에는 필요하지 않다.

추천 시스템의 일반 구조는 Google의 [candidate generation → scoring → re-ranking](https://developers.google.com/machine-learning/recommendation/overview/types) 단계를 따른다.

### 4.5 이 영역의 완료 기준

#### 2026-08-31 진행 반영

- `/api/fans/recommendations`를 추가해 서버가 `fan-v1` 알고리즘 버전, 정렬 주체, 이유 코드와 함께 추천 결과를 반환한다.
- 기존 `/api/fans` 검색도 동일한 추천 점수·이유 메타데이터를 반환하며, 삭제된 계정은 후보에서 제외한다.
- 이는 설명 가능한 서버 정렬 계약을 닫은 단계이며, 거절·장기 유지율·다양성 지표는 아직 후속 작업이다.
- 추천 기본 목록의 상위 10개 노출은 `recommendation.impression`으로 기록하고, 추천 경유 팔로우는 `recommendation.followed`로 기록한다. 관리자 통계의 `recommendationQuality`에서 `fan-v1` 노출·프로필 조회·팔로우 수와 전환율을 확인할 수 있다.

- `/api/fans/recommendations`가 페이지네이션, 알고리즘 버전, 이유 코드와 함께 서버 정렬 결과를 반환한다.
- 삭제·차단·정지·고위험 계정이 후보 생성 단계에서 제외된다.
- 추천 목록 상위 10개 노출, 추천 카드 프로필 조회, 추천 경유 팔로우까지 attribution이 연결된다. 언팔로우·차단·신고·거래 전환 attribution은 후속 작업이다.
- 서버 점수·안전 필터·fallback은 회귀 검증됐지만, 오프라인 결정론·다양성·콜드스타트 평가는 후속 작업이다.
- 운영 통계에서 `fan-v1`의 노출·프로필 조회·팔로우와 전환율을 확인할 수 있으며, 안전 지표와 알고리즘 버전 비교 대시보드는 후속 작업이다.
- 추천이 실패해도 안전한 기본 정렬로 fallback한다.

## 5. 결론 C — 결제·포인트 원장의 멱등성과 원자성

### 5.1 용어

- **멱등성**: 같은 논리 요청을 네트워크 오류로 여러 번 보내도 효과는 한 번만 발생하고 최초 결과를 재현하는 성질이다.
- **원자성**: 잔액, 원장, 주문, 지급 상태가 모두 성공하거나 모두 롤백되어 중간 상태가 남지 않는 성질이다.
- **원장**: 잔액의 근거가 되는 사건 기록이다. 잔액은 빠른 조회를 위한 projection이며 원장에서 다시 계산할 수 있어야 한다.
- **대사**: 내부 주문·원장·잔액을 PG 승인·환불·정산 자료와 비교해 누락과 중복을 찾는 절차다.

멱등성과 원자성은 서로 대체하지 않는다. 한 요청 안의 DB 쓰기를 한 번에 묶어도 재시도가 중복되면 안 되고, 멱등키가 있어도 잔액만 바뀌고 상품 지급이 실패하면 안 된다.

### 5.2 현재 데이터 구조

| 데이터 | 역할 | 현재 제약 |
| --- | --- | --- |
| `PointLedger` | 적립·사용·역전·만료·조정 사건 | `(user_id, source_event_id, rule_key)` 유일, 유형 CHECK |
| `PointBalance` | 사용자별 현재 잔액 cache | 사용자 PK, `balance >= 0` CHECK |
| `PointTransaction` | 외부 명령의 멱등 기록 | `(user_id, operation, idempotency_key)` 유일 |
| `ShopOrder` | 상품·가격·결제수단 snapshot | `(user_id, idempotency_key)` 유일, 포인트 결제만 허용 |
| `ShopOrderEntitlement` / `RewardGrant` | 카드팩 사용권 또는 보상 지급 | 주문별 중복 지급 방지와 환불 시 revoke 상태 |
| `PointCharge` | 샌드박스 포인트 충전 기록 | `(user_id, idempotency_key)` 유일, 즉시 `completed` |

모델 근거는 `backend/app/models.py:662-714`, `backend/app/models.py:1274-1391`에 있고, DB 제약은 `backend/alembic/versions/0050_growth_missions_points.py`, `0053_point_transactions_and_shop_refunds.py`, `0068_point_charge_flow.py`에 있다.

### 5.3 현재 잘된 부분

1. **포인트 잔액을 잠근다.**
   - `_get_or_create_point_balance_for_update`, `spend_points`, `reverse_points`가 잔액 행을 잠근다(`backend/app/services.py:445-521`, `661-744`).
   - 운영 환경은 PostgreSQL을 강제하므로 `FOR UPDATE`가 경쟁 쓰기를 직렬화한다.

2. **상점 구매의 관련 쓰기를 한 DB 트랜잭션에 둔다.**
   - 상품 행 잠금, 재고 증가, 포인트 차감, 원장, 주문, 카드팩 사용권 또는 보상 지급, `PointTransaction`을 마지막 commit 전까지 같은 세션에서 처리한다(`backend/app/routers/fan.py:469-584`).
   - 중간 예외가 나면 요청 세션이 rollback되어 “포인트만 차감” 또는 “상품만 지급” 상태를 피한다.

3. **상점 환불은 더 명시적으로 원자화되어 있다.**
   - 주문과 지급 상태를 잠그고 사용 여부를 확인한 뒤, 지급 revoke, 역전 원장, 환불 transaction, 주문 상태를 `async with session.begin()` 안에서 함께 변경한다(`backend/app/routers/fan.py:588-689`).

4. **순차 재시도와 지급 원자성 테스트가 있다.**
   - 관리자 조정, 주문 재시도, 단일 환불, 카드팩·보상 지급/회수를 검증한다(`backend/tests/contract/test_points_economy.py:50-225`).
   - 서로 다른 최초 포인트 적립과 동일 적립의 경쟁 테스트도 있다(`backend/tests/unit/test_growth_economy_services.py:117-295`).

5. **이번 검토의 집중 회귀가 통과했다.**
   - 실행(`backend` 디렉터리): `.venv/bin/python -m pytest -q tests/contract/test_points_economy.py tests/contract/test_shop_api.py tests/unit/test_growth_economy_services.py tests/contract/test_support_tickets.py`
   - 결과: `20 passed, 1 warning in 6.46s`

이 증거는 내부 DB 경제의 기반이 있다는 뜻이지 PG 결제나 운영 동시성 전체를 증명하는 것은 아니다.

### 5.4 현재 결함과 출시 위험

#### P0 — 운영 샌드박스 충전 차단이 없다

팬 충전 요청은 `sandbox_card`, `sandbox_kakao`, `sandbox_naver`만 받지만(`backend/app/schemas.py:850-855`), 서버는 실제 PG 승인을 확인하지 않고 즉시 포인트 원장과 `completed` 충전 기록을 만든다(`backend/app/services.py:550-610`). 프론트는 테스트 결제임을 표시하지만(`frontend/src/App.tsx:248-288`) 서버 라우터에서 hosted/production 차단 조건이나 QA 전용 권한을 찾지 못했다.

**영향:** 이 경로가 운영 배포에서 열려 있으면 일반 팬 계정이 실제 결제 없이 포인트를 발행할 수 있다. 유료 가치가 있는 상품을 포인트로 구매할 수 있다면 즉시 출시 차단 사유다.

**조치:** 실결제 도입 전에는 hosted 환경에서 충전 catalog/create/refund를 404 또는 403으로 닫고, 명시적 QA 환경·QA 역할에서만 샌드박스를 허용한다. 화면 숨김이 아니라 서버가 강제해야 한다.

#### P0 — 멱등키가 최초 요청 내용과 결합되지 않는다

> 2026-08-31: 주문·포인트 충전·관리자 포인트 조정의 동일 키/상이 payload 또는 resource 충돌은 `409 IDEMPOTENCY_KEY_REUSED`로 거부하도록 보강했다. 포인트 충전 환불에도 키를 필수화했다. canonical request hash와 응답 snapshot 저장은 후속 P1 작업으로 남긴다.

현재 구현은 키 중복만 확인하고 최초 요청의 상품·수량·결제수단·대상과 같은지 비교하지 않는다.

- 포인트 충전은 같은 키가 있으면 새 `package_id`나 `payment_method`를 검사하지 않고 과거 충전을 반환한다(`backend/app/services.py:558-566`).
- 주문은 같은 키가 있으면 URL body의 다른 `productId`를 검사하지 않고 과거 주문을 반환한다(`backend/app/routers/fan.py:478-495`).
- 관리자 조정은 같은 키에 다른 금액을 넣어도 과거 원장을 재생하면서 응답에는 새 요청 금액을 표시할 수 있다(`backend/app/routers/admin.py:2506-2530`).
- 주문 환불은 같은 환불 키를 다른 주문 URL에 재사용하면 기존 transaction을 찾은 뒤 요청 URL의 `orderId`와 과거 잔액을 조합해 성공 응답할 수 있다(`backend/app/routers/fan.py:600-616`).

Stripe도 같은 idempotency key의 재요청 파라미터가 최초 요청과 다르면 오류를 반환한다. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

**조치:** 모든 명령에 canonical request hash와 `resource_type/resource_id`를 저장한다. 같은 키·같은 hash는 최초 상태·응답을 반환하고, 같은 키·다른 hash는 `409 IDEMPOTENCY_KEY_REUSED`로 거부한다.

#### P0 — 상점 주문의 Idempotency-Key가 서버에서 필수가 아니다

> 2026-08-31: 상점 주문에서 `Idempotency-Key`를 필수화했다. 프론트의 주문·충전 환불 호출도 키를 전송한다.

프론트는 키를 보내지만 API는 키가 없으면 새 UUID를 생성한다(`backend/app/routers/fan.py:469-479`). 네트워크 timeout 뒤 키 없이 재시도하는 다른 클라이언트는 중복 주문·차감을 만들 수 있다.

**조치:** 모든 잔액 변동 `POST`에 키를 필수로 하고 길이·형식·보존 기간을 계약으로 고정한다.

#### P1 — 동시 중복 요청의 loser 복구가 불완전하다

포인트 적립 helper는 유일 제약 충돌을 회수하지만, `PointCharge`와 `ShopOrder` 생성은 “조회 후 insert” 경쟁에서 최종 유일 제약 오류를 최초 결과로 복구하는 경로가 없다. 현재 계약 테스트의 주문·충전 재시도는 순차 호출이며 동일 키 동시 10~20개 요청을 검증하지 않는다.

**조치:** command row를 먼저 insert/claim하고, 유일 제약 loser는 저장된 결과를 조회해 반환한다. PostgreSQL에서 실제 동시 HTTP 테스트를 추가한다.

#### P1 — 포인트 충전 환불의 명령 원장이 불완전하다

충전 생성은 `PointTransaction(operation='charge')`을 만들지만 충전 환불은 `PointLedger`와 `PointCharge.status`만 변경하고 별도 `PointTransaction(operation='refund')`을 만들지 않는다(`backend/app/services.py:613-658`). 환불 API에도 Idempotency-Key가 없다(`backend/app/routers/fan.py:1736-1751`). 현재는 charge 행 잠금과 상태로 순차 재요청을 막지만, 외부 PG 환불과 연결할 명령 identity와 실패 상태가 없다.

#### P1 — 거래 유형과 상태가 운영 현실을 표현하지 못한다

- 상점의 포인트 **사용**도 `PointTransaction.operation='charge'`로 기록한다(`backend/app/routers/fan.py:569-578`). 포인트 구입과 사용을 구분하기 어렵다.
- `PointTransaction.status`는 `failed`를 허용하지만 실제 생성 경로는 `completed`만 기록한다. 요청이 중간 실패하면 transaction 자체가 rollback되어 운영 화면의 실패 건수에 남지 않는다.
- `PointCharge`는 생성 즉시 `completed`이며 `pending`, `requires_action`, `authorized`, `captured`, `refund_pending` 같은 공급자 상태가 없다.
- 포인트 충전과 상점 주문이 모두 operation `charge` namespace를 써 같은 사용자가 같은 키를 두 API에 보내면 `PointTransaction` 유일 제약이 충돌할 수 있다.

#### P1 — 원장 불변성과 대사가 DB·운영에서 강제되지 않는다

- `PointLedger`는 docstring상 immutable이지만 DB 역할, trigger, 권한으로 수정·삭제를 차단하지 않는다.
- `PointBalance.balance == SUM(PointLedger.amount)`를 주기적으로 확인·복구하는 대사 job과 경보를 찾지 못했다.
- 주문, 지급, point transaction, ledger의 orphan·금액 불일치를 검사하는 운영 invariant가 없다.
- `expires_at`과 `expire` 유형은 모델에 있지만 포인트 만료 processor는 없다. 만료 정책을 제공하지 않을 것이면 노출하지 말고, 제공할 것이면 별도 만료 원장과 사전 알림을 구현해야 한다.

#### P1 — 금융·보정 권한이 감사 조회 권한과 섞여 있다

승인 요청 생성과 승인 실행이 모두 `audit:read`를 요구한다(`backend/app/routers/admin.py:1460-1541`). viewer도 `audit:read`를 가진다(`backend/app/admin_access.py:130-140`). 자기 승인만 막는 것으로는 금융 조정 권한 분리가 충분하지 않다.

**조치:** `finance:request_adjustment`, `finance:approve_adjustment`, `finance:refund`, `ledger:read`를 분리하고 조직 범위·금액 한도·step-up·이중 승인을 적용한다.

#### P2 — 삭제와 감사 보존 정책을 더 강하게 해야 한다

포인트·주문·소유권 모델의 사용자 FK 일부는 `ON DELETE CASCADE`다. 현재 계정 삭제 API는 익명화 중심이지만 DB 차원의 하드 삭제가 원장까지 지울 수 있는 구조는 고신뢰 감사에 맞지 않는다. 원장은 pseudonymous party ID를 유지하고 사용자 PII만 분리·삭제하는 구조가 안전하다.

### 5.5 실결제를 추가할 때의 목표 구조

PG와 Fanfolio DB는 하나의 ACID transaction으로 묶을 수 없다. 따라서 “PG 호출 성공 + DB commit”을 한 함수 안에서 연속 호출하는 것으로 원자성을 만들 수 없다. 다음 상태 머신과 inbox/outbox 패턴을 사용한다.

```text
사용자 결제 요청
  -> payment_order 생성 (idempotency key + request hash, pending)
  -> PG Payment Intent 생성/확인 (같은 provider idempotency key)
  -> 사용자 인증/3DS
  -> PG 서명 webhook 수신
  -> webhook event_id를 inbox에 1회 claim
  -> [한 DB transaction]
       payment_order 상태 전이
       화폐 journal 기록
       포인트 발행 원장 기록
       PointBalance projection 갱신
       사용자 영수증 outbox 생성
  -> commit
  -> outbox 비동기 전송
```

클라이언트 redirect의 “성공” 값만 믿고 포인트를 발행하지 않는다. PG가 제공하는 상태를 서버에서 확인하고, webhook 서명을 검증하며, 중복 event ID를 무시한다. Stripe 역시 payment state machine과 중복 webhook 처리를 공식적으로 요구한다.

- [PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)
- [Webhook signature and duplicate event handling](https://docs.stripe.com/webhooks)

### 5.6 화폐 원장과 포인트 원장을 분리한다

실결제 전에는 현재 단일 포인트 원장으로 운영할 수 있다. 실제 원화 결제가 시작되면 다음 두 원장을 분리한다.

1. **화폐 journal — double-entry**
   - PG 미수금/현금성 자산
   - 고객 포인트 부채
   - 수수료
   - 환불·chargeback 부채
   - 각 journal transaction의 debit 합과 credit 합은 항상 동일

2. **포인트 unit ledger — event-sourced**
   - 발행, 사용, 환불, 만료, 운영 보정
   - 모든 항목에 화폐 journal 또는 비금전 source event를 연결
   - `PointBalance`는 projection이며 언제든 재생성 가능

3. **상품·소유권 ledger**
   - 어떤 결제·포인트 사용이 어떤 카드팩 사용권·보상·카드 소유권을 만들었는지 연결

이 세 원장을 분리하되 `business_reference_id`로 연결하면 “PG에는 결제 성공인데 포인트가 없음”, “포인트는 차감됐는데 카드가 없음”을 대사할 수 있다.

### 5.7 DB 불변식과 권한

PostgreSQL transaction은 여러 변경을 all-or-nothing으로 묶고, `FOR UPDATE`는 경쟁 writer를 transaction 종료까지 기다리게 한다.

- [PostgreSQL transactions](https://www.postgresql.org/docs/16/tutorial-transactions.html)
- [PostgreSQL explicit row locking](https://www.postgresql.org/docs/17/explicit-locking.html)

다음 규칙은 애플리케이션 코드뿐 아니라 DB에 둔다.

- 원장 amount, 상태 전이, debit=credit 제약
- provider event ID와 idempotency scope 유일 제약
- 원장 table owner와 app writer 역할 분리
- app writer는 원장 `INSERT/SELECT`만 가능
- 원장 `UPDATE/DELETE/TRUNCATE` revoke
- projection 갱신은 제한된 함수 또는 transaction service만 허용

PostgreSQL은 `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` 권한을 별도로 관리할 수 있다. [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html)

### 5.8 대사와 복구

#### 실시간 invariant

- `PointBalance = SUM(PointLedger.amount)`
- 완료 주문마다 정확히 하나의 spend ledger와 지급 결과가 존재
- 환불 주문마다 원 debit을 가리키는 정확히 하나의 reverse ledger가 존재
- point charge의 포인트·가격·provider amount가 package snapshot과 일치
- 같은 provider event는 한 번만 처리
- double-entry journal의 debit 합 = credit 합

#### 정기 대사

- 매시간: 내부 주문 ↔ 지급 ↔ 포인트 원장
- 매일: PG 승인·취소·환불 ↔ payment order ↔ 화폐 journal
- 매 정산 주기: PG 정산 입금 ↔ 수수료 ↔ 은행 입금
- drift 발견 시 자동 수정하지 말고 incident와 보정 approval을 생성

#### 복구

- PostgreSQL PITR과 암호화 백업
- 운영 백업의 정기 격리 복원
- 원장 재생으로 잔액 projection 재생성
- 외부 provider 재조회로 webhook 누락 복구
- signed reconciliation report를 별도 immutable storage에 보관

## 6. 결론 D — 오프라인 사녹 이벤트의 모집·현장 인증·입장 운영

### 6.1 문제와 제품 결정

기존 사전녹화 행사는 특정 시각에 참가자를 집결시키고, 부재 시 순번을 뒤로 미루거나 당첨을 취소한 뒤, 앞 번호부터 명단·신분증·자격 문서를 수작업으로 확인하고 포토카드와 번호표를 지급하는 경우가 많다. 확인이 끝나도 실제 입장까지 다시 대기해야 하므로 다음 문제가 반복된다.

- 참가자는 자신의 순번에 맞춰 물리적으로 줄을 서고 장시간 대기한다.
- 팬매니저는 수십~수백 명을 종이·스프레드시트 명단에서 찾아 같은 정보를 반복 확인한다.
- 지각, 불참, 현장 예외와 대기 순번 변경이 실시간으로 공유되지 않는다.
- 번호표·입장 QR·휴대폰을 다른 사람에게 넘기면 신청자와 실제 입장자가 달라질 수 있다.
- 현장 네트워크나 단말 장애가 나면 전체 입장이 멈출 수 있다.

Fanfolio의 목표는 신원 확인을 무조건 없애는 것이 아니라 **명단 탐색·서류 반복·물리 대기열을 없애고, 신원 확인은 짧고 확실한 한 번으로 축소하는 것**이다.

현재 확정할 제품 원칙은 다음과 같다.

1. 모집 방식은 행사별로 파트너가 `추첨`, `선착순`, `혼합형` 중 선택한다.
2. 모집이 시작되면 방식·정원·주요 자격·지각 및 불참 규칙을 변경할 수 없게 고정하고 팬에게 공개한다.
3. 신청 시에는 계정 상태, 중복 신청, 팬클럽·구매·연령 등 행사에 필요한 최소 자격만 확인한다.
4. 현장 일괄 QR은 집결 시간 내 도착을 빠르게 기록하는 수단이며 최종 신원 증명이 아니다.
5. 번호표와 현장 지급물(실물 포토카드가 있다면)을 받기 전 모든 참가자는 한 번의 짧은 대면 신원 확인을 거친다.
6. 확인이 끝난 사람에게 직원이 비양도성 훼손 방지 손목밴드와 계정에 묶인 디지털 입장 자격을 발급한다.
7. 한정 포토카드의 디지털 소유권은 `도착`이나 `신원 확인`이 아니라 실제 `참석 완료` 뒤에 멱등하게 지급한다.
8. 자동 얼굴 인식은 MVP 범위에서 제외한다.

모집 방식별 공정성 규칙도 함께 고정한다.

- **추첨**: 마감 시점의 후보 snapshot, 알고리즘 버전, 감사 가능한 선정 증적을 보존한다.
- **선착순**: 클라이언트 시각을 믿지 않고 서버 대기열 토큰과 서버 수신 순서를 사용하며, 속도 경쟁을 줄이기 위한 virtual waiting room, 계정·신원별 1회 신청, rate limit과 자동화 탐지를 적용한다.
- **혼합형**: 자격 확인 기간 뒤 추첨하거나, 일부 선착순·일부 추첨처럼 파트너가 공개한 비율과 순서를 정책 버전에 고정한다.

```text
신청·최소 자격 확인
  -> 행사 정책에 따른 선정·대기자 결정
  -> 집결 시간에 행사장 공용 QR 스캔 (도착 잠정 기록)
  -> 앱의 디지털 대기열·창구 호출
  -> 모바일 신분증 또는 실물 신분증/여권으로 짧은 대면 확인
  -> 훼손 방지 손목밴드 + 번호표·현장 지급물 + 디지털 입장 자격 발급
  -> 입장 게이트 재확인
  -> 실제 참석 완료
  -> 행사 한정 디지털 포토카드 지급
```

### 6.2 순수 일괄 인증이 아닌 하이브리드 방식을 선택하는 이유

| 방식 | 장점 | 결정적 한계 | 판단 |
| --- | --- | --- | --- |
| 기존 순차 수기 확인 | 신청자와 눈앞의 사람을 직접 비교할 수 있다. | 명단 탐색과 줄서기가 느리고 변경·감사 기록이 약하다. | 디지털화 필요 |
| 참가자가 팬매니저 QR을 일괄 스캔 | 수백 명의 도착 여부를 짧은 시간에 수집할 수 있다. | QR 중계, 원격 PASS 인증, 휴대폰 양도, 인증 뒤 참가자 교체를 막지 못한다. | 도착 확인에만 사용 |
| 자동 얼굴 인식 | 이론적으로 무인 처리할 수 있다. | 신뢰할 원본 얼굴, 라이브니스, 오인식 예외, 생체정보 보호와 별도 동의·보안 체계가 필요하다. | MVP 제외 |
| 일괄 도착 확인 + 병렬 대면 확인 | 물리 줄과 명단 탐색을 없애면서 최종적으로 사람과 신원 증거를 결합한다. | 예외 창구와 손목밴드 운영이 필요하다. | 권장안 |

일괄 QR은 행사·시간대·회차와 결합된 서명 challenge로 만들고 짧은 시간마다 교체한다. 팬은 로그인된 앱에서 이를 스캔하며 서버는 동일 신청의 재시도를 같은 결과로 처리한다. 그러나 QR이 영상통화나 메시지로 중계될 가능성은 남으므로 이 단계에서는 `arrived_pending_identity`만 기록하고 번호표·카드·입장 자격을 확정하지 않는다.

### 6.3 신청과 현장 운영 상태를 분리한다

`EventApplication.status` 하나에 신청·추첨·도착·신원·입장 상태를 모두 넣으면 상태 전이가 복잡해지고 운영자가 과거 결정을 덮어쓸 수 있다. 다음 세 경계를 분리한다.

1. **신청·선정**
   - `submitted`, `eligible`, `selected`, `waitlisted`, `not_selected`, `cancelled`
   - 모집 방식, 자격 판단 결과, 선정 근거와 정책 버전을 보존한다.
2. **현장 참석**
   - `not_arrived`, `arrived_pending_identity`, `identity_verified`, `credential_issued`, `late`, `no_show`, `rejected`, `admitted`, `attended`
   - 각 전이에 운영자, 단말, 시각, 사유, 이전 상태를 append-only 이벤트로 남긴다.
3. **입장 자격**
   - 짧은 유효시간의 디지털 자격과 손목밴드 serial을 한 신청에 결합한다.
   - 발급·재발급·무효화·사용을 별도 이력으로 기록하고, 한 자격은 한 번만 입장에 사용할 수 있다.

현장 흐름은 다음 상태 규칙을 지켜야 한다.

- `arrived_pending_identity`는 최종 입장을 허용하지 않는다.
- `identity_verified` 없이 번호표·현장 지급물·손목밴드를 발급할 수 없다.
- `credential_issued` 이후 재발급은 기존 자격을 먼저 무효화하고 관리자 사유를 남긴다.
- `admitted`는 원자적 compare-and-set으로 한 번만 전이한다.
- 디지털 보상은 `attended` 이벤트를 멱등키로 사용해 중복 지급을 막는다.
- 지각·불참·대기자 승격은 행사 시작 전 공개된 정책 버전으로만 처리한다.

### 6.4 내·외국인을 포함한 신원 확인 수단

행사별로 요구하는 신원 확인 강도는 파트너가 모집 전에 고정하되, 한 가지 인증수단을 모든 참가자에게 강제하지 않는다. 같은 강도를 충족하는 범위에서 **참가자가 실제로 이용할 수 있는 증거의 종류**에 따라 여러 경로를 제공한다.

| 참가자 | 기본 경로 | 보완·예외 경로 | 저장 원칙 |
| --- | --- | --- | --- |
| 국내 이용자 | 모바일 신분증 QR을 직원 검증 단말로 확인 | PASS 사전 본인확인 + 현장 실물 신분증 육안 대조 | 성공 여부, 수단, 시각, 검증자만 저장 |
| 국내 체류 외국인 | 모바일 외국인등록증 또는 조건을 충족하는 PASS | 실물 외국인등록증 또는 여권 육안 대조 | 원본 이미지·전체 번호를 저장하지 않음 |
| 단기 방문 외국인 | 여권 육안 대조 | 파트너가 승인한 별도 수동 확인 창구 | 문서 사본 대신 검증 결과와 예외 사유만 저장 |
| 휴대폰 분실·배터리 방전·접근성 예외 | 수동 확인 창구 | 이중 직원 확인과 일회용 현장 자격 발급 | 재발급과 승인자 감사 이력 저장 |

[PASS 공식 FAQ](https://www.passauth.co.kr/question)에 따르면 PASS는 휴대폰 본인확인이 가능하고 인증앱 가입이 가능한 외국인만 이용할 수 있으므로 모든 외국 팬의 필수 수단이 될 수 없다. [모바일 외국인등록증](https://www.mobileid.go.kr/mip/hps/issuReqstGuidance/issuReqstGuidanceMfc.do)도 외국인등록증 소지자가 대상이므로 단기 방문객의 여권 경로는 남겨야 한다.

[모바일 신분증 검증 방식](https://www.mobileid.go.kr/mip/hps/svcIntrcn/svcIntrcnIdnty.do)은 사용자가 제공에 동의한 필요한 정보만 요청할 수 있고, 검증용 QR은 짧은 시간 뒤 초기화되며 캡처 방지 기능을 제공한다. Fanfolio는 가능하면 정부 모바일 신분증 연계 또는 공식 검증앱을 사용하고 신분증 사진·주민등록번호·여권 사본을 자체 DB에 수집하지 않는다.

PASS나 Fanfolio 앱의 생체 잠금은 **등록된 휴대폰 계정의 인증**에는 도움이 되지만 눈앞의 사람이 신청자라는 사실을 단독으로 증명하지 않는다. 휴대폰을 넘기거나 신청자가 원격으로 인증할 수 있기 때문이다. 최종 결합은 현장에서 모바일 신분증이 제공한 검증된 신원정보를 확인하거나 실물 신분증·여권의 사진과 참가자를 육안 대조하는 방식으로 수행한다.

### 6.5 대리 인증과 참가자 교체에 대한 위협 모델

| 위협 | 방어 |
| --- | --- |
| 행사장 QR을 외부 신청자에게 실시간 전달 | 일괄 QR은 도착 잠정 상태만 만들고 신원 확인 전에는 입장 자격을 발급하지 않는다. |
| 신청자가 PASS 인증만 대신 수행 | PASS 결과를 현장 참가자와 결합하지 않으면 최종 인증으로 인정하지 않는다. |
| 인증한 휴대폰이나 디지털 QR을 다른 사람에게 전달 | 게이트에서 짧은 유효시간의 계정 자격을 다시 검사하고, 신원 확인 직후 직원이 비양도성 손목밴드를 직접 채운다. |
| 번호표·현장 지급물만 다른 사람에게 전달 | 번호표만으로 입장시키지 않고 손목밴드 serial과 서버 입장 상태를 함께 확인한다. |
| QR 캡처·복제·재사용 | 서명된 nonce, 짧은 만료, event/slot/application binding, 1회 소비와 원자적 상태 전이를 사용한다. |
| 운영자 임의 통과·순번 변경 | 운영자별 최소 권한, 모든 수동 변경의 사유·이전값·단말·시각 기록, 고위험 재발급의 이중 승인을 적용한다. |
| 과도한 신분정보 수집 또는 유출 | 검증 assertion과 최소 마스킹 속성만 처리하고 원본 신분증·얼굴 template은 저장하지 않는다. 보존 기간 후 자동 파기한다. |
| 자동 얼굴 인식의 오인식·스푸핑 | MVP에서 얼굴 template을 만들지 않고 공식 신분증 진위 검증과 짧은 육안 대조를 사용한다. |

자동 얼굴 인식은 기술적으로 가능하지만 신뢰할 원본 얼굴, 라이브니스, 오인식 이의제기, 장애 대체 절차가 필요하다. [개인정보보호위원회 생체정보 보호 안내서](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000.Updated&nttId=10900)를 기준으로 보면 얼굴 특징정보는 유출 뒤 변경하기 어려운 생체인식정보이므로 별도 개인정보 영향평가와 법률 검토 없이 편의 기능으로 도입하지 않는다.

### 6.6 현장 성능과 참가자 경험 목표

현장 속도는 신원 확인 자체를 생략해서가 아니라 **도착 수집, 대기, 명단 조회, 창구 분배를 병렬화**해서 개선한다.

1. 집결 시간에 여러 화면 또는 운영 단말이 동일 회차의 공용 도착 challenge를 표시한다.
2. 팬이 Fanfolio 앱으로 스캔하면 신청 정보가 즉시 조회되고 도착 상태가 멱등하게 기록된다.
3. 서버가 참가자를 여러 확인 창구에 자동 분배하고 앱에 창구·호출 순서·대기 상태를 표시한다.
4. 팬은 번호대로 계속 줄을 서지 않고 지정 구역에서 대기하며 호출 직전에만 확인 창구로 이동한다.
5. 직원 화면은 이름을 수기 검색하지 않고 해당 신청과 필요한 최소 자격·신원 확인 수단을 미리 표시한다.
6. 확인 성공, 손목밴드 serial 결합, 번호표 발급을 한 트랜잭션으로 처리한다.
7. 입장 시 별도 게이트가 자격을 1회 소비하고 참석 완료는 행사 운영자가 확정한다.

파일럿의 측정 가능한 성능 기준은 다음으로 둔다.

- 500명이 같은 회차 QR을 스캔해도 도착 확인 API의 p95가 2초 이내다.
- 정상 참가자의 현장 신원 확인과 자격 발급은 p95 15초 이내다.
- 동일 QR·동일 신청의 동시 재시도에서도 도착·자격·입장 이벤트는 각각 정확히 한 번만 기록된다.
- 운영 대시보드의 도착·확인·입장 인원은 2초 이내 갱신된다.
- 참가자는 앱에서 자신의 현재 상태, 호출 창구, 지각·대기자 승격 여부를 확인한다.
- 예외 참가자는 정상 창구를 막지 않고 별도 수동 확인 lane으로 이동한다.

목표 수치는 실제 파트너 파일럿에서 단말 수, 네트워크, 참가자 연령·언어와 함께 측정해 조정하며 코드 단위 테스트만으로 달성했다고 판단하지 않는다.

### 6.7 장애와 현장 예외 처리

- **인터넷 장애**: 행사 시작 전에 서명된 최소 roster와 lane별 처리 범위를 운영 단말에 내려받는다. 오프라인 확인은 `provisional`로 기록하고 네트워크 복구 뒤 서버가 중복·충돌을 대사한다.
- **단말 장애**: 다른 승인 단말로 운영자 인증 후 lane을 인계한다. 공유 관리자 계정은 사용하지 않는다.
- **앱·카메라 장애**: 신청 ID와 마스킹된 신원 속성으로 수동 조회하되, 이중 확인과 사유 입력을 요구한다.
- **지각**: 행사별 공개 정책에 따라 후순위 이동, 대기자 승격 또는 취소를 자동 제안하고 최종 운영 결정을 감사 기록으로 남긴다.
- **신원 불일치**: 정상 줄에서 분리하고 거절·재검토·증빙 보완 상태를 구분한다. 직원이 임의로 신청자 정보를 수정해 통과시키지 못하게 한다.
- **손목밴드 훼손·분실**: 기존 자격을 무효화한 뒤 이중 승인으로만 재발급한다.
- **행사 취소·시간 변경**: 입장 자격을 일괄 무효화하고 모든 선정자에게 재발급·환불·보상 상태를 같은 incident ID로 연결한다.

### 6.8 현재 구현과의 차이

현재 `Event`는 장소, 정원, 신청 시작·종료 시각을 보유하고(`backend/app/models.py:848-907`), `EventApplication`은 행사·사용자별 유일 신청과 단일 문자열 상태를 보유한다(`backend/app/models.py:926-945`). 팬 신청은 중복 요청을 멱등하게 처리하고(`backend/app/routers/events.py:481-596`), 관리자 추첨은 암호학적으로 안전한 난수로 당첨자를 뽑는다(`backend/app/routers/events.py:936-977`). 이는 모집 기반이지 현장 운영 완성 상태가 아니다.

현재 부족한 항목은 다음과 같다.

- 행사별 추첨·선착순·혼합형 선택 정책과 모집 시작 후 정책 고정
- 자격 규칙과 판정 근거·정책 버전
- 대기자 순번과 지각·불참 승격 규칙
- 도착, 신원 확인, 자격 발급, 입장, 참석의 분리된 상태·감사 이벤트
- 서명·만료·1회 소비되는 현장 QR과 입장 자격
- 손목밴드·번호표 serial과 신청의 결합
- 운영자 check-in 전용 권한과 단말 등록
- 모바일 신분증/PASS/여권 예외 경로와 개인정보 보존·파기 정책
- 디지털 대기열, 창구 배정, 호출 알림, 현장 운영 대시보드
- 오프라인 roster, 충돌 대사, 재발급·수동 통과 이중 승인
- 실제 참석 완료를 원인으로 하는 행사 한정 카드의 멱등 지급

또한 `User`에는 이메일·닉네임·소셜 계정 연결만 있고 법적 실명·생년월일·본인확인 수준을 표현하는 별도 신원 assertion이 없다(`backend/app/models.py:41-66`, `358-373`). 일반 프로필과 신원 확인 결과를 섞지 말고, 공급자·검증 수준·검증 시각·만료·마스킹 속성만 보유하는 별도 경계를 설계해야 한다.

### 6.9 완료 기준

#### 구현 증거

- 행사 정책과 버전이 모집 시작 뒤 불변으로 고정된다.
- 신청·현장 참석·입장 자격 상태가 분리되고 모든 전이가 허용된 이전 상태에서만 원자적으로 수행된다.
- 도착·신원·발급·입장·참석 이벤트가 append-only 감사 이력으로 남는다.
- 신분증 원본과 얼굴 template 없이 여러 신원수단의 검증 결과를 표현한다.
- 행사 한정 카드는 참석 완료 이벤트와 1:1로 연결되고 재시도해도 한 번만 지급된다.

#### 검증 증거

- 500명 동시 도착 스캔, 동일 신청 중복 스캔, 만료·위조·다른 회차 QR을 부하·보안 테스트한다.
- 신청자 원격 인증, 휴대폰 양도, 번호표 양도, 입장 QR 재사용, 운영자 임의 재발급을 공격 시나리오로 검증한다.
- 모바일 신분증, PASS 가능 외국인, 여권 수동 확인, 배터리·카메라·네트워크 장애 경로를 E2E로 검증한다.
- `arrived`만으로 카드가 지급되지 않고 `attended` 뒤 정확히 한 번 지급되는 원자성과 멱등성을 검증한다.
- 지각·불참·대기자 승격과 정책 변경 금지를 회귀 테스트한다.

#### 운영 증거

- 실제 행사와 유사한 인원·창구·네트워크로 리허설하고 scan latency, 창구 처리시간, 예외율, 입장 drift를 측정한다.
- 운영자가 수동 명단 검색 없이 도착·확인·입장 인원을 대사할 수 있다.
- 오프라인 처리 뒤 서버와 현장 단말의 중복·충돌을 복구한 리허설 증적이 있다.
- 신원정보 보존 기간과 자동 파기, 운영자 접근 로그, 사고 대응 절차를 개인정보 담당자와 검토한다.
- 파트너와 팬의 파일럿 피드백으로 모집 방식·지각 정책·대기 UX를 확정한다.

## 7. 권장 구현 순서

### P0 — 금전 가치 유출 차단

1. hosted 환경의 샌드박스 포인트 충전 API를 서버에서 차단한다.
2. 주문·충전·환불·관리자 조정의 Idempotency-Key를 필수화한다.
3. command에 `request_hash`, `resource_type`, `resource_id`, `response_snapshot`을 저장한다.
4. 같은 키·다른 payload/resource는 409로 거부한다.
5. 금융 승인 권한을 `audit:read`에서 분리한다.

### P1 — 내부 포인트 경제 완성

1. 포인트 명령 service를 하나로 통합하고 `earn/spend/refund/expire/adjust`를 구분한다.
2. 충전 환불에도 transaction과 idempotency key를 기록한다.
3. 원장 DB 권한을 append-only로 제한한다.
4. 잔액·주문·지급 대사 job과 운영 경보를 추가한다.
5. 동일 키 동시 요청, 서로 다른 resource에 같은 키, write 단계별 failpoint rollback을 PostgreSQL에서 테스트한다.

### P2 — 추천 V1과 소유권 고도화

1. 추천 노출·행동 이벤트와 알고리즘 버전을 기록한다.
2. 안전 필터가 포함된 설명 가능 점수와 다양성 재정렬을 출시한다.
3. 소유권 원장 해시 체인과 외부 서명 체크포인트를 추가한다.
4. 카드 이전에 passkey step-up을 적용하고 사용자 서명 영수증을 제공한다.

### P3 — 오프라인 사녹 운영 파일럿

1. 행사별 추첨·선착순·혼합형 정책과 모집 시작 후 불변 정책 버전을 추가한다.
2. 신청·참석·입장 자격 상태와 append-only 전이 감사를 분리한다.
3. 일괄 도착 QR, 디지털 대기열, 다중 확인 창구, 모바일 신분증·PASS·여권 예외 경로를 구현한다.
4. 훼손 방지 손목밴드 serial과 1회용 디지털 입장 자격을 결합하고 실제 참석 뒤에만 한정 카드를 지급한다.
5. 500명 동시 도착, 네트워크 장애, 대리 인증, 재발급, 지각·대기자 승격을 포함한 현장 리허설을 진행한다.

### P4 — 실결제 준비

1. PG hosted checkout 또는 provider-hosted fields를 선택해 카드정보를 Fanfolio 서버가 직접 받지 않게 한다.
2. payment order/attempt/webhook inbox/outbox 상태 머신을 구현한다.
3. provider idempotency, webhook 서명, 중복·역순 이벤트를 검증한다.
4. 화폐 double-entry journal과 포인트 발행을 연결한다.
5. 환불, 부분 환불, chargeback, 실패·timeout, 수동 보정 정책을 운영화한다.
6. PCI 범위와 사업·세무·전자상거래 고지를 법률·회계 전문가와 확정한다. 결제 기능을 외부 PCI DSS 검증 사업자에게 완전히 위탁하면 적용 범위를 줄일 수 있으나, 자격 요건은 별도 확인해야 한다. [PCI SSC SAQ A guidance](https://www.pcisecuritystandards.org/faqs/1439/)

### P5 — 상용 출시 증명

1. 실제 PG sandbox E2E와 제한 금액 production canary를 수행한다.
2. 실제 운영 PostgreSQL backup/restore와 원장 재생을 완료한다.
3. 추천 품질·안전 지표, 행사 도착·확인·입장 처리량, 결제 성공률, webhook 지연, 대사 drift, 원장 invariant를 dashboard와 alert에 연결한다.
4. 사고 대응 runbook으로 계정 탈취, 대리 입장, 현장 네트워크 장애, 중복 결제, 포인트 과발행, 소유권 분쟁, PG 장애를 훈련한다.

## 8. 다음 구현에 필요한 필수 테스트

| 영역 | 반드시 추가할 테스트 |
| --- | --- |
| 멱등성 | 같은 키+같은 payload는 같은 결과, 같은 키+다른 payload/resource는 409 |
| 동시성 | 동일 충전·주문·환불 20개 동시 요청에서 주문·원장·지급이 정확히 1개 |
| 원자성 | 잔액 변경 뒤, 원장 뒤, 주문 뒤, 지급 뒤 failpoint 각각에서 전체 rollback |
| 재고 | 마지막 1개 상품에 동시 구매가 들어와 정확히 한 주문만 완료 |
| webhook | 서명 오류 거부, 같은 event ID 중복 무효, 역순 이벤트 안전 처리, worker 재시작 후 재처리 |
| 대사 | 고의로 만든 balance/ledger/order drift를 탐지하고 approval incident를 생성 |
| 권한 | viewer가 포인트 조정·환불을 요청·승인하지 못하고 요청자 자기 승인이 불가 |
| 소유권 | 거래 경쟁, 체크포인트 검증, 과거 영수증의 최신 소유권 오인 방지, 운영 복원 뒤 root 일치 |
| 추천 | 삭제·차단·신고 계정 제외, 다양성, 콜드스타트, fallback, 노출 attribution |
| 행사 정책 | 모집 시작 후 방식·정원·자격 변경 거부, 추첨·선착순·혼합형 결정론, 지각·불참·대기자 승격 |
| 현장 동시성 | 500명 도착 스캔, 동일 신청 중복 스캔, 같은 입장 자격 동시 사용에서 각 상태 전이가 정확히 1개 |
| 현장 보안 | 만료·위조·다른 회차·원격 중계 QR, 휴대폰·번호표 양도, 운영자 임의 재발급·수동 통과 거부와 감사 |
| 신원·개인정보 | 모바일 신분증, PASS 가능 외국인, 여권 수동 확인, 접근성 예외, 원본 신분증·얼굴 template 미수집, 보존기간 만료 파기 |
| 현장 복구 | 인터넷·단말 장애 중 provisional 처리, 서버 복구 뒤 중복·충돌 대사, 손목밴드 재발급과 기존 자격 무효화 |
| 행사 보상 | `arrived`·`identity_verified`에서는 미지급, `attended` 뒤 한 번만 지급, 지급 실패 재시도와 전체 rollback |

## 9. 당장 확정할 제품 정책

코드 작업과 별개로 다음 정책을 먼저 문서에 고정해야 구현이 흔들리지 않는다.

- 포인트가 환불 가능한 유상 포인트인지, 무상 보상 포인트와 분리되는지
- 유상·무상 포인트를 사용할 때 어떤 순서로 차감하는지
- 포인트 유효기간과 소멸 전 알림 정책
- 카드팩을 열기 전·후 환불 가능 여부
- 거래 완료 후 취소·분쟁·계정 탈취 복구 기준
- 카드 소유권이 포함하는 권리와 포함하지 않는 저작권
- 서비스 종료 시 카드·소유권 영수증·포인트 잔액 처리
- 추천에서 차단·신고·신규 팬·아티스트 다양성을 어떤 우선순위로 보호하는지
- 행사별 추첨·선착순·혼합형의 공개 방식과 모집 시작 뒤 변경 금지 범위
- 신청 최소 자격, 중복·매크로 방지, 지각·불참·대기자 승격 기준
- 모바일 신분증·PASS·외국인등록증·여권 중 허용할 수단과 수동 예외 승인 기준
- 신원 확인 결과의 보존 기간, 파기 시점, 운영자가 볼 수 있는 최소 정보
- 손목밴드·번호표 분실·훼손·재발급과 참가자 교체·양도 적발 시 처리 기준
- 행사 한정 실물·디지털 포토카드 지급 시점과 불참·중도 이탈·행사 취소 시 회수·보상 기준

## 10. 완료 판단

이 문서 기준에서 다음 네 문장은 아직 사용할 수 없다.

- “Fanfolio가 해킹되어도 카드 소유권은 독립적으로 증명된다.”
- “팔로워 추천이 사용자 취향에 맞게 제대로 개인화된다.”
- “카드·카카오·네이버 실결제와 환불이 운영된다.”
- “수백 명의 사녹 신청부터 신원 확인·입장·한정 카드 지급까지 대리 참석 없이 자동 운영된다.”

대신 현재는 다음처럼 표현하는 것이 정확하다.

- 카드 지급·거래와 내부 소유권 이력은 트랜잭션과 계약 테스트로 보호한다.
- 팬 찾기는 공통 관심사·보유 카드·거래 가능성 정보를 제공하는 규칙 기반 탐색 기능이다.
- 포인트 상점의 내부 차감·지급·환불은 구현되어 있으나 충전 화면은 샌드박스이고 실제 PG 결제는 아니다.
- 이벤트는 신청·중복 방지·추첨 기반을 제공하지만, 현장 도착·신원·입장·참석과 대리 참석 방지는 아직 설계·파일럿 단계다.

위 P0와 P1을 완료하면 내부 포인트 기반 제한 베타의 안정성을 높일 수 있다. P2는 디지털 서비스의 차별화와 신뢰를 높이고, P3는 Fanfolio가 온라인 수집 서비스에서 실제 팬 활동 운영 플랫폼으로 확장될 수 있는지 검증한다. P4와 P5가 완료되어야 실결제 상용 출시를 주장할 수 있다.

## 11. 참고 기준

- [NIST SP 800-63B — Authenticator Assurance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- [OWASP Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [PostgreSQL Transactions](https://www.postgresql.org/docs/16/tutorial-transactions.html)
- [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html)
- [PostgreSQL Privileges](https://www.postgresql.org/docs/17/ddl-priv.html)
- [Google Recommendation Systems Overview](https://developers.google.com/machine-learning/recommendation/overview/types)
- [AWS Personalize Interaction Data](https://docs.aws.amazon.com/personalize/latest/dg/interactions-datasets.html)
- [NIST SP 800-63A — Identity Proofing and Enrollment](https://pages.nist.gov/800-63-4/sp800-63a.html)
- [PASS 인증서 FAQ — 외국인 이용 조건](https://www.passauth.co.kr/question)
- [모바일 신분증 — 신원확인자 검증 방식](https://www.mobileid.go.kr/mip/hps/svcIntrcn/svcIntrcnIdnty.do)
- [모바일 신분증 — 모바일 외국인등록증](https://www.mobileid.go.kr/mip/hps/issuReqstGuidance/issuReqstGuidanceMfc.do)
- [모바일 신분증 개발지원센터 — 연계 인터페이스](https://dev.mobileid.go.kr/mip/dfs/useguide/useinterfaceMethod.do)
- [개인정보보호위원회 — 생체정보 보호 안내서](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000.Updated&nttId=10900)
- [Google Wallet — Event ticket redemption methods](https://developers.google.com/wallet/tickets/events/use-cases/redemption-methods)
