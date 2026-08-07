# Fanfolio 상용 인증·브랜드 설계

## 1. 목적

현재 Fanfolio의 고정 fixture 매직 링크는 계약 테스트에는 적합하지만 실제 사용자가 로그인하기에는 불편하다. 이 설계는 카카오·Google 소셜 로그인을 주 경로로 만들고, 이메일 로그인과 회원가입을 보조 경로로 제공하며, 운영 배포에서 안전하게 확장할 수 있는 인증 경계를 정의한다.

Apple 로그인은 초기 범위에서 제외한다. 다만 provider adapter 계약을 유지해 추후 별도 provider를 추가할 수 있어야 한다.

## 2. 범위와 성공 기준

### 포함

- 팬 앱 로그인 화면의 소셜 우선 UX
- 카카오 OAuth 로그인
- Google OAuth 로그인
- 소셜 최초 로그인 시 자동 회원 생성 및 최초 설정 진입
- 이메일·비밀번호 회원가입, 이메일 인증, 로그인
- 비밀번호 재설정 요청 및 재설정
- 기존 매직 링크는 계정 복구·보조 인증으로 유지하되 기본 화면에서는 접힘
- 인증 실패·취소·중복 계정·provider 장애의 한국어 상태 표시
- provider별 환경변수와 callback URL의 개발/스테이징/운영 분리
- Fanfolio 브랜드 마크, 워드마크, favicon 및 로그인 화면 자산

### 제외

- Apple 로그인 실제 연결
- 다중 계정 병합 UI
- 전화번호 인증
- 소셜 provider별 프로필 사진을 영구 저장하는 별도 미디어 파이프라인
- 운영 SMTP/provider의 실제 계정 생성과 비밀키 발급

### 성공 기준

1. 신규 사용자는 카카오 또는 Google 버튼 한 번으로 인증 provider로 이동하고, callback 후 Fanfolio 세션을 받는다.
2. 이미 연결된 provider identity면 기존 계정으로 로그인하고, 이메일만 일치하는 별도 계정은 자동 병합하지 않으며 명시적인 계정 연결 절차를 요구한다.
3. 최초 로그인 사용자는 인증 이후 한 번만 온보딩으로 이동한다.
4. 이메일 경로는 회원가입→인증→로그인, 로그인, 비밀번호 재설정이 각각 명확한 상태를 보여준다.
5. provider 키가 없는 개발 환경에서도 mock provider 또는 fixture로 전체 UI와 callback 테스트를 실행할 수 있다.
6. production 설정이 누락되면 서버가 안전하지 않은 기본값으로 기동하지 않는다.
7. 인증 성공·실패·로그아웃 후에도 팬/관리자/아티스트 세션 쿠키가 서로 섞이지 않는다.

## 3. 사용자 경험

### 로그인 화면

상단에는 Fanfolio 마크와 짧은 가치 제안을 둔다. 첫 번째 시각적 그룹은 다음 순서다.

1. `카카오로 계속하기` — 카카오 색상과 공식 심볼 사용 규칙을 준수한다.
2. `Google로 계속하기` — Google 공식 다색 G 심볼과 흰색 버튼을 사용한다.
3. `또는` 구분선
4. `이메일로 로그인` — 보조 버튼으로 열리는 이메일 폼
5. `처음이신가요? 회원가입` 링크

소셜 버튼은 provider가 설정되지 않은 개발 환경에서 숨기지 않고 `개발 환경에서 준비 중` 상태를 표시할 수 있다. 운영 환경에서 설정되지 않은 provider는 사용자에게 노출하지 않는다.

### 이메일 흐름

- 로그인: 이메일 + 비밀번호
- 회원가입: 이메일 + 비밀번호 + 비밀번호 확인 + 약관 동의
- 이메일 인증: 인증 메일 재전송, 남은 유효시간, 이미 인증된 상태 처리
- 비밀번호 재설정: 이메일 요청→토큰 화면→새 비밀번호 저장
- 기존 매직 링크: 이메일 폼 안의 `이메일 링크로 로그인` 보조 옵션

비밀번호 규칙과 오류 문구는 한국어로 명시한다. 입력 중에는 필드별 오류를 표시하고, 서버 오류는 폼 상단의 한 가지 알림으로 요약한다.

### 소셜 최초 로그인

```text
provider 인증
  → callback에서 provider subject/email 검증
  → identity 조회
  → 기존 identity면 기존 사용자 로그인
  → 새 identity면 Fanfolio 사용자와 identity 생성
  → onboardingCompleted 확인
  → 미완료면 최초 설정, 완료면 컬렉션
```

provider에서 이메일을 제공하지 않는 경우에는 계정을 만들지 않고 이메일 제공 동의를 안내한다. 사용자의 provider 계정 삭제와 Fanfolio 계정 삭제는 별도 기능으로 취급한다.

## 4. 백엔드 경계

### Provider adapter

인증 라우터는 카카오·Google의 SDK 세부사항을 직접 알지 않는다. 다음 계약을 가진 adapter를 둔다.

```python
class OAuthProvider(Protocol):
    name: str

    def authorization_url(self, state: str, redirect_uri: str) -> str: ...
    async def exchange_code(self, code: str, redirect_uri: str) -> ProviderProfile: ...

class ProviderProfile(TypedDict):
    provider: str
    subject: str
    email: str
    email_verified: bool
    display_name: str | None
    avatar_url: str | None
```

### 라우트 계약

