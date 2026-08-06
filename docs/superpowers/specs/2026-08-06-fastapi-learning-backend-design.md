# Fanfolio FastAPI 학습용 백엔드 디자인

## 목표

`BACKEND_IMPLEMENTATION_CONTRACT.md`와 `backend/tests/contract/`를 만족하는 실행 가능한 예시 백엔드를 `backend/app/`에 구현한다. 각 모듈은 최신 FastAPI, Pydantic v2, SQLAlchemy 2 async 패턴을 설명하는 한국어 주석을 포함한다.

## 범위

- FastAPI application factory와 lifespan
- Pydantic v2 요청/응답 스키마와 공통 response envelope
- `APIRouter` 기반의 health, test fixture, auth, fan, admin, artist 라우터
- SQLite + aiosqlite 기반 SQLAlchemy async engine, `async_sessionmaker`, 요청 단위 session dependency
- 코드 발급의 원자성, 세션 기반 권한 검사, 카드 상태 전이
- 계약 테스트에 필요한 test-only reset/seed 라우터
- 비동기 이미지 작업 상태(job) 생성 API

## 비범위

- 실제 이메일 전송, OAuth, 파일 스토리지, QR 이미지 해독, 이미지 배경 제거 모델
- Celery/Redis worker 배포. job 모델과 API만 만들어 나중에 큐를 연결할 위치를 보여 준다.
- 결제, NFT, 마켓플레이스, 소셜 기능

## 모듈 경계

```text
app/main.py              앱 생성, lifespan, 라우터 등록
app/core/config.py       환경 변수와 URL 설정
app/db/session.py        async engine, session factory, 요청 의존성
app/models.py            SQLAlchemy 테이블 및 Enum
app/schemas.py           Pydantic v2 입력·출력 모델
app/dependencies.py      현재 사용자와 역할 검사
app/services.py          카드 등록, 상태 전이, 시드 데이터 생성
app/routers/*.py         HTTP 해석과 응답 모델 연결
```

라우터는 HTTP 입출력·상태 코드만 담당한다. 트랜잭션, 권한의 세부 검사, 상태 전이는 service에 둔다. DB session은 요청마다 새 `AsyncSession`을 만들며, 어떤 전역 session도 공유하지 않는다.

## 데이터 및 트랜잭션

- User, Session, Card, Drop, RedeemCode, UserCard, Notification, Asset, BackgroundRemovalJob을 SQLite 테이블로 둔다.
- `POST /api/redemptions`은 redeem code의 사용 가능 여부 검사, code 사용 처리, UserCard 생성, drop 사용량 증가를 하나의 `async with session.begin()` 트랜잭션에서 처리한다.
- 테스트 fixture는 `APP_ENV=test`일 때만 router를 등록하며, `reset`과 `seed`가 독립적인 테스트 상태를 만든다.

## API 경계

- 모든 성공 응답은 `{ "ok": true, "data": ... }`다.
- 모든 도메인 오류는 `{ "ok": false, "error": { "code", "message" } }` 형식의 `HTTPException` handler로 통일한다.
- 인증은 `fanfolio_session` cookie에서 session token을 읽는다.
- Fan / Admin / Artist 권한은 dependency alias(`Annotated`)로 표현한다.

## 테스트 전략

- 기존 계약 테스트를 수정하지 않는다.
- health → test fixture → auth → fan redemption → fan read models → admin/artist 순서로 구현한다.
- async DB 코드는 pytest의 HTTP 테스트를 통해 검증하고, 필요할 때 `httpx.AsyncClient` 기반 단위 테스트를 추가한다.

## 학습 주석 원칙

- 주석은 “무엇을 하는가”가 아니라 “왜 이 선택을 하는가”를 설명한다.
- Pydantic v2, `Annotated`, `expire_on_commit=False`, eager loading, transaction boundary 등 2022년 이후 자주 달라진 부분을 우선 설명한다.
- 오래된 대안(`on_event`, Pydantic v1 `Config`, sync session 공유)이 왜 피해야 하는지도 짧게 연결한다.
