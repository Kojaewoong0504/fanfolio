# Admin Partner Logo Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 웹에서 파트너 로고를 선택적으로 업로드·교체·제거하고, 검증된 자산을 목록과 상세 화면에 안정적으로 표시한다.

**Architecture:** 기존 자산 업로드 파이프라인에 `organization_logo` 목적과 2MB 제한을 추가하고, `organizations.logo_asset_id`가 검증된 `assets` 행을 참조하게 한다. API는 자산이 있을 때 동일 출처 로고 콘텐츠 URL을 반환하고 기존 `logo_url`은 읽기 호환용으로만 유지한다. 관리자 앱은 로컬 미리보기와 첫 글자 폴백을 제공하며 파트너 저장 전에 로고 업로드를 완료한다.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, Pytest, vanilla JavaScript, CSS, Node test runner

---

### Task 1: 로고 자산 API 계약을 테스트로 고정

**Files:**
- Modify: `backend/tests/contract/test_admin_partner_access.py`
- Modify: `backend/tests/contract/test_assets.py`

- [ ] **Step 1: 파트너 로고 계약의 실패 테스트 작성**

`backend/tests/contract/test_admin_partner_access.py`에 다음 헬퍼와 테스트를 추가한다.

```python
def upload_organization_logo(admin: TestClient, *, purpose: str = "organization_logo") -> str:
    presigned = assert_success(
        admin.post(
            "/api/uploads/presign",
            json={
                "fileName": "starwave-logo.png",
                "contentType": "image/png",
                "purpose": purpose,
            },
        ),
        201,
    )
    asset_id = presigned["assetId"]
    response = admin.put(
        f"/api/uploads/{asset_id}/content",
        content=b"\x89PNG\r\n\x1a\n" + b"logo-bytes",
        headers={"Content-Type": "image/png"},
    )
    assert response.status_code == 204
    return asset_id


def test_partner_logo_is_optional_and_ready_logo_asset_is_exposed(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    without_logo = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "로고 없는 회사", "slug": "without-logo"},
        ),
        201,
    )
    assert without_logo["logoAssetId"] is None
    assert without_logo["logoUrl"] is None

    asset_id = upload_organization_logo(actors["admin"])
    with_logo = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={
                "name": "스타웨이브 엔터테인먼트",
                "slug": "starwave-logo",
                "logoAssetId": asset_id,
            },
        ),
        201,
    )
    assert with_logo["logoAssetId"] == asset_id
    assert with_logo["logoUrl"] == f"/api/organizations/{with_logo['id']}/logo"

    logo = actors["admin"].get(with_logo["logoUrl"])
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"


def test_partner_logo_can_be_replaced_and_removed(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    first_asset_id = upload_organization_logo(actors["admin"])
    organization = assert_success(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "교체 테스트", "slug": "logo-replace", "logoAssetId": first_asset_id},
        ),
        201,
    )
    second_asset_id = upload_organization_logo(actors["admin"])
    replaced = assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}",
            json={"logoAssetId": second_asset_id},
        )
    )
    assert replaced["logoAssetId"] == second_asset_id

    removed = assert_success(
        actors["admin"].patch(
            f"/api/admin/organizations/{organization['id']}",
            json={"logoAssetId": None},
        )
    )
    assert removed["logoAssetId"] is None
    assert removed["logoUrl"] is None


def test_partner_logo_rejects_unready_or_wrong_purpose_assets(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    unready = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "unready.png",
                "contentType": "image/png",
                "purpose": "organization_logo",
            },
        ),
        201,
    )
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "준비 안 됨", "slug": "logo-unready", "logoAssetId": unready["assetId"]},
        ),
        409,
        "ASSET_NOT_READY",
    )

    wrong_purpose_id = upload_organization_logo(actors["admin"], purpose="card")
    assert_error(
        actors["admin"].post(
            "/api/admin/organizations",
            json={"name": "잘못된 목적", "slug": "logo-purpose", "logoAssetId": wrong_purpose_id},
        ),
        422,
        "INVALID_LOGO_ASSET",
    )
```

