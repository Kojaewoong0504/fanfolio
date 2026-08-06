# Fanfolio

공식 디지털 포토카드를 코드 또는 QR로 발급받고 수집하는 서비스입니다.

## 개발 환경

- `frontend/`: React + Vite + TypeScript
- `admin_app/`: 한국어 관리자 운영 화면(정적 브라우저 앱)
- `builder_app/`: 아티스트 카드 스튜디오(정적 브라우저 앱)
- `backend/`: FastAPI + SQLAlchemy + Alembic
- 데이터베이스: SQLite로 시작하고 PostgreSQL로 마이그레이션 가능하게 설계

## 처음 실행하기

### 1. 환경 변수 준비

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

### 2. 백엔드 실행

```bash
cd backend
python3 -m uv run uvicorn app.main:app --reload --port 8000
```

헬스 체크: `http://localhost:8000/api/health`

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
python3 -m uv run celery -A app.tasks:celery_app worker --loglevel=INFO
```

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
python3 -m uv run --project backend pre-commit run --all-files
```

## 품질 확인

```bash
cd backend
python3 -m uv run pytest
python3 -m uv run ruff check .

cd ../frontend
npm run lint
npm run build
```

## 백엔드 계약 테스트

백엔드 구현 전에는 아래 테스트가 실패하는 것이 정상입니다. API를 구현하면서 순서대로 통과시키세요.

```bash
cd backend
APP_ENV=test python3 -m uv run pytest tests/contract -q
```

세부 입력/출력과 테스트 fixture 규약은 [백엔드 구현 계약](BACKEND_IMPLEMENTATION_CONTRACT.md)을 따릅니다.

## 참고 문서

- [프론트엔드·기능·API 명세](FANFOLIO_FRONTEND_API_SPEC_v0_2.md)
- [UI/UX 검수 보드](fanfolio-ui-review.html)
