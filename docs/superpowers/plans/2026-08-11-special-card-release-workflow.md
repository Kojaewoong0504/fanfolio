# 스페셜 카드 제작·검수·발행 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아티스트 스튜디오의 카드가 회사 검수와 필요 시 플랫폼 운영 검수를 거쳐, 승인된 카드만 드롭·QR 코드 발급과 팬앱 공개까지 이어지게 한다.

**Architecture:** 기존 `Card.status`에 섞인 검수 책임을 `release_status`와 불변 검수 요청으로 분리한다. 기존 `Drop`, `RedeemCodeBatch`, 팬 카탈로그는 재사용하되, 서버가 승인·연결·라이브 상태를 순서대로 강제한다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, Vanilla JavaScript, pytest, Node built-in test runner.

---

## File structure and ownership

| Path | Responsibility |
| --- | --- |
| `backend/alembic/versions/0029_card_release_workflow.py` | 릴리스 정책·검수 요청·결정·알림 링크 데이터 변경 |
| `backend/app/models.py` | 카드 릴리스 필드와 검수 요청/결정 모델 |
| `backend/app/admin_access.py` | 플랫폼 운영 관리자 권한 |
| `backend/app/schemas.py` | 제출·결정·드롭 연결·알림 API 계약 |
| `backend/app/services.py` | 범위 기반 관리자 알림과 이벤트 중복 방지 |
| `backend/app/routers/artist.py` | 스튜디오 제출·수정·상태 조회 |
| `backend/app/routers/admin.py` | 대기열, 회사/플랫폼 결정, 드롭 연결, 알림 |
| `backend/app/routers/fan.py` | 라이브 드롭 카드만 카탈로그 노출 |
| `backend/tests/contract/test_card_release_workflow.py` | 역할별 상태 전이와 팬 노출 계약 |
| `backend/tests/contract/test_admin_notifications.py` | 관리자 알림 수신·읽음 계약 |
| `admin_app/app.js`, `admin_app/styles.css` | 내비게이션/계정 메뉴, 검수 대기열, 알림 |
| `builder_app/app.js`, `builder_app/studio-core.js` | 스튜디오 상태·수정 요청·승인 이력 |

## Shared contracts

```python
ReleaseStatus = Literal[
    "draft", "pending_partner_review", "changes_requested",
    "pending_platform_review", "approved", "drop_ready", "published",
]
ReleasePolicy = Literal["partner_only", "partner_and_platform"]
ReviewStage = Literal["partner", "platform"]
ReviewDecision = Literal["approved", "changes_requested"]
```

서버가 정책을 결정한다. `Special`은 기본적으로 `partner_and_platform`, 나머지는 `partner_only`다. 회사 관리자는 검수 단계를 추가할 수 있지만 낮출 수 없다. `platform_operator`는 조직에 속하지 않는 내부 운영 역할이며, `root`는 일상 카드 승인이 아니라 정책·예외·감사만 담당한다.

## Task 1: Fix the admin shell comments first

**Files:**
- Modify: `admin_app/app.js:34-68,249-263,416-465,2100-2380`
- Modify: `admin_app/styles.css:1-420,1840-2520`
- Modify: `admin_app/tests/admin-responsive-layout.test.mjs`
- Create: `admin_app/tests/admin-account-menu.test.mjs`

- [ ] **Step 1: Write failing UI-source regression tests.**

```js
test('desktop navigation can be expanded and keeps logout reachable', () => {
  assert.match(source, /navCollapsed/)
  assert.match(source, /id="desktop-nav-toggle"/)
  assert.match(source, /id="logout"/)
})
test('top avatar opens account actions instead of being a passive span', () => {
  assert.match(source, /id="account-menu-toggle"/)
  assert.match(source, /id="account-password-change"/)
  assert.match(source, /id="account-logout"/)
})
test('company scope does not render misleading root ownership labels', () => {
  assert.doesNotMatch(source, /내 회사 운영 범위/)
  assert.doesNotMatch(source, /루트 관리자 관리 범위/)
})
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `node --test admin_app/tests/admin-account-menu.test.mjs`

Expected: FAIL because navigation and account-menu controls do not exist.

- [ ] **Step 3: Add explicit navigation and account-menu state.**

```js
const state = {
  // existing fields
  navCollapsed: window.localStorage.getItem('fanfolio.admin.navCollapsed') === 'true',
  accountMenuOpen: false,
}
function toggleDesktopNavigation() {
  state.navCollapsed = !state.navCollapsed
  window.localStorage.setItem('fanfolio.admin.navCollapsed', String(state.navCollapsed))
  layout()
}
```

Render a desktop nav toggle and make the avatar a button. Its popover contains `계정 설정`, `비밀번호 변경`, and `로그아웃`. Bind Escape/outside click. Keep a logout control in the visible bottom account area when collapsed.

- [ ] **Step 4: Remove scope chips but preserve read-only scope.**

```js
const managementActions = isRoot() ? rootActions : ''
const scopeHelp = canManageScope
  ? '이 기업이 운영할 수 있는 전체 아티스트 범위를 설정합니다.'
  : '배정된 아티스트 범위에서 카드와 드롭을 운영할 수 있습니다.'
