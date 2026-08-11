# Fanfolio 관리자 운영 웹 전면 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참고 이미지 수준의 정돈된 관리자 UI와 회사 범위·내부 역할 권한을 갖춘 운영 웹을 완성한다.

**Architecture:** FastAPI는 조직·역할·아티스트 배정 범위를 모든 드롭과 코드 요청에 적용하고, 관리자는 `GET /api/admin/me`의 허용 작업을 UI 구성에만 사용한다. 정적 관리자 앱은 공통 셸, 파트너 디렉터리, 범위형 작업 화면을 분리해 기존 API 호출을 유지하면서 정보 구조와 시각 표현을 교체한다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pytest, Vanilla ES modules, CSS, Node test runner, Material Symbols.

---

## 파일 구조와 책임

- `backend/alembic/versions/0027_drop_organization_scope.py`: 기존 드롭에 조직·아티스트 범위를 추가하고 인덱스를 만든다.
- `backend/app/models.py`: `Drop`의 조직·아티스트 외래 키와 인덱스를 선언한다.
- `backend/app/schemas.py`: 드롭 생성/수정 요청의 조직·아티스트 필드를 검증한다.
- `backend/alembic/versions/0028_company_admin_access_level.py`: 기업 슈퍼 관리자 access level을 기존 membership 제약에 안전하게 추가한다.
- `backend/app/admin_access.py`: 기업 슈퍼 관리자와 매니저/에디터/뷰어의 허용 작업을 명시한다.
- `backend/app/routers/admin_partners.py`: 루트 및 기업 슈퍼 관리자의 조직 멤버·아티스트 배정 경계를 서버에서 강제한다.
- `backend/app/routers/admin.py`: 범위형 드롭·코드 조회/생성/수정/발행 요청을 구현한다.
- `backend/tests/contract/test_admin_partner_access.py`: 조직·역할·아티스트 범위의 API 계약을 잠근다.
- `admin_app/app.js`: 상태, API 호출, 역할별 메뉴와 화면 렌더링을 유지하는 앱 진입점이다.
- `admin_app/styles.css`: 공통 셸, 디렉터리, 표, drawer, popover의 반응형 토큰과 스타일을 제공한다.
- `admin_app/tests/admin-responsive-layout.test.mjs`: 구조·반응형·접근성 회귀를 고정한다.
- `admin_app/tests/admin-operations-workspace.test.mjs`: 역할별 메뉴·드롭 workspace·UI 경계를 고정한다.
- `design-qa.md`: 참고 이미지와 동일한 데스크톱 상태의 시각 QA 결과를 기록한다.

## Task 1: 드롭의 회사·아티스트 소유권을 데이터 모델에 추가

**Files:**
- Create: `backend/alembic/versions/0027_drop_organization_scope.py`
- Modify: `backend/app/models.py:315-321`
- Test: `backend/tests/unit/test_migrations.py`

- [ ] **Step 1: 실패하는 migration 계약 테스트를 추가한다.**

