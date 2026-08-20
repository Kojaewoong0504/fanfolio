# Fanfolio Product Scenario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fanfolio의 카드 발급·수집 핵심 흐름을 실제 백엔드 데이터와 역할별 운영 권한으로 완성한 뒤, 조합·거래·소셜·아티스트 효과 기능을 단계적으로 안전하게 추가한다.

**Architecture:** 먼저 현재 `Card`, `CardPack`, `RedeemCode`, `UserCard`, `CardReviewRequest`, `AuditLog` 모델을 기반으로 카드 소유권과 발급 상태를 단일 원장으로 안정화한다. 그 다음 관리자 웹·아티스트 스튜디오·팬 앱이 같은 API 상태를 사용하도록 통합하고, 각 확장 기능은 별도 모델·라우터·화면·통합 시나리오를 갖는 수직 슬라이스로 구현한다. 공개 확률과 공개 버전은 불변 스냅샷으로 취급하며, 모든 소유권 변경은 서버 트랜잭션과 멱등성 키로 보호한다.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, SQLite/PostgreSQL, React 19, TypeScript, Vite, Node test runner, pytest, oxlint

---

## 0. 실행 원칙과 범위

**기준 문서:** `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`

**작업 순서:** 소유권·권한 기반 → 관리자/스튜디오 검수 → 팬 획득·컬렉션 → 운영 가시성 → 조합 → 제한적 거래 → 팔로잉·전시 → 효과 편집

**현재 확인된 기반:**

- 팬 앱 카드 상세 경로는 독립 화면으로 수정되어 있다.
- 팬 API에는 카드팩 목록·확률·개봉, QR/인증번호 등록, 컬렉션 조회가 이미 존재한다.
- 관리자 API에는 카드·카드팩·드롭·검수·발급 배치·파트너·감사 로그 일부가 이미 존재한다.
- `AdminMembership`, `OrganizationArtist`, `AdminArtistAssignment`로 파트너 범위와 관리자 접근 수준을 표현할 기반이 있다.

**완료 기준:** 각 단계의 테스트와 시나리오가 통과되지 않으면 다음 단계로 넘어가지 않는다. 전체 배포는 Task 10의 통합 검증을 통과한 뒤에만 승인한다.

### 2026-08-20 진행 기록

- [x] 백엔드 마이그레이션 `0043_card_ownership_ledger`를 로컬 SQLite에 적용하고 head 상태를 확인했다.
- [x] 카드팩 개봉·인증번호 등록의 공통 `grant_user_card` 경로와 소유권 원장을 연결했다.
- [x] 단일 실행 기준 백엔드 계약 테스트 `256 passed`를 확인했다.
- [x] 팬앱 계약 테스트 `130 passed`, 관리자 카드 운영 계약 테스트 `46 passed`를 확인했다.
- [x] 실제 로컬 HTTP `GET /api/catalog/card-packs` 응답 `200`을 확인했다.
- [x] 기존 로컬 DB를 보존한 별도 테스트 DB에서 Codex 내장 브라우저 팬앱 E2E를 실행했다: 계정·온보딩 → 인증코드 등록 → 카드 공개 → 컬렉션 반영 → 카드 상세·뒷면 전환.
- [x] Codex 내장 브라우저에서 관리자 카드 관리·카드팩·구성 편집·발급·인증번호 정적 프리뷰의 핵심 표시 계약을 확인했다.
- [x] 임시 백엔드 `8003`에 관리자 웹을 연결해 로그인·대시보드·카드·카드팩 실제 API 조회를 확인하고, 관리자 API로 카드팩 생성·확률 100%·공개까지 검증했다.
- [x] 팬앱 `/collection/cards`에서 공개 카드팩 확률표·개봉·컬렉션 반영·카드 상세를 Codex 내장 브라우저로 확인했다.
- [x] 팬앱 인증번호 성공·중복·미공개 코드 차단과 QR 스캔 화면 진입·스캔 중 상태를 확인했다.
- [ ] 관리자 카드 등록 UI의 이미지 업로드→검수→공개와 실제 카메라 QR 인식은 브라우저 파일/카메라 주입 제한으로 검증 보류다.
- [ ] 조합·거래·팔로잉·효과 편집과 운영 통계는 후속 단계로 남아 있다.

