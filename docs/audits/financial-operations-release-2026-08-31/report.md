# 금융 운영 릴리스 검증 보고서

기준일: 2026-08-31

## 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| 7. PostgreSQL 역할·동시성 | 부분 완료 | `0079` 권한 migration과 opt-in PostgreSQL trigger 검증 추가. 실제 PostgreSQL URL 미설정으로 런타임 검증은 미실행 |
| 8. 잔액 정합성 스케줄러 | 완료 | Celery Beat 등록, drift warning task, 단위 테스트 통과 |
| 9. 포인트 명령 경계 | 완료 | earn/spend/reverse 단일 dispatch 경계와 기존 멱등 서비스 계약 유지 |
| 10. 관리자 금융 스모크 | 완료 | 인증 운영 스크립트, 기존 관리자/지원 큐 계약 테스트 통과. 자격증명 없이는 fail-closed |
| 11. hosted 배포 | 미완료 | PR #69의 세 Vercel Preview는 Ready였지만 production 배포 증거가 아님. Render 직접 확인은 현재 브라우저에서 차단됨 |
| 12. production 모바일·결제·포인트·QR E2E | 미완료 | production API/자격증명/실기기 세션을 동시에 확보하지 못해 수행하지 않음 |

## 현재 검증 결과

- 신규 대상 테스트: `4 passed, 1 skipped`
- 프론트엔드: `283 passed`, lint/build 완료
- 관리자: `249 passed`
- 스튜디오: `71 passed`
- 백엔드 병렬 전체: `522 passed, 3 skipped, 1 failed`
- 실패 1건은 기존 `test_platform_operator_membership_must_not_belong_to_an_organization`에서 `admin_memberships` 테이블이 없는 SQLite 상태로 발생했으며, 신규 변경과 무관한 기존 테스트 격리/초기화 문제다.
- PostgreSQL opt-in 테스트는 `FANFOLIO_POSTGRES_TEST_URL`이 없을 때 skip하며, 실제 운영 DB를 대체하지 않는다.

## 다음 실행 조건

11~12를 완료하려면 Vercel production deployment가 Ready이고 Render API가 접근 가능해야 한다. 그 뒤 관리자 세션으로 `scripts/financial-operations-smoke.sh`를 실행하고, 모바일 브라우저에서 홈·탐색·포인트·QR 권한 fallback을 다시 확인한다.
