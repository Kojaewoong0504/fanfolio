# Admin Issuance Operations Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the previously approved issuance-batch experience as a production admin workflow backed by the existing redeem-code APIs.

**Architecture:** Normalize root permissions in the backend contract, then replace the legacy combined drop/code form with production list, detail, and dedicated creation views that reuse the preview CSS patterns. Keep existing drop and redeem-code endpoints unchanged; the UI adapts their real payloads into the approved operational presentation.

**Tech Stack:** FastAPI, SQLAlchemy, vanilla JavaScript, CSS, Python pytest contract tests, Node test runner.

---

## File responsibilities

- `backend/app/admin_access.py`: canonical root and partner permission sets.
- `backend/tests/contract/test_admin_partner_access.py`: permission-contract regression tests.
- `admin_app/app.js`: production admin view routing, issuance list/detail rendering, filters, creation form, and API event handlers.
- `admin_app/styles.css`: production issuance layout using existing preview design primitives.
- `admin_app/tests/card-operations-production.test.mjs`: static production wiring and UI contract tests.

### Task 1: Restore root issuance permissions

**Files:**
- Modify: `backend/app/admin_access.py:17-39`
- Test: `backend/tests/contract/test_admin_partner_access.py`

- [ ] **Step 1: Write the failing permission test**

```python
from app.admin_access import ROOT_ACTIONS


def test_root_actions_expose_redeem_code_read_and_write_contract() -> None:
    assert {"codes:read", "codes:write"} <= ROOT_ACTIONS
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd backend && pytest tests/contract/test_admin_partner_access.py::test_root_actions_expose_redeem_code_read_and_write_contract -q`

Expected: FAIL because `ROOT_ACTIONS` contains only `codes:manage`.

- [ ] **Step 3: Add the detailed root permissions**

```python
ROOT_ACTIONS = frozenset(
    {
        # existing actions
        "codes:manage",
        "codes:read",
        "codes:write",
    }
)
```

- [ ] **Step 4: Run permission tests and verify GREEN**

Run: `cd backend && pytest tests/contract/test_admin_partner_access.py -q`

Expected: PASS with existing partner role restrictions unchanged.

- [ ] **Step 5: Commit the permission contract**

Commit only `backend/app/admin_access.py` and `backend/tests/contract/test_admin_partner_access.py` with a Lore-compliant message.

### Task 2: Add production issuance list and creation routes

**Files:**
- Modify: `admin_app/app.js:300-435`
- Test: `admin_app/tests/card-operations-production.test.mjs`

- [ ] **Step 1: Write failing production-route assertions**

```javascript
test('production issuance uses dedicated list and creation views', () => {
  assert.match(source, /"issuance-create": issuanceCreationView/)
  assert.match(source, /data-view="issuance-create"/)
  assert.match(source, /function issuanceCreationView\(/)
  assert.match(source, /function issuanceDetailView\(/)
})
```

- [ ] **Step 2: Run the Node test and verify RED**

Run: `node --test admin_app/tests/card-operations-production.test.mjs`

Expected: FAIL because production has only the legacy `batchesView()`.

- [ ] **Step 3: Register the production route and title**

```javascript
const titles = {
  // existing titles
  batches: "발급·인증번호",
  "issuance-create": "새 발급 배치 만들기",
};

const views = {
  // existing views
  batches: batchesView,
  "issuance-create": issuanceCreationView,
};
```

Include `issuance-create` in the active Card navigation state and navigate from the one list-page create button.

- [ ] **Step 4: Run the production test and verify GREEN**

Run: `node --test admin_app/tests/card-operations-production.test.mjs`

Expected: PASS for routing assertions.

- [ ] **Step 5: Commit production routing**

Commit only the route/title/test changes with a Lore-compliant message.

### Task 3: Replace the legacy batch page with real-data operations UI

**Files:**
- Modify: `admin_app/app.js:1721-1815`
- Modify: `admin_app/styles.css:3591-5108`
- Test: `admin_app/tests/card-operations-production.test.mjs`

- [ ] **Step 1: Write failing list/detail contract assertions**

```javascript
test('production issuance list restores operational tracking controls', () => {
  const view = extractFunction('batchesView')
  assert.match(view, /예약 배치/)
  assert.match(view, /잔여 수량/)
  assert.match(view, /전체 상태/)
  assert.match(view, /전체 카드 유형/)
  assert.match(view, /전체 기간/)
  assert.match(view, /CSV 내보내기/)
  assert.match(view, /data-batch-id/)
})
```

- [ ] **Step 2: Run the Node test and verify RED**

Run: `node --test admin_app/tests/card-operations-production.test.mjs`

