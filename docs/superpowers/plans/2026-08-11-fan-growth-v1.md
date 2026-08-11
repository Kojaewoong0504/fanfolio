# 팬 성장·업적·무료 팬 패스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개된 공식 카드를 수집한 팬이 아티스트 업적, 서버 계산 XP, 레벨, 꾸미기 보상, 무료 시즌 팬 패스를 사용할 수 있게 한다.

**Architecture:** 카드 등록 트랜잭션은 `engagement_events`에 불변 이벤트를 기록하고, 이벤트 소비자가 XP 원장·업적 진행·보상·알림을 멱등적으로 확정한다. 팬 앱은 진행도를 읽고 획득한 보상만 장착하며, 관리자는 자기 조직·아티스트 범위 안에서 템플릿 기반 업적과 무료 패스만 초안·검수·공개한다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, Celery/inline task queue, pytest, React + TypeScript + Vite, 정적 JavaScript 관리자 앱, Node built-in test runner.

---

## 선행 조건

이 계획은 [스페셜 카드 제작·검수·발행 연동 계획](2026-08-11-special-card-release-workflow.md)의 카드-드롭 연결과 공개 검증이 먼저 통과한 상태를 전제로 한다. 성장 보상은 `Drop.status == "live"`인 공개 카드의 `UserCard`만 원천으로 사용한다.

구현 중 `release_status == "published"` 및 라이브 드롭 조건을 우회하는 별도 카드 수집 경로를 만들지 않는다.

## 파일 구조와 책임

| 경로 | 책임 |
| --- | --- |
| `backend/alembic/versions/0031_fan_growth_foundation.py` | 성장 이벤트, 업적, 보상, XP, 패스, 프로필 장착 테이블 |
| `backend/app/models.py` | 성장 엔터티와 유니크 멱등 제약 |
| `backend/app/schemas.py` | 팬 진행도/장착 및 관리자 업적·패스 요청 계약 |
| `backend/app/admin_access.py` | 성장 운영 액션과 조직 범위 권한 |
| `backend/app/services.py` | 이벤트 기록, XP 원장, 업적 평가, 보상·알림 생성 |
| `backend/app/tasks.py` | 이벤트 처리 작업의 inline/Celery 공통 진입점 |
| `backend/app/routers/fan.py` | 진행도, 업적, 보상 수령, 프로필 장착 API |
| `backend/app/routers/admin.py` | 업적·보상·무료 패스 초안/검수/공개 API |
| `backend/tests/contract/test_fan_growth.py` | 카드 수집부터 XP·업적·장착까지 팬 계약 |
| `backend/tests/contract/test_engagement_admin.py` | 조직 범위·검수·패스 운영 계약 |
| `backend/tests/unit/test_engagement_services.py` | 중복 이벤트, XP 상쇄, 규칙 평가 단위 테스트 |
| `frontend/src/api/client.ts` | 진행도/업적/보상 TypeScript 타입 |
| `frontend/src/components/FanGrowth.tsx` | 홈 활동 카드, 업적 목록, 패스, 장착 패널 |
| `frontend/src/components/FanGrowth.css` | 팬 성장 UI의 반응형·접근성 스타일 |
| `frontend/src/App.tsx` | 데이터 로딩, 홈/설정 진입, 수령·장착 상호작용 |
| `admin_app/app.js` | `fan-growth` 뷰와 업적·패스 운영 drawer |
| `admin_app/styles.css` | 빌더, 검수 상태, 보상 프리뷰 스타일 |
| `admin_app/tests/fan-growth-management.test.mjs` | 관리자 화면의 권한·빌더 회귀 검사 |

## 공유 계약

```python
AchievementCondition = Literal[
    "first_card", "card_count", "member_count", "specific_card", "set_complete", "drop_participation"
]
AchievementStatus = Literal["draft", "pending_review", "published", "disabled"]
RewardType = Literal["badge", "title", "profile_frame", "collection_theme", "digital_bonus"]
PassStatus = Literal["draft", "pending_review", "published", "ended"]
EngagementEventKind = Literal["card_collected", "set_completed", "card_revoked"]
```

각 보상 지급은 `user_id + source_event_id + rule_key`로 유일해야 한다. XP 원장도 같은 키를 사용한다. `source_event_id`는 브라우저가 보내지 않고 서버가 생성한 `engagement_events.id`다.

### Task 1: 공개 카드 등록을 성장 이벤트로 고정한다

**Files:**
- Modify: `backend/app/services.py:693-784`
- Modify: `backend/app/tasks.py:1-46`
- Test: `backend/tests/contract/test_fan_growth.py`

