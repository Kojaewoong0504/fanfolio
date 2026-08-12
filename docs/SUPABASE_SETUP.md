# Fanfolio Supabase 운영 저장소 설정

Fanfolio는 브라우저에서 Supabase에 직접 접속하지 않습니다.

- **PostgreSQL**: FastAPI가 SQLAlchemy async로 Supabase PostgreSQL에 연결합니다.
- **파일/이미지**: FastAPI가 Supabase Storage의 S3 호환 엔드포인트를 통해 카드 앞면·뒷면·미디어·미리보기를 저장합니다.
- **마이그레이션**: 스키마 변경은 Alembic으로 적용합니다.
- **보안**: `DATABASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`는 서버(Render) 환경 변수에만 둡니다. 프론트엔드 환경 변수나 Git에 넣지 않습니다.

이 구조를 사용하면 Render 재시작이나 재배포가 발생해도 카드 메타데이터와 이미지가 사라지지 않습니다. 기존 Render/SQLite 데이터는 자동으로 이전되지 않으므로 별도 export/import가 필요합니다.

## 1. Supabase 프로젝트 준비

1. Supabase에서 프로젝트를 생성합니다.
2. Database 설정에서 연결 문자열을 확인합니다.
3. Render처럼 외부 서버에서 연결할 때는 Supabase의 **Transaction pooler** 연결 문자열을 사용할 수 있습니다.
4. Transaction pooler(일반적으로 6543 포트)를 사용할 때는 아래처럼 prepared statement 캐시를 끕니다.

```env
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<db-password>@<pooler-host>:6543/postgres
DATABASE_STATEMENT_CACHE_SIZE=0
```

직접 연결 또는 Session pooler를 사용한다면 해당 연결 방식에 맞는 호스트·포트를 사용하고, `DATABASE_STATEMENT_CACHE_SIZE`는 성능 요구에 따라 조정할 수 있습니다.

## 2. Storage 버킷과 S3 호환 키 준비

Storage에 `fanfolio-assets`라는 **private bucket**을 생성합니다. 카드 원본과 음성·동영상은 공개 URL이 아니라 백엔드가 권한을 확인한 뒤 전달하는 방식을 사용합니다.

Supabase Storage의 S3 Configuration에서 서버 전용 S3 Access Key와 Secret Key를 발급합니다. 앱은 다음 값을 사용합니다.

```env
STORAGE_BACKEND=supabase
S3_ENDPOINT_URL=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=<project-region>
S3_BUCKET=fanfolio-assets
S3_KEY_PREFIX=fanfolio
S3_ACCESS_KEY_ID=<server-only-s3-access-key>
S3_SECRET_ACCESS_KEY=<server-only-s3-secret-key>
```

S3 키는 Storage RLS를 우회할 수 있는 서버 권한이므로 절대로 프론트 번들, `VITE_*`, `NEXT_PUBLIC_*`, 로그, Git 저장소에 노출하지 않습니다. Fanfolio 백엔드가 모든 업로드·다운로드 권한을 통제합니다.

공식 참고: [Supabase Storage S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)

## 3. Render 환경 변수

Render 백엔드 서비스의 Environment에 아래를 등록합니다.

```env
APP_ENV=production
DATABASE_URL=postgresql+asyncpg://...
DATABASE_STATEMENT_CACHE_SIZE=0
AUTO_CREATE_SCHEMA=false
STORAGE_BACKEND=supabase
S3_ENDPOINT_URL=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=<project-region>
S3_BUCKET=fanfolio-assets
S3_KEY_PREFIX=fanfolio
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

기존 인증·OAuth·메일·Redis 환경 변수는 그대로 유지합니다. `DATABASE_URL`의 비밀번호와 S3 Secret은 이 문서나 `.env` 파일에 실제 값으로 커밋하지 않습니다.

## 4. 스키마 적용

Render Shell 또는 배포 작업에서 백엔드 디렉터리를 기준으로 실행합니다.

```bash
cd backend
alembic upgrade head
```

그 다음 백엔드의 `/api/health`를 확인합니다. 카드 생성 후 카드 목록·검수 화면·팬앱 카드 상세에서 이미지가 보이는지 확인해야 합니다. 파일이 저장되지 않으면 먼저 `STORAGE_BACKEND`, S3 endpoint, bucket, S3 키와 Render 로그를 확인합니다.

## 5. RLS와 데이터 접근 원칙

현재 백엔드는 서버 전용 PostgreSQL 연결로 SQLAlchemy를 사용하므로 팬앱·관리자 웹·아티스트 스튜디오가 Supabase 테이블에 직접 접근하지 않습니다. 따라서 권한 검사는 FastAPI 인증·인가 계층에서 수행합니다.

나중에 Supabase Data API를 브라우저에서 직접 사용할 기능을 추가한다면 해당 테이블에 RLS를 활성화하고, 사용자 JWT 기반 정책을 별도로 설계해야 합니다. 현재 구조에서 `service_role` 키를 프론트에 넣어 이 정책을 우회하면 안 됩니다.

## 6. 데이터 이전 주의

Render의 기존 SQLite 파일이나 로컬 `storage/` 폴더는 Supabase로 자동 복사되지 않습니다.

1. 기존 데이터를 별도 백업합니다.
2. PostgreSQL 스키마를 `alembic upgrade head`로 준비합니다.
3. 필요한 테이블 데이터를 PostgreSQL로 변환·import합니다.
4. 기존 이미지·미디어를 `fanfolio-assets`에 업로드하고 DB의 저장 경로를 새 object key로 맞춥니다.
5. 카드 목록, 카드 검수, 드롭 코드 사용, 팬 컬렉션 등록을 순서대로 smoke test합니다.