```

Delete both meaningless labels; do not replace them with decorative permission chips.

- [ ] **Step 5: Change CSS from forced compact nav to intentional collapse.**

```css
.admin-shell.nav-collapsed { grid-template-columns: 72px 280px minmax(0, 1fr); }
.app-nav { width: 208px; }
.admin-shell.nav-collapsed .nav-brand-copy,
.admin-shell.nav-collapsed .nav-item > span,
.admin-shell.nav-collapsed .nav-account-copy { display: none; }
```

At the compact desktop breakpoint retain a usable icon rail, but keep an accessible expansion button and tooltip labels.

- [ ] **Step 6: Run checks.**

Run: `node --check admin_app/app.js && node --test admin_app/tests/admin-responsive-layout.test.mjs admin_app/tests/admin-account-menu.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/admin-responsive-layout.test.mjs admin_app/tests/admin-account-menu.test.mjs
git commit -m "운영 화면의 계정과 내비게이션 동작을 복구한다"
```

## Task 2: Store release workflow and platform operator access

**Files:**
- Create: `backend/alembic/versions/0029_card_release_workflow.py`
- Modify: `backend/app/models.py:288-420`
- Modify: `backend/app/admin_access.py:13-160`
- Modify: `backend/app/schemas.py:102-160,299-350`
- Modify: `backend/tests/unit/test_migrations.py`
- Modify: `backend/tests/contract/test_admin_partner_access.py`

- [ ] **Step 1: Write failing role and migration tests.**

```python
def test_platform_operator_can_review_platform_stage_but_not_manage_partners():
    assert "cards:review_platform" in PLATFORM_ACTIONS
    assert "organizations:manage" not in PLATFORM_ACTIONS

def test_card_release_migration_creates_review_request_tables():
    assert {"card_review_requests", "card_review_decisions"} <= upgraded_table_names()
```

Also assert that `platform_operator` needs a null organization, while a company role requires one.

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/contract/test_admin_partner_access.py`

Expected: FAIL due to absent role and tables.

- [ ] **Step 3: Add additive migration and models.**

```python
op.add_column("cards", sa.Column("release_policy", sa.String(), nullable=False,
    server_default="partner_only"))
op.add_column("cards", sa.Column("release_status", sa.String(), nullable=False,
    server_default="draft"))
op.add_column("cards", sa.Column("review_version", sa.Integer(), nullable=False,
    server_default="0"))
op.create_table(
    "card_review_requests",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("card_id", sa.String(), sa.ForeignKey("cards.id"), nullable=False),
    sa.Column("version", sa.Integer(), nullable=False),
    sa.Column("stage", sa.String(), nullable=False),
    sa.Column("status", sa.String(), nullable=False),
    sa.Column("snapshot", sa.JSON(), nullable=False),
    sa.UniqueConstraint("card_id", "version", "stage",
                        name="uq_card_review_request_version_stage"),
)
```

Create `card_review_decisions` with request/reviewer/decision/note/time. Add nullable `entity_type`, `entity_id`, `event_key` on `notifications` and unique `(user_id, event_key)`. Backfill old card status values. Preserve old `Card.status` only during compatibility, then use release status as authoritative.

- [ ] **Step 4: Add access and schemas.**

```python
PLATFORM_ACTIONS = frozenset({"cards:read", "cards:review_platform", "notifications:read"})
class CardReviewRequest(Base):
    __tablename__ = "card_review_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"))
    version: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    snapshot: Mapped[dict] = mapped_column(JSON)
```

Do not grant platform operators partner, code, organization, or broad audit access.