- [ ] **Step 1: 카드 등록이 이벤트를 만든다는 실패 계약을 작성한다.**

```python
def test_redeeming_a_live_card_records_one_pending_growth_event(actors, seeded):
    redeemed = assert_success(
        actors["fan"].post("/api/redemptions", json={"code": seeded["codes"]["valid"], "source": "qr"}),
        201,
    )
    events = assert_success(actors["fan"].get("/api/me/progression"))["debugEvents"]
    assert events == [{"kind": "card_collected", "sourceUserCardId": redeemed["userCardId"], "status": "pending"}]
```

- [ ] **Step 2: 계약이 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py::test_redeeming_a_live_card_records_one_pending_growth_event`

Expected: FAIL because `/api/me/progression` and the event record do not exist.

- [ ] **Step 3: `redeem` 안에서 팬 성장 이벤트를 만들되 카드 등록 트랜잭션에 포함한다.**

```python
event = await record_engagement_event(
    session,
    user_id=user_id,
    kind="card_collected",
    source_type="user_card",
    source_id=user_card.id,
    payload={"cardId": card.id, "artistId": card.artist_id, "memberId": card.member_id, "dropId": drop.id},
)
session.add(user_card)
await record_audit(
    session,
    actor_user_id=user_id,
    action="redemption.created",
    entity_type="user_card",
    entity_id=user_card.id,
    details={**record_details, "engagementEventId": event.id},
)
```

`record_engagement_event`는 `(user_id, kind, source_type, source_id)` 유니크 충돌을 정상 재시도로 처리해 기존 이벤트를 반환한다. 트랜잭션이 커밋된 뒤에만 `enqueue_engagement_event(event.id, background_tasks)`를 호출한다.

- [ ] **Step 4: inline/Celery 양쪽에서 같은 소비자를 호출하게 한다.**

```python
@celery_app.task(name="fanfolio.process_engagement_event")
def process_engagement_event_task(event_id: str) -> None:
    asyncio.run(process_engagement_event(event_id))

def enqueue_engagement_event(event_id: str, background_tasks: BackgroundTasks) -> None:
    if settings.task_queue_mode == "celery":
        process_engagement_event_task.delay(event_id)
    else:
        background_tasks.add_task(process_engagement_event, event_id)
```

`POST /api/redemptions`에 `BackgroundTasks`를 주입해 enqueue를 호출한다. 이벤트 자체는 이미 카드 등록 트랜잭션에 저장되어 있으므로 작업 지연은 카드 소유권을 되돌리지 않는다.

- [ ] **Step 5: 계약을 다시 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py::test_redeeming_a_live_card_records_one_pending_growth_event`

Expected: PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/services.py backend/app/tasks.py backend/app/routers/fan.py backend/tests/contract/test_fan_growth.py
git commit -m "카드 수집을 팬 성장 이벤트로 기록한다"
```

### Task 2: 멱등 가능한 성장 데이터 모델과 마이그레이션을 추가한다

**Files:**
- Create: `backend/alembic/versions/0031_fan_growth_foundation.py`
- Modify: `backend/app/models.py:1-470`
- Modify: `backend/app/services.py:1-40,693-784`
- Test: `backend/tests/unit/test_migrations.py`
- Test: `backend/tests/unit/test_engagement_services.py`

- [ ] **Step 1: 테이블과 유니크 제약을 검사하는 실패 테스트를 작성한다.**

```python
def test_growth_migration_creates_event_ledger_and_reward_tables():
    assert {
        "engagement_events", "achievement_definitions", "achievement_progress",
        "reward_catalog", "reward_grants", "xp_ledger", "fan_levels",
        "pass_seasons", "pass_tiers", "pass_progress", "profile_equipment",
    } <= upgraded_table_names()

