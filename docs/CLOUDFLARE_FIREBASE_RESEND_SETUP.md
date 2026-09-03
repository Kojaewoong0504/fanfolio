# Cloudflare R2 · Firebase FCM · Resend 운영 설정

이 문서는 Fanfolio의 외부 전달 인프라를 개발 환경에서 운영 환경으로 연결하는 절차를 정리한다.
모든 비밀 값은 백엔드 배포 환경 변수에만 저장한다. Firebase 웹 설정과 VAPID 공개 키는
브라우저에 전달되는 공개 값이므로 프론트엔드 배포 환경 변수(`VITE_` 접두사)에 둔다.

## 현재 전달 흐름

- 앱 알림은 먼저 데이터베이스에 생성된다.
- 이메일·웹 푸시는 `notification_deliveries` outbox에 기록되고 Celery worker가 전달한다.
- 일시적 오류는 bounded exponential backoff로 재시도하며, 한도를 넘으면 `dead_letter`가 된다.
- FCM이 무효 토큰을 반환하면 해당 `push_devices` 행을 비활성화한다.
- 외부 공급자가 없어도 인앱 알림은 계속 동작한다.

## 백엔드 환경 변수

`backend/.env.example`를 기준으로 설정한다.

```dotenv
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_BUCKET=<r2-bucket-name>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>

MAIL_DELIVERY_MODE=resend
RESEND_API_KEY=<resend-api-key>
MAIL_FROM=Fanfolio <verified-sender@example.com>

FIREBASE_PROJECT_ID=fnafolio
FIREBASE_CLIENT_EMAIL=<service-account-client-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key-with-escaped-newlines>
```

운영에서는 `MAIL_FROM`의 도메인이 Resend에서 검증된 도메인이어야 한다. 도메인을 아직
구매하지 않았다면 `MAIL_DELIVERY_MODE=console`을 유지하고 이메일은 로그로만 확인한다.
FCM 서비스 계정 JSON 전체를 저장하지 말고 필요한 세 필드만 secret manager에 등록한다.

## 프론트엔드 환경 변수

Firebase Console의 프로젝트 설정 → 일반 → 내 앱(웹)의 공개 설정과 Cloud Messaging의
웹 푸시 인증서(VAPID key)를 Vercel 또는 프론트엔드 배포 환경에 등록한다.

```dotenv
VITE_FIREBASE_API_KEY=<web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=fnafolio.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fnafolio
VITE_FIREBASE_STORAGE_BUCKET=<firebase-storage-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<web-app-id>
VITE_FIREBASE_VAPID_KEY=<web-push-certificate-key-pair-public-key>
```

푸시 권한은 사용자가 설정 화면에서 “푸시 알림 켜기”를 누를 때만 요청한다. 브라우저가
지원하지 않거나 권한을 거절해도 기존 인앱 알림에는 영향을 주지 않는다.

## R2 확인 순서

1. R2 bucket을 만든다.
2. bucket의 Public access를 끄고 `r2.dev` 공개 URL이나 공개 커스텀 도메인을 연결하지 않는다.
3. R2 API Token에서 해당 bucket에만 읽기·쓰기 권한을 준다.
4. 백엔드에 위 secret을 등록하고 `STORAGE_BACKEND=r2`로 배포한다.
5. 관리자 카드/상품 이미지 업로드에서 presigned PUT이 성공하는지 확인한다.
6. 업로드 완료 후 GET presigned URL과 만료 후 재발급 동작을 확인한다.

운영 API는 R2 자격 증명으로 서버에서 객체를 읽고 권한을 확인한 뒤 응답한다. 브라우저에
R2 access key·secret을 전달하지 않으며, 사용자 업로드 파일을 `backend/assets` 같은 공개
정적 디렉터리에 저장하지 않는다. `STORAGE_BACKEND=local`은 운영 환경에서 시작 단계에
거부된다.

## 무료 단계의 자산 보호 점검표

다음 항목은 코드만으로 R2 대시보드 설정을 확인할 수 없으므로 배포 전에 Cloudflare에서
직접 확인한다.

- R2 bucket이 private이고 외부 공개 URL이 비활성화되어 있다.
- API Token이 Fanfolio 전용 bucket의 필요한 object read/write만 갖고 있다.
- Render/Vercel 로그에 R2 secret, presigned URL, 원본 파일 경로가 출력되지 않는다.
- 무인증 요청으로 R2 객체 URL을 직접 열면 거부된다.
- private asset API는 소유자·관리자 권한 없이 `401` 또는 `403`을 반환한다.
- 팬에게 공개하기로 결정한 카드·보상 이미지는 R2 URL이 아니라 `/api/cards/*/image`,
  `/api/rewards/*/image` 같은 공개 카탈로그 API를 통해서만 노출된다.
- 공개 카탈로그 API를 private 원본 저장소의 공개 정책으로 착각하지 않는다. 원본·개인
  혜택 파일은 계속 서버 권한 검사와 서명된 다운로드 흐름을 사용한다.

무료 단계에서는 별도 이미지 변환 상품을 추가하지 않고, 기존 서버 프록시와 업로드 시
생성되는 파생 이미지를 사용한다. 트래픽이 커지면 CDN signed URL/Transform Rules와
원본·파생본 분리, 만료 짧은 read URL을 다음 단계로 검토한다.

## 전달 검증

1. 팬앱 설정에서 웹 푸시를 활성화한다.
2. `push_devices`에 동일 사용자·토큰이 중복되지 않는지 확인한다.
3. 관리자 운영 지표의 “알림 전달 상태”에서 `delivered`, `pending/retry`,
   `dead_letter`를 구분해 확인한다.
4. 의도적으로 공급자를 잠시 사용할 수 없게 해 재시도 후 `dead_letter`가 되는지 테스트한다.
5. 테스트 후에는 실제 사용자에게 테스트 알림을 보내지 않도록 테스트 계정과 토큰을 제거한다.

운영자 화면에서는 실패한 `failed`·`retry`·`dead_letter` 작업을 `/api/admin/notification-deliveries/{id}/retry`로
다시 `pending` 큐에 넣을 수 있다. 이 응답에는 이메일 주소나 FCM 토큰을 포함하지 않는다. 실제 외부 전송은
Resend 발신 도메인 검증과 Firebase 서비스 계정 권한이 확인된 뒤 테스트 계정으로만 수행한다.

## 비용과 안전 경계

R2·FCM·Resend의 무료 한도와 과금 조건은 계정·시점에 따라 달라질 수 있으므로 배포 전
각 서비스의 현재 요금 페이지를 확인한다. 애플리케이션은 무한 재시도를 하지 않으며,
API key·서비스 계정 private key·FCM 등록 토큰을 로그에 남기지 않는다.
