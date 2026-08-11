# Fanfolio 관리자 파트너 권한 및 UI 개편 구현 계획

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before claiming completion.

**Goal:** 루트 관리자와 기업 담당자의 권한 범위를 서버에서 강제하고, 선택한 파트너 디렉터리 분할 시안을 반응형 관리자 웹으로 구현하며, 팬 앱 아이콘의 흰색 외곽 여백을 제거한다.

**Architecture:** 기존 `users.role == admin` 로그인 경계는 유지하고 `admin_memberships`와 조직/아티스트 연결 테이블을 추가해 운영 범위를 분리한다. FastAPI 의존성에서 관리자 컨텍스트를 한 번 계산하고, 각 서비스·라우터는 이 컨텍스트로 쿼리와 변경 권한을 기본 거부 방식으로 제한한다. 관리자 웹은 같은 API 컨텍스트를 받아 역할별 탐색과 파트너 분할 화면을 렌더링하며, 생성·배정·카드 등록은 오른쪽 drawer로 처리한다.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, pytest, vanilla HTML/CSS/JavaScript, Node test runner, Vite fan frontend, ImageGen-generated PNG assets.

---

## Task 1: 관리자 조직 데이터 모델과 마이그레이션

**Files:**
- Create: `backend/alembic/versions/0025_admin_partner_scope.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/services.py`
- Modify: `backend/tests/unit/test_migrations.py`
- Create: `backend/tests/contract/test_admin_partner_access.py`

- [ ] bootstrap 관리자가 자동으로 root 멤버십을 받는 실패 계약 테스트를 추가한다.
- [ ] 조직, 관리자 멤버십, 조직-아티스트, 관리자-아티스트 배정, 감사 로그 범위 컬럼의 마이그레이션 실패 테스트를 추가한다.
- [ ] 새 모델과 enum을 최소 구현하고 기존 데이터 보존형 Alembic migration을 작성한다.
- [ ] `ensure_admin_bootstrap()`가 기존/신규 bootstrap 관리자 모두에 root 멤버십을 보장하도록 구현한다.
- [ ] `pytest backend/tests/unit/test_migrations.py backend/tests/contract/test_admin_partner_access.py -q`를 통과시킨다.

## Task 2: 관리자 컨텍스트와 파트너 관리 API

**Files:**
- Create: `backend/app/admin_access.py`
- Modify: `backend/app/dependencies.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/services.py`
- Modify: `backend/tests/contract/test_admin_partner_access.py`
- Modify: `backend/tests/conftest.py`

- [ ] `GET /api/admin/me`의 root/manager/editor/viewer 응답 계약 테스트를 먼저 추가한다.
- [ ] 조직 목록·생성·상세·수정, 조직 아티스트 연결, 담당자 목록·생성·수정·배정 API의 root-only 실패/성공 테스트를 추가한다.
- [ ] `AdminContext`, `require_root`, `require_write`, `require_artist_scope` 의존성을 구현한다.
- [ ] 관리자 로그인과 refresh 시 활성 멤버십 및 활성 조직을 검증하고, 멤버십이 없는 기존 비-bootstrap 관리자는 기본 거부한다.
- [ ] 한 번만 표시하는 임시 비밀번호, 중복 slug/email 409, root-only 403, 범위 밖 404 오류를 구현한다.
- [ ] 멤버 역할/상태 변경 시 refresh-token family와 legacy `Session` 행을 모두 폐기하고 기존 cookie/header/refresh 흐름이 거부되는지 테스트한다.
- [ ] 타 조직 아티스트 배정, 조직 풀에 없는 아티스트 배정을 409로 거부하고 조직 아티스트 연결 해제 시 담당자 배정도 같은 트랜잭션에서 제거한다.
- [ ] 모든 변경을 organization/artist 범위 정보와 함께 감사 로그에 저장·반환하고 기업 담당자의 로그 조회 범위를 테스트한다.
- [ ] 새 계약 테스트와 기존 인증 계약 테스트를 통과시킨다.