## Task 1: 기준 시나리오와 테스트 데이터 고정

**목표:** 반복 검증에 사용할 관리자·파트너·아티스트·팬 계정을 고정하고, 실제 서비스 흐름을 자동화할 수 있는 테스트 fixture를 만든다.

**Files:**

- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/contract/test_card_release_to_collection.py`
- Create: `frontend/tests/product-scenario-contract.test.mjs`
- Modify: `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`

- [x] **Step 1: 실패하는 통합 시나리오 테스트를 작성한다.**

```python
async def test_partner_card_release_pack_open_and_collection(client, seeded_roles):
    card = await create_artist_card(client, seeded_roles.artist)
    await submit_card_review(client, seeded_roles.artist, card["id"])
    await approve_card(client, seeded_roles.partner_manager, card["id"])
    pack = await create_pack_with_card(client, seeded_roles.partner_manager, card["id"])
    await publish_pack(client, seeded_roles.general_admin, pack["id"])
    opened = await open_pack(client, seeded_roles.fan, pack["id"])
    collection = await get_collection(client, seeded_roles.fan)
    assert opened["userCardId"] in {item["userCardId"] for item in collection["cards"]}
```

- [x] **Step 2: 테스트를 실행해 현재 통합 흐름의 실패 지점을 기록한다.**

Run: `cd backend && pytest tests/contract/test_card_release_to_collection.py -q`

Expected: 현재 구현되지 않은 권한·검수·발급 연결 지점을 명시적으로 확인한다. 테스트가 우연히 통과하면 각 단계의 상태와 응답을 assertion으로 강화한다.

- [x] **Step 3: 역할별 fixture와 고정된 테스트 카드팩을 추가한다.**

`backend/tests/conftest.py`에 root, general admin, partner manager, partner editor, artist studio, fan을 만들고 각 계정의 `AdminMembership`과 `AdminArtistAssignment`를 명시한다. 테스트 데이터는 하나의 파트너와 두 개의 아티스트를 사용해 파트너 범위 누출을 검증한다.

- [x] **Step 4: 프론트 시나리오 계약 테스트에 필요한 화면 계약을 고정한다.**

`frontend/tests/product-scenario-contract.test.mjs`에서 컬렉션, 카드 상세, QR 등록, 카드팩 개봉이 실제 API 경로를 사용하는지 확인한다.

- [x] **Step 5: 전체 기준 문서에 테스트 ID를 기록한다.**

`docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`의 시나리오 A~C에 테스트 이름과 현재 결과를 기록한다.

검증 결과: `backend/tests/contract/test_card_release_to_collection.py` 단일 테스트와 전체 백엔드 계약 테스트가 통과했다. `seeded_roles`는 root/general admin, partner manager/editor, artist studio, fan 세션을 고정한다.

- [ ] **Step 6: 변경을 커밋한다.** (현재 혼합된 작업 트리를 보존하기 위해 전용 커밋은 별도 정리 단계에서 수행)

```bash
git add backend/tests/conftest.py backend/tests/contract/test_card_release_to_collection.py frontend/tests/product-scenario-contract.test.mjs docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md
git commit -m "test: lock card release scenario fixtures"
```

## Task 2: 카드 소유권 원장과 멱등성 강화

**목표:** 카드팩 개봉, 인증번호 등록, 조합, 거래가 모두 같은 소유권 규칙을 사용하도록 발급 원장을 안정화한다.

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0043_card_ownership_ledger.py`
- Modify: `backend/app/services.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/routers/admin.py`
- Create: `backend/tests/contract/test_card_ownership_ledger.py`
- Create: `backend/tests/unit/test_card_ownership_service.py`

- [ ] **Step 1: 중복 발급을 재현하는 테스트를 작성한다.**

