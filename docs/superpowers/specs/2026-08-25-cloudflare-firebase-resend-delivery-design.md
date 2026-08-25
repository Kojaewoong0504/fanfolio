# Cloudflare R2·Firebase·Resend 전달 인프라 설계

## 목표

Fanfolio의 이미지 저장을 Cloudflare R2로 분리하고, 앱 알림을 Firebase Cloud Messaging(FCM)으로 전달하며, 로그인 링크와 알림 이메일을 Resend로 발송한다. 외부 서비스 장애가 핵심 도메인 트랜잭션을 되돌리지 않도록 앱 내부 알림을 원본으로 유지하고 이메일·푸시 전송은 영속적인 전송 대기열에서 처리한다.

## 범위와 비범위

- 범위: R2 직접 업로드/조회, FCM 기기 토큰 등록·해제, Resend 이메일, 이메일·푸시 전송 대기열과 재시도, 설정 검증, 운영 문서와 환경 변수 예시
- 범위: 팬앱의 푸시 권한 요청 및 토큰 동기화, 관리자 알림 발송이 실제 이메일·푸시 전달로 이어지는 흐름
- 비범위: 외부 PG, SMS, 마케팅 캠페인 자동화, Cloudflare Images의 이미지 변환 과금 기능, iOS/Android 네이티브 앱 빌드
- Supabase PostgreSQL과 인증은 유지한다. 이미지 바이너리만 R2에 저장하고 메타데이터와 권한 정보는 기존 데이터베이스가 소유한다.

## 이미지 저장: Cloudflare R2

기존 `AssetStorage`와 `S3AssetStorage`를 유지하고 `STORAGE_BACKEND=r2`를 명시적으로 지원한다. R2는 S3 호환 API를 사용하므로 기존 브라우저 직접 PUT 업로드 흐름을 재사용한다.

- 엔드포인트: `https://<account-id>.r2.cloudflarestorage.com`
- 리전: `auto`
- 버킷은 비공개로 유지한다.
- 업로드와 조회는 짧은 만료 시간의 presigned URL을 사용한다.
- 브라우저 PUT이 필요한 팬앱·관리자웹·스튜디오 origin만 R2 CORS에 등록한다.
- URL은 bearer credential이므로 로그, 분석 이벤트, 영구 데이터에 전체 presigned URL을 저장하지 않는다.
- 데이터베이스에는 기존처럼 객체 키와 메타데이터만 저장한다.

개발 환경은 로컬 저장을 계속 사용할 수 있다. 운영에서 R2가 활성화되었는데 계정 ID, 버킷, 액세스 키가 없으면 서버가 시작 단계에서 실패하도록 한다.

## 푸시 알림: Firebase Cloud Messaging

팬앱은 브라우저의 알림 권한을 받은 뒤 FCM 등록 토큰을 서버에 등록한다. 서비스 계정 인증 정보는 백엔드만 보유한다.

`push_devices`

- `id`, `user_id`, `token`
- `platform`: `web`, `ios`, `android`
- `device_label`, `last_seen_at`, `disabled_at`
- `created_at`, `updated_at`
- 토큰은 전체 시스템에서 유일하며 사용자가 바뀌면 최신 소유자로 갱신한다.

API:

- `POST /api/me/push-devices`: 현재 사용자의 토큰 등록 또는 갱신
- `DELETE /api/me/push-devices/{token}`: 로그아웃·권한 해제 시 비활성화

FCM은 HTTP v1 또는 공식 Admin SDK를 통해 백엔드 작업에서 호출한다. 유효하지 않거나 등록 해제된 토큰 응답은 해당 토큰을 비활성화한다. 일시적 오류는 전송 대기열 정책에 따라 재시도한다.

## 이메일: Resend

기존 mailer 인터페이스 뒤에 `ResendMailer`를 추가한다. 이메일 로그인 링크와 사용자 알림 이메일 모두 같은 어댑터를 사용한다.

- `MAIL_DELIVERY_MODE=resend`로 활성화한다.
- 발신 주소와 Resend API 키는 서버 환경 변수로만 관리한다.
- 전송 요청에는 안정적인 idempotency key를 포함한다.
- 개발·테스트의 `console` 모드는 명시적으로 비운영 환경에서만 허용한다.
- 운영에서 Resend가 선택되었는데 키나 검증된 발신 주소가 없으면 시작 단계에서 실패한다.

## 전달 일관성: Notification Outbox

