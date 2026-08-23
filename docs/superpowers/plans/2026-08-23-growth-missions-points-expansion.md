# Growth, Missions, and Points Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect every verified fan action to a durable growth event and deliver repeatable missions, configurable levels, non-cash service points, fan UI, administrator operations, and an end-to-end verified reward loop.

**Architecture:** Existing `EngagementEvent` remains the single server-authored action ledger. One idempotent processor evaluates XP, achievements, missions, point rewards, and fan-pass progress; first-class mission and point ledgers keep repeatable completion and spendable balances separate from one-time achievements. All action endpoints persist their domain row and engagement event together, then enqueue processing after commit.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, pytest, React 19, TypeScript, Vite, static JavaScript admin app, Node built-in test runner.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/alembic/versions/0050_growth_missions_points.py` | Add mission, point, level-policy, and event-error storage |
| `backend/app/models.py` | Persist mission definitions/progress, point ledger/balance, level thresholds |
| `backend/app/schemas.py` | Validate mission, point policy, exchange, and admin requests |
| `backend/app/services.py` | Process events, evaluate scoped rules, grant XP/points/rewards, calculate levels |
| `backend/app/tasks.py` | Shared inline/Celery engagement enqueue entry point |
| `backend/app/routers/fan.py` | Pack growth enqueue, progression, missions, point history and exchange APIs |
| `backend/app/routers/events.py` | Emit comment and application engagement events |
| `backend/app/routers/social.py` | Emit follow and completed-trade engagement events |
| `backend/app/routers/combinations.py` | Emit card-combination engagement events |
| `backend/app/routers/admin.py` | Mission, level policy, point policy, event retry operations |
| `frontend/src/api/client.ts` | Fan mission and point API contracts |
| `frontend/src/App.tsx` | Mission and point routes and data loading |
| `frontend/src/components/FanGrowth.tsx` | Real mission and point summaries |
| `frontend/src/components/FanMissions.tsx` | Mission list, status and reward claim UI |
| `frontend/src/components/FanPoints.tsx` | Balance, history, and exchange UI |
| `frontend/src/components/Settings.tsx` | Real point balance entry |
| `admin_app/app.js` | Mission, point, level and failed-event operations |
| `admin_app/styles.css` | Existing design-system layouts for the new admin views |

### Task 1: Process card-pack growth exactly once

**Files:**
- Modify: `backend/app/routers/fan.py`
- Test: `backend/tests/contract/test_card_packs.py`

- [x] **Step 1: Write the failing pack-growth test**

```python
def test_opening_pack_processes_growth_once(actors, published_pack):
    before = actors["fan"].get("/api/me/progression").json()["data"]["level"]["totalXp"]
    opened = actors["fan"].post(
        f"/api/me/card-packs/{published_pack['id']}/open",
        headers={"Idempotency-Key": "growth-pack-open"},
    )
    assert opened.status_code == 201
    after = actors["fan"].get("/api/me/progression").json()["data"]
    assert after["level"]["totalXp"] == before + 30
    retry = actors["fan"].post(
        f"/api/me/card-packs/{published_pack['id']}/open",
        headers={"Idempotency-Key": "growth-pack-open"},
    )
    assert retry.json()["data"]["userCardId"] == opened.json()["data"]["userCardId"]
    assert actors["fan"].get("/api/me/progression").json()["data"]["level"]["totalXp"] == before + 30
```

- [x] **Step 2: Run the test and observe the missing XP failure**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_packs.py -k growth_once`

Expected: FAIL because the created engagement event remains pending.

- [x] **Step 3: Inject `BackgroundTasks` and enqueue after the transaction**

```python
@router.post("/me/card-packs/{pack_id}/open", status_code=status.HTTP_201_CREATED)
async def open_card_pack(
    pack_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user: FanUser,
    session: DbSession,
) -> dict:
    ...
    enqueue_engagement_event(event.id, background_tasks)
    return response
```

The idempotent replay branch must not enqueue a second event.

- [x] **Step 4: Run pack and growth regression tests**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_packs.py backend/tests/contract/test_fan_growth.py`

Expected: PASS.

- [x] **Step 5: Commit**

Commit intent: `Ensure pack rewards reach the growth ledger`

### Task 2: Add mission, point, level-policy, and retry storage

**Files:**
- Create: `backend/alembic/versions/0050_growth_missions_points.py`
- Modify: `backend/app/models.py`
- Test: `backend/tests/unit/test_migrations.py`
- Create: `backend/tests/unit/test_growth_economy_services.py`

- [x] **Step 1: Write failing model and migration tests**

```python
def test_growth_economy_migration_creates_required_tables(upgraded_table_names):
    assert {
        "mission_definitions", "mission_progress", "point_ledger",
        "point_balances", "level_policy_versions", "level_thresholds",
    } <= upgraded_table_names
