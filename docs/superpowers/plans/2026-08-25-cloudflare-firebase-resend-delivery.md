# Cloudflare R2·Firebase·Resend 전달 인프라 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지 바이너리는 Cloudflare R2에 저장하고, 앱 내부 알림을 원본으로 유지하면서 Firebase 푸시와 Resend 이메일을 영속적인 전송 대기열로 안전하게 전달한다.

**Architecture:** 기존 S3 호환 저장소 경계와 mailer 인터페이스를 확장한다. 알림 생성 트랜잭션에서 채널별 outbox 행을 만들고, 커밋 후 inline/Celery 작업자가 공급자를 호출해 성공·재시도·최종 실패를 기록한다. 팬앱은 FCM 토큰만 인증 API로 동기화하며 모든 비밀 값은 백엔드 환경 변수에 둔다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Celery, boto3, httpx, Firebase Admin/Google Auth, React/Vite, service worker, pytest, Node test runner.

---

### Task 1: R2 설정과 기존 저장소 어댑터 확장

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/storage.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/test_config.py`
- Test: `backend/tests/unit/test_storage.py`
- Test: `backend/tests/integration/test_s3_storage.py`

- [x] **Step 1: `r2` backend의 필수 설정·리전·endpoint 검증을 기대하는 실패 테스트를 작성한다.**
- [x] **Step 2: 집중 테스트를 실행해 현재 `r2`가 거절되는 실패를 확인한다.**
- [x] **Step 3: `STORAGE_BACKEND=r2`, R2 account/bucket/key 설정과 기존 generic S3 설정의 호환 매핑을 추가한다.**
- [x] **Step 4: R2 클라이언트가 region `auto`, S3 endpoint, path addressing을 사용하고 기존 presigned PUT/GET 계약을 유지하도록 한다.**
- [x] **Step 5: 저장소·설정 테스트와 업로드 API 계약 테스트를 실행한다.**

### Task 2: Resend 메일 어댑터

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/mailer.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/test_mailer.py`
- Test: `backend/tests/unit/test_production_configuration.py`

- [x] **Step 1: Resend payload, 인증 header, idempotency key, 오류 분류와 운영 설정 누락의 실패 테스트를 작성한다.**
- [x] **Step 2: 테스트가 `ResendMailer` 부재로 실패하는 것을 확인한다.**
- [x] **Step 3: 기존 mailer 인터페이스에 비동기 `ResendMailer`를 추가하고 magic link·notification 호출이 idempotency key를 넘기도록 확장한다.**
- [x] **Step 4: 운영 환경에서 `resend`가 선택되면 API key와 올바른 발신 주소를 요구하고 console/smtp 호환을 유지한다.**
- [x] **Step 5: mailer·인증 이메일 회귀 테스트를 실행한다.**

> 도메인 구매와 Resend 발신 도메인 검증은 보류한다. 따라서 로컬/현재 개발 환경은
> `MAIL_DELIVERY_MODE=console`을 유지하고, 검증된 발신 주소를 확보한 뒤에만 `resend`로
> 전환한다. R2와 Resend 어댑터 자체는 이 보류와 독립적으로 테스트된다.

### Task 3: 푸시 기기와 전달 대기열 데이터 모델

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0057_push_devices.py`
- Modify: `backend/tests/unit/test_migrations.py`
- Create: `backend/tests/unit/test_notification_delivery_models.py`

- [x] **Step 1: `PushDevice` 토큰·소유권·활성 상태 필드와 유일성 인덱스 테스트를 작성한다.**
- [x] **Step 2: 인증 팬의 기기 등록·재등록·해제 계약 테스트를 추가한다.**
- [x] **Step 3: 토큰 소유권, 비활성화, 마지막 확인 시각을 표현하는 모델을 추가한다.**
- [x] **Step 4: PostgreSQL과 SQLite 테스트에서 동작하는 `0057` 마이그레이션과 downgrade를 추가한다.**
- [x] **Step 5: 모델·마이그레이션·API 집중 테스트를 실행한다.**

> 전달 대기열(`NotificationDelivery`)은 별도 작업으로 남겨 둔다. 현재 단계에서는
> 외부 공급자에 토큰을 노출하지 않고, 인증된 팬 계정에 한해 토큰을 안전하게 동기화한다.

### Task 4: FCM 공급자 어댑터와 오류 분류

**Files:**
- Create: `backend/app/push.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`
- Create: `backend/tests/unit/test_push.py`

- [x] **Step 1: 성공 메시지 ID, 잘못된 토큰, 인증 실패, 재시도 가능한 서버 오류를 기대하는 실패 테스트를 작성한다.**
- [x] **Step 2: 공급자 모듈이 없어 실패하는 것을 확인한다.**
- [x] **Step 3: backend-only Firebase service credentials로 HTTP v1 메시지를 보내는 작은 어댑터와 명시적인 오류 타입을 구현한다.**
- [x] **Step 4: 로그에 전체 토큰이나 자격 증명이 남지 않도록 마스킹한다.**
- [x] **Step 5: push 단위 테스트와 설정 검증 테스트를 실행한다.**

> 도메인 구매 없이 Firebase 서버 어댑터와 설정 검증까지 구현했다. 실제 사용자 기기로
> 발송하려면 다음 단계에서 인증된 기기의 FCM 토큰 등록·해제 API와 알림 outbox를 연결해야 한다.

### Task 5: 알림 생성과 outbox 처리

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/tasks.py`
- Modify: `backend/app/database.py`
- Create: `backend/tests/unit/test_notification_delivery_service.py`
- Modify: `backend/tests/contract/test_admin_notifications.py`

