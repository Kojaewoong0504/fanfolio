import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import ApprovalRequest, PointBalance, TradeProposal
from tests.conftest import assert_error, assert_success


def test_fan_can_create_list_and_read_own_support_ticket(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    created = assert_success(
        fan.post(
            "/api/me/support-tickets",
            json={
                "category": "trade",
                "subject": "거래 제안이 보이지 않아요",
                "body": "거래 제안 목록에 방금 만든 거래가 없습니다.",
            },
        ),
        201,
    )

    ticket_id = created["id"]
    assert created["status"] == "open"
    assert created["messages"][0]["body"] == "거래 제안 목록에 방금 만든 거래가 없습니다."

    listed = assert_success(fan.get("/api/me/support-tickets"))
    assert [item["id"] for item in listed["items"]] == [ticket_id]

    detail = assert_success(fan.get(f"/api/me/support-tickets/{ticket_id}"))
    assert detail["id"] == ticket_id
    assert detail["messages"][0]["authorRole"] == "fan"


def test_admin_can_reply_and_transition_support_ticket(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    admin = actors["admin"]
    created = assert_success(
        fan.post(
            "/api/me/support-tickets",
            json={
                "category": "card",
                "subject": "카드 등록 문의",
                "body": "QR 등록이 실패했습니다.",
            },
        ),
        201,
    )
    ticket_id = created["id"]

    assert_success(
        admin.patch(
            f"/api/admin/support-tickets/{ticket_id}",
            json={"status": "in_progress"},
        )
    )
    replied = assert_success(
        admin.post(
            f"/api/admin/support-tickets/{ticket_id}/messages",
            json={"body": "카드 등록 상태를 확인해 주세요. 다시 시도할 수 있도록 안내드렸습니다."},
        ),
        201,
    )
    assert replied["status"] == "answered"
    assert replied["messages"][-1]["authorRole"] == "admin"

    queue = assert_success(admin.get("/api/admin/support-tickets?status=answered"))
    assert queue["items"][0]["id"] == ticket_id

    fan_detail = assert_success(fan.get(f"/api/me/support-tickets/{ticket_id}"))
    assert fan_detail["messages"][-1]["body"].startswith("카드 등록 상태")


def test_admin_support_status_requires_valid_transition(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["fan"].post(
            "/api/me/support-tickets",
            json={"category": "general", "subject": "상태 문의", "body": "상태를 확인해 주세요."},
        ),
        201,
    )
    ticket_id = created["id"]

    assert_error(
        actors["admin"].patch(
            f"/api/admin/support-tickets/{ticket_id}",
            json={"status": "answered"},
        ),
        409,
        "SUPPORT_TICKET_INVALID_TRANSITION",
    )
    assert_success(
        actors["admin"].patch(
            f"/api/admin/support-tickets/{ticket_id}",
            json={"status": "in_progress", "assignedAdminId": "admin"},
        )
    )
    assigned = assert_success(actors["admin"].get(f"/api/admin/support-tickets/{ticket_id}"))
    assert assigned["assignedAdminId"] == "admin"


def test_admin_case_actions_record_evidence_and_stage_dual_approval(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["fan"].post(
            "/api/me/support-tickets",
            json={"category": "order", "subject": "환불 검토", "body": "주문 환불을 요청합니다."},
        ),
        201,
    )
    ticket_id = created["id"]
    evidence = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{ticket_id}/actions",
            json={"action": "record_evidence", "referenceId": "order_1", "note": "주문 상태 확인"},
        ),
        201,
    )
    assert evidence["evidence"][0]["kind"] == "case_note"
    staged = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{ticket_id}/actions",
            json={"action": "refund_order", "referenceId": "order_1", "note": "환불 승인 필요"},
        ),
        201,
    )
    assert staged["evidence"][-1]["kind"] == "approval_requested"
    approvals = assert_success(actors["admin"].get("/api/admin/approvals"))
    assert approvals["items"][0]["status"] == "pending"
    assert_error(
        actors["admin"].post(
            f"/api/admin/approvals/{approvals['items'][0]['id']}/approve",
            json={},
        ),
        409,
        "APPROVAL_SELF_APPROVAL",
    )