동일한 인증번호 등록 요청과 동일한 카드팩 개봉 멱등성 키를 동시에 실행하고 `UserCard`가 한 건만 생성되는지 검증한다. 실패 요청은 카드 수량과 인증번호 상태를 변경하지 않아야 한다.

- [ ] **Step 2: 원장 모델과 유니크 제약을 추가한다.**

`CardOwnershipLedger`를 추가해 `user_card_id`, `action`, `source_type`, `source_id`, `from_user_id`, `to_user_id`, `metadata`, `created_at`을 기록한다. `action + source_type + source_id + user_id` 조합을 유니크하게 만들어 동일 이벤트 재처리를 막는다.

- [ ] **Step 3: 공통 소유권 서비스 함수를 구현한다.**

`backend/app/services.py`에 다음 계약을 추가한다.

```python
async def grant_user_card(
    session: AsyncSession,
    *,
    user_id: str,
    card_id: str,
    source_type: str,
    source_id: str,
    acquisition_source: str,
    metadata: dict | None = None,
) -> UserCard:
    """Create one UserCard and one ownership ledger row atomically."""
```

이 함수가 다음 순서를 지키게 한다: 멱등성 조회 → 카드·수량 검증 → serial 할당 → `UserCard` 생성 → 원장 기록 → commit.

- [ ] **Step 4: 카드팩 개봉과 인증번호 등록을 공통 서비스로 전환한다.**

`backend/app/routers/fan.py`의 `/me/card-packs/{pack_id}/open`과 `/redemptions`가 직접 `UserCard`를 만들지 않고 `grant_user_card`를 호출하게 한다.

- [ ] **Step 5: 테스트를 실행한다.**

Run: `cd backend && pytest tests/unit/test_card_ownership_service.py tests/contract/test_card_ownership_ledger.py tests/contract/test_card_packs.py tests/contract/test_redemptions.py -q`