- [ ] **Step 2: 로고 업로드 제한의 실패 테스트 작성**

`backend/tests/contract/test_assets.py`에 `organization_logo`가 이미지 형식만 허용되고 2MB를 초과하면 413을 반환하는 테스트를 추가한다.

```python
def test_organization_logo_upload_is_limited_to_two_megabytes(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    presigned = assert_success(
        actors["admin"].post(
            "/api/uploads/presign",
            json={
                "fileName": "oversized-logo.png",
                "contentType": "image/png",
                "purpose": "organization_logo",
            },
        ),
        201,
    )
    response = actors["admin"].put(
        f"/api/uploads/{presigned['assetId']}/content",
        content=b"x" * (2 * 1024 * 1024 + 1),
        headers={"Content-Type": "image/png"},
    )
    assert_error(response, 413, "UPLOAD_TOO_LARGE")
```

- [ ] **Step 3: 계약 테스트가 올바른 이유로 실패하는지 확인**

Run:

```bash
backend/.venv/bin/pytest -q \
  backend/tests/contract/test_admin_partner_access.py \
  backend/tests/contract/test_assets.py
```

Expected: `organization_logo`가 스키마에 없거나 `logoAssetId`가 응답에 없어 FAIL.

- [ ] **Step 4: 테스트만 커밋**

```bash
git add backend/tests/contract/test_admin_partner_access.py backend/tests/contract/test_assets.py
git commit -m "파트너 로고 자산의 API 경계를 검증한다"
```

### Task 2: 데이터 모델과 업로드 정책 구현

**Files:**
- Create: `backend/alembic/versions/0026_organization_logo_asset.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/assets.py`
- Modify: `backend/tests/unit/test_migrations.py`

- [ ] **Step 1: 마이그레이션 실패 테스트 작성**

`backend/tests/unit/test_migrations.py`의 현재 스키마 검증에 다음 단언을 추가한다.

```python
organization_columns = {
    row[1] for row in connection.execute("PRAGMA table_info(organizations)")
}
assert "logo_asset_id" in organization_columns
```