def test_same_event_and_rule_can_only_grant_xp_once(async_session):
    first = await grant_xp(async_session, user_id="fan", event_id="evt_1", rule_key="card_collected", amount=30)
    second = await grant_xp(async_session, user_id="fan", event_id="evt_1", rule_key="card_collected", amount=30)
    assert first.id == second.id
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/unit/test_engagement_services.py`

Expected: FAIL because the models and migration are absent.

- [ ] **Step 3: 0031 additive migration을 작성한다.**

```python
op.create_table(
    "engagement_events",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("kind", sa.String(), nullable=False),
    sa.Column("source_type", sa.String(), nullable=False),
    sa.Column("source_id", sa.String(), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    sa.Column("status", sa.String(), nullable=False, server_default="pending"),
    sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    sa.UniqueConstraint("user_id", "kind", "source_type", "source_id", name="uq_engagement_event_source"),
)
op.create_table(
    "xp_ledger",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("event_id", sa.String(), sa.ForeignKey("engagement_events.id"), nullable=False),
    sa.Column("rule_key", sa.String(), nullable=False),
    sa.Column("amount", sa.Integer(), nullable=False),
    sa.UniqueConstraint("user_id", "event_id", "rule_key", name="uq_xp_ledger_event_rule"),
)
```

`achievement_progress`는 `(user_id, achievement_id)`를, `reward_grants`는 `(user_id, source_event_id, rule_key)`를, `pass_progress`는 `(user_id, season_id)`를 유니크로 둔다. `profile_equipment`는 `user_id`를 기본 키로 하고 장착한 reward ID 목록과 공개 여부를 저장한다.

- [ ] **Step 4: 모델과 원장 helper를 추가한다.**

```python
async def grant_xp(session: AsyncSession, *, user_id: str, event_id: str, rule_key: str, amount: int) -> XpLedger:
    existing = await session.scalar(select(XpLedger).where(
        XpLedger.user_id == user_id, XpLedger.event_id == event_id, XpLedger.rule_key == rule_key,
    ))
    if existing:
        return existing
    row = XpLedger(id=f"xp_{uuid4().hex[:12]}", user_id=user_id, event_id=event_id, rule_key=rule_key, amount=amount)
    session.add(row)
    return row
```

레벨은 `sum(xp_ledger.amount)`로 계산하고 `fan_levels`는 조회 최적화용 캐시로만 갱신한다. 과거 XP를 수정하지 않고, 회수 시 음수 `amount` 원장을 새로 넣는다.

- [ ] **Step 5: migration과 unit test를 실행한다.**

Run: `backend/.venv/bin/alembic upgrade head && backend/.venv/bin/pytest -q backend/tests/unit/test_migrations.py backend/tests/unit/test_engagement_services.py`

Expected: migration succeeds and both tests PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/alembic/versions/0031_fan_growth_foundation.py backend/app/models.py backend/app/services.py backend/tests/unit/test_migrations.py backend/tests/unit/test_engagement_services.py
git commit -m "팬 성장 원장과 보상 지급 기반을 저장한다"
```

### Task 3: 업적 템플릿 평가와 보상·알림을 구현한다

**Files:**
- Modify: `backend/app/services.py:427-784`
- Modify: `backend/app/models.py:288-470`
- Test: `backend/tests/unit/test_engagement_services.py`
- Test: `backend/tests/contract/test_fan_growth.py`

- [ ] **Step 1: 초기 다섯 템플릿의 실패 테스트를 작성한다.**

```python
@pytest.mark.parametrize(
    ("condition_type", "target", "cards_needed"),
    [("first_card", 1, 1), ("card_count", 3, 3), ("member_count", 2, 2)],
)
async def test_card_collection_updates_scoped_achievement(condition_type, target, cards_needed, async_session):
    achievement = await make_published_achievement(async_session, condition_type=condition_type, target=target, artist_id="artist_nova3")
    for number in range(cards_needed):
        await process_test_card_collected(async_session, user_id="fan", card_id=f"card_{number}", artist_id="artist_nova3", member_id=f"member_{number}")
    progress = await get_progress(async_session, user_id="fan", achievement_id=achievement.id)
    assert (progress.current_value, progress.completed_at is not None) == (target, True)
```

별도로 `specific_card`, `set_complete`, `drop_participation`은 각각 카드 ID, `CollectionCampaign.required_card_ids`, 드롭 ID 기준으로 완료되는 사례를 작성한다.

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_engagement_services.py backend/tests/contract/test_fan_growth.py`

Expected: FAIL because 업적 평가와 reward grant가 없다.

- [ ] **Step 3: 이벤트 소비자를 구현한다.**

```python
async def process_engagement_event(event_id: str) -> None:
    async with SessionLocal() as session:
        event = await session.scalar(select(EngagementEvent).where(EngagementEvent.id == event_id).with_for_update())
        if not event or event.status == "processed":
            return
        await grant_xp(session, user_id=event.user_id, event_id=event.id, rule_key=event.kind, amount=base_xp_for(event))
        for definition in await published_definitions_for_event(session, event):
            await update_achievement_progress(session, event=event, definition=definition)
        await update_pass_progress(session, event=event)
        event.status, event.processed_at = "processed", now()
        await session.commit()
```

`update_achievement_progress`가 처음 완료시키는 경우에만 `grant_reward`와 `notify_fan_once`를 호출한다. `notify_fan_once`는 `notifications.event_key = f"achievement:{achievement_id}:{user_id}"`로 중복 알림을 막는다.

- [ ] **Step 4: 카드 회수의 상쇄 규칙을 구현한다.**

```python
async def revoke_card_growth(session: AsyncSession, *, user_card: UserCard, reason: str) -> EngagementEvent:
    return await record_engagement_event(
        session, user_id=user_card.user_id, kind="card_revoked", source_type="user_card", source_id=user_card.id,
        payload={"cardId": user_card.card_id, "reason": reason},
    )
```

`card_revoked`는 카드 수집 기본 XP와 해당 이벤트의 미수령 보상만 상쇄한다. 이미 장착하거나 수령한 보상은 자동 삭제하지 않고 운영자 수동 조정·감사 로그로 남긴다.

- [ ] **Step 5: 테스트를 다시 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/unit/test_engagement_services.py backend/tests/contract/test_fan_growth.py`

Expected: PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/models.py backend/app/services.py backend/tests/unit/test_engagement_services.py backend/tests/contract/test_fan_growth.py
git commit -m "공식 카드 수집에 업적과 보상을 연결한다"
```

### Task 4: 팬 진행도·보상 수령·프로필 장착 API를 제공한다

**Files:**
- Modify: `backend/app/schemas.py:1-120,250-380`
- Modify: `backend/app/routers/fan.py:1-210,412-490`
- Test: `backend/tests/contract/test_fan_growth.py`

- [ ] **Step 1: 팬 API 실패 계약을 작성한다.**

```python
def test_fan_can_read_progress_claim_a_reward_and_equip_it(actors, seeded):
    fan = actors["fan"]
    redeem_and_process_growth(fan, seeded["codes"]["valid"])
    progression = assert_success(fan.get("/api/me/progression"))
    grant = next(item for item in progression["claimableRewards"] if item["type"] == "title")
    claimed = assert_success(fan.post(f"/api/me/rewards/{grant['id']}/claim"))
    equipped = assert_success(fan.put("/api/me/profile/equipment", json={"titleRewardId": claimed["id"], "badgeRewardIds": []}))
    assert equipped["titleRewardId"] == claimed["id"]

def test_fan_cannot_claim_or_equip_another_fans_reward(actors, seeded):
    assert_error(actors["otherFan"].post("/api/me/rewards/reward_of_fan/claim"), 404, "REWARD_GRANT_NOT_FOUND")
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py`

Expected: FAIL because the endpoints and schemas are absent.

- [ ] **Step 3: Pydantic 요청 모델과 read model을 추가한다.**

```python
class ProfileEquipmentUpdate(BaseModel):
    title_reward_id: str | None = Field(default=None, alias="titleRewardId")
    badge_reward_ids: list[str] = Field(default_factory=list, alias="badgeRewardIds", max_length=3)
    frame_reward_id: str | None = Field(default=None, alias="frameRewardId")
    theme_reward_id: str | None = Field(default=None, alias="themeRewardId")
    public_profile_enabled: bool = Field(default=False, alias="publicProfileEnabled")
    model_config = ConfigDict(populate_by_name=True)
```

`AchievementDefinitionCreate`는 `organizationId`, `artistId`, `memberId`, `conditionType`, `targetValue`, `rewardIds`, `xpBonus`, `startsAt`, `endsAt`을 받으며 조건별 필수 ID를 model validator로 강제한다.

- [ ] **Step 4: 팬 라우트를 추가한다.**

```python
@router.get("/me/progression")
async def progression(user: FanUser, session: DbSession) -> dict:
    return {"ok": True, "data": await fan_progression_data(session, user.id)}

@router.post("/me/rewards/{grant_id}/claim")
async def claim_reward(grant_id: str, user: FanUser, session: DbSession) -> dict:
    return {"ok": True, "data": await claim_reward_grant(session, user_id=user.id, grant_id=grant_id)}

@router.put("/me/profile/equipment")
async def equip_profile(payload: ProfileEquipmentUpdate, user: FanUser, session: DbSession) -> dict:
    return {"ok": True, "data": await update_profile_equipment(session, user_id=user.id, payload=payload)}
```

`claim_reward_grant`는 소유자·claimable 상태를 잠근 뒤 `claimed_at`을 한 번만 설정한다. `update_profile_equipment`는 모든 reward ID가 해당 팬의 claimed grant이고 타입이 맞는지 확인한다.

- [ ] **Step 5: API 계약을 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py`

Expected: PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/schemas.py backend/app/routers/fan.py backend/tests/contract/test_fan_growth.py
git commit -m "팬의 성장 보상 조회와 프로필 장착을 제공한다"
```

### Task 5: 조직 범위의 업적·보상 검수 API를 만든다

**Files:**
- Modify: `backend/app/admin_access.py:15-85`
- Modify: `backend/app/schemas.py:250-380`
- Modify: `backend/app/routers/admin.py:70-315`
- Test: `backend/tests/contract/test_engagement_admin.py`

- [ ] **Step 1: 역할과 조직 경계의 실패 계약을 작성한다.**

```python
def test_company_manager_can_draft_only_assigned_artist_achievement(company_client, other_artist_id):
    assert_error(
        company_client.post("/api/admin/engagement/achievements", json={
            "name": "타사 업적", "artistId": other_artist_id, "conditionType": "first_card", "targetValue": 1,
            "rewardIds": [], "xpBonus": 50,
        }),
        404,
        "RESOURCE_NOT_FOUND",
    )

def test_company_super_admin_can_publish_company_achievement(company_admin_client):
    draft = assert_success(company_admin_client.post("/api/admin/engagement/achievements", json=achievement_payload()))
    assert_success(company_admin_client.post(f"/api/admin/engagement/achievements/{draft['id']}/approve"))

def test_editor_cannot_publish_achievement(editor_client):
    assert_error(editor_client.post("/api/admin/engagement/achievements/achievement_1/approve"), 403, "ADMIN_WRITE_REQUIRED")
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_engagement_admin.py`

Expected: FAIL because 성장 운영 액션과 routes are absent.

- [ ] **Step 3: 최소 권한을 추가한다.**

```python
ROOT_ACTIONS = ROOT_ACTIONS | frozenset({"engagement:manage_global", "engagement:approve_global"})
PARTNER_ACTIONS["company_admin"] = PARTNER_ACTIONS["company_admin"] | frozenset({"engagement:write", "engagement:approve"})
PARTNER_ACTIONS["manager"] = PARTNER_ACTIONS["manager"] | frozenset({"engagement:write"})
PARTNER_ACTIONS["editor"] = PARTNER_ACTIONS["editor"] | frozenset({"engagement:write"})
```

플랫폼 운영 관리자는 플랫폼 공통 보상을 승인할 수 있도록 `engagement:approve_global`만 가진다. 루트는 카드 공개 승인에 참여하지 않으며 전역 정책과 감사에만 접근한다.

- [ ] **Step 4: 관리자 라우트와 검수 상태 전이를 추가한다.**

```python
@router.post("/engagement/achievements", status_code=status.HTTP_201_CREATED)
async def create_achievement(payload: AchievementDefinitionCreate, context: CurrentAdmin, session: DbSession) -> dict:
    context.require_action("engagement:write")
    await require_engagement_scope(context, payload.organization_id, payload.artist_id)
    achievement = AchievementDefinition(id=f"achievement_{uuid4().hex[:12]}", status="draft", **payload.model_dump(by_alias=False))
    session.add(achievement)
    await record_audit(session, actor_user_id=context.user.id, action="achievement.created", entity_type="achievement", entity_id=achievement.id, organization_id=achievement.organization_id, artist_id=achievement.artist_id)
    await session.commit()
    return {"ok": True, "data": achievement_data(achievement)}
```

상태 전이는 `draft → pending_review → published`와 `published → disabled`만 허용한다. 승인자는 회사 범위에는 기업 슈퍼 관리자, 전역 범위에는 플랫폼 운영 관리자 또는 루트만 허용한다. `reward_catalog`도 같은 조직 범위 검사를 사용한다.

- [ ] **Step 5: 관리자 계약을 다시 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_engagement_admin.py backend/tests/contract/test_admin_partner_access.py`

Expected: PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/admin_access.py backend/app/schemas.py backend/app/routers/admin.py backend/tests/contract/test_engagement_admin.py backend/tests/contract/test_admin_partner_access.py
git commit -m "회사 범위의 업적 검수와 공개 권한을 분리한다"
```

### Task 6: 무료 시즌 팬 패스와 티어 수령을 추가한다

**Files:**
- Modify: `backend/app/models.py:288-470`
- Modify: `backend/app/schemas.py:250-380`
- Modify: `backend/app/services.py:427-784`
- Modify: `backend/app/routers/fan.py:1-210`
- Modify: `backend/app/routers/admin.py:70-315`
- Test: `backend/tests/contract/test_fan_growth.py`
- Test: `backend/tests/contract/test_engagement_admin.py`

- [ ] **Step 1: 시즌 티어 수령의 실패 계약을 작성한다.**

```python
def test_free_pass_tier_is_claimed_once_after_required_xp(actors, seeded):
    fan = actors["fan"]
    season = create_published_free_pass_with_tier(required_xp=30, reward_type="profile_frame")
    redeem_and_process_growth(fan, seeded["codes"]["valid"])
    progress = assert_success(fan.get("/api/me/progression"))
    tier = next(item for item in progress["pass"]["tiers"] if item["seasonId"] == season["id"])
    assert_success(fan.post(f"/api/me/pass-tiers/{tier['id']}/claim"))
    assert_error(fan.post(f"/api/me/pass-tiers/{tier['id']}/claim"), 409, "PASS_TIER_ALREADY_CLAIMED")
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py::test_free_pass_tier_is_claimed_once_after_required_xp`

Expected: FAIL because pass APIs are absent.

- [ ] **Step 3: 패스 모델과 server-side progress 갱신을 추가한다.**

```python
async def update_pass_progress(session: AsyncSession, *, event: EngagementEvent) -> None:
    seasons = await session.scalars(select(PassSeason).where(PassSeason.status == "published", PassSeason.starts_at <= now(), PassSeason.ends_at >= now()))
    for season in seasons:
        progress = await get_or_create_pass_progress(session, user_id=event.user_id, season_id=season.id)
        progress.xp_total = await current_xp_for_season(session, user_id=event.user_id, season=season)
```

`PassSeason.is_paid`는 이 계획에서 항상 `False`다. create/update schema에서 `isPaid`를 받지 않는다. `claim_pass_tier`는 `required_xp <= progress.xp_total`, 시즌 종료 뒤 14일 유예, 동일 티어 미수령을 모두 확인한다.

- [ ] **Step 4: 패스 운영 및 팬 수령 API를 추가한다.**

```python
@router.get("/me/pass")
async def fan_pass(user: FanUser, session: DbSession) -> dict: ...

@router.post("/me/pass-tiers/{tier_id}/claim")
async def claim_pass_tier(tier_id: str, user: FanUser, session: DbSession) -> dict: ...

@router.post("/engagement/pass-seasons")
async def create_pass_season(payload: PassSeasonCreate, context: CurrentAdmin, session: DbSession) -> dict: ...
```

패스 공개도 업적과 동일한 `draft → pending_review → published` 승인 규칙과 조직 범위 검사를 적용한다.

- [ ] **Step 5: 패스 계약을 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_fan_growth.py backend/tests/contract/test_engagement_admin.py`

Expected: PASS.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/services.py backend/app/routers/fan.py backend/app/routers/admin.py backend/tests/contract/test_fan_growth.py backend/tests/contract/test_engagement_admin.py
git commit -m "무료 팬 패스 보상을 안전하게 지급한다"
```

### Task 7: 팬 앱에 활동·업적·패스·장착 UI를 연결한다

**Files:**
- Modify: `frontend/src/api/client.ts:70-210`
- Create: `frontend/src/components/FanGrowth.tsx`
- Create: `frontend/src/components/FanGrowth.css`
- Modify: `frontend/src/App.tsx:1-470,707-790`
- Modify: `frontend/src/App.css:1-145`
- Test: `frontend/src/components/FanGrowth.test.tsx`

- [ ] **Step 1: 화면 상태를 고정하는 실패 컴포넌트 테스트를 작성한다.**

```tsx
it('shows a claimable reward without adding a sixth bottom tab', () => {
  render(<FanGrowth progression={progressionWithClaimableTitle} onClaim={vi.fn()} onEquip={vi.fn()} />)
  expect(screen.getByText('수령 가능한 보상 1개')).toBeVisible()
  expect(screen.getByRole('button', { name: '칭호 받기' })).toBeVisible()
  expect(screen.queryByRole('tab', { name: '팬 패스' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `cd frontend && npm test -- --run src/components/FanGrowth.test.tsx`

Expected: FAIL because `FanGrowth` does not exist.

- [ ] **Step 3: API 타입과 조회 함수를 추가한다.**

```ts
export type FanProgression = {
  level: number
  totalXp: number
  nextLevelXp: number
  achievements: AchievementProgress[]
  claimableRewards: RewardGrant[]
  pass: { seasonName: string | null; tiers: PassTier[] }
}

export const getProgression = () => apiFetch<{ ok: true; data: FanProgression }>('/me/progression')
```

`App.tsx`는 로그인과 `refreshCollection()` 뒤에 `getProgression()`을 병렬 호출한다. 네트워크 실패는 컬렉션 로딩을 막지 않고 홈 활동 카드에 재시도 버튼만 표시한다.

- [ ] **Step 4: `FanGrowth`와 홈 진입을 구현한다.**

```tsx
<section className="fan-growth-summary" aria-label="나의 팬 활동">
  <p className="eyebrow">FAN LEVEL</p>
  <strong>Lv. {progression.level}</strong>
  <progress value={progression.totalXp} max={progression.nextLevelXp} />
  <button type="button" onClick={onOpenAchievements}>업적 전체 보기</button>
</section>
```

홈에는 현재 레벨, 다음 레벨, 진행 중 업적 3개, 수령 가능한 보상 수만 노출한다. 전체 업적/패스/장착은 설정의 프로필 패널에서 bottom sheet로 연다. 화면 폭 360px에서도 버튼 최소 높이 44px과 가로 스크롤 없는 레이아웃을 유지한다.

- [ ] **Step 5: 수령·장착 성공과 실패 UI를 구현한다.**

수령 버튼은 요청 중 비활성화하고 성공 시 `refreshProgression()`을 호출한다. 장착 패널은 API가 반환한 `claimed` reward만 선택지로 만들며, claimable 또는 잠긴 보상을 임의 장착할 수 없게 한다.

- [ ] **Step 6: 프론트 테스트와 빌드를 실행한다.**

Run: `cd frontend && npm test -- --run src/components/FanGrowth.test.tsx && npm run build`

Expected: PASS and Vite build completes.

- [ ] **Step 7: 커밋한다.**

```bash
git add frontend/src/api/client.ts frontend/src/components/FanGrowth.tsx frontend/src/components/FanGrowth.css frontend/src/components/FanGrowth.test.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "팬 앱에 업적과 무료 패스 진행도를 보여준다"
```

### Task 8: 관리자 웹의 업적·패스 빌더와 검수 대기열을 연결한다

**Files:**
- Modify: `admin_app/app.js:1-360, currentView helpers`
- Modify: `admin_app/styles.css`
- Create: `admin_app/tests/fan-growth-management.test.mjs`

- [ ] **Step 1: 운영 화면 구조의 실패 소스 테스트를 작성한다.**

```js
test('fan growth is scoped to the administrator workspace', () => {
  assert.match(source, /id: "fan-growth"/)
  assert.match(source, /can\("engagement:write"\)/)
  assert.match(source, /engagement\/achievements/)
})

test('only a permitted approver sees the publish action', () => {
  assert.match(source, /can\("engagement:approve"\)|can\("engagement:approve_global"\)/)
  assert.match(source, /업적 공개 승인/)
})
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `node --test admin_app/tests/fan-growth-management.test.mjs`

Expected: FAIL because the navigation view and API bindings do not exist.

- [ ] **Step 3: state, navigation, and data loader를 추가한다.**

```js
state.engagement = { achievements: [], rewards: [], passSeasons: [] };
// navItems()
...(can("engagement:write") || can("engagement:manage_global")
  ? [{ id: "fan-growth", label: "팬 성장", icon: "workspace_premium" }]
  : []),
```

`loadFanGrowth()`는 `/api/admin/engagement/achievements`, `/rewards`, `/pass-seasons`을 `Promise.all`로 호출한다. 다른 페이지 데이터 로더에 영향을 주지 않고, 접근 거부는 일반 오류가 아니라 해당 메뉴를 숨겨 해결한다.

- [ ] **Step 4: 템플릿 빌더 drawer를 구현한다.**

업적 drawer는 범위, 아티스트/멤버, 조건 템플릿, 목표 수치, XP, 보상, 기간을 순서대로 보여 준다. 조건에 따라 필요한 선택 항목만 나타낸다.

```js
const conditionFields = {
  first_card: ["artistId"],
  card_count: ["artistId", "targetValue"],
  member_count: ["artistId", "targetValue"],
  specific_card: ["cardId"],
  set_complete: ["campaignId"],
  drop_participation: ["dropId"],
};
```

`저장`은 draft만 만들고, `검수 요청`, `공개 승인`은 별도 버튼으로 분리한다. 승인 버튼은 `engagement:approve` 또는 `engagement:approve_global` 권한일 때만 렌더한다.

- [ ] **Step 5: 무료 패스 drawer를 구현한다.**

패스는 이름, 조직/아티스트 범위, 시작/종료 시각, 10개 이하 티어, 각 티어 XP와 보상만 입력한다. `유료`, 가격, 결제 관련 필드는 렌더하지 않는다. 종료 시각은 시작 시각보다 뒤여야 한다는 서버 오류를 필드 아래에 표시한다.

- [ ] **Step 6: 관리자 화면 테스트를 실행한다.**

Run: `node --check admin_app/app.js && node --test admin_app/tests/fan-growth-management.test.mjs admin_app/tests/admin-responsive-layout.test.mjs`

Expected: PASS.

- [ ] **Step 7: 커밋한다.**

```bash
git add admin_app/app.js admin_app/styles.css admin_app/tests/fan-growth-management.test.mjs
git commit -m "운영자가 범위별 업적과 무료 패스를 관리하게 한다"
```

### Task 9: 운영 관측과 전체 출시 시나리오를 검증한다

**Files:**
- Modify: `backend/app/routers/admin.py:316-370,1669-1740`
- Modify: `backend/tests/contract/test_fan_growth.py`
- Modify: `backend/tests/contract/test_engagement_admin.py`
- Modify: `reports/e2e-release-scenario-2026-08-11/README.md`

- [ ] **Step 1: 전체 상태 전이 계약을 작성한다.**

```python
def test_special_card_release_to_fan_growth_e2e(platform, company_admin, artist, fan):
    card = artist_creates_and_submits_special_card(artist)
    company_approves(card, company_admin)
    platform_approves(card, platform)
    live_drop = link_publish_and_create_live_drop(card, company_admin)
    code = create_code_for_card(company_admin, live_drop, card)
    assert_success(fan.post("/api/redemptions", json={"code": code, "source": "qr"}), 201)
    progression = assert_success(fan.get("/api/me/progression"))
    assert progression["totalXp"] >= 60
    assert any(item["status"] == "completed" for item in progression["achievements"])
```

- [ ] **Step 2: 테스트가 실패하는지 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_release_workflow.py backend/tests/contract/test_fan_growth.py backend/tests/contract/test_engagement_admin.py`

Expected: FAIL until the release and growth paths are both wired.

- [ ] **Step 3: 관리자 대시보드에 범위별 관측치를 추가한다.**

```python
growth_summary = {
    "activeAchievements": await scoped_count(AchievementDefinition, status="published"),
    "earnedXpToday": await scoped_xp_total_today(context),
    "claimableRewards": await scoped_unclaimed_reward_count(context),
}
```

집계는 조직과 아티스트 범위를 반드시 적용한다. 루트는 전체 합계를, 회사 관리자는 자기 조직의 합계만 본다. 개인 팬 식별 정보나 전체 팬 순위는 대시보드에 넣지 않는다.

- [ ] **Step 4: 통합 테스트와 정적 검사를 실행한다.**

Run: `backend/.venv/bin/pytest -q backend/tests/contract/test_card_release_workflow.py backend/tests/contract/test_fan_growth.py backend/tests/contract/test_engagement_admin.py backend/tests/contract/test_redemptions.py && node --test admin_app/tests/*.test.mjs && cd frontend && npm run build`

Expected: all PASS.

- [ ] **Step 5: 배포 환경에서 수동 E2E를 실행하고 보고서를 갱신한다.**

1. Artist Studio 계정으로 스페셜 카드를 제출한다.
2. 회사 관리자와 플랫폼 운영 관리자가 각각 승인한다.
3. 승인된 카드를 라이브 드롭에 연결하고 코드 배치를 만든다.
4. 팬 계정으로 QR을 한 번 등록하고 XP, 업적, 알림, 보상 수령, 칭호 장착을 확인한다.
5. 같은 QR 재시도와 보상 재수령 요청이 각각 409이며 XP가 증가하지 않는지 확인한다.
6. 다른 회사 관리자 계정에서 해당 업적·패스가 보이지 않는지 확인한다.

보고서에는 계정 비밀번호·토큰·원본 QR을 넣지 않는다. 생성한 QA 업적, 패스, 보상, 코드, 테스트 계정은 비활성화하거나 삭제 사유를 감사 로그에 남긴다.

- [ ] **Step 6: 커밋한다.**

```bash
git add backend/app/routers/admin.py backend/tests/contract/test_card_release_workflow.py backend/tests/contract/test_fan_growth.py backend/tests/contract/test_engagement_admin.py reports/e2e-release-scenario-2026-08-11/README.md
git commit -m "카드 공개부터 팬 성장 보상까지 검증한다"
```

## 계획 자체 검토

- 설계의 출시 선행 조건은 Task 1과 Task 9에 반영했다.
- 업적·XP·프로필 장착·무료 패스·조직 권한·관리자 UI·팬 UI·중복 방지는 Tasks 2–8에 각각 한 번씩 책임을 두었다.
- 유료 결제, 확률형 보상, 거래, 공개 랭킹은 어떤 API나 UI에도 포함하지 않았다.
- 이후 작업이 앞선 타입과 함수 이름을 재사용하도록 `engagement_events`, `reward_grants`, `xp_ledger`, `ProfileEquipmentUpdate`, `process_engagement_event`를 공통 계약으로 고정했다.