```

```python
async def test_point_ledger_deduplicates_source_rule(async_session):
    first = await grant_points(async_session, user_id="fan", source_event_id="evt", rule_key="mission:m1", amount=100)
    second = await grant_points(async_session, user_id="fan", source_event_id="evt", rule_key="mission:m1", amount=100)
    assert first.id == second.id
    assert await point_balance(async_session, "fan") == 100
```

- [x] **Step 2: Run the tests and verify missing symbols/tables**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/unit/test_growth_economy_services.py`

Expected: FAIL because the models and helpers do not exist.

- [x] **Step 3: Add additive models and unique constraints**

```python
class MissionDefinition(Base):
    __tablename__ = "mission_definitions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"))
    artist_id: Mapped[str | None] = mapped_column(ForeignKey("artists.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    event_kind: Mapped[str] = mapped_column(String, nullable=False)
    target_value: Mapped[int] = mapped_column(Integer, nullable=False)
    recurrence: Mapped[str] = mapped_column(String, nullable=False, default="once")
    condition_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    reward_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

`MissionProgress` is unique on `(user_id, mission_id, period_key)`. `PointLedger` is unique on `(user_id, source_event_id, rule_key)` and stores signed `amount`, transaction type, expiration and reversal source. `PointBalance` is keyed by user. `LevelThreshold` is unique on `(policy_version_id, level)`.

- [x] **Step 4: Add migration 0050 and model imports**

The migration must be additive, point to `0049_analytics_events`, and add nullable `error_code`, `error_message`, and `attempt_count` columns to `engagement_events`.

- [x] **Step 5: Implement minimal point helpers and configurable level lookup**

```python
async def grant_points(...):
    existing = await find_point_entry(...)
    if existing:
        return existing
    balance = await lock_or_create_point_balance(session, user_id)
    if balance.balance + amount < 0:
        raise AppError(409, "INSUFFICIENT_POINTS", "포인트가 부족합니다.")
    row = PointLedger(...)
    balance.balance += amount
    session.add(row)
    return row
```

- [x] **Step 6: Run migration and unit tests**

Run: `backend/.venv/bin/alembic upgrade head`

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/unit/test_growth_economy_services.py`

Expected: PASS.

- [x] **Step 7: Commit**

Commit intent: `Create durable mission and point accounting`

### Task 3: Evaluate generic missions and rewards from engagement events

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/tasks.py`
- Test: `backend/tests/unit/test_growth_economy_services.py`

- [x] **Step 1: Write failing recurrence, scope, and reward tests**

```python
@pytest.mark.parametrize("recurrence,period_key", [("daily", "2026-08-23"), ("weekly", "2026-W34")])
async def test_mission_progress_uses_period_instance(recurrence, period_key, async_session):
    mission = await make_mission(async_session, event_kind="event_commented", recurrence=recurrence, target=2)
    await process_test_event(async_session, kind="event_commented", source_id="c1")
    await process_test_event(async_session, kind="event_commented", source_id="c2")
    progress = await mission_progress(async_session, mission.id, period_key)
    assert progress.current_value == 2
    assert progress.completed_at is not None
```

```python
async def test_completed_mission_grants_xp_points_and_reward_once(async_session):
    mission = await make_mission(async_session, target=1, reward={"xp": 50, "points": 100, "rewardId": "reward_1"})
    event = await process_test_event(async_session, kind=mission.event_kind)
    await process_engagement_event(event.id)
    assert await xp_for_rule(async_session, "mission:" + mission.id) == 50
    assert await point_balance(async_session, "fan") == 100
    assert await reward_grant_count(async_session, mission.id) == 1
```

- [x] **Step 2: Verify expected failures**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_growth_economy_services.py`

Expected: FAIL because mission processing is absent.

- [x] **Step 3: Implement period keys, scope matching, and mission progress**

`once` uses `once`, `daily` uses UTC date, `weekly` uses ISO week, and `season` uses the configured mission start/end version key. Scope matching checks organization, artist, pack, card and event IDs from server-authored payload.

- [x] **Step 4: Extend the event processor**

```python
try:
    await grant_base_event_xp(...)
    await update_missions(session, event=event)
    await update_achievements(session, event=event)
    await update_pass_progress(session, event=event)
    event.status = "processed"
except Exception as exc:
    event.status = "failed"
    event.attempt_count += 1
    event.error_code = type(exc).__name__
    event.error_message = str(exc)[:500]
    raise
```

