# PostgreSQL 금융 운영 런북

## 운영 원칙

`point_ledger`는 append-only다. API는 `DATABASE_APP_ROLE`로 접속하고, migration은 소유자 또는 권한을 위임받은 운영 역할로 실행한다. 앱 역할에는 `SELECT, INSERT`만 부여하고 `UPDATE, DELETE, TRUNCATE`는 회수한다. 원장을 고치는 대신 반대 방향의 `reverse` 원장 행을 추가한다.

운영 설정에는 실제 비밀번호를 기록하지 않는다.

```dotenv
DATABASE_URL=postgresql+asyncpg://fanfolio_api:<url-encoded-password>@<host>:5432/fanfolio
DATABASE_APP_ROLE=fanfolio_api
POINT_RECONCILIATION_INTERVAL_SECONDS=300
```

## 마이그레이션 순서

1. DB 소유자 연결로 `alembic upgrade head`를 실행한다.
2. API를 `DATABASE_APP_ROLE`로 재시작한다.
3. `point_ledger`에 대한 UPDATE/DELETE/TRUNCATE 시도가 거부되는지 확인한다.
4. Celery Beat가 `fanfolio.reconcile_point_balances`를 실행하는지 확인한다.

권한 migration은 역할 이름이 비어 있으면 아무 권한도 변경하지 않는다. 역할 이름은 영문·숫자·밑줄만 허용해 SQL 식별자 주입을 차단한다.

## 정합성 경고

정합성 작업은 캐시 잔액과 원장 합계를 비교해 drift 개수만 반환하고, 금융 데이터를 자동 수정하지 않는다. 경고가 발생하면 `/api/admin/integrity/points`에서 사용자별 차이를 확인한 뒤 승인된 보정 명령을 통해 반대 원장을 기록한다.

## 테스트 경계

일반 pytest 실행은 SQLite에서 원장 서비스와 migration 계약을 검증한다. 실제 PostgreSQL 동시성·권한 검증은 `FANFOLIO_POSTGRES_TEST_URL`이 설정된 환경에서만 실행하며, 변수가 없을 때는 테스트를 성공으로 위장하지 않고 skip한다.
