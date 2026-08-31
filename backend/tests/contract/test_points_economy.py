import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import (
    CardPack,
    PointBalance,
    PointLedger,
    PointTransaction,
    RewardCatalog,
    RewardGrant,
    ShopOrder,
    ShopOrderEntitlement,
    ShopProduct,
)
from tests.conftest import assert_success


def _seed_sellable_product() -> None:
    async def seed() -> None:
        async with SessionLocal() as session:
            pack = CardPack(
                id="economy_pack",
                artist_id="artist_nova3",
                name="Economy Pack",
                version="v1.0",
                status="published",
            )
            session.add(pack)
            session.add(
                ShopProduct(
                    id="economy_product",
                    artist_id="artist_nova3",
                    product_type="card_pack",
                    card_pack_id=pack.id,
                    name="Economy Product",
                    description="원자성 테스트 상품",
                    price_points=1200,
                    status="published",
                )
            )
            session.add(PointBalance(user_id="fan", balance=2000))
            await session.commit()

    asyncio.run(seed())


def test_admin_point_charge_is_idempotent_and_append_only(
    actors: dict[str, TestClient],
) -> None:
    payload = {
        "userId": "fan",
        "amount": 500,
        "reason": "로컬 포인트 지급",
        "idempotencyKey": "charge-economy-001",
    }
    first = assert_success(
        actors["admin"].post("/api/admin/engagement/points/adjustments", json=payload)
    )
    replay = assert_success(
        actors["admin"].post("/api/admin/engagement/points/adjustments", json=payload)
    )

    assert first["balance"] == 500
    assert replay["balance"] == 500

    async def read_rows() -> tuple[int, int, int]:
        async with SessionLocal() as session:
            transactions = await session.scalar(
                select(func.count())
                .select_from(PointTransaction)
                .where(
                    PointTransaction.user_id == "fan",
                    PointTransaction.idempotency_key == "charge-economy-001",
                )
            )
            ledger_count = await session.scalar(
                select(func.count()).select_from(PointLedger).where(PointLedger.user_id == "fan")
            )
            balance = await session.scalar(
                select(PointBalance.balance).where(PointBalance.user_id == "fan")
            )
            return int(transactions or 0), int(ledger_count or 0), int(balance or 0)

    assert asyncio.run(read_rows()) == (1, 1, 500)


def test_shop_order_is_idempotent_and_refund_is_single_use(
    actors: dict[str, TestClient],
) -> None:
    _seed_sellable_product()
    headers = {"Idempotency-Key": "order-economy-001"}
    first = assert_success(
        actors["fan"].post(
            "/api/me/shop/orders",
            json={"productId": "economy_product", "paymentMethod": "points"},
            headers=headers,
        ),
        201,
    )
    replay = assert_success(
        actors["fan"].post(
            "/api/me/shop/orders",
            json={"productId": "economy_product", "paymentMethod": "points"},
            headers=headers,
        ),
        201,
    )
    assert replay["id"] == first["id"]

    points = assert_success(actors["fan"].get("/api/me/points"))
    assert points["balance"] == 800

    refund_headers = {"Idempotency-Key": "refund-economy-001"}
    refunded = assert_success(
        actors["fan"].post(
            f"/api/me/shop/orders/{first['id']}/refund",
            headers=refund_headers,
        ),
        201,
    )
    refund_replay = assert_success(
        actors["fan"].post(
            f"/api/me/shop/orders/{first['id']}/refund",
            headers=refund_headers,
        ),
        201,
    )
    assert refunded["balance"] == 2000
    assert refund_replay == refunded

    async def read_order() -> tuple[str, int, str]:
        async with SessionLocal() as session:
            order = await session.get(ShopOrder, first["id"])
            balance = await session.scalar(
                select(PointBalance.balance).where(PointBalance.user_id == "fan")
            )
            entitlement = await session.scalar(
                select(ShopOrderEntitlement).where(ShopOrderEntitlement.order_id == first["id"])
            )
            return order.status, int(balance or 0), entitlement.status

    assert asyncio.run(read_order()) == ("refunded", 2000, "revoked")