- [ ] **Step 2: 마이그레이션 테스트 실패 확인**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py`

Expected: `logo_asset_id`가 없어 FAIL.

- [ ] **Step 3: 선택형 자산 관계와 API 입력 타입 구현**

`backend/app/models.py`의 `Organization`에 다음 열을 추가한다.

```python
logo_asset_id: Mapped[str | None] = mapped_column(
    ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
)
```

`backend/app/schemas.py`의 `OrganizationCreate`와 `OrganizationUpdate`에 다음 필드를 추가하고 기존 `logo_url`은 읽기 호환용으로 유지한다.

```python
logo_asset_id: str | None = Field(default=None, alias="logoAssetId", max_length=80)
```

`UploadPresignRequest.purpose`에 `organization_logo`를 추가한다.

```python
purpose: Literal[
    "card",
    "handwriting",
    "voice",
    "video",
    "collection_benefit",
    "organization_logo",
]
```

- [ ] **Step 4: 마이그레이션 구현**

`0026_organization_logo_asset.py`에서 `organizations.logo_asset_id`를 nullable FK로 추가하고 인덱스를 만든다.

```python
revision = "0026_organization_logo_asset"
down_revision = "0025_admin_partner_scope"


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(sa.Column("logo_asset_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_organizations_logo_asset_id_assets",
            "assets",
            ["logo_asset_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_organizations_logo_asset_id", ["logo_asset_id"])


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_index("ix_organizations_logo_asset_id")
        batch_op.drop_constraint("fk_organizations_logo_asset_id_assets", type_="foreignkey")
        batch_op.drop_column("logo_asset_id")
```

- [ ] **Step 5: 목적별 2MB 제한 구현**

`backend/app/routers/assets.py`에 목적별 크기 함수를 추가하고 API 업로드와 S3 완료 경로 양쪽에서 사용한다.

```python
ORGANIZATION_LOGO_MAX_BYTES = 2 * 1024 * 1024


def upload_limit_bytes(asset: Asset) -> int:
    if asset.purpose == "organization_logo":
        return ORGANIZATION_LOGO_MAX_BYTES
    return get_settings().max_upload_bytes
```

`upload_asset_content()`와 `complete_asset_upload()`의 크기 비교는 `upload_limit_bytes(asset)`를 사용한다.

- [ ] **Step 6: 모델·마이그레이션·크기 제한 테스트 통과 확인**

Run:

```bash
backend/.venv/bin/pytest -q \
  backend/tests/unit/test_migrations.py \
  backend/tests/contract/test_assets.py
```

Expected: PASS.

- [ ] **Step 7: 데이터 계층 커밋**

```bash
git add backend/alembic/versions/0026_organization_logo_asset.py backend/app/models.py backend/app/schemas.py backend/app/routers/assets.py backend/tests/unit/test_migrations.py
git commit -m "파트너 로고를 검증된 선택형 자산으로 저장한다"
```

### Task 3: 파트너 API 자산 검증과 로고 콘텐츠 제공

**Files:**
- Modify: `backend/app/routers/admin_partners.py`
- Modify: `backend/app/routers/assets.py`
- Test: `backend/tests/contract/test_admin_partner_access.py`

- [ ] **Step 1: 로고 자산 검증 헬퍼 구현**

`backend/app/routers/admin_partners.py`에 `Asset`과 `configured_asset_storage`를 import하고 다음 헬퍼를 추가한다.

```python
async def _validated_logo_asset(
    session: DbSession,
    *,
    asset_id: str | None,
    owner_id: str,
) -> Asset | None:
    if asset_id is None:
        return None
    asset = await session.get(Asset, asset_id)
    if (
        asset is None
        or asset.owner_id != owner_id
        or asset.purpose != "organization_logo"
        or asset.content_type not in {"image/png", "image/jpeg", "image/webp"}
    ):
        raise AppError(422, "INVALID_LOGO_ASSET", "파트너 로고 자산을 확인해 주세요.")
    if (
        asset.upload_completed_at is None
        or asset.storage_path is None
        or not configured_asset_storage().exists(asset.storage_path)
    ):
        raise AppError(409, "ASSET_NOT_READY", "파트너 로고 업로드가 완료되지 않았습니다.")
    return asset
```

- [ ] **Step 2: 생성·수정에 자산 검증과 제거 의미 적용**

`create_organization()`은 `logo_asset_id`를 `model_dump()`에서 분리해 검증한 뒤 저장한다. `update_organization()`은 `logoAssetId`가 요청에 포함된 경우에만 검증하고, 명시적 `null`이면 `logo_asset_id`와 구형 `logo_url`을 함께 비운다.

```python
values = payload.model_dump(exclude_unset=True, by_alias=False)
logo_asset_id = values.pop("logo_asset_id", None)
await _validated_logo_asset(session, asset_id=logo_asset_id, owner_id=context.user.id)
organization = Organization(
    id=f"org_{uuid4().hex[:12]}",
    logo_asset_id=logo_asset_id,
    **values,
)
```

```python
values = payload.model_dump(exclude_unset=True, by_alias=False)
if "logo_asset_id" in values:
    logo_asset_id = values.pop("logo_asset_id")
    await _validated_logo_asset(session, asset_id=logo_asset_id, owner_id=context.user.id)
    organization.logo_asset_id = logo_asset_id
    organization.logo_url = None
```

- [ ] **Step 3: 응답과 동일 출처 로고 URL 구현**

`_organization_data()`는 `logoAssetId`를 반환하고 자산이 있으면 API URL을 우선한다.

```python
"logoAssetId": organization.logo_asset_id,
"logoUrl": (
    f"/api/organizations/{organization.id}/logo"
    if organization.logo_asset_id
    else organization.logo_url
),
```

`backend/app/routers/assets.py`에 공개 브랜드 자산 전용 읽기 엔드포인트를 추가한다. 이 경로는 조직 식별자만 노출하며 원본 저장 경로는 반환하지 않는다.

```python
@router.get("/organizations/{organization_id}/logo")
async def get_organization_logo(organization_id: str, session: DbSession) -> Response:
    organization = await session.get(Organization, organization_id)
    if organization is None or organization.logo_asset_id is None:
        raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
    asset = await session.get(Asset, organization.logo_asset_id)
    if asset is None or asset.storage_path is None or asset.upload_completed_at is None:
        raise AppError(404, "ASSET_NOT_FOUND", "파트너 로고를 찾을 수 없습니다.")
    return storage_response(
        configured_asset_storage(),
        asset.storage_path,
        media_type=asset.content_type or "image/png",
    )
```

- [ ] **Step 4: 파트너 계약 테스트 통과 확인**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_admin_partner_access.py`

Expected: PASS.

- [ ] **Step 5: API 구현 커밋**

```bash
git add backend/app/routers/admin_partners.py backend/app/routers/assets.py backend/tests/contract/test_admin_partner_access.py
git commit -m "파트너 로고 자산의 검증과 표시 경로를 연결한다"
```

### Task 4: 관리자 로고 UI 동작을 테스트로 고정

**Files:**
- Modify: `admin_app/tests/partner-access.test.mjs`
- Modify: `admin_app/tests/admin-responsive-layout.test.mjs`

- [ ] **Step 1: 관리자 UI 실패 테스트 작성**

`admin_app/tests/partner-access.test.mjs`에 다음 검증을 추가한다.

```javascript
test('partner logo is optional and supports preview replacement removal and fallback', () => {
  assert.match(source, /organization-logo-input/)
  assert.match(source, /organization-logo-preview/)
  assert.match(source, /remove-organization-logo/)
  assert.match(source, /organization_logo/)
  assert.match(source, /logoAssetId/)
  assert.match(source, /2 \* 1024 \* 1024/)
  assert.match(source, /image\/png.*image\/jpeg.*image\/webp/s)
  assert.match(source, /partnerLogoMarkup/)
  assert.match(source, /onerror=/)
})
```

`admin_app/tests/admin-responsive-layout.test.mjs`에 로고 프레임과 좁은 화면 검증을 추가한다.

```javascript
test('partner logos preserve their aspect ratio without widening the directory', () => {
  assert.match(styles, /\.company-avatar img[^}]*object-fit:\s*contain/s)
  assert.match(styles, /\.company-avatar\s*\{[^}]*width:\s*44px/s)
  assert.match(styles, /\.company-avatar\.large\s*\{[^}]*width:\s*96px/s)
  assert.match(styles, /\.organization-logo-picker/)
})
```

- [ ] **Step 2: 관리자 테스트 실패 확인**

Run: `node --test admin_app/tests/*.test.mjs`

Expected: 로고 입력·미리보기·폴백 구현이 없어 FAIL.

- [ ] **Step 3: 테스트 커밋**

```bash
git add admin_app/tests/partner-access.test.mjs admin_app/tests/admin-responsive-layout.test.mjs
git commit -m "파트너 로고 관리 화면의 필수 상호작용을 고정한다"
```

### Task 5: 관리자 앱 로고 업로드·교체·제거 구현

**Files:**
- Modify: `admin_app/app.js`

- [ ] **Step 1: 로고 UI 상태와 공용 렌더러 추가**

전역 상태에 다음 값을 추가한다.

```javascript
organizationLogoFile: null,
organizationLogoPreviewUrl: "",
organizationLogoRemoved: false,
```

목록·상세·서랍이 동일한 폴백 규칙을 사용하도록 렌더러를 추가한다.

```javascript
function partnerLogoMarkup(organization, size = "default") {
  const fallback = escapeHtml((organization?.name || "파트너").trim().slice(0, 1) || "파");
  const logoUrl = organization?.logoUrl;
  return `<span class="company-avatar ${size === "large" ? "large" : ""}">
    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(organization.name)} 로고" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span class="company-avatar-fallback" hidden>${fallback}</span>` : `<span class="company-avatar-fallback">${fallback}</span>`}
  </span>`;
}
```

- [ ] **Step 2: 등록·수정 서랍에 선택형 업로드 UI 추가**

`organizationDrawer()` 상단에 `accept="image/png,image/jpeg,image/webp"` 파일 입력, 미리보기, 교체 및 제거 버튼을 추가한다. 기존 로고가 있으면 현재 로고를 미리보기로 사용하고, 로고가 없어도 폼 제출을 막지 않는다.

```javascript
<section class="organization-logo-picker">
  <div class="organization-logo-preview" id="organization-logo-preview">
    ${partnerLogoMarkup({ name: editing?.name || "파트너", logoUrl: state.organizationLogoPreviewUrl || editing?.logoUrl }, "large")}
  </div>
  <div class="organization-logo-copy">
    <strong>회사 로고 <span class="optional-label">선택</span></strong>
    <p>PNG, JPG, WebP · 최대 2MB · 원본 비율 유지</p>
    <div class="inline-actions">
      <label class="secondary upload-button" for="organization-logo-input">${editing?.logoUrl ? "로고 교체" : "로고 선택"}</label>
      <input id="organization-logo-input" name="logo" type="file" accept="image/png,image/jpeg,image/webp" hidden />
      ${(editing?.logoUrl || state.organizationLogoPreviewUrl) ? `<button class="text-button danger-text" id="remove-organization-logo" type="button">로고 제거</button>` : ""}
    </div>
  </div>
</section>
```

- [ ] **Step 3: 파일 검증과 로컬 미리보기 구현**

파일 변경 이벤트에서 형식과 2MB 제한을 확인하고 기존 object URL을 해제한 뒤 새 미리보기를 만든다.

```javascript
function setOrganizationLogoFile(file, form) {
  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("PNG, JPG 또는 WebP 로고만 등록할 수 있습니다.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("회사 로고는 2MB 이하로 등록해 주세요.");
  }
  if (state.organizationLogoPreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.organizationLogoPreviewUrl);
  }
  state.organizationLogoFile = file;
  state.organizationLogoPreviewUrl = URL.createObjectURL(file);
  state.organizationLogoRemoved = false;
  layout();
}
```

제거 버튼은 파일과 미리보기를 비우고 `organizationLogoRemoved = true`로 설정한다.

- [ ] **Step 4: 저장 흐름에 자산 업로드를 연결**

`saveOrganization()`에서 파트너 API 호출 전에 선택 파일을 업로드한다. 파일이 없고 제거하지 않았다면 `logoAssetId`를 payload에서 생략하고, 제거했다면 `null`을 보낸다.

```javascript
if (state.organizationLogoFile) {
  try {
    payload.logoAssetId = await uploadAsset(
      state.organizationLogoFile,
      "organization_logo",
    );
  } catch (error) {
    submit.disabled = false;
    errorBox.textContent = `로고 업로드에 실패했습니다: ${String(error?.message || error)}`;
    errorBox.hidden = false;
    return;
  }
} else if (state.organizationLogoRemoved) {
  payload.logoAssetId = null;
}
```

저장 성공과 서랍 닫기에서 object URL을 해제하고 로고 임시 상태를 초기화한다. 저장 실패 시에는 미리보기를 유지한다.

- [ ] **Step 5: 목록·상세 화면을 공용 로고 렌더러로 전환**

`partnerListItem`과 `partnersView()`의 첫 글자 전용 `.company-avatar` 마크업을 각각 다음 호출로 교체한다.

```javascript
${partnerLogoMarkup(organization)}
```

```javascript
${partnerLogoMarkup(organization, "large")}
```

- [ ] **Step 6: 관리자 동작 테스트 통과 확인**

Run: `node --test admin_app/tests/*.test.mjs`

Expected: PASS.

- [ ] **Step 7: 관리자 동작 커밋**

```bash
git add admin_app/app.js admin_app/tests/partner-access.test.mjs
git commit -m "파트너 로고의 선택 업로드와 폴백 흐름을 완성한다"
```

### Task 6: 관리자 파트너 로고 시각 완성도와 반응형 레이아웃 구현

**Files:**
- Modify: `admin_app/styles.css`
- Test: `admin_app/tests/admin-responsive-layout.test.mjs`

- [ ] **Step 1: 로고 프레임과 업로드 영역 스타일 구현**

기존 디자인 토큰을 사용해 목록 44px, 상세 96px 프레임과 서랍 업로드 영역을 구현한다.

```css
.company-avatar {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.company-avatar.large {
  width: 96px;
  height: 96px;
  flex-basis: 96px;
  border-radius: 18px;
}

.company-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.company-avatar-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: 800;
}

.organization-logo-picker {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-muted);
}
```

- [ ] **Step 2: 좁은 서랍과 모바일에서 세로 배치 적용**

기존 모바일 media query 안에서 업로드 영역과 버튼이 넘치지 않게 한다.

```css
@media (max-width: 640px) {
  .organization-logo-picker {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
  }

  .organization-logo-picker .company-avatar.large {
    width: 72px;
    height: 72px;
    flex-basis: 72px;
  }
}
```

- [ ] **Step 3: 반응형 테스트 통과 확인**

Run: `node --test admin_app/tests/admin-responsive-layout.test.mjs`

Expected: PASS.

- [ ] **Step 4: 스타일 커밋**

```bash
git add admin_app/styles.css admin_app/tests/admin-responsive-layout.test.mjs
git commit -m "파트너 로고를 관리자 화면 규격에 맞춰 표시한다"
```

### Task 7: 전체 회귀 검증과 시각 QA

**Files:**
- Create: `design-qa.md`
- Modify only if verification finds a defect: files changed in Tasks 1–6

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `backend/.venv/bin/pytest -q backend/tests`

Expected: `0 failed`; 환경 의존 통합 테스트만 기존 기준대로 skip.

- [ ] **Step 2: 백엔드 정적 검사 실행**

Run:

```bash
backend/.venv/bin/ruff format --check backend/app backend/tests backend/alembic
backend/.venv/bin/ruff check backend/app backend/tests backend/alembic
```

Expected: PASS.

- [ ] **Step 3: 관리자 전체 테스트와 JavaScript 구문 검사 실행**

Run:

```bash
node --check admin_app/app.js
node --test admin_app/tests/*.test.mjs
```

Expected: PASS.

- [ ] **Step 4: 로컬 서버에서 핵심 경로 확인**

백엔드와 관리자 앱을 실행한 뒤 다음 순서로 확인한다.

1. 로고 없이 파트너 등록 → 첫 글자 표시
2. PNG 로고가 있는 파트너 등록 → 목록과 상세에 전체 비율 표시
3. 수정에서 로고 교체 → 목록과 상세 즉시 갱신
4. 수정에서 로고 제거 → 첫 글자 폴백 복귀
5. JPG/WebP 허용, 잘못된 형식과 2MB 초과 파일 거절
6. 1402px, 1024px, 768px viewport에서 가로 스크롤 없음

- [ ] **Step 5: 소스 이미지와 실제 화면 시각 비교**

제공된 `/Users/gojaewoong/Downloads/생성된 이미지 2.png`와 같은 파트너 상세 상태를 관리자 앱에서 캡처한다. 두 이미지를 한 비교 입력으로 열어 로고 크기, 목록 밀도, 상세 헤더 간격, 테이블 정렬, 가로 넘침을 검사하고 `design-qa.md`에 P0–P3로 기록한다. P0–P2를 수정하고 `final result: passed`가 될 때까지 재검증한다.

- [ ] **Step 6: 최종 검증 커밋**

```bash
git add design-qa.md
git commit -m "파트너 로고 운영 흐름의 회귀와 시각 품질을 검증한다"
```