현재 앱 내부 `Notification`을 사용자에게 보여 줄 원본으로 유지한다. 도메인 이벤트와 앱 내부 알림을 저장하는 동일한 DB 트랜잭션에서 채널별 `notification_deliveries` 행을 함께 만든다. 외부 네트워크 요청은 커밋 이후 작업자가 수행한다.

`notification_deliveries`

- `id`, `notification_id`, `user_id`
- `channel`: `email` 또는 `push`
- `destination`: 이메일 주소 또는 푸시 토큰 스냅샷
- `status`: `pending`, `processing`, `delivered`, `retry`, `failed`, `cancelled`
- `attempt_count`, `next_attempt_at`, `last_attempt_at`
- `provider_message_id`, `last_error`
- `idempotency_key`, `created_at`, `updated_at`, `delivered_at`
- `(channel, idempotency_key)`는 유일하다.

처리 규칙:

1. 알림 생성 시 사용자 설정과 활성 기기 토큰을 확인해 채널별 전송 행을 만든다.
2. DB 커밋 이후 inline background task 또는 Celery가 pending 행을 처리한다.
3. 작업자는 행을 잠그고 `processing`으로 바꾼 뒤 공급자를 호출한다.
4. 성공은 `delivered`, 일시적 실패는 지수 백오프를 적용한 `retry`, 영구 실패는 `failed`로 기록한다.
5. 같은 idempotency key는 공급자와 데이터베이스 양쪽에서 중복 전달을 막는다.
6. 외부 공급자 장애는 이미 저장된 앱 내부 알림과 원래 도메인 변경을 롤백하지 않는다.

## 앱과 관리자 흐름

- 팬앱 로그인 후 푸시 지원 브라우저에서만 권한 안내를 노출하고, 허용되면 서비스 워커 토큰을 서버에 동기화한다.
- 로그아웃 시 현재 토큰을 해제한다. 토큰 갱신 시 등록 API를 다시 호출한다.
- 관리자 알림 생성 API는 기존 앱 내부 알림과 함께 전송 대기열을 생성한다.
- 관리자 화면에는 전송 성공을 가장하지 않고, 요청 접수와 채널별 전송 상태를 구분해 표시할 수 있도록 API 응답을 준비한다.
- 설정이 없는 로컬 환경은 앱 내부 알림과 console/no-op 상태를 명확히 표시한다.

## 보안과 운영

- R2, Firebase, Resend 비밀 값은 프론트엔드 번들에 포함하지 않는다. Firebase 웹 공개 구성만 팬앱에 노출할 수 있다.
- 서비스 계정 JSON은 파일로 커밋하지 않고 환경 변수 또는 배포 플랫폼의 secret로 전달한다.
- 전송 오류에 이메일 본문, 전체 토큰, presigned URL을 기록하지 않는다.
- 사용자 삭제와 알림 수신 철회 시 활성 푸시 토큰을 비활성화하고 새 전송을 만들지 않는다.
- 전송 작업은 제한된 배치 크기와 최대 시도 횟수를 사용하며, 오래된 최종 상태는 보존 정책에 따라 정리한다.

## 검증

- R2: 엔드포인트·리전·path addressing·presigned PUT/GET·설정 누락 실패 테스트
- Resend: 요청 payload, Authorization, idempotency header, 공급자 오류 분류 테스트
- FCM: 서비스 인증, 메시지 payload, 비활성 토큰 처리, 일시 오류 재시도 테스트
- Outbox: 알림과 전송 행의 원자적 생성, 중복 방지, 성공·재시도·최종 실패 상태 테스트
- API: 푸시 토큰 등록·재등록·해제·다른 사용자 토큰 소유권 갱신 테스트
- 팬앱: 지원 환경의 권한 요청·토큰 등록·로그아웃 해제와 미지원 환경의 안전한 fallback 테스트
- 회귀: 기존 인증 링크, 관리자 알림, 앱 내부 알림, 이미지 직접 업로드, 전체 린트·빌드

## 선택하지 않은 방식

- 요청 처리 중 이메일·푸시를 동기 전송: 응답 지연과 외부 장애 롤백 위험 때문에 제외한다.
- Supabase Edge Function·Webhook를 주 전송 엔진으로 추가: 현재 FastAPI·Celery 경계를 중복시키므로 제외한다.
- 공개 R2 버킷: 사용자 업로드와 운영 자산의 접근 제어가 약해져 제외한다.
- Cloudflare Images를 즉시 도입: 현재 요구는 원본 저장과 전달이며 이미지 변환 과금·마이그레이션을 불필요하게 추가하므로 제외한다.