- [ ] **Step 5: Run tests and commit.**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/contract/test_admin_partner_access.py`

Expected: PASS.

```bash
git add backend/alembic/versions/0029_card_release_workflow.py backend/app/models.py backend/app/admin_access.py backend/app/schemas.py backend/tests/unit/test_migrations.py backend/tests/contract/test_admin_partner_access.py
git commit -m "스페셜 카드의 분리된 검수 책임을 저장한다"
```

## Task 3: Implement submission, decisions, and scoped notifications

**Files:**
- Modify: `backend/app/services.py:444-465`
- Modify: `backend/app/routers/artist.py:531-575`
- Modify: `backend/app/routers/admin.py:62-110,641-712,715-832,1520-1547`
- Create: `backend/tests/contract/test_card_release_workflow.py`
- Create: `backend/tests/contract/test_admin_notifications.py`

- [ ] **Step 1: Write failing policy/transition tests.**

```python
def test_normal_card_needs_one_company_approval_before_drop_linking(...):
    card = submit_studio_card(rarity="R")
    assert card["releaseStatus"] == "pending_partner_review"
    approve_as_company_manager(card["id"])
    assert get_card(card["id"])["releaseStatus"] == "approved"

def test_special_card_needs_company_and_platform_approval(...):
    card = submit_studio_card(rarity="Special")
    approve_as_company_manager(card["id"])
    assert get_card(card["id"])["releaseStatus"] == "pending_platform_review"
    assert create_drop_link(card["id"]).status_code == 409
    approve_as_platform_operator(card["id"])
    assert get_card(card["id"])["releaseStatus"] == "approved"
```

Add negative cases for root normal review, company platform review, editor/viewer decision, out-of-scope manager, and editing after submission creating a new review version.

- [ ] **Step 2: Write failing notification tests.**

```python
def test_submission_notifies_scoped_company_reviewers_once(...):
    card = submit_studio_card(rarity="R")
    items = get_admin_notifications(company_manager)["items"]
    assert items[0]["kind"] == "card_partner_review_requested"
    assert items[0]["entityId"] == card["id"]

def test_special_company_approval_notifies_platform_operators_once(...):
    approve_as_company_manager(card_id)
    assert platform_notifications()["items"][0]["kind"] == "card_platform_review_requested"
```

- [ ] **Step 3: Implement immutable submission snapshot and transition helpers.**

```python
def review_snapshot(card: Card) -> dict:
    return {
        "name": card.name, "rarity": card.rarity, "artistId": card.artist_id,
        "memberId": card.member_id, "imageAssetId": card.image_asset_id,
        "voiceAssetId": card.voice_asset_id, "videoAssetId": card.video_asset_id,
        "handwritingAssetId": card.handwriting_asset_id,
        "designConfig": card.design_config or {}, "issueLimit": card.issue_limit,
    }
def required_policy(card: Card) -> str:
    return "partner_and_platform" if card.rarity == "Special" or card.platform_review_required else "partner_only"
```

Studio submit validates media as now, increments review version, saves partner-stage snapshot, sets `pending_partner_review`, writes audit, and emits one event-keyed notification to each active scoped company approver. Changes requested returns the release to draft; old request stays terminal.

- [ ] **Step 4: Add explicit stage endpoints and admin notification endpoints.**

```python
@router.post("/cards/{card_id}/review/partner")
async def decide_partner_review(card_id: str, payload: CardReviewDecisionRequest,
                                context: CurrentAdmin, session: DbSession) -> dict: ...

@router.post("/cards/{card_id}/review/platform")
async def decide_platform_review(card_id: str, payload: CardReviewDecisionRequest,
                                 context: CurrentAdmin, session: DbSession) -> dict: ...

@router.get("/notifications")
async def admin_notifications(context: CurrentAdmin, session: DbSession) -> dict: ...
```

Require a note for changes requested. Company approval sends Special/escalated cards to platform; platform approval sets approved. Return `{items, unreadCount}` only for the logged-in user. Route `PATCH /notifications/{id}` marks only that user’s record read.

- [ ] **Step 5: Enforce drop linkage rather than direct publishing.**

```python
if card.release_status != "approved":
    raise AppError(409, "CARD_RELEASE_NOT_APPROVED",
                   "모든 필수 검수가 끝난 카드만 드롭에 연결할 수 있습니다.")
card.release_status = "drop_ready"
```

Add `POST /api/admin/drops/{drop_id}/cards`. It validates company/artist scope. A code batch requires linked card and live drop. A linked `drop_ready` card becomes `published` only when its drop becomes live. Do not reintroduce direct publish as a user-facing path.

- [ ] **Step 6: Run contracts and commit.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_release_workflow.py backend/tests/contract/test_admin_notifications.py backend/tests/contract/test_admin_and_artist.py backend/tests/contract/test_admin_partner_access.py`

Expected: PASS.

