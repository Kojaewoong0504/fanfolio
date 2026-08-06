# API 계약 맵 디자인

## 목표

긴 Markdown API 명세를 보완해, 백엔드 구현자가 역할별 책임 범위와 테스트 통과 순서를 한눈에 이해하는 한국어 정적 웹 페이지를 제공한다.

## 정보 구조

- 전체 흐름: `Health → Test fixture → Auth → Fan → Admin → Artist` 구현 순서를 표시한다.
- 역할 경계: Fan, Admin, Artist, Test fixture를 분리하고 각 역할이 접근할 수 있는 경로만 표시한다.
- 엔드포인트 상세: 클릭한 항목의 HTTP method, 권한, 입력, 성공 응답, 오류, 관련 계약 테스트를 보여 준다.
- 테스트 경계: fixture API는 `APP_ENV=test`에서만 노출하며 프로덕션 API와 명확히 구분한다.

## 비범위

- OpenAPI/Swagger 생성, API 서버 로직 변경, 로그인 동작, 실제 네트워크 호출은 포함하지 않는다.
- Markdown 계약 문서와 pytest 계약 테스트는 정본으로 유지한다.

## 성공 조건

- HTML 파일 하나를 로컬에서 열어도 동작한다.
- API 경로를 클릭하면 요청·응답·오류·테스트 정보를 확인할 수 있다.
- Admin/Artist 권한 경계 및 테스트 전용 경로가 시각적으로 구분된다.