## Task 3: 기존 운영 API의 조직·아티스트 범위 제한

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/services.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/contract/test_admin_partner_access.py`
- Modify: `backend/tests/contract/test_admin_management.py`

- [ ] 다른 기업/미배정 아티스트 카드와 프로필이 404인 실패 테스트를 추가한다.
- [ ] manager/editor/viewer의 카드 초안 쓰기와 검수 요청 권한 테스트를 추가한다.
- [ ] 최종 공개, 검수 결정, 드롭·코드, 서비스 사용자 변경이 root 전용인지 테스트한다.
- [ ] `admin.py` 전체 엔드포인트 권한 매트릭스를 작성하고 manager/editor/viewer에 대해 코드 배치 목록·CSV/ZIP/QR·코드 상태, 계정 발급, 컬렉션 캠페인, 사용자 역할 변경을 포함한 root-only 경로를 전수 테스트한다.
- [ ] dashboard, catalog, cards, artist-profiles, audit-logs 쿼리를 `AdminContext` 범위로 제한한다.
- [ ] 기업 카드 생성 시 `artistId`를 필수화하고 배정된 아티스트·멤버만 허용한다.
- [ ] 전체 backend pytest와 Ruff를 실행해 기존 root 계약 회귀가 없는지 확인한다.

## Task 4: 관리자 웹 셸과 파트너 디렉터리 분할 화면

**Files:**
- Modify: `admin_app/index.html`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `admin_app/tests/partner-access.test.mjs`

- [ ] root와 기업 담당자별 탐색 항목, 현재 범위 배지, 하단 계정 메뉴의 실패 테스트를 추가한다.
- [ ] `GET /api/admin/me`를 세션 복구 직후 로드하고 허용 작업에 따라 화면을 구성한다.
- [ ] 선택 시안대로 왼쪽 앱 탐색 + 가운데 파트너 목록 + 오른쪽 기업 상세의 3열 구조를 구현한다.
- [ ] 파트너 검색/선택, 개요·관리자·아티스트 탭, 실제 빈 상태와 realistic seed 상태를 구현한다.
- [ ] 관리자 추가 drawer, 임시 비밀번호 결과, 아티스트 배정 drawer, 비활성화 확인 흐름을 API에 연결한다.
- [ ] 호스팅 API 주소/관리자 이메일 편집과 장식성 상태 요소를 제거한다.
- [ ] Material Symbols 기반 아이콘과 키보드 포커스/ARIA 상태를 적용한다.

## Task 5: 카드 관리 drawer와 반응형 overflow 제거

**Files:**
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `admin_app/tests/admin-responsive-layout.test.mjs`

- [ ] 카드 등록이 inline 초대형 폼이 아니라 drawer에서 열리는 실패 테스트를 추가한다.
- [ ] 기업 담당자 카드 입력 선택지가 배정 아티스트로 제한되는 테스트를 추가한다.
- [ ] 1280px 이상 208/280/flexible, 1024~1279px 72/240/flexible, 768~1023px drawer/selector, 767px 이하 카드 행 규칙을 구현한다.
- [ ] 모든 grid/flex 자식에 `min-width: 0`, 루트에 `overflow-x: clip`, 표의 열 축소/카드 변환을 적용한다.
- [ ] Node 테스트와 브라우저에서 1024/1280/1440 `scrollWidth <= clientWidth`를 확인한다.

## Task 6: 팬 앱 아이콘 자산 교체

**Files:**
- Modify: `frontend/public/fanfolio-app-icon.png`
- Modify: `frontend/public/apple-touch-icon.png`
- Modify: `frontend/public/favicon.png`
- Create: `frontend/public/icon-192.png`
- Create: `frontend/public/icon-512.png`
- Modify: `frontend/index.html`
- Create: `frontend/tests/brand-assets.test.mjs`

- [ ] 현재 아이콘의 외곽 흰색 픽셀과 메타데이터를 검증하는 실패 테스트를 추가한다.
- [ ] ImageGen으로 카드 페이지 모티프와 기존 팔레트를 유지한 full-bleed 1024px RGB 원본을 만든다.
- [ ] 512/192/180/64px 자산을 고품질 리샘플링하고 favicon은 작은 크기 가독성을 확인한다.
- [ ] HTML 메타 링크를 새 자산과 일치시키고 팬 앱 test/lint/build를 통과시킨다.

## Task 7: 통합 검증, 시각 QA, 배포

**Files:**
- Create: `design-qa.md`
- Modify: `README.md` (새 관리자 범위와 로컬 확인 절차가 빠져 있을 때만)

- [ ] backend 전체 pytest와 Ruff, admin Node 테스트, fan test/lint/build를 새로 실행한다.
- [ ] 로컬 API와 관리자 웹을 실행해 root 로그인, 파트너 생성, 담당자 생성, 아티스트 배정, 범위 거부를 smoke test한다.
- [ ] 사용자가 선택한 시안과 1440×1024 구현 화면을 같은 비교 입력으로 검토하고 P0/P1/P2 차이를 수정한다.
- [ ] 1024/1280/1440 및 모바일 화면을 in-app Browser로 확인하고 `design-qa.md` 최종 결과를 정확히 `passed`로 기록한다.
- [ ] Lore Commit Protocol에 맞춰 변경을 커밋하고 main에 통합한 뒤 GitHub에 push한다.
- [ ] Render migration/API와 Vercel 관리자·팬 앱 배포를 확인하고 배포 URL에서 핵심 흐름을 다시 smoke test한다.