Expected: 중복 요청에도 `UserCard`와 원장 행이 각각 한 건만 생성된다.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/models.py backend/alembic/versions/0043_card_ownership_ledger.py backend/app/services.py backend/app/routers/fan.py backend/app/routers/admin.py backend/tests
git commit -m "feat: centralize card ownership issuance"
```

## Task 3: 역할·파트너·아티스트 범위의 API 검증 완성

**목표:** 화면에서 버튼을 숨기는 수준을 넘어 모든 관리자·스튜디오 API가 서버에서 역할과 범위를 검사한다.

**Files:**

- Modify: `backend/app/admin_access.py`
- Modify: `backend/app/dependencies.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/admin_partners.py`
- Modify: `backend/app/routers/artist.py`
- Create: `backend/tests/contract/test_card_role_scope_matrix.py`
- Modify: `admin_app/app.js`
- Modify: `admin_app/tests/partner-access.test.mjs`

- [ ] **Step 1: 권한 매트릭스 실패 테스트를 작성한다.**

파트너 A 관리자가 파트너 B 카드·카드팩·발급 배치를 조회하거나 수정할 때 403을 반환하는 테스트를 작성한다. 스튜디오 사용자가 승인·공개·확률 변경 API를 호출할 때도 403을 검증한다.

- [ ] **Step 2: 공통 범위 검사를 적용한다.**

카드·드롭·카드팩을 조회할 때 `organization_id`, 연결된 `artist_id`, `assigned_artist_ids`, `allowed_actions`를 함께 확인한다. 파트너 범위를 확인하지 않는 기존 관리자 경로를 제거한다.

- [ ] **Step 3: UI 권한 표현을 API 결과와 맞춘다.**

`admin_app/app.js`는 `/api/admin/me`의 `accessLevel`, `organization`, `assignedArtists`, `allowedActions`만 사용해 메뉴·버튼·검수 액션을 표시한다. 거부된 API 응답은 일반 오류가 아니라 권한 부족 메시지로 표시한다.

- [ ] **Step 4: 테스트를 실행한다.**

Run: `cd backend && pytest tests/contract/test_admin_partner_access.py tests/contract/test_admin_management.py tests/contract/test_card_role_scope_matrix.py -q`

Run: `node --test admin_app/tests/partner-access.test.mjs`

Expected: 파트너 경계를 넘는 모든 API 요청이 거부되고 허용된 범위는 정상 동작한다.

- [ ] **Step 5: 커밋한다.**

```bash
git add backend/app/admin_access.py backend/app/dependencies.py backend/app/routers/admin.py backend/app/routers/admin_partners.py backend/app/routers/artist.py backend/tests/contract/test_card_role_scope_matrix.py admin_app/app.js admin_app/tests/partner-access.test.mjs
git commit -m "feat: enforce scoped card operations"
```

## Task 4: 관리자·스튜디오 카드 출시 흐름 완성

**목표:** 카드 제작자가 만든 콘텐츠가 검수 없이 팬 앱에 노출되지 않고, 승인된 카드만 카드팩·특전 발급에 사용할 수 있게 한다.

**Files:**

- Modify: `backend/app/routers/artist.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/services.py`
- Modify: `backend/app/models.py`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `backend/tests/contract/test_card_release_to_collection.py`
- Modify: `admin_app/tests/admin-release-review.test.mjs`

- [ ] **Step 1: 승인 전 팬 노출 실패 테스트를 작성한다.**

초안·검수 중 카드가 `/api/catalog/cards`, `/api/catalog/card-packs`, 카드 이미지 경로에서 노출되지 않는지 검증한다.

- [ ] **Step 2: 카드 상태 전이를 서버에서 제한한다.**

허용 전이를 `draft → pending_review → approved → published`로 제한하고, 반려·재검수는 이전 버전과 새 review version을 구분한다. 파트너 승인과 플랫폼 승인이 필요한 경우 각각 `CardReviewRequest`와 `CardReviewDecision`에 기록한다.

- [ ] **Step 3: 카드팩 포함 조건을 검증한다.**

공개 카드팩에는 승인·공개된 카드만 추가할 수 있도록 `validate_card_pack_input`을 강화하고, 확률 합계 100%와 동일 카드 중복 금지를 계속 보장한다.

- [ ] **Step 4: 관리자 UI에서 제작·검수·공개 단계를 분리한다.**

`admin_app/app.js`의 카드 상세에서 제작자 콘텐츠, 검수 상태, 승인·반려·공개 액션을 별도 영역으로 표현한다. 승인 전 카드는 팬 노출 경로가 없다는 안내를 표시한다.

- [ ] **Step 5: 전체 출시 테스트를 실행한다.**

Run: `cd backend && pytest tests/contract/test_card_release_workflow.py tests/contract/test_card_packs.py tests/contract/test_card_release_to_collection.py -q`

Run: `node --test admin_app/tests/admin-release-review.test.mjs admin_app/tests/card-operations-preview.test.mjs`

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/routers/artist.py backend/app/routers/admin.py backend/app/services.py backend/app/models.py admin_app/app.js admin_app/styles.css backend/tests admin_app/tests
git commit -m "feat: complete card release workflow"
```

## Task 5: 팬 획득·컬렉션·카드 상세 통합 검증

**목표:** 카드팩과 특별 카드가 팬 앱의 실제 컬렉션과 카드 상세에 일관되게 반영되도록 한다.

**Files:**

- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/CardDetail.tsx`
- Modify: `frontend/src/components/QrRedeemModal.tsx`
- Modify: `frontend/src/components/InteractiveCollectibleCard.tsx`
- Modify: `frontend/src/App.css`
- Create: `frontend/tests/card-acquisition-e2e-contract.test.mjs`
- Modify: `frontend/tests/card-detail-route.test.mjs`
- Modify: `frontend/tests/card-registration-complete.test.mjs`

- [ ] **Step 1: 카드팩·QR·인증번호 세 경로의 성공·실패 테스트를 작성한다.**

각 성공 결과에 대해 `/me/collection` 새로고침 후 카드가 존재하고, 실패·중복 요청은 컬렉션을 변경하지 않는지 확인한다.

- [ ] **Step 2: 팬 앱 API 데이터를 공통 카드 모델로 정규화한다.**

`frontend/src/api/client.ts`의 카드 응답 타입에 `acquisitionSource`, `serialNumber`, `acquiredAt`, `designConfig`, `voiceUrl`, `videoUrl`, `handwritingUrl`을 유지하고, `App.tsx`가 fixture 카드를 실제 응답보다 우선하지 않도록 한다.

- [ ] **Step 3: 카드 상세 독립 경로의 회귀를 확인한다.**

`/cards/:id`에서 `main.card-detail-screen`만 렌더링하고 `dialog`·`detail-backdrop`가 없으며, 뒤로가기·직접 새로고침·뒷면 틸트가 동작하는지 테스트한다.

- [ ] **Step 4: 브라우저 시나리오를 실행한다.**

Run: `cd frontend && npm test && npm run build && npm run lint`

Expected: 카드 등록·팩 개봉·상세 화면 테스트가 통과하고 lint에 새로운 오류가 없다.

- [ ] **Step 5: 커밋한다.**

```bash
git add frontend/src frontend/tests
git commit -m "test: verify fan card acquisition flows"
```

## Task 6: 운영 가시성 — 알림·감사·통계·내보내기

**목표:** 팬과 운영자가 발급·검수·거래·조합 상태를 확인할 수 있도록 운영 정보를 연결한다.

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0044_operational_metrics.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/services.py`
- Modify: `frontend/src/App.tsx`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `backend/tests/contract/test_card_operations_metrics.py`
- Create: `frontend/tests/card-notifications-and-history.test.mjs`

- [ ] **Step 1: 알림과 획득 기록 테스트를 작성한다.**

카드 발급·등록·검수 결과마다 중복되지 않는 알림과 획득 이력이 생성되는지 확인한다. 기존 `Notification`의 `event_key` 유니크 규칙을 사용한다.

- [ ] **Step 2: 관리자 통계 API를 추가한다.**

`GET /api/admin/card-operations/metrics`가 카드팩 오픈 수, 희귀도별 발급 수, 카드별 보유자 수, 인증번호 성공·실패 수, 조합·거래 수를 반환한다. 모든 집계에는 `organization_id`와 `artist_id` 범위를 적용한다.

- [ ] **Step 3: 카드·발급 배치·감사 로그 CSV를 연결한다.**

기존 CSV 응답 패턴을 재사용해 UTF-8 BOM, 컬럼 헤더, 권한 범위 필터를 보장한다. 내보내기 버튼은 실제 다운로드를 시작하고 완료 알림을 표시한다.

- [ ] **Step 4: 팬 앱에 알림·획득 기록을 연결한다.**

기존 `/notifications`, `/notifications/stream`, `/me/cards/{user_card_id}` 응답을 사용해 카드 상세와 알림 센터에서 실제 데이터를 표시한다.

- [ ] **Step 5: 테스트를 실행하고 커밋한다.**

Run: `cd backend && pytest tests/contract/test_admin_notifications.py tests/contract/test_card_operations_metrics.py tests/contract/test_redemptions.py -q`

Run: `cd frontend && npm test`

```bash
git add backend frontend/src admin_app
git commit -m "feat: expose card operation history and metrics"
```

## Task 7: 카드 조합