def test_admin_cannot_hold_a_completed_trade_from_a_dispute_ticket(
    actors: dict[str, TestClient],
) -> None:
    ticket = assert_success(
        actors["fan"].post(
            "/api/me/support-tickets",
            json={
                "category": "report",
                "subject": "완료 거래 분쟁",
                "body": "완료 거래를 검토합니다.",
            },
        ),
        201,
    )
    proposal_id = f"completed_trade_{uuid4().hex[:8]}"

    async def seed_completed_trade() -> None:
        async with SessionLocal() as session:
            session.add(
                TradeProposal(
                    id=proposal_id,
                    proposer_id="fan",
                    recipient_id="otherFan",
                    status="accepted",
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                    responded_at=datetime.now(UTC),
                )
            )
            await session.commit()

    asyncio.run(seed_completed_trade())
    assert_error(
        actors["admin"].post(
            f"/api/admin/support-tickets/{ticket['id']}/actions",
            json={
                "action": "hold_trade",
                "referenceId": proposal_id,
                "note": "완료 거래 보류 시도",
            },
        ),
        409,
        "TRADE_NOT_PENDING",
    )


def test_admin_can_release_an_active_trade_hold(
    actors: dict[str, TestClient],
) -> None:
    ticket = assert_success(
        actors["fan"].post(
            "/api/me/support-tickets",
            json={
                "category": "report",
                "subject": "보류 해제",
                "body": "거래 보류 해제를 검토합니다.",
            },
        ),
        201,
    )
    proposal_id = f"pending_trade_{uuid4().hex[:8]}"

    async def seed_pending_trade() -> None:
        async with SessionLocal() as session:
            session.add(
                TradeProposal(
                    id=proposal_id,
                    proposer_id="fan",
                    recipient_id="otherFan",
                    status="pending",
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
            await session.commit()

    asyncio.run(seed_pending_trade())
    held = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{ticket['id']}/actions",
            json={"action": "hold_trade", "referenceId": proposal_id, "note": "검토 중"},
        ),
        201,
    )
    assert held["evidence"][-1]["kind"] == "trade_hold"
    released = assert_success(
        actors["admin"].post(
            f"/api/admin/support-tickets/{ticket['id']}/actions",
            json={"action": "release_trade", "referenceId": proposal_id, "note": "검토 완료"},
        ),
        201,
    )
    assert released["evidence"][-1]["kind"] == "trade_release"


def test_second_admin_approval_executes_point_adjustment(actors: dict[str, TestClient]) -> None:
    approval_id = f"approval_test_{uuid4().hex[:8]}"

    async def seed() -> None:
        async with SessionLocal() as session:
            session.add(
                ApprovalRequest(
                    id=approval_id,
                    kind="grant_points",
                    entity_type="user",
                    entity_id="fan",
                    requested_by="fan",
                    payload={"amount": 75},
                    reason="보상 지급 테스트",
                )
            )
            balance = await session.get(PointBalance, "fan")
            if balance is None:
                session.add(PointBalance(user_id="fan", balance=0))
            await session.commit()

    asyncio.run(seed())
    result = assert_success(
        actors["admin"].post(f"/api/admin/approvals/{approval_id}/approve", json={})
    )
    assert result["execution"]["amount"] == 75
    replay = assert_success(
        actors["admin"].post(f"/api/admin/approvals/{approval_id}/approve", json={})
    )
    assert replay.get("replayed") is True


def test_point_adjustment_request_requires_a_non_zero_amount(
    actors: dict[str, TestClient],
) -> None:
    created = assert_success(
        actors["fan"].post(
            "/api/me/support-tickets",
            json={
                "category": "report",
                "subject": "포인트 조정 검증",
                "body": "승인 금액 검증용 문의입니다.",
            },
        ),
        201,
    )

    assert_error(
        actors["admin"].post(
            f"/api/admin/support-tickets/{created['id']}/actions",
            json={
                "action": "grant_points",
                "referenceId": "fan",
                "note": "금액 누락 검증",
            },
        ),
        422,
        "INVALID_POINT_AMOUNT",
    )
