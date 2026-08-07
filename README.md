# Fanfolio

공식 디지털 포토카드를 코드 또는 QR로 발급받고 수집하는 서비스입니다.

## 개발 환경

- `frontend/`: React + Vite + TypeScript
- `admin_app/`: 한국어 관리자 운영 화면(정적 브라우저 앱)
- `builder_app/`: 아티스트 카드 스튜디오(정적 브라우저 앱)
- `backend/`: FastAPI + SQLAlchemy + Alembic
- 데이터베이스: SQLite로 시작하고 PostgreSQL로 마이그레이션 가능하게 설계

## 처음 실행하기

MVP를 짧게 소개하거나 검수할 때는 [1분 데모 스크립트](DEMO_SCRIPT.md)를 참고하세요.

### 1. 환경 변수 준비

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

백엔드 가상환경은 저장소에 포함되지 않으므로 최초 한 번만 준비합니다. `uv`가 없다면
[uv 설치 안내](https://docs.astral.sh/uv/getting-started/installation/)에 따라 설치한 뒤 실행하세요.

```bash
uv sync --project backend --locked --dev
```

이후의 실행·검사 명령은 `backend/.venv/bin/` 안의 도구를 직접 사용합니다. 따라서 VS Code의
Python 인터프리터도 `backend/.venv/bin/python`으로 선택해야 하며, 별도의 `python3 -m uv` 명령은
사용하지 않습니다.

### 2. 백엔드 실행

```bash
cd backend
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

헬스 체크: `http://localhost:8000/api/health`
배포 readiness 체크: `http://localhost:8000/api/health/ready` (데이터베이스와 운영 설정을 함께 확인)

### 3. 프론트엔드 실행

```bash
cd frontend
npm run dev
```

프론트는 `http://localhost:5173`에서 실행되며 `/api` 요청을 FastAPI로 프록시합니다.

### 4. 관리자 화면 실행

```bash
cd admin_app
python3 -m http.server 4174
```

관리자 화면은 `http://localhost:4174`에서 열 수 있습니다. 기본 API 주소는
`http://localhost:8000/api`이며, 설정 화면에서 다른 주소로 변경할 수 있습니다.

### 5. 아티스트 스튜디오 실행

```bash
cd builder_app
python3 -m http.server 4175
```

스튜디오는 `http://localhost:4175`에서 열 수 있습니다. 카드 생성, 손글씨 캔버스,
배경 제거 작업 요청, 검수 요청 API를 연결합니다. 브라우저의 세션 설정에서 아티스트 세션 토큰을 입력할 수 있습니다.

### 6. 선택적 Celery 작업자

기본값은 Redis 없이 실행되는 `TASK_QUEUE_MODE=inline`입니다. Redis를 실행한 뒤 분산 작업 큐를 사용하려면 backend `.env`를 다음처럼 설정하고 Celery worker를 실행합니다.

```bash
TASK_QUEUE_MODE=celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

cd backend
.venv/bin/celery -A app.tasks:celery_app worker --loglevel=INFO
.venv/bin/celery -A app.tasks:celery_app beat --loglevel=INFO
```

운영에서는 요청 제한도 모든 API 인스턴스가 공유해야 하므로 Redis를 사용합니다.
`APP_ENV=production`일 때 `RATE_LIMIT_BACKEND=redis`가 아니면 API가 시작되지 않습니다.
로컬 개발과 계약 테스트는 Redis 없이 실행할 수 있도록 기본값이 `memory`입니다.

```bash
RATE_LIMIT_BACKEND=redis
RATE_LIMIT_REDIS_URL=redis://localhost:6379/1
```

Redis 장애 시 요청 제한을 우회하지 않고 `503 RATE_LIMITER_UNAVAILABLE`을 반환합니다.

### 7. 매직 링크 이메일 발송

기본 `MAIL_DELIVERY_MODE=console`에서는 실제 메일 대신 백엔드 로그에 로그인 URL을 남깁니다.
운영 SMTP를 사용하려면 `backend/.env`에 다음 값을 설정합니다. 비밀번호는 저장소에 커밋하지 마세요.

```bash
MAIL_DELIVERY_MODE=smtp
FRONTEND_URL=https://app.fanfolio.example
MAIL_FROM=Fanfolio <no-reply@fanfolio.example>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=mailer-user
SMTP_PASSWORD=replace-me
SMTP_USE_TLS=true
```

사용자가 메일의 링크를 클릭하면 프론트가 `token` 쿼리 파라미터를 자동으로 검증하고 로그인합니다.
SMTP 연결에 실패하면 API는 `503 MAGIC_LINK_DELIVERY_FAILED`를 반환합니다.

로그인 성공 후 API는 짧은 수명의 access JWT를 응답하고, 회전 가능한 refresh JWT는 HttpOnly
쿠키로만 저장합니다. access token은 각 프론트 앱의 메모리에만 두며, 만료되면
`POST /api/auth/refresh`가 refresh token rotation(RTR)을 수행해 새 access/refresh token을
발급합니다. 이전 refresh token이 다시 사용되면 해당 token family 전체를 폐기합니다.
운영 환경에서는 아래 JWT 비밀키를 반드시 별도 시크릿으로 주입하고 기본값을 사용하지 마세요.

```bash
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
JWT_ISSUER=fanfolio
JWT_AUDIENCE=fanfolio-api
JWT_ACCESS_TTL_SECONDS=600
JWT_REFRESH_TTL_SECONDS=2592000
```

refresh 쿠키는 `fanfolio_fan_refresh`, `fanfolio_admin_refresh`, `fanfolio_artist_refresh`로
클라이언트별 분리되며 `Secure`, `HttpOnly`, `SameSite=Lax` 속성을 사용합니다.

### 8. Kakao·Google 소셜 로그인 설정

팬 앱 로그인 화면은 Kakao와 Google을 우선 노출하고 이메일 매직 링크를 보조 수단으로 제공합니다.
각 provider의 콘솔에 아래 callback URL을 등록한 뒤 환경변수를 설정합니다. OAuth callback은
access token을 URL에 넣지 않고 1회성 교환 코드만 프론트로 전달하며, 프론트가 이를 API에 교환해
기존 JWT/RTR 쿠키를 발급받습니다.

```bash
OAUTH_FRONTEND_CALLBACK_URL=https://app.fanfolio.example/oauth/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.fanfolio.example/api/auth/oauth/google/callback
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...
KAKAO_REDIRECT_URI=https://api.fanfolio.example/api/auth/oauth/kakao/callback
```

Google은 OpenID Connect의 `openid email profile` scope를 사용하고, Kakao는 이메일·닉네임
동의를 요청합니다. 이메일이 provider에서 검증되지 않은 경우 계정을 만들거나 기존 계정에
연결하지 않습니다. Apple 로그인은 개발자 프로그램 비용과 별도 운영 설정이 필요하므로 이후
단계로 남겨 둡니다.
운영 환경(`APP_ENV=production`)에서는 애플리케이션 시작 시 `FRONTEND_URL`이 HTTPS인지,
`FRONTEND_ORIGINS`가 비어 있지 않은지, SMTP 설정이 있는지를 검사합니다. 조건을 만족하지
않으면 안전하지 않은 기본값으로 서버가 시작되지 않습니다.

개발 중 실제 메일 메시지까지 확인하려면 Docker가 설치된 환경에서 Mailpit을 실행합니다.

```bash
docker compose -f docker-compose.mailpit.yml up -d
# backend/.env에 backend/.env.mailpit.example의 값을 반영한 뒤 API를 재시작
open http://localhost:8025
```

팬·관리자·아티스트 로그인 링크를 요청하면 메일이 Mailpit 화면에 도착합니다. SMTP 포트는
`1025`, 웹 확인 화면은 `8025`이며 외부 SMTP 계정 없이도 링크 생성부터 수신까지 확인할 수 있습니다.

### 8. PostgreSQL·SMTP·Redis 통합 환경

Docker 또는 Podman Compose를 사용할 수 있다면 세 외부 의존성을 한 번에 실행할 수 있습니다.
이 구성의 비밀번호와 포트는 로컬 개발 전용이며 운영 환경에서 재사용하지 마세요.

```bash
docker compose -f docker-compose.local.yml up -d
cp backend/.env.mailpit.example backend/.env
```

`backend/.env`의 데이터베이스와 작업 큐 설정을 다음처럼 바꾼 뒤 마이그레이션과 API를
실행합니다.

```dotenv
DATABASE_URL=postgresql+asyncpg://fanfolio:fanfolio-local-only@localhost:5432/fanfolio
AUTO_CREATE_SCHEMA=false
TASK_QUEUE_MODE=celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

```bash
cd backend
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/celery -A app.tasks:celery_app worker --loglevel=INFO
.venv/bin/celery -A app.tasks:celery_app beat --loglevel=INFO
```

`http://localhost:8000/api/health/ready`가 `ready`를 반환하고, `http://localhost:8025`에서
매직 링크 메일을 확인하면 데이터베이스·SMTP·작업 큐를 연결한 개발 검증이 끝납니다.

위 과정을 자동으로 확인하려면 루트에서 다음 명령을 실행합니다. 이 스모크 테스트는
PostgreSQL 마이그레이션, Celery worker와 Beat의 실제 기동·스케줄 발행, Redis rate limit(6번째
요청의 429), SMTP Mailpit 수신까지 확인합니다. 컨테이너는 기본적으로 계속 실행되므로 Mailpit에서
메시지를 확인할 수 있습니다. 테스트 후 정리하려면
`STOP_SERVICES=1`을 붙입니다.

```bash
./scripts/integration-smoke.sh
STOP_SERVICES=1 ./scripts/integration-smoke.sh
```

Podman을 사용할 때 기본 연결이 여러 개라면 연결 이름을 명시할 수 있습니다.

```bash
COMPOSE_PROVIDER=podman PODMAN_CONNECTION=fanfolio-machine ./scripts/integration-smoke.sh
```

`podman compose`가 제공되지 않는 Podman 설치에서는 `podman-compose`를 설치하면
스크립트가 자동으로 인식합니다. 이미 사용 중인 로컬 포트가 있으면 외부 포트만 바꿀 수
있습니다(컨테이너 내부 포트와 API 설정은 스크립트가 함께 맞춥니다).

```bash
python3 -m pip install --user podman-compose
POSTGRES_HOST_PORT=15432 SMTP_HOST_PORT=11025 MAILPIT_HOST_PORT=18025 \
REDIS_HOST_PORT=16379 COMPOSE_PROVIDER=podman \
PODMAN_CONNECTION=fanfolio-machine STOP_SERVICES=1 ./scripts/integration-smoke.sh
```

API와 Celery까지 컨테이너로 실행하려면 별도의 전체 스택 compose 파일을 사용합니다.
이 구성은 로컬 검증용이며, 운영에서는 비밀번호·도메인·TLS 설정을 반드시 교체하세요.

```bash
docker compose -f docker-compose.stack.yml up --build -d
open http://localhost:8025
```

API 컨테이너가 시작될 때 Alembic 마이그레이션을 먼저 적용합니다. 상태와 로그는 다음처럼
확인할 수 있습니다.

API와 Celery는 컨테이너 내부의 비특권 `fanfolio` 사용자로 실행됩니다.

```bash
curl http://localhost:8000/api/health/ready
docker compose -f docker-compose.stack.yml logs -f api worker beat
```

종료 및 로컬 볼륨까지 삭제하려면 다음을 사용합니다.

```bash
docker compose -f docker-compose.stack.yml down -v
```

S3·ClamAV 통합 검증은 별도 스택으로 실행합니다. 스택은 테스트용 MinIO 버킷을 만들고
로컬 팬/아티스트 프론트엔드에서 presigned PUT을 사용할 수 있도록 버킷 CORS도 설정합니다.
ClamAV 이미지는 Apple Silicon을 포함한 멀티아키텍처 태그로 고정되어 있으며, 포트가 이미
사용 중이면 환경 변수로 외부 포트를 바꿀 수 있습니다. 운영 S3에서는 `localhost` origin을
그대로 사용하지 말고 실제 HTTPS 프론트엔드 origin만 버킷 CORS에 등록하세요.

```bash
docker compose -f docker-compose.storage.example.yml up -d
cd backend
FANFOLIO_S3_INTEGRATION=1 \
S3_ENDPOINT_URL=http://localhost:9000 \
S3_REGION=ap-northeast-2 \
S3_BUCKET=fanfolio-test \
S3_ACCESS_KEY_ID=fanfolio-local \
S3_SECRET_ACCESS_KEY=fanfolio-local-secret \
.venv/bin/pytest -q tests/integration/test_s3_storage.py
```

ClamAV의 정상 파일 통과와 EICAR 테스트 시그니처 차단까지 확인하려면 같은 스택에서
다음 통합 테스트를 실행합니다. 테스트 시그니처는 실제 악성 코드가 아니라 안티바이러스
연동 검증용 표준 문자열입니다.

```bash
cd backend
FANFOLIO_CLAMAV_INTEGRATION=1 \
ASSET_SCAN_MODE=clamav \
CLAMAV_HOST=localhost \
CLAMAV_PORT=3310 \
.venv/bin/pytest -q tests/integration/test_clamav.py
```

두 검증을 한 번에 실행하고 완료 후 스택까지 정리하려면 루트에서 다음 스크립트를
사용합니다. Docker 대신 Podman을 사용한다면 연결 이름을 지정할 수 있습니다.

```bash
./scripts/storage-integration-smoke.sh
COMPOSE_PROVIDER=podman PODMAN_CONNECTION=fanfolio-machine \
  ./scripts/storage-integration-smoke.sh
```

포트를 바꿨다면 `S3_ENDPOINT_URL`도 같은 외부 MinIO 포트로 맞추세요. 검증 후에는
`docker compose -f docker-compose.storage.example.yml down -v`로 테스트 컨테이너와 볼륨을
정리합니다.

운영에서는 `AUTO_CREATE_SCHEMA=false`를 유지하고 배포 단계에서 `alembic upgrade head`를
먼저 실행합니다. 앱이 시작할 때 ORM이 임의로 테이블을 만들지 않도록 하는 설정입니다.

### 운영용 컨테이너 배포 템플릿

운영 환경의 비밀번호와 SMTP 자격 증명은 저장소에 커밋하지 않습니다. 예시 환경 파일을
복사해 실제 값으로 교체한 뒤, TLS reverse proxy가 API 앞단에서 HTTPS를 종료하도록 구성하세요.
API 포트는 기본적으로 `127.0.0.1:8000`에만 바인딩되어 외부에 직접 노출되지 않습니다.

```bash
cp .env.production.example .env.production
# .env.production의 도메인·DB·Redis·SMTP 값을 실제 값으로 교체
docker compose --env-file .env.production \
  -f docker-compose.production.example.yml config
docker compose --env-file .env.production \
  -f docker-compose.production.example.yml up --build -d
curl http://127.0.0.1:8000/api/health/ready
```

`config` 단계가 필수 환경 변수 누락을 먼저 잡고, API 컨테이너가 `alembic upgrade head`
후 시작합니다. 운영 배포에서는 이미지 태그를 고정하고, PostgreSQL·Redis 볼륨 백업과
TLS reverse proxy 설정을 별도로 관리하세요. `docker-compose.stack.yml`은 Mailpit과
개발용 비밀번호를 포함한 로컬 검증용이므로 운영에 사용하지 않습니다.

## VS Code 개발 환경

프로젝트 루트 폴더를 VS Code로 열면 추천 확장 설치 알림이 표시됩니다. 다음 확장을 설치하세요.

- Python + Pylance: 타입 진단, 자동 import, 함수·FastAPI 타입 기반 자동완성
- Ruff: 저장 시 Python 포맷과 import 정리
- Python Debugger: `Run and Debug`에서 `Backend: FastAPI` 실행
- GitLens: Git 변경 이력·blame 확인
- GitHub Copilot / Copilot Chat: 선택 사항. GitHub 로그인과 별도 구독이 있어야 AI 코드 제안이 활성화됩니다.

공유 설정은 `.vscode/`에 있습니다. Python 인터프리터는 `backend/.venv/bin/python`으로 자동 선택됩니다. VS Code 터미널에서 `code .` 명령도 쓰고 싶다면 Command Palette에서 `Shell Command: Install 'code' command in PATH`를 한 번 실행하세요.

`Terminal > Run Task`에서 다음 작업을 바로 실행할 수 있습니다.

- `Backend: Ruff 검사`
- `Backend: 계약 테스트`
- `Frontend: Lint`
- `Frontend: Build`

### Git pre-commit

저장소 전용 hook이 `.githooks/pre-commit`에 연결돼 있습니다. 커밋할 Python 파일에는 Ruff 포맷·lint를, 프론트 변경에는 lint를 실행합니다. 아직 구현 전이라 의도적으로 실패하는 계약 테스트는 pre-commit에서 실행하지 않습니다.

수동 실행:

```bash
backend/.venv/bin/pre-commit run --all-files
```

## 품질 확인

```bash
cd backend
.venv/bin/pytest
.venv/bin/ruff check app tests alembic

cd ../frontend
npm run lint
npm run build
```

### 브라우저 스모크 테스트

백엔드, 팬 앱, 관리자 웹, 아티스트 스튜디오를 함께 실행하고 핵심 브라우저 흐름을
검증하려면 저장소 루트에서 실행합니다. 테스트는 임시 SQLite 데이터베이스와 저장소를
사용하므로 현재 개발 데이터에 영향을 주지 않습니다.

```bash
./scripts/e2e-smoke.sh
```

이 테스트는 아티스트 카드 생성·손글씨 배경 제거·미리보기·검수 요청, 관리자 승인·공개·
코드 발행, 팬 로그인·최초 설정·코드 등록·카드 상세 확인, 그리고 세 앱의 브라우저 세션
분리를 확인합니다.

GitHub Actions의 `Fanfolio CI`는 이 검사를 백엔드 계약 테스트·프론트 빌드·Docker 기반
PostgreSQL/Redis/Mailpit/Celery 통합 테스트로 나누어 push와 pull request마다 실행합니다.

### 운영 배포 전 설정 점검

운영 서버를 시작하기 전에 `backend/.env` 또는 환경변수를 로드한 상태에서 실행합니다.
HTTPS origin, SMTP 설정, 그리고 test-only route 비활성화를 확인하며 데이터베이스를 변경하지
않습니다.

PostgreSQL을 사용할 때는 async URL을 지정합니다. `asyncpg` 드라이버는 backend 의존성에
포함되어 있습니다.

```bash
DATABASE_URL=postgresql+asyncpg://user:password@db:5432/fanfolio
```

```bash
APP_ENV=production AUTO_CREATE_SCHEMA=false ./scripts/production-preflight.sh
```

## 백엔드 계약 테스트

백엔드 구현 전에는 아래 테스트가 실패하는 것이 정상입니다. API를 구현하면서 순서대로 통과시키세요.

```bash
cd backend
APP_ENV=test .venv/bin/pytest tests/contract -q
```

세부 입력/출력과 테스트 fixture 규약은 [백엔드 구현 계약](BACKEND_IMPLEMENTATION_CONTRACT.md)을 따릅니다.

## 참고 문서

- [프론트엔드·기능·API 명세](FANFOLIO_FRONTEND_API_SPEC_v0_2.md)
- [UI/UX 검수 보드](fanfolio-ui-review.html)