```text
GET  /api/auth/oauth/{provider}/start
GET  /api/auth/oauth/{provider}/callback
POST /api/auth/email/signup
POST /api/auth/email/verify
POST /api/auth/email/login
POST /api/auth/password/forgot
POST /api/auth/password/reset
POST /api/auth/magic-link/request       # 보조 경로
POST /api/auth/magic-link/verify        # 보조 경로
GET  /api/auth/me
POST /api/auth/logout
```

OAuth state와 nonce는 서버가 생성하고 짧은 TTL로 저장한다. callback에서는 state, nonce, redirect URI, provider issuer와 token signature를 검증한다. provider access token은 Fanfolio 세션 대신 사용하지 않으며, 필요 시 암호화된 provider identity 정보만 저장한다.

### 데이터 모델

- `users`: 기존 사용자 테이블 확장
- `oauth_identities`: `provider`, `subject`, `user_id`, `email_at_link`, `created_at`, unique(provider, subject)
- `email_verification_tokens`: 해시된 토큰, 목적, 만료시각, 소비시각
- `password_reset_tokens`: 해시된 1회 토큰, 만료시각, 소비시각
- 기존 `sessions`: client scope와 HttpOnly 쿠키 정책 유지

이메일 주소만으로 소셜 계정을 자동 병합하지 않는다. 기존 이메일 계정에 provider를 연결하려면 현재 계정으로 로그인한 뒤 별도의 `계정 연결` 절차를 거치게 한다. 이는 탈취된 provider 이메일 주장으로 계정이 합쳐지는 위험을 줄인다.

## 5. 환경과 배포

### 개발

- `APP_ENV=development`
- provider 키가 없으면 mock callback을 사용
- Mailpit 또는 ConsoleMailer로 이메일 확인
- `FRONTEND_URL`, callback URL은 localhost만 허용

### 스테이징

- 실제 카카오·Google 개발 앱 사용
- 별도 client ID/secret, database, Redis, storage bucket
- callback allowlist에 staging 도메인만 등록
- 로그에는 token, authorization code, password를 남기지 않음

### 운영

- HTTPS 강제
- Secure, HttpOnly, SameSite=Lax 세션 쿠키
- Redis 기반 rate limit과 state 저장
- SMTP 또는 transactional email provider
- secrets manager에서 provider secret 주입
- S3 호환 private asset storage와 signed URL
- migration 선행, `AUTO_CREATE_SCHEMA=false`
- provider callback 도메인 allowlist 강제
- 인증 이벤트 감사 로그와 개인정보 최소 수집

## 6. 브랜드 자산

Fanfolio의 기존 보라색 UI와 카드 컬렉션 이미지를 이어받되, 단순한 문자 `F` 박스는 상용 앱 아이콘으로 교체한다.

- primary mark: 카드 모서리와 컬렉션을 연상시키는 겹침 구조의 F 심볼
- wordmark: `FANFOLIO` 영문 대문자, 로그인 화면과 웹 메타에 사용
- app icon: 1024px master PNG, 512/192/180/32px 파생 크기
- favicon: 32px 및 16px
- monochrome mark: 다크 배경과 시스템 알림용
- social provider 아이콘은 브랜드 자산과 혼합하지 않고 각 provider 공식 가이드 준수

생성 이미지는 원본 master를 보관하고, 브라우저 표시용 파일은 최적화된 파생 파일로 만든다. 로고 안에 작은 글자를 넣지 않아 favicon에서도 식별 가능하게 한다.

## 7. 테스트 전략

### 백엔드 계약 테스트

- provider start가 state/redirect를 생성하는지
- 잘못된 state·nonce·code를 거절하는지
- 신규/기존 OAuth identity 연결
- 이메일 회원가입과 중복 이메일
- 이메일 인증 만료·재사용·재전송
- 비밀번호 해시 저장 및 평문 미저장
- 비밀번호 재설정 만료·재사용
- provider 장애와 이메일 provider 장애
- client별 세션 쿠키 격리

### 프론트 브라우저 테스트

- 소셜 버튼의 provider별 redirect/취소/오류 상태
- 이메일 폼 열기와 회원가입 전환
- 최초 소셜 로그인 온보딩
- 이미 로그인한 사용자의 callback 재방문
- 비밀번호 표시/숨김, 필드 오류, 재전송
- 로그아웃 후 보호 화면 접근 차단
- 모바일 390px에서 소셜 버튼과 브랜드 자산의 시각적 레이아웃

### 배포 검증

- development/staging/production 설정 누락 시 fail-fast
- HTTPS callback 및 cookie 속성 확인
- secrets가 bundle과 로그에 포함되지 않는지 검사
- health와 readiness 모두 통과

## 8. 단계별 구현 순서

1. 로그인 화면을 소셜 우선 UI로 재구성하고 provider 미설정 상태를 명확히 표시한다.
2. 백엔드 provider adapter, state/nonce 저장, OAuth identity 모델과 migration을 추가한다.
3. Google과 카카오 callback을 연결한다.
4. 이메일 비밀번호 회원가입·인증·로그인·재설정을 연결한다.
5. 개발 mock/Mailpit과 staging/production 환경 문서를 추가한다.
6. 브랜드 master와 favicon 파생 파일을 만들고 로그인 화면, `index.html`, PWA metadata에 적용한다.
7. 계약 테스트, 브라우저 E2E, 배포 preflight를 통과시킨다.
8. Apple adapter는 동일 계약으로 별도 후속 작업으로 추가한다.
