import asyncio

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