- [x] **Step 5: Run service and existing growth tests**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_growth_economy_services.py backend/tests/unit/test_engagement_services.py backend/tests/contract/test_fan_growth.py`

Expected: PASS.

- [x] **Step 6: Commit**

Commit intent: `Make verified actions advance repeatable missions`

### Task 4: Emit events from real fan actions

**Files:**
- Modify: `backend/app/routers/fan.py`
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/routers/social.py`
- Modify: `backend/app/routers/combinations.py`
- Test: `backend/tests/contract/test_growth_action_events.py`

- [x] **Step 1: Write parameterized failing action tests**

```python
@pytest.mark.parametrize(
    "action,event_kind",
    [
        ("comment", "event_commented"),
        ("application", "event_applied"),
        ("follow", "fan_followed"),
        ("combination", "card_combined"),
        ("trade", "trade_completed"),
    ],
)
def test_successful_action_emits_one_processed_growth_event(action, event_kind, scenario):
    source_id = scenario.perform(action)
    events = scenario.growth_events(kind=event_kind, source_id=source_id)
    assert len(events) == 1
    assert events[0]["status"] == "processed"
```

- [x] **Step 2: Run and verify missing events**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_growth_action_events.py`

Expected: FAIL for every action not yet connected.

- [x] **Step 3: Add transaction-local event recording and post-commit enqueue**

Every successful domain command records one event using a stable source row ID. Existing idempotent branches return the original source and do not create another event. Deletions and failed validations do not emit positive events.

- [x] **Step 4: Run action, social, event and combination contracts**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_growth_action_events.py backend/tests/contract/test_event_comments.py backend/tests/contract/test_event_applications.py backend/tests/contract/test_social_trading.py backend/tests/contract/test_card_combinations.py`

Expected: PASS.

- [x] **Step 5: Commit**

Commit intent: `Connect real fan actions to growth processing`

### Task 5: Expose fan missions, points, exchange, and consistent profile balances

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/fan.py`
- Test: `backend/tests/contract/test_fan_growth_economy.py`

- [x] **Step 1: Write failing API contract tests**

```python
def test_fan_can_read_missions_points_and_exchange_ticket(actors, published_mission, ticket_reward):
    profile = actors["fan"].get("/api/me").json()["data"]
    points = actors["fan"].get("/api/me/points").json()["data"]
    missions = actors["fan"].get("/api/me/missions").json()["data"]
    assert profile["points"] == points["balance"]
    assert missions["items"][0]["id"] == published_mission.id
    exchanged = actors["fan"].post(f"/api/me/points/exchanges/{ticket_reward.id}")
    assert exchanged.status_code == 201
    assert exchanged.json()["data"]["balance"] == points["balance"] - ticket_reward.point_cost
```

- [x] **Step 2: Run and verify 404/missing balance failures**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth_economy.py`

Expected: FAIL.

- [x] **Step 3: Add fan APIs**

- `GET /api/me/missions?status=active|completed|ended`
- `POST /api/me/missions/{mission_id}/claim`
- `GET /api/me/points`
- `GET /api/me/points/history`
- `GET /api/catalog/point-exchanges`
- `POST /api/me/points/exchanges/{exchange_id}`

Mission reward claim is idempotent. Point exchange locks the balance and grants the configured non-transferable reward in one transaction.

- [x] **Step 4: Replace `/api/me` point placeholder with the real balance**

```python
"points": await current_point_balance(session, user.id)
```

- [x] **Step 5: Run fan contracts**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth_economy.py backend/tests/contract/test_fan_growth.py`

Expected: PASS.

- [x] **Step 6: Commit**

Commit intent: `Expose missions and service points to fans`

### Task 6: Add permission-scoped administrator operations

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/admin_access.py`
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/contract/test_engagement_admin.py`
- Create: `backend/tests/contract/test_growth_economy_admin.py`

- [x] **Step 1: Write failing role and workflow tests**

Cover root/global policy access, partner-scoped mission drafts, cross-organization denial, submit/approve/publish transitions, immutable published policies, manual adjustment reason, and failed event retry audit.

- [x] **Step 2: Run and observe missing endpoints**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_growth_economy_admin.py`

Expected: FAIL.

- [x] **Step 3: Add mission and policy APIs**

- `GET/POST/PATCH /api/admin/engagement/missions`
- `POST /api/admin/engagement/missions/{id}/submit`
- `POST /api/admin/engagement/missions/{id}/approve`
- `GET/POST /api/admin/engagement/level-policies`
- `GET/POST /api/admin/engagement/point-exchanges`
- `POST /api/admin/engagement/points/adjustments`
- `GET /api/admin/engagement/events?status=failed`
- `POST /api/admin/engagement/events/{id}/retry`

- [x] **Step 4: Enforce organization and approval scope**

Published definitions are immutable. Partner managers can draft and submit in assigned organization/artist scope; platform approvers publish; only root/platform finance-like permission can manually adjust points.