- [x] **Step 1: 앱 알림과 채널별 전달 행의 원자적 생성, 중복 방지, 사용자 설정 반영에 대한 실패 테스트를 작성한다.**
- [x] **Step 2: 현재 동기 SMTP 경로와 outbox 부재 때문에 실패하는 것을 확인한다.**
- [x] **Step 3: `notify_fans`·`notify_user_once`가 앱 알림과 outbox를 만들고 외부 호출은 하지 않도록 변경한다.**
- [x] **Step 4: pending/retry 행을 제한된 배치로 잠그고 Resend/FCM을 호출해 delivered/retry/failed를 기록하는 서비스를 구현한다.**
- [x] **Step 5: inline background task와 Celery task 진입점을 추가하고 커밋 이후에만 enqueue한다.**
- [x] **Step 6: 재시도·최대 시도·무효 FCM 토큰 비활성화·idempotency 회귀 테스트를 실행한다.**

> 2026-08-26 완료: 성장 이벤트와 외부 알림 전달 모두 bounded exponential backoff 및
> `dead_letter` 상태를 사용한다. `notification_deliveries` outbox, Celery worker,
> Resend/FCM 공급자 연결과 무효 FCM 토큰 비활성화를 구현했다.

### Task 6: 푸시 토큰 API와 팬앱 FCM 연결

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/fan.py`
- Create: `backend/tests/contract/test_push_devices.py`
- Modify: `frontend/package.json`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pushNotifications.ts`
- Create: `frontend/public/firebase-messaging-sw.js`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/.env.example`
- Create: `frontend/tests/push-notifications.test.mjs`

- [x] **Step 1: 토큰 등록·재등록·소유권 갱신·비활성화 API 실패 테스트를 작성한다.**
- [x] **Step 2: 팬앱의 지원 여부·권한 거절·토큰 등록·로그아웃 해제 계약 테스트를 작성하고 실패를 확인한다.**
- [x] **Step 3: `/api/me/push-devices` PUT/DELETE를 인증된 팬 API에 추가한다.**
- [x] **Step 4: Firebase 웹 공개 설정과 service worker를 추가하고 명시적 사용자 동작에서만 권한을 요청한다.**
- [x] **Step 5: 로그인 후 토큰 동기화, 토큰 갱신, 로그아웃 해제를 연결하며 미지원 브라우저는 기존 앱 알림만 유지한다.**
- [x] **Step 6: API·팬앱 집중 테스트를 실행한다.**

### Task 7: 운영 문서, 관리자 상태, 전체 검증

**Files:**
- Modify: `docs/SUPABASE_SETUP.md`
- Create: `docs/CLOUDFLARE_FIREBASE_RESEND_SETUP.md`
- Modify: `docs/api-contract.md`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Test: `admin_app/tests/notifications.test.mjs`

- [x] **Step 1: 관리자 알림에서 요청 접수와 전달 상태를 구분하는 실패 계약 테스트를 작성한다.**
- [x] **Step 2: 전송 상태 요약을 관리자 API/UI에 최소한으로 노출한다.**
- [x] **Step 3: R2 CORS, Firebase 웹/서버 키, Resend 도메인·발신자, 배포 secret, 로컬 fallback 설정 절차를 문서화한다.**
- [x] **Step 4: backend unit/contract/integration 테스트, frontend/admin 테스트, lint, build, migration smoke, `git diff --check`를 실행한다.** (backend 444 passed/2 skipped, frontend 227 passed, build/lint/admin syntax/ruff/diff check 통과; Docker Compose 검증은 로컬 Docker 미설치로 보류)
- [ ] **Step 5: 로컬 팬앱·관리자웹에서 이미지 업로드, 앱 알림, 토큰 API, 전달 상태를 E2E 확인한다.**
- [ ] **Step 6: Cloudflare·Firebase·Resend 대시보드 값이 필요한 시점에 인앱 브라우저를 열고 사용자 로그인 후 실제 자격 증명을 배포 secret에 연결한다.**
