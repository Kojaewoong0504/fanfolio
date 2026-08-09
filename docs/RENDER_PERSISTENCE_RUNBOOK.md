# Render 운영 데이터 영속성 런북

## 현재 확인된 증상

아티스트 계정이 재배포 뒤 사라졌다면 먼저 애플리케이션 로그인 코드를 수정하지 않는다. Render 배포 로그에서 아래와 같이 Alembic이 `0001`부터 전체 실행되는지 확인한다.

```text
Running upgrade -> 0001_schema_and_drop_metadata
...
Running upgrade -> 0021_artist_card_layers
```

기존 PostgreSQL에 연결된 정상적인 재배포라면 이미 적용된 migration은 다시 처음부터 실행되지 않는다. 이 로그는 현재 `DATABASE_URL`이 비어 있는 새 데이터베이스 또는 기존과 다른 데이터베이스를 가리킨다는 강한 신호다.

## 복구 순서

1. 재배포와 계정 재생성을 반복하지 않는다.
2. Render 프로젝트의 서비스 목록에서 `fanfolio-api` 외에 PostgreSQL 또는 외부 관리형 PostgreSQL이 실제로 존재하는지 확인한다.
3. 기존 데이터가 있는 PostgreSQL을 찾았으면 그 연결 주소를 Render의 `DATABASE_URL`에 설정한다. 값은 저장소나 채팅에 기록하지 않는다.
4. URL scheme은 반드시 `postgresql+asyncpg://`를 사용한다. 비밀번호에 `@`, `#`, `/`, `:` 등이 포함되면 URL encode한다.
5. `APP_ENV=production`, `AUTO_CREATE_SCHEMA=false`를 유지하고 한 번만 재배포한다.
6. 로그에서 migration이 새로 `0001`부터 시작하지 않는지 확인한 뒤 관리자 로그인, 아티스트 로그인, 카드 목록을 확인한다.

기존 PostgreSQL이나 백업이 없다면 현재 비어 있는 데이터베이스에서 계정·카드 정보를 복구할 수 없다. 이 경우 새 관리형 PostgreSQL을 연결하고 관리자 계정, 아티스트 계정, 카탈로그를 다시 provision해야 한다.

## 재발 방지 체크리스트

- API 서비스의 `DATABASE_URL`은 Render PostgreSQL의 영속 connection string 또는 외부 관리형 PostgreSQL만 사용한다.
- SQLite(`./fanfolio.db`)와 컨테이너 파일시스템의 `storage/`를 운영 데이터 저장소로 사용하지 않는다.
- 이미지·영상은 S3 호환 object storage에 저장한다.
- 배포 직후 `/api/health`와 `/api/health/ready`를 모두 확인한다. `health`만 200이고 `ready`가 503이면 운영 트래픽을 정상으로 보지 않는다.
- 운영 DB의 정기 백업과 복구 리허설을 별도로 설정한다.

현재 코드도 production에서 SQLite와 schema 자동 생성 설정을 거부하지만, 빈 PostgreSQL을 정상적인 DB로 오인하는 문제는 인프라의 DB 연결 대상과 백업 정책으로 막아야 한다.