Expected: FAIL because the production view still renders two inline creation forms.

- [ ] **Step 3: Render real batch summaries and selection**

Add production state fields:

```javascript
issuanceQuery: "",
issuanceStatus: "all",
issuanceType: "all",
issuancePeriod: "all",
selectedBatchId: null,
```

Derive each row from `state.batches`, `state.cards`, and `state.drops`:

```javascript
const issued = Number(batch.usedCount || 0)
const quantity = Number(batch.codeCount ?? batch.quantity ?? 0)
const remaining = Math.max(0, quantity - issued)
```

Use the approved compact statistics, filter toolbar, aligned table, centered pagination, and a full-width detail section below the table. Display real CSV and QR ZIP URLs from the API response.

- [ ] **Step 4: Add event handlers for search, filters, selection, and exports**

```javascript
document.querySelector('#issuance-search')?.addEventListener('input', (event) => {
  state.issuanceQuery = event.target.value
  layout()
})

document.querySelectorAll('[data-issuance-filter]').forEach((select) => {
  select.addEventListener('change', () => {
    state[select.dataset.issuanceFilter] = select.value
    layout()
  })
})
```

Rows set `state.selectedBatchId`; the detail action downloads the existing `csvExportUrl` or `qrZipUrl` with authenticated admin fetch behavior already used by the application.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test admin_app/tests/card-operations-production.test.mjs admin_app/tests/card-operations-preview.test.mjs`

Expected: PASS; preview behavior remains intact.

- [ ] **Step 6: Commit the production list/detail restoration**

Commit `admin_app/app.js`, `admin_app/styles.css`, and the production test with a Lore-compliant message.

### Task 4: Connect the dedicated creation screen to the existing API

**Files:**
- Modify: `admin_app/app.js:2990-3065`
- Test: `admin_app/tests/card-operations-production.test.mjs`

- [ ] **Step 1: Write failing creation-flow assertions**

```javascript
test('production issuance creation submits the existing batch API contract', () => {
  const view = extractFunction('issuanceCreationView')
  const submit = extractFunction('createBatch')
  assert.match(view, /name="cardId"/)
  assert.match(view, /name="dropId"/)
  assert.match(view, /name="quantity"/)
  assert.match(view, /name="maxUsesPerCode"/)
  assert.match(view, /name="expiresAt"/)
  assert.match(view, /name="prefix"/)
  assert.match(submit, /\/admin\/redeem-code-batches/)
  assert.match(submit, /state\.view = "batches"/)
})
```

- [ ] **Step 2: Run the Node test and verify RED**

Run: `node --test admin_app/tests/card-operations-production.test.mjs`

Expected: FAIL because the dedicated production creation view does not exist.

- [ ] **Step 3: Implement the production creation view**

Render the approved `ISSUANCE BATCH` form and workflow guide while using the real API fields. Only published cards and live drops are selectable. Explain that this screen creates pre-generated one-use codes for limited cards; random card-pack issuance remains an on-open flow.

- [ ] **Step 4: Redirect after successful creation**

After `POST /admin/redeem-code-batches` succeeds:

```javascript
state.batch = result.data
state.selectedBatchId = result.data.id
state.view = "batches"
await loadData()
toast("발급 배치를 생성했습니다.")
```

- [ ] **Step 5: Run production and preview tests and verify GREEN**

Run: `node --test admin_app/tests/card-operations-production.test.mjs admin_app/tests/card-operations-preview.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the creation workflow**

Commit production creation-flow changes with a Lore-compliant message.

### Task 5: Verify the restored production workflow

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Run targeted backend tests**

Run: `cd backend && pytest tests/contract/test_admin_partner_access.py tests/contract/test_redemptions.py tests/contract/test_missing_admin_contracts.py -q`

Expected: PASS.

- [ ] **Step 2: Run the full admin test set**

Run: `node --test admin_app/tests/*.test.mjs`

Expected: PASS.

- [ ] **Step 3: Run static quality checks**

Run: `cd backend && ruff check app tests`

Expected: PASS.

- [ ] **Step 4: Verify in the in-app browser**

Log in as the root administrator on the local production admin route and verify:

1. Card navigation shows Card management, Card pack management, and Issuance/authentication codes.
2. Issuance list uses real API data and filters return to the full list.
3. A row opens its below-table detail without nested scrolling.
4. The create button opens a separate production creation screen.
5. A valid live-drop batch creates the requested number of unique codes.
6. CSV and QR ZIP downloads respond successfully.

- [ ] **Step 5: Record verification and final commit**

Update this plan's checkboxes and add a short verification note with command results. Commit only verification-driven changes.