**목표:** 중복 카드를 소비해 같은 카드팩·컬렉션 범위의 상위 등급 랜덤 카드를 한 번만 지급한다.

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0044_card_combinations.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services.py`
- Create: `backend/app/routers/combinations.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/contract/test_card_combinations.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/tests/card-combination.test.mjs`

- [x] **Step 1: 조합 정책과 핵심 실패 테스트를 고정한다.**

같은 팩 범위, 필요한 중복 수량, 상위 등급 풀, 확률, UR·한정 카드 제외 정책을 fixture로 만든다. 수량 부족·범위 불일치·동시 요청·확률 버전 불일치가 모두 실패하는 테스트를 작성한다.

- [x] **Step 2: 조합 모델을 추가한다.**

`CardCombinationRecipe`에 `scope_type`, `scope_id`, `input_quantity`, `output_rarity_pool`, `probability_snapshot`, `status`를 저장하고, `CardCombination`에 사용자·재료 카드·결과 카드·확률 버전·상태를 저장한다.

- [x] **Step 3: 원자적 조합 서비스를 구현한다.**

`POST /api/me/card-combinations/preview`는 소비 대상과 공개 확률만 반환한다. `POST /api/me/card-combinations`는 재료 UserCard를 잠그고, 이미 소비된 카드가 없는지 확인한 뒤, `grant_user_card`로 결과를 지급하고 조합 원장을 기록한다.

- [x] **Step 4: 팬 앱 조합 화면을 구현한다.**

중복 카드 수량, 소비 카드 목록, 결과 등급 풀, 확률, 완료 후 예상 상태를 표시한다. 특정 카드를 확정 획득하는 것처럼 보이는 문구를 사용하지 않는다.

- [x] **Step 5: 계약 테스트와 멱등성 검증을 실행한다.**

Run: `cd backend && pytest tests/contract/test_card_combinations.py -q`

Run: `cd frontend && node --test tests/card-combination.test.mjs`

Run: `cd backend && pytest tests/unit/test_migrations.py -q`

확인 결과: 조합 계약 테스트 1건, 팬앱 조합 UI 계약 테스트, 전체 마이그레이션 테스트 15건, 프론트 빌드가 통과했다. 초기 스키마와 0044 신규 테이블 중복 생성 및 SQLite 0043 다운그레이드 호환성도 보완했다.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend frontend/src frontend/tests
git commit -m "feat: add duplicate card combination"
```

## Task 8: 제한적 카드 트레이딩과 팔로잉