def test_idempotency_key_rejects_changed_point_command_payload(
    actors: dict[str, TestClient],
) -> None:
    payload = {
        "userId": "fan",
        "amount": 500,
        "reason": "첫 지급",
        "idempotencyKey": "conflict-economy-001",
    }
    assert_success(actors["admin"].post("/api/admin/engagement/points/adjustments", json=payload))
    changed = {**payload, "amount": 700}
    response = actors["admin"].post("/api/admin/engagement/points/adjustments", json=changed)
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


def test_concurrent_point_charge_retries_create_one_charge(
    actors: dict[str, TestClient],
) -> None:
    def charge() -> Any:
        return actors["fan"].post(
            "/api/me/point-charges",
            json={"packageId": "points_500", "paymentMethod": "sandbox_card"},
            headers={"Idempotency-Key": "concurrent-charge-001"},
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(lambda _: charge(), range(8)))

    assert {response.status_code for response in responses} == {201}
    body = [response.json()["data"] for response in responses]
    assert len({item["chargeId"] for item in body}) == 1
    assert sum(item["replayed"] is False for item in body) == 1


def test_idempotency_key_rejects_changed_shop_order_resource(
    actors: dict[str, TestClient],
) -> None:
    _seed_sellable_product()
    headers = {"Idempotency-Key": "conflict-order-001"}
    assert_success(
        actors["fan"].post(
            "/api/me/shop/orders",
            json={"productId": "economy_product", "paymentMethod": "points"},
            headers=headers,
        ),
        201,
    )
    changed = actors["fan"].post(
        "/api/me/shop/orders",
        json={"productId": "missing-product", "paymentMethod": "points"},
        headers=headers,
    )
    assert changed.status_code == 409, changed.text
    assert changed.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


def test_non_pg_reward_product_is_fulfilled_atomically(actors: dict[str, TestClient]) -> None:
    async def seed() -> None:
        async with SessionLocal() as session:
            session.add(
                RewardCatalog(
                    id="reward_profile_frame",
                    reward_type="profile_frame",
                    name="Nebula Frame",
                    status="published",
                )
            )
            session.add(
                ShopProduct(
                    id="frame_product",
                    artist_id="artist_nova3",
                    product_type="point_item",
                    name="Nebula 프로필 프레임",
                    fulfillment={"rewardId": "reward_profile_frame"},
                    price_points=400,
                    status="published",
                )
            )
            session.add(PointBalance(user_id="fan", balance=1000))
            await session.commit()

    asyncio.run(seed())
    response = assert_success(
        actors["fan"].post(
            "/api/me/shop/orders",
            json={"productId": "frame_product", "paymentMethod": "points"},
            headers={"Idempotency-Key": "frame-order-001"},
        ),
        201,
    )

    async def read_rows() -> tuple[int, int, int, bool]:
        async with SessionLocal() as session:
            grant = await session.scalar(
                select(RewardGrant).where(
                    RewardGrant.user_id == "fan",
                    RewardGrant.rule_key == f"shop_order:{response['id']}",
                )
            )
            balance = await session.scalar(
                select(PointBalance.balance).where(PointBalance.user_id == "fan")
            )
            orders = await session.scalar(
                select(func.count()).select_from(ShopOrder).where(ShopOrder.id == response["id"])
            )
            return (
                int(grant is not None),
                int(balance or 0),
                int(orders or 0),
                bool(grant and grant.revoked_at is None),
            )

    assert asyncio.run(read_rows()) == (1, 600, 1, True)

    refund = assert_success(
        actors["fan"].post(
            f"/api/me/shop/orders/{response['id']}/refund",
            headers={"Idempotency-Key": "frame-refund-001"},
        ),
        201,
    )
    assert refund["balance"] == 1000

    async def read_revoked_grant() -> tuple[str, int]:
        async with SessionLocal() as session:
            grant = await session.scalar(
                select(RewardGrant).where(RewardGrant.rule_key == f"shop_order:{response['id']}")
            )
            balance = await session.scalar(
                select(PointBalance.balance).where(PointBalance.user_id == "fan")
            )
            return ("revoked" if grant and grant.revoked_at else "active", int(balance or 0))

    assert asyncio.run(read_revoked_grant()) == ("revoked", 1000)