- [x] **Step 5: Run admin contracts**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_growth_economy_admin.py backend/tests/contract/test_engagement_admin.py`

Expected: PASS.

- [x] **Step 6: Commit**

Commit intent: `Let scoped operators govern missions and points`

### Task 7: Build fan mission and point screens on real APIs

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/FanGrowth.tsx`
- Modify: `frontend/src/components/Settings.tsx`
- Create: `frontend/src/components/FanMissions.tsx`
- Create: `frontend/src/components/FanPoints.tsx`
- Create: `frontend/src/components/FanGrowthEconomy.css`
- Create: `frontend/tests/fan-missions-points.test.mjs`

- [x] **Step 1: Write failing source-contract and route tests**

Assert real API paths, no fixture point constant, `/growth/missions` and `/points` routes, status filtering, claim/exchange commands, and loading/error/empty states.

- [x] **Step 2: Run and observe source-contract failures**

Run: `node --test frontend/tests/fan-missions-points.test.mjs`

Expected: FAIL.

- [x] **Step 3: Add typed API methods and route components**

Use existing `apiRequest`, `AppShell`, header, bottom navigation, chip, card, loading, and empty-state patterns. Do not add a sixth bottom-navigation item.

- [x] **Step 4: Connect summaries and profile balance**

`FanGrowth` shows active missions and point balance from progression/economy APIs. `Settings` continues to display `me.points`, now backed by the ledger.

- [x] **Step 5: Run frontend tests, lint, and build**

Run: `node --test frontend/tests/fan-missions-points.test.mjs frontend/tests/fan-growth.test.mjs frontend/tests/fan-growth-loading.test.mjs`

Run: `cd frontend && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 6: Commit**

Commit intent: `Show real missions and points in the fan app`

### Task 8: Build administrator growth operations on real APIs

**Files:**
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Create: `admin_app/tests/growth-economy-management.test.mjs`

- [x] **Step 1: Write failing admin UI contract tests**

Assert navigation, mission list/builder, recurrence and scope fields, reward inputs, validation and review actions, level threshold preview, point exchange catalog, failed-event retry, and permission-dependent controls.

- [x] **Step 2: Run and observe missing UI contracts**

Run: `node --test admin_app/tests/growth-economy-management.test.mjs`

Expected: FAIL.

- [x] **Step 3: Implement API-backed views using existing design tokens**

Add subnavigation under `팬 성장`: `미션`, `업적`, `XP·레벨`, `포인트`, `처리 상태`. Forms use full-page creation/edit flows where policy creation is complex; table detail uses the same aligned master-detail pattern as card operations.

- [x] **Step 4: Add client-side validation without duplicating server authority**

Validate required fields, positive targets, recurrence periods, point costs and level threshold order. Server error codes remain the source of truth.

- [x] **Step 5: Run admin tests**

Run: `node --test admin_app/tests/growth-economy-management.test.mjs admin_app/tests/fan-growth-management.test.mjs`

Expected: PASS.

- [x] **Step 6: Commit**

Commit intent: `Operate growth missions and points from the admin web`

### Task 9: Verify the complete local scenario and update product evidence

**Files:**
- Create: `backend/tests/contract/test_growth_economy_scenario.py`
- Modify: `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md`
- Modify: `docs/superpowers/plans/2026-08-23-growth-missions-points-expansion.md`

- [ ] **Step 1: Write the full failing scenario**

The test creates and approves a mission, performs a fan comment/application/follow, completes and claims the mission, verifies points, exchanges a draw ticket, opens a published pack, and verifies collection, XP, level, pass, point ledger and audit rows.

- [ ] **Step 2: Run the focused full scenario**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_growth_economy_scenario.py`

Expected: PASS only when all slices are connected.

- [ ] **Step 3: Run complete automated verification**

Run: `backend/.venv/bin/pytest -q backend/tests/unit backend/tests/contract`

Run: `node --test frontend/tests/*.test.mjs`

Run: `node --test admin_app/tests/*.test.mjs`

Run: `cd frontend && npm run lint && npm run build`

Expected: all commands PASS with no new warnings introduced by this work.

- [ ] **Step 4: Verify actual local browser flows**

Use the Codex in-app browser with one backend on port 8000, fan app on 5173, and admin app on 5178. Verify admin mission publication, fan mission progress, point balance/history, ticket exchange, pack opening and resulting growth summary. Preserve screenshots under `docs/design/qa/`.

- [ ] **Step 5: Update documentation and mark completed checkboxes**

Record exact commands, counts, browser URLs, observed results, and any production-only gaps in `docs/PRODUCT_SCENARIO_AND_RELEASE_GATE.md` and this plan.

- [ ] **Step 6: Commit**

Commit intent: `Prove the complete fan growth economy scenario`