**목표:** 거래 가능한 카드만 팬 간 제안·수락으로 이전하고, 공개 컬렉션과 팔로잉을 안전하게 제공한다.

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0046_social_card_trading.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/social.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/PublicCollection.tsx`
- Create: `frontend/src/components/TradeProposal.tsx`
- Create: `backend/tests/contract/test_social_card_trading.py`
- Create: `frontend/tests/social-collection.test.mjs`

- [ ] **Step 1: 거래·팔로우 정책 테스트를 작성한다.**

거래 불가 카드, 기간제 카드, 조합 카드, 이미 잠긴 카드의 거래 제안이 422 또는 409로 거부되는지 확인한다. 공개 컬렉션·비공개·차단 상태를 각각 검증한다.

- [ ] **Step 2: 모델을 추가한다.**

`Follow`, `TradeProposal`, `TradeItem`, `CardVisibility`를 추가한다. 거래 제안은 `pending`, `accepted`, `rejected`, `cancelled`, `expired` 상태와 만료 시각을 갖고, 카드별 거래 잠금 유니크 규칙을 둔다.

- [ ] **Step 3: 제안·수락을 원자적으로 구현한다.**

`POST /api/me/trades`, `POST /api/me/trades/{id}/accept`, `POST /api/me/trades/{id}/reject`, `POST /api/me/trades/{id}/cancel`을 추가한다. 수락 시 양쪽 UserCard의 소유자를 하나의 트랜잭션으로 바꾸고 ownership ledger를 기록한다.

- [ ] **Step 4: 공개 컬렉션·팔로우 API를 구현한다.**

`POST /api/me/follows/{user_id}`, `DELETE /api/me/follows/{user_id}`, `GET /api/fans/{user_id}/collection`을 추가한다. 차단된 계정과 비공개 컬렉션은 404 또는 정책에 맞는 제한 응답을 반환한다.

- [ ] **Step 5: 팬 앱 화면을 구현한다.**

공개 컬렉션, 팔로우, 카드별 거래 가능 상태, 거래 제안·수락·거절을 연결한다. 거래 제안 알림은 Task 6의 알림 이벤트를 사용한다.

- [ ] **Step 6: 경쟁 조건 테스트를 실행하고 커밋한다.**

Run: `cd backend && pytest tests/contract/test_social_card_trading.py -q`

Run: `cd frontend && node --test tests/social-collection.test.mjs`

```bash
git add backend frontend/src frontend/tests
git commit -m "feat: add scoped fan trading and follows"
```

## Task 9: 아티스트 스튜디오 효과 프리셋과 검수 미리보기

**목표:** 아티스트가 안전한 프리셋으로 카드 효과를 만들고, 승인된 효과 버전만 팬 앱에 표시한다.

**Files:**

- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0047_studio_effect_versions.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/artist.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `frontend/src/utils/cardEffects.ts`
- Modify: `frontend/src/components/InteractiveCollectibleCard.tsx`
- Modify: `admin_app/app.js`
- Create: `frontend/tests/studio-effect-contract.test.mjs`
- Modify: `admin_app/tests/partner-access.test.mjs`

- [ ] **Step 1: 효과 스키마 실패 테스트를 작성한다.**

허용되지 않은 효과 타입, 과도한 입자 수, 잘못된 색상·속도, 대용량 미디어 참조가 저장되지 않는지 검증한다. 승인 전 효과가 팬 API 응답에 포함되지 않는지도 확인한다.

- [ ] **Step 2: 효과 버전 모델과 검증기를 추가한다.**

`CardEffectVersion`에 카드·버전·설정 JSON·작성자·검수 상태·승인 시각을 저장한다. `design_config`는 프리셋·강도·속도·트리거·접근성 대체 표현을 포함하도록 스키마를 제한한다.

- [ ] **Step 3: 스튜디오 편집 API를 연결한다.**

`POST /api/artist/cards/{card_id}/effect-versions`, `PATCH /api/artist/cards/{card_id}/effect-versions/{version_id}`, `POST /api/artist/cards/{card_id}/effect-versions/{version_id}/submit-review`를 추가한다. 승인·공개는 관리자 API에서만 허용한다.

- [ ] **Step 4: 프리셋 중심 UI를 구현한다.**

초기 UI는 광원·글로우·반사·홀로그램·입자·모션 프리셋과 색상·강도·속도 조정만 제공한다. 고급 레이어·타임라인·블렌딩은 별도 후속 계획으로 둔다.

- [ ] **Step 5: 팬 앱과 관리자 검수 미리보기를 통합한다.**

팬 앱에서는 앞면·뒷면·탭·스와이프·뒤집기 효과를 확인하고, 뒷면에는 틸트만 적용한다. 관리자 검수 화면은 저장된 효과 버전을 동일한 컴포넌트로 미리 본다.

- [ ] **Step 6: 테스트와 성능 검증을 실행한다.**

Run: `cd backend && pytest tests/contract/test_card_release_workflow.py tests/contract/test_admin_and_artist.py -q`

Run: `cd frontend && node --test tests/card-material-effects.test.mjs tests/studio-effect-contract.test.mjs`

## Task 10: 전체 시나리오 검증과 배포 게이트

**목표:** 실제 로컬 서버에서 관리자 → 파트너 → 아티스트 스튜디오 → 검수 → 카드팩/특전 발급 → 팬 등록 → 컬렉션 확인을 완주하고 배포 여부를 결정한다.

**Files:**

- Create: `reports/e2e-release-scenario-2026-08-20/README.md`
- Create: `reports/e2e-release-scenario-2026-08-20/role-matrix.md`
- Create: `reports/e2e-release-scenario-2026-08-20/commands.log`
- Modify: `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`
- Verify: `backend/tests/contract/test_card_release_to_collection.py`
- Verify: `frontend/tests/product-scenario-contract.test.mjs`

- [ ] **Step 1: 서버 상태를 확인한다.**

Run: `curl -s http://127.0.0.1:8000/health`

Run: `curl -s http://127.0.0.1:5173`

Run: `curl -s http://127.0.0.1:4180`

