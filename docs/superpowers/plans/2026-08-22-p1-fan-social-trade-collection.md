# P1 팬 소셜·거래·컬렉션 탐색 구현 계획

> 실행 기준: 기존 `codex/card-service-integration` 작업 트리의 P0/P1 변경을 보존하고, 각 기능은 실패하는 회귀 테스트를 먼저 추가한 뒤 최소 구현으로 통과시킨다.

## Task 1: 공개 컬렉션과 팔로잉 계약 완성

**Files**
- Modify: `backend/app/routers/social.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/PublicCollection.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`
- Test: `backend/tests/contract/test_social_card_trading.py`
- Test: `frontend/tests/social-collection.test.mjs`

1. 팬 검색, 팔로잉/팔로워 목록과 카운트, 팔로우 여부를 검증하는 실패 테스트를 추가한다.
2. 공개 컬렉션 응답에 팔로우 상태와 관계 요약을 포함하고 팬 검색·관계 목록 API를 구현한다.
3. 탐색 가능한 팬 목록과 공개 컬렉션 진입, 팔로우/언팔로우, 비공개·차단·없음·빈 컬렉션 상태를 구현한다.
4. 타 팬의 신규 카드 획득 알림을 팔로잉 피드로 노출할 최소 계약을 연결한다.

## Task 2: 거래함과 상태 전이 완성

**Files**
- Modify: `backend/app/routers/social.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/TradeProposal.tsx`
- Add: `frontend/src/components/TradeInbox.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`
- Test: `backend/tests/contract/test_social_card_trading.py`
- Test: `frontend/tests/social-collection.test.mjs`

1. 받은/보낸 거래 목록, 상세 조회, 거절·취소·만료·충돌과 상태별 알림의 실패 테스트를 추가한다.
2. 거래 목록/상세 API를 만들고 만료 상태를 조회 시 정리하며, 거절·취소에도 알림을 기록한다.
3. 거래함 라우트와 받은/보낸 탭, 카드 미리보기, 수락·거절·취소 동작, 상태·오류 메시지를 구현한다.
4. 거래 완료 후 컬렉션과 알림을 새로고침하고, 조합·잠금·기간제·이미 거래 중인 카드를 화면에서 구분한다.

## Task 3: 컬렉션 탐색 누락 보완

**Files**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/reference.css`
- Add: `frontend/tests/card-collection-exploration.test.mjs`

1. 검색, 필터, 정렬, 버전 탐색, 10장 이상 반응형 그리드, 실제 획득 경로를 고정하는 실패 테스트를 추가한다.
2. 카드명·번호·멤버 검색과 결과 없음 상태를 추가한다.
3. 시즌/앨범 그룹과 카드팩 버전 이동을 명확히 표시하고, 10장 이상에서도 카드가 잘리지 않는 반응형 레이아웃을 적용한다.
4. 상세 진입 payload의 획득 경로를 실제 보유 카드 데이터에서 전달한다.

## Task 4: 카드 조합 후속 상태 완성

**Files**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/reference.css`
- Modify: `frontend/tests/card-combination.test.mjs`

1. 조합 성공 후 결과 카드 강조, 알림/컬렉션 갱신, 새로고침 후 결과 유지 계약을 테스트한다.
2. 조합에 소비된 카드가 즉시 선택·거래 후보에서 사라지도록 서버 응답 후 컬렉션을 다시 불러온다.
3. 실패·중복 제출·충돌 메시지를 조합 시트 안에서 복구 가능하게 표시한다.

## Task 5: 회귀·브라우저 검증과 문서 반영

1. 백엔드 소셜/거래 계약 테스트와 프론트 집중 테스트를 실행한다.
2. 프론트 전체 테스트, 린트, 타입체크/빌드를 실행한다.
3. 로컬 백엔드·팬앱을 기존 포트 충돌 없이 정리해 실행하고 Codex 인앱 브라우저에서 공개 컬렉션, 거래함, 컬렉션 검색/상세를 검증한다.
4. `docs/FAN_APP_FRONTEND_VERIFICATION_BACKLOG.md`에서 실제로 코드·자동화·브라우저 검증을 통과한 항목만 `[x]`로 갱신하고 나머지는 `[~]` 또는 `[ ]`로 남긴다.