```bash
git add backend/app/services.py backend/app/routers/artist.py backend/app/routers/admin.py backend/tests/contract/test_card_release_workflow.py backend/tests/contract/test_admin_notifications.py
git commit -m "카드 공개를 회사와 플랫폼 검수 흐름으로 연결한다"
```

## Task 4: Drive the release workflow in the admin web

**Files:**
- Modify: `admin_app/app.js:49-68,260-265,626-691,1628-1765,2100-2380`
- Modify: `admin_app/styles.css:420-1240,1840-2520`
- Create: `admin_app/tests/admin-release-workflow.test.mjs`

- [ ] **Step 1: Write failing UI tests.**

```js
test('admin card detail uses server-owned release stages', () => {
  assert.match(source, /releaseStatus/)
  assert.match(source, /pending_partner_review/)
  assert.match(source, /pending_platform_review/)
  assert.match(source, /review\/partner/)
  assert.match(source, /review\/platform/)
})
test('bell opens release notifications with its unread count', () => {
  assert.match(source, /\/admin\/notifications/)
  assert.match(source, /notification-badge/)
  assert.match(source, /data-open-notification/)
})
```

- [ ] **Step 2: Run to verify failure.**

Run: `node --test admin_app/tests/admin-release-workflow.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Add API-backed notification bell and review queue.**

```js
async function loadAdminNotifications() {
  const result = await api('/admin/notifications')
  state.notifications = result.data.items
  state.unreadNotificationCount = result.data.unreadCount
}
function reviewAction(card) {
  if (card.nextAction === 'partner_review') return '회사 검수'
  if (card.nextAction === 'platform_review') return '플랫폼 검수'
  return null
}
```

The bell’s badge and review queue use the same API data. Selecting an item marks it read and opens the card. Do not keep a local duplicate count.

- [ ] **Step 4: Render snapshot, history, policy, and one allowed next action.**

```js
const canApprovePartner = card.nextAction === 'partner_review'
const canApprovePlatform = card.nextAction === 'platform_review'
const canPrepareDrop = card.releaseStatus === 'approved' && can('drops:write')
```

Show front/back snapshot preview, enabled media, submitter memo, review version/history, policy badge, and server-provided next action. Require a client-side note for changes requested, while preserving server validation.

- [ ] **Step 5: Link an approved card to a scoped drop.**

```js
await api(`/admin/drops/${dropId}/cards`, {
  method: 'POST', body: JSON.stringify({ cardId }),
})
```

Use a drawer to select/create a scoped drop. After linkage show `드롭 준비됨` and direct to existing code-batch actions. Never render the old direct card 공개 action.

- [ ] **Step 6: Run tests and commit.**

Run: `node --check admin_app/app.js && node --test admin_app/tests/*.mjs`

Expected: PASS.

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/admin-release-workflow.test.mjs
git commit -m "운영 검수 대기열과 발행 준비 화면을 연결한다"
```

## Task 5: Show studio users the real outcome and revision state

**Files:**
- Modify: `builder_app/app.js:250-265,400-420,930-960,1160-1210,1880-1905`
- Modify: `builder_app/studio-core.js`
- Modify: `builder_app/styles.css`
- Create: `builder_app/tests/studio-release-workflow.test.mjs`

- [ ] **Step 1: Write failing status tests.**

```js
test('maps review stages to distinct artist-facing copy', () => {
  assert.equal(releaseStatusLabel('pending_partner_review'), '소속사 검수 중')
  assert.equal(releaseStatusLabel('pending_platform_review'), 'Fanfolio 운영 검수 중')
})
test('permits editing only draft and changes-requested releases', () => {
  assert.equal(canEditRelease('pending_partner_review'), false)
  assert.equal(canEditRelease('changes_requested'), true)
})
```

- [ ] **Step 2: Run to verify failure.**

Run: `node --test builder_app/tests/studio-release-workflow.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Add state helpers and outcome rendering.**

```js
export function releaseStatusLabel(status) {
  return {
    draft: '초안', pending_partner_review: '소속사 검수 중',
    pending_platform_review: 'Fanfolio 운영 검수 중',
    changes_requested: '수정 요청', approved: '발행 준비 완료',
    drop_ready: '드롭 준비됨', published: '팬앱 공개됨',
  }[status] || status
}
export const canEditRelease = (status) => ['draft', 'changes_requested'].includes(status)
```

Render reviewer role/date/reason exactly from the API. Lock mutation actions while submitted; show the response’s review version after resubmission.

- [ ] **Step 4: Run Studio tests and commit.**

Run: `node --check builder_app/app.js && node --test builder_app/tests/*.mjs`

Expected: PASS.

```bash
git add builder_app/app.js builder_app/studio-core.js builder_app/styles.css builder_app/tests/studio-release-workflow.test.mjs
git commit -m "아티스트 스튜디오에 실제 검수 결과를 표시한다"
```

## Task 6: Restrict fan exposure to released cards in live drops

**Files:**
- Modify: `backend/app/routers/fan.py:213-250,637-750`
- Modify: `backend/tests/contract/test_card_release_workflow.py`
- Modify: fan API consumers only if the response gains safe release-display fields.

- [ ] **Step 1: Write failing visibility tests.**

```python
def test_published_card_without_live_drop_is_not_in_fan_catalog(...):
    publish_without_live_drop(card_id)
    assert catalog_card_ids(fan) == []

def test_live_drop_linked_card_is_visible_and_redeemable(...):
    card_id, drop_id = approve_link_and_start_drop()
    assert card_id in catalog_card_ids(fan)
    assert redeem_qr_code(fan, drop_id, card_id)["cardId"] == card_id
```

- [ ] **Step 2: Run test to verify failure.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_release_workflow.py -k 'fan_catalog or live_drop'`

Expected: FAIL because current queries only filter old `Card.status == 'published'`.

- [ ] **Step 3: Require live linked drops in fan catalog queries.**

```python
live_card_ids = select(RedeemCodeBatch.card_id).join(Drop).where(Drop.status == 'live')
filters = [
    Card.release_status == 'published',
    Card.is_official.is_(True),
    Card.id.in_(live_card_ids),
]
```

Use a distinct subquery to avoid duplicate cards. Apply the same rule to artist/member lists and collection campaigns. Preserve detail access for a fan who already owns a card after its drop ends.

- [ ] **Step 4: Run all verification and commit.**

Run: `backend/.venv/bin/pytest -q && node --test admin_app/tests/*.mjs && node --test builder_app/tests/*.mjs && npm --prefix frontend run build`

Expected: PASS.

```bash
git add backend/app/routers/fan.py backend/tests/contract/test_card_release_workflow.py
git commit -m "라이브 드롭의 승인 카드만 팬에게 공개한다"
```

## Task 7: Documentation, deployment, and production verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-11-special-card-release-workflow-design.md`
- Modify: this plan only to mark completed steps during execution.

- [ ] **Step 1: Document operational responsibility.**

```markdown
### 카드 공개 책임
- 일반 카드: 담당 회사 관리자 또는 매니저 한 명의 검수 승인
- Special/상향 카드: 회사 승인 한 명과 플랫폼 운영 관리자 한 명의 승인
- 루트 관리자: 정책·예외·감사만 담당하며 개별 공개를 승인하지 않음
```

- [ ] **Step 2: Run final checks.**

Run: `git status --short && backend/.venv/bin/pytest -q && node --test admin_app/tests/*.mjs && node --test builder_app/tests/*.mjs && npm --prefix frontend run build`

Expected: only intended files changed and all checks pass.

- [ ] **Step 3: Commit, push, and verify deployed endpoints/assets.**

```bash
git add README.md docs/superpowers/specs/2026-08-11-special-card-release-workflow-design.md docs/superpowers/plans/2026-08-11-special-card-release-workflow.md
git commit -m "스페셜 카드 공개 운영 기준을 문서화한다"
git push origin codex/admin-operations-redesign
git push origin HEAD:main
curl -fsSL https://fanfolio-api.onrender.com/openapi.json | jq -r '.paths | keys[]' | rg '/api/admin/(notifications|cards/.*/review/partner|cards/.*/review/platform|drops/.*/cards)'
curl -fsSL https://fanfolio-admin-one.vercel.app/app.js | rg 'account-menu-toggle|pending_platform_review|/admin/notifications'
```

Expected: all endpoint paths and admin workflow markers are deployed.

## Self-review

- Studio submission, immutable snapshots, revisions, and media validation: Tasks 2, 3, 5.
- Ordinary/Special policies, company/platform approvals, root exclusion: Tasks 2 and 3.
- Scoped unread notifications and queue: Tasks 3 and 4.
- Drop/QR/fan visibility chain: Tasks 3 and 6.
- Reported admin shell comments: Task 1.
- Deployment, smoke, and documentation: Task 7.

All later tasks use the same values: `releaseStatus`, `releasePolicy`, `reviewVersion`, `pending_partner_review`, `pending_platform_review`, and explicit `review/partner` / `review/platform` endpoints. No placeholder steps remain.