Expected: 백엔드·팬 앱·관리자 웹이 같은 로컬 데이터베이스와 API를 사용한다.

- [ ] **Step 2: 역할별 권한 시나리오를 실행한다.**

root, 일반 관리자, 파트너 매니저, 파트너 하위 관리자, 스튜디오 사용자, 팬으로 로그인해 허용·거부 API 응답을 기록한다.

- [ ] **Step 3: 기본 카드팩 시나리오를 실행한다.**

카드 등록 → 검수 요청 → 승인 → 카드팩 구성 → 확률 100% 검증 → 공개 → 팬 앱 노출 → 카드팩 개봉 → 컬렉션 반영 → 카드 상세 확인 순서로 실행한다.

- [ ] **Step 4: 특별 카드 인증번호 시나리오를 실행한다.**

제한 수량 발급 배치 → 고유 코드 생성 → QR/인증번호 등록 → 재사용 거부 → 잘못된 코드 거부 → 컬렉션 반영 → 획득 경로 표시 순서로 실행한다.

- [ ] **Step 5: 결과를 증거 파일로 남긴다.**

각 단계의 URL, API 응답 요약, 데이터베이스 결과, 브라우저 화면 캡처, 실패 로그를 `reports/e2e-release-scenario-2026-08-20/`에 저장한다. 인증번호 원문과 개인정보는 기록하지 않는다.

- [ ] **Step 6: 전체 검증 명령을 실행한다.**

Run: `cd backend && pytest -q`

Run: `cd frontend && npm test && npm run build && npm run lint`

Run: `node --test admin_app/tests/*.test.mjs`

- [ ] **Step 7: 배포 판정을 문서에 기록한다.**

`docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`의 MVP 및 배포 게이트를 `통과`, `실패`, `검증 보류` 중 하나로 업데이트한다. 실패 항목이 하나라도 있으면 배포하지 않고 Task 1~9 중 해당 단계로 돌아간다.

- [ ] **Step 8: 배포 전 최종 커밋을 만든다.**

```bash
git add reports/e2e-release-scenario-2026-08-20 docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md
git commit -m "test: verify end to end card service release"
```

## 의존관계와 중단 기준

- Task 1은 모든 작업의 선행 조건이다.
- Task 2가 완료되기 전에는 조합·거래를 구현하지 않는다.
- Task 3이 완료되기 전에는 파트너 운영 범위의 실제 배포를 승인하지 않는다.
- Task 4와 Task 5가 완료되기 전에는 카드팩 공개와 특별 카드 발급을 실제 서비스 기능으로 표시하지 않는다.
- Task 6이 완료되기 전에는 운영 지표가 없는 상태로 확률·발급 기능을 확장하지 않는다.
- Task 7과 Task 8은 독립 기능이지만 둘 다 Task 2와 Task 6에 의존한다.
- Task 9는 기존 카드 상세와 관리자 검수 미리보기의 회귀 테스트를 통과한 뒤에만 진행한다.
- Task 10의 필수 시나리오 실패, 서버 원장 불일치, 권한 누출, 인증번호 중복, 확률 불일치가 발견되면 배포를 중단한다.

## 계획 자체의 검토 결과

- 요구사항 문서의 역할·권한은 Task 3에 대응한다.
- 카드 생명주기와 카드팩 공개는 Task 4와 Task 5에 대응한다.
- 인증번호와 카드 소유권은 Task 2와 Task 5에 대응한다.
- 운영 알림·통계·복구는 Task 6에 대응한다.
- 카드 조합은 Task 7에 대응한다.
- 거래·팔로잉·공개 컬렉션은 Task 8에 대응한다.
- 스튜디오 효과 편집은 Task 9에 대응한다.
- 배포 승인·증거 수집은 Task 10에 대응한다.

현재 계획의 의도적인 제외 범위는 결제·실물 배송·현금성 교환·외부 마켓 연동이다. 이 범위는 카드 소유권과 거래 정책이 검증된 뒤 별도 사업·법률 요구사항으로 분리한다.
