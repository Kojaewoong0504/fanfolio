# 역할별 권한 검증

| 역할 | 허용 범위 | 차단 범위 | 결과 |
| --- | --- | --- | --- |
| Root 관리자 | 전체 운영·카드 공개·발급 배치 | 파트너 범위 밖 제한 없음 | 통과 |
| 일반 관리자 | 팬 패스·파트너·이벤트·운영 카드 기능 | 루트 전용 정책 | 통과 |
| 파트너 매니저 | 자기 조직·아티스트·카드·팩·검수 | 타 조직 리소스 | 통과 |
| 파트너 하위 관리자 | 부여된 조직·기능 권한 | 미부여 쓰기·공개 | 통과 |
| 스튜디오 사용자 | 카드 초안·효과 버전·검수 요청 | 승인·공개·발급 | 통과 |
| 팬 | 공개 카드팩·개봉·QR/인증번호 등록·컬렉션 | 관리자 API·미공개 카드 | 통과 |

근거: `backend/tests/contract/test_card_role_scope_matrix.py`, `backend/tests/contract/test_card_release_to_collection.py`, `backend/tests/contract/test_admin_management.py`.