```python
def test_alembic_upgrade_scopes_drops_to_organization_and_artist(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'drop_scope.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE drops (id VARCHAR PRIMARY KEY, status VARCHAR)"))
    command.upgrade(_alembic_config(engine.url.render_as_string(hide_password=False)), "head")
    with engine.connect() as connection:
        columns = {row[1] for row in connection.execute(text("PRAGMA table_info(drops)"))}
        indexes = {row[1] for row in connection.execute(text("PRAGMA index_list(drops)"))}
    assert {"organization_id", "artist_id"} <= columns
    assert "ix_drops_organization_artist_status" in indexes
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `backend/.venv/bin/pytest backend/tests/unit/test_migrations.py::test_alembic_upgrade_scopes_drops_to_organization_and_artist -q`

Expected: `FAILED` because the columns and index do not exist.

- [ ] **Step 3: 모델과 migration을 작성한다.**

```python
class Drop(Base):
    __tablename__ = "drops"
    __table_args__ = (Index("ix_drops_organization_artist_status", "organization_id", "artist_id", "status"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    artist_id: Mapped[str | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), nullable=True
    )
```

```python
def upgrade() -> None:
    with op.batch_alter_table("drops") as batch:
        batch.add_column(sa.Column("organization_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("artist_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_drops_organization_id", "organizations", ["organization_id"], ["id"], ondelete="SET NULL")
        batch.create_foreign_key("fk_drops_artist_id", "artists", ["artist_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_drops_organization_artist_status", "drops", ["organization_id", "artist_id", "status"])
```

- [ ] **Step 4: migration 계약을 통과시킨다.**

Run: `backend/.venv/bin/pytest backend/tests/unit/test_migrations.py::test_alembic_upgrade_scopes_drops_to_organization_and_artist -q`

Expected: `1 passed`.

- [ ] **Step 5: 커밋한다.**

```bash
git add backend/alembic/versions/0027_drop_organization_scope.py backend/app/models.py backend/tests/unit/test_migrations.py
git commit -m "드롭을 회사와 아티스트 범위에 연결한다"
```

## Task 2: 기업 내부 역할과 드롭·코드 행동 권한을 고정

**Files:**
- Create: `backend/alembic/versions/0028_company_admin_access_level.py`
- Modify: `backend/app/models.py:96-135`
- Modify: `backend/app/schemas.py:229-266`
- Modify: `backend/app/admin_access.py:12-55`
- Modify: `backend/app/routers/admin_partners.py:180-590`
- Test: `backend/tests/contract/test_admin_partner_access.py`
- Test: `backend/tests/unit/test_migrations.py`

- [ ] **Step 1: 역할별 실패 계약을 추가한다.**

```python
def test_partner_roles_expose_only_their_drop_and_code_actions() -> None:
    assert {"organization:read", "organization:manage_scoped", "members:manage_scoped"} <= PARTNER_ACTIONS["company_admin"]
    assert {"drops:read", "drops:write", "drops:submit", "codes:write"} <= PARTNER_ACTIONS["manager"]
    assert {"drops:read", "drops:write"} <= PARTNER_ACTIONS["editor"]
    assert "drops:submit" not in PARTNER_ACTIONS["editor"]
    assert "drops:write" not in PARTNER_ACTIONS["viewer"]
    assert "codes:write" not in PARTNER_ACTIONS["viewer"]
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -k partner_roles_expose -q`

Expected: `FAILED` because partner actions currently exclude drop/code actions.

- [ ] **Step 3: 명시적인 액션 맵을 구현한다.**

```python
PARTNER_ACTIONS = {
    "company_admin": frozenset({
        "organization:read", "organization:manage_scoped", "members:manage_scoped",
        "artists:read", "artists:write", "cards:read", "cards:write", "cards:submit_review",
        "drops:read", "drops:write", "drops:submit", "codes:read", "codes:write", "audit:read",
    }),
    "manager": frozenset({
        "artists:read", "artists:write", "cards:read", "cards:write", "cards:submit_review",
        "drops:read", "drops:write", "drops:submit", "codes:read", "codes:write", "audit:read",
    }),
    "editor": frozenset({
        "artists:read", "artists:write", "cards:read", "cards:write", "cards:submit_review",
        "drops:read", "drops:write", "codes:read", "audit:read",
    }),
    "viewer": frozenset({"artists:read", "cards:read", "drops:read", "codes:read", "audit:read"}),
}
```

`AdminMembership` check constraint를 `company_admin`까지 확장하는 Alembic migration을 작성한다. `OrganizationMemberCreate`는 루트 호출에서만 `company_admin`을 허용하고, 기업 슈퍼 관리자는 자신의 조직 안에 `manager`·`editor`·`viewer`만 발급·변경·중지할 수 있다. 기업 슈퍼 관리자의 자신/동일 역할 승격과 루트 발급은 금지한다.

`admin_partners.py`에는 `require_organization_management(context, organization_id)`를 둔다. 루트는 모든 조직을 통과하고, `company_admin`은 `context.organization.id == organization_id`일 때만 통과하며 그 외 역할은 403을 받는다. 조직 상세·자기 조직 관리자 목록·아티스트 배정은 이 도우미를 사용한다. 이 검사는 메뉴 숨김과 무관하게 API에서 항상 수행한다.

- [ ] **Step 4: 계약을 통과시킨다.**

Run: `backend/.venv/bin/pytest backend/tests/unit/test_migrations.py -k company_admin -q && backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -k 'partner_roles_expose or company_admin or admin_me' -q`

Expected: all selected tests pass.

- [ ] **Step 5: 커밋한다.**

```bash
git add backend/alembic/versions/0028_company_admin_access_level.py backend/app/models.py backend/app/schemas.py backend/app/admin_access.py backend/app/routers/admin_partners.py backend/tests/unit/test_migrations.py backend/tests/contract/test_admin_partner_access.py
git commit -m "기업 내부 운영 역할을 명시한다"
```

## Task 3: 범위형 드롭·코드 API를 구현

**Files:**
- Modify: `backend/app/schemas.py:102-120`
- Modify: `backend/app/routers/admin.py:97-110, 308-320, 660-735`
- Test: `backend/tests/contract/test_admin_partner_access.py`

- [ ] **Step 1: 드롭 범위 계약을 작성한다.**

```python
def test_partner_manager_can_only_create_and_list_own_assigned_artist_drops(actors):
    organization, member = create_partner(actors["admin"], access_level="manager")
    own_drop = assert_success(actors["partner"].post("/api/admin/drops", json={
        "name": "회사 컴백 드롭", "artistId": member["assignedArtists"][0]["id"],
    }))
    listed = assert_success(actors["partner"].get("/api/admin/drops"))["items"]
    assert [item["id"] for item in listed] == [own_drop["id"]]
    denied = actors["partner"].post("/api/admin/drops", json={"name": "범위 밖", "artistId": "artist_other"})
    assert_error(denied, 404, "RESOURCE_NOT_FOUND")
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -k partner_manager_can_only_create_and_list_own_assigned_artist_drops -q`

Expected: `FAILED` because drops are root-only and have no scope.

- [ ] **Step 3: 요청 모델과 범위 도우미를 구현한다.**

```python
class DropCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    organization_id: str | None = Field(default=None, alias="organizationId")
    artist_id: str = Field(alias="artistId")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    model_config = ConfigDict(populate_by_name=True)

async def scoped_drop_or_404(drop_id: str, context: AdminContext, session: DbSession) -> Drop:
    drop = await session.get(Drop, drop_id)
    if not drop or (not context.is_root and (
        drop.organization_id != context.membership.organization_id
        or drop.artist_id not in context.assigned_artist_ids
    )):
        raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    return drop
```

`list_drops`, `get_drop`, `create_drop`, `update_drop`, 코드 배치 생성·CSV/QR 다운로드에 이 도우미와 `context.require_action(...)`을 적용한다. 드롭 생성 시 기업 관리자는 `organization_id=context.membership.organization_id`로 강제하며, 루트는 `organizationId`를 명시하고 해당 조직에 연결된 `artistId`인지 검증한다. `company_admin`은 회사의 모든 연결 아티스트, manager/editor/viewer는 자신의 배정 아티스트만 접근한다. 기존 범위 없는 드롭은 루트에만 보이고 마이그레이션 중 임의로 소유권을 추정하지 않는다. `drop_data`에는 `organizationId`와 `artistId`를 포함한다.

- [ ] **Step 4: 발행 요청과 루트 최종 발행을 분리한다.**

```python
@router.post("/drops/{drop_id}/submit")
async def submit_drop(drop_id: str, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("drops:submit")
    drop = await scoped_drop_or_404(drop_id, context, session)
    if drop.status != "draft":
        raise AppError(409, "INVALID_DROP_STATUS", "초안 드롭만 발행 요청할 수 있습니다.")
    drop.status = "pending_review"
    await record_audit(session, actor_user_id=context.user.id, action="drop.submitted", entity_type="drop", entity_id=drop.id, organization_id=drop.organization_id, artist_id=drop.artist_id)
    await session.commit()
    return {"ok": True, "data": drop_data(drop)}
```

`DropStatusUpdate`에 `pending_review`를 추가하고, live/ended 전환 route는 `context.require_root()`를 호출한다. `company_admin`과 manager는 초안을 `pending_review`로 요청할 수 있지만 editor는 드롭 초안 저장까지만 가능하며 viewer는 읽기 전용이다.

- [ ] **Step 5: 계약을 통과시킨다.**

Run: `backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -k 'drop or redeem_code' -q`

Expected: selected root/partner scope tests pass.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/schemas.py backend/app/routers/admin.py backend/tests/contract/test_admin_partner_access.py
git commit -m "기업 범위 드롭과 코드 운영을 허용한다"
```

## Task 4: 관리자 공통 셸과 내비게이션을 참고 이미지 체계로 재구성

**Files:**
- Modify: `admin_app/app.js:245-315`
- Modify: `admin_app/styles.css:1-350, 2300-2715`
- Test: `admin_app/tests/admin-responsive-layout.test.mjs`

- [ ] **Step 1: 공통 셸 구조의 실패 테스트를 추가한다.**

```javascript
test('admin shell uses the reference hierarchy with a collapsible account footer', () => {
  assert.match(source, /class="app-nav[^"]*"/)
  assert.match(source, /class="nav-account"/)
  assert.match(source, /data-view="partners"/)
  assertCssMatches(/\.admin-shell\.partner-layout\s*\{[^}]*208px\s+280px/s, 'keeps the desktop three-column partner layout')
  assertCssMatches(/@media\s*\(max-width:\s*1023px\)[\s\S]*\.app-nav/s, 'collapses navigation below desktop')
})
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test admin_app/tests/admin-responsive-layout.test.mjs`

Expected: failure until the shell contains the new account collapse control and responsive rule.

- [ ] **Step 3: 최소 셸 상태와 markup을 추가한다.**

```javascript
const state = { /* existing fields */, navCollapsed: false, accountMenuOpen: false };

function navigationView() {
  return `<aside class="app-nav ${state.navCollapsed ? "collapsed" : ""}">
    <button class="nav-collapse" id="nav-collapse" type="button" aria-label="메뉴 접기">${icon("keyboard_double_arrow_left")}</button>
    ...
    <div class="nav-account">...</div>
  </aside>`;
}
```

CSS keeps the 208px expanded width, transitions to 72px only when `navCollapsed`, and removes labels without hiding icon accessible names. Do not introduce a second navigation system.

- [ ] **Step 4: 통과와 좁은 폭 회귀를 확인한다.**

Run: `node --test admin_app/tests/admin-responsive-layout.test.mjs`

Expected: all layout tests pass.

- [ ] **Step 5: 커밋한다.**

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/admin-responsive-layout.test.mjs
git commit -m "관리자 공통 셸을 운영 도구 구조로 정리한다"
```

## Task 5: 파트너 디렉터리를 참고 이미지의 운영 화면으로 완성

**Files:**
- Modify: `admin_app/app.js:385-465, 1010-1055, 1290-1405`
- Modify: `admin_app/styles.css:820-1220, 1550-1700`
- Test: `admin_app/tests/admin-operations-workspace.test.mjs`

- [ ] **Step 1: 파트너 구조와 접근성 실패 테스트를 작성한다.**

```javascript
test('partner workspace has searchable directory, detail metrics, and scoped manager actions', () => {
  assert.match(source, /aria-label="파트너 목록"/)
  assert.match(source, /계약 기간/)
  assert.match(source, /발행 카드/)
  assert.match(source, /data-assign-member/)
  assert.match(source, /role="dialog"/)
})
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test admin_app/tests/admin-operations-workspace.test.mjs`

Expected: `FAILED` because the new dedicated test file is absent.

- [ ] **Step 3: 파트너 헤더와 탭을 정리한다.**

```javascript
function partnerTabView(organization) {
  return {
    overview: partnerOverviewView(organization),
    members: partnerMembersView(),
    artists: partnerArtistsView(organization),
    operations: partnerOperationsView(organization),
  }[state.partnerTab];
}
```

`partnerOverviewView`는 계약 기간, 담당자, 발행 카드 수, 최근 업데이트를 보여준다. `partnerMembersView`는 검색 input, 역할 badge, 배정 trigger, 최근 로그인, 상태, menu button을 사용한다. 루트에게만 전체 디렉터리·계약 변경·기업 슈퍼 관리자 발급을 제공하고, 기업 슈퍼 관리자에게는 자기 회사 상세/구성원/배정만 제공한다. role menu와 assignment popover의 wrapper만 `overflow: visible`로 유지한다.

- [ ] **Step 4: 테스트를 통과시킨다.**

Run: `node --test admin_app/tests/admin-operations-workspace.test.mjs admin_app/tests/admin-responsive-layout.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 5: 커밋한다.**

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/admin-operations-workspace.test.mjs
git commit -m "파트너 운영 화면을 디렉터리형으로 완성한다"
```

## Task 6: 역할별 아티스트·카드·드롭 작업 화면을 정리

**Files:**
- Modify: `admin_app/app.js:466-785, 930-985, 1470-1755`
- Modify: `admin_app/styles.css:1200-2300`
- Test: `admin_app/tests/admin-operations-workspace.test.mjs`

- [ ] **Step 1: 역할별 메뉴와 작업 실패 테스트를 추가한다.**

```javascript
test('company roles see scoped drops and only allowed actions', () => {
  assert.match(source, /can\("drops:write"\)/)
  assert.match(source, /can\("drops:submit"\)/)
  assert.match(source, /can\("codes:write"\)/)
  assert.match(source, /scopeLabel\(\)/)
})
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test admin_app/tests/admin-operations-workspace.test.mjs -t company`

Expected: failure until drop permissions are rendered through `allowedActions`.

- [ ] **Step 3: 드롭·코드 화면을 범위형 workspace로 바꾼다.**

```javascript
function batchesView() {
  const canCreate = can("drops:write");
  const canSubmit = can("drops:submit");
  return `<div class="workspace-heading">...</div>
    <section class="operations-grid">${dropListView()}${codeBatchListView()}</section>
    ${canCreate ? dropDrawerTrigger() : ""}
    ${canSubmit ? dropReviewQueueView() : ""}`;
}
```

드롭 생성 drawer는 `artistId`를 항상 전송하며 루트에게만 `organizationId` 선택기를 보인다. UI는 루트일 때만 최종 발행/중지, 코드 무효화, 재고 조정 액션을 렌더링한다. 기업 슈퍼 관리자는 회사 전체의 드롭·코드, 매니저/에디터는 배정 아티스트 드롭, 뷰어는 읽기 전용 지표와 목록만 본다.

- [ ] **Step 4: 카드·아티스트 화면에서 중복 설정 패널을 제거한다.**

`guideView`와 독립 `settings` 항목은 `currentView`와 `navItems`에서 제거한다. 안내는 각 빈 상태와 helper tooltip으로 이동한다. 카드의 운영/스튜디오 구분은 `source` badge와 filter로 렌더링한다.

- [ ] **Step 5: 테스트를 통과시킨다.**

Run: `node --test admin_app/tests/*.mjs && node --check admin_app/app.js`

Expected: all admin tests pass and syntax check exits 0.

- [ ] **Step 6: 커밋한다.**

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/admin-operations-workspace.test.mjs
git commit -m "회사 범위 운영 화면을 역할별로 정리한다"
```

## Task 7: 오류 안내·세션 폐기·감사 로그 계약을 완료

**Files:**
- Modify: `backend/app/routers/admin_partners.py:511-580`
- Modify: `backend/app/routers/admin.py:660-735`
- Modify: `admin_app/app.js:789-820, 1180-1410`
- Test: `backend/tests/contract/test_admin_partner_access.py`
- Test: `admin_app/tests/admin-operations-workspace.test.mjs`

- [ ] **Step 1: 역할 변경과 드롭 발행 요청의 감사/세션 실패 테스트를 추가한다.**

```python
def test_company_admin_role_change_revokes_target_refresh_sessions_and_records_scope(actors, session):
    organization, member = create_partner(actors["admin"], access_level="company_admin")
    response = actors["company_admin"].patch(
        f"/api/admin/organizations/{organization['id']}/members/{member['id']}",
        json={"accessLevel": "viewer"},
    )
    assert_success(response)
    assert session.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == member["id"])) == 0
    assert_scoped_audit(session, "organization.member_updated", organization["id"])
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -k 'role_change_revokes or drop' -q`

Expected: failure for any missing company-admin action, session revocation, or scoped audit field.

- [ ] **Step 3: 서버와 UI 오류 문구를 구현한다.**

```javascript
function permissionMessage(error) {
  if (error.code === "ADMIN_ROOT_REQUIRED") return "이 작업은 Fanfolio 루트 관리자만 실행할 수 있습니다.";
  if (error.code === "ADMIN_WRITE_REQUIRED") return "이 작업은 회사 슈퍼 관리자 또는 매니저에게 요청하세요.";
  return error.message;
}
```

변경 route는 `record_audit(..., organization_id=drop.organization_id, artist_id=drop.artist_id)`를 항상 전달하고, 멤버 role/status 변경 뒤 refresh token family를 폐기한다. 기업 슈퍼 관리자가 자신의 조직 구성원을 변경한 경우에도 같은 세션 폐기·감사 계약을 적용한다.

- [ ] **Step 4: 테스트를 통과시킨다.**

Run: `backend/.venv/bin/pytest backend/tests/contract/test_admin_partner_access.py -q && node --test admin_app/tests/*.mjs`

Expected: all contract and admin tests pass.

- [ ] **Step 5: 커밋한다.**

```bash
git add backend/app/routers/admin.py backend/app/routers/admin_partners.py backend/tests/contract/test_admin_partner_access.py admin_app/app.js admin_app/tests/admin-operations-workspace.test.mjs
git commit -m "운영 권한 변경의 감사와 안내를 강화한다"
```

## Task 8: 반응형·시각 QA와 배포 검증

**Files:**
- Create: `design-qa.md`
- Modify: `admin_app/styles.css`
- Test: `admin_app/tests/admin-responsive-layout.test.mjs`

- [ ] **Step 1: 화면 폭 회귀 테스트를 추가한다.**

```javascript
test('desktop partner workspace preserves reference columns and mobile converts tables to records', () => {
  assertCssMatches(/208px\s+280px\s+minmax\(0,\s*1fr\)/, 'desktop has global nav, directory, and detail columns')
  assertCssMatches(/@media\s*\(max-width:\s*767px\)[\s\S]*\.responsive-table[\s\S]*display:\s*grid/, 'mobile tables become records')
  assert.match(css, /overflow-x:\s*clip/)
})
```

- [ ] **Step 2: 테스트를 통과시킨다.**

Run: `node --test admin_app/tests/admin-responsive-layout.test.mjs`

Expected: all tests pass.

- [ ] **Step 3: 1440×1024 시각 QA를 기록한다.**

`design-qa.md`에 아래 형식으로 기록한다.

```markdown
# Admin operations design QA

- Reference: /Users/gojaewoong/Downloads/생성된 이미지 2.png
- Viewport: 1440×1024
- Compared state: ROOT > 파트너 > 관리자 탭
- P0: none
- P1: none
- P2: none
- Remaining P3: small-screen account-menu animation polish

final result: passed
```

- [ ] **Step 4: 전체 검증을 실행한다.**

Run: `/Users/gojaewoong/Desktop/ko/fanfolio/backend/.venv/bin/pytest -q && node --test admin_app/tests/*.mjs && node --check admin_app/app.js && /Users/gojaewoong/Desktop/ko/fanfolio/backend/.venv/bin/pre-commit run --all-files`

Expected: all commands exit 0.

- [ ] **Step 5: 실서비스 smoke test 후 커밋·푸시한다.**

검증 순서: 루트 로그인 → 파트너 생성/수정 → 기업 슈퍼 관리자 발급 → 아티스트 배정 → 매니저 로그인 → 범위형 드롭 초안 및 발행 요청 → 루트 최종 발행 → 뷰어 읽기 전용 확인.

```bash
git add admin_app backend design-qa.md
git commit -m "관리자 운영 웹 전면 개편을 검증한다"
git push origin codex/admin-operations-redesign
```

## 계획 자체 검토

- 설계의 전역 셸, 파트너 3단 화면, 역할별 범위, 드롭·코드 접근, 오류·감사·세션 폐기, 반응형과 시각 QA를 각각 Task 1~8에 배정했다.
- `TBD`, `TODO`, 추후 구현 같은 자리표시자를 사용하지 않았다.
- 드롭의 `organization_id`/`artist_id`, `allowedActions`, `pending_review` 상태는 모델·schema·router·frontend 순서로 일관되게 정의했다.
