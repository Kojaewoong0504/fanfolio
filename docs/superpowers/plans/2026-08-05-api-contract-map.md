# Fanfolio API Contract Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드 구현자가 API 경계와 계약 테스트 범위를 시각적으로 탐색할 수 있는 한국어 정적 HTML 계약 맵을 만든다.

**Architecture:** `fanfolio-api-contract-map.html` 하나가 계약 데이터를 JavaScript 객체로 보유한다. 역할 탭과 구현 단계 필터가 목록을 좁히며, 각 엔드포인트 선택은 상세 패널을 갱신한다. 정본은 `BACKEND_IMPLEMENTATION_CONTRACT.md`와 `backend/tests/contract/`이다.

**Tech Stack:** HTML, CSS, vanilla JavaScript

---

### Task 1: 계약 맵 정적 페이지 생성

**Files:**
- Create: `fanfolio-api-contract-map.html`

- [ ] **Step 1: 역할·단계·엔드포인트 계약 데이터를 페이지에 정의한다.**

  Fan, Admin, Artist, Test fixture 역할별로 method, path, auth, request, success response, errors, test file을 담는다.

- [ ] **Step 2: 역할 탭과 구현 단계 보드를 만든다.**

  `Health → Fixture → Auth → Fan → Admin → Artist` 순서를 표시하고 선택한 역할에 맞는 API만 목록에 남긴다.

- [ ] **Step 3: 클릭 가능한 상세 패널을 만든다.**

  API 항목을 선택하면 권한, JSON 입력·출력, 상태 코드, 관련 테스트를 보여 준다.

- [ ] **Step 4: 브라우저 정적 검증을 한다.**

  Run: `open fanfolio-api-contract-map.html`

  Expected: 탭, 엔드포인트 선택, 상세 패널이 로컬 파일 상태에서 동작한다.

### Task 2: 계약 동기화 검증

**Files:**
- Modify: `fanfolio-api-contract-map.html`
- Reference: `BACKEND_IMPLEMENTATION_CONTRACT.md`
- Reference: `backend/tests/contract/`

- [ ] **Step 1: API 경로와 오류 코드를 계약 문서·테스트와 대조한다.**

- [ ] **Step 2: 테스트 명령과 구현 순서가 정확히 표기됐는지 확인한다.**

  Run: `cd backend && APP_ENV=test python3 -m uv run pytest tests/contract -q`

  Expected: 아직 미구현 API의 red baseline이 나타나며, HTML에는 이 상태가 ‘정상’으로 표시된다.
