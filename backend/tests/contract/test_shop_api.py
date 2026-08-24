import asyncio

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import CardPack, PointBalance, ShopProduct


def test_shop_catalog_route_is_registered(actors: dict[str, TestClient]) -> None:
    response = actors["fan"].get("/api/catalog/shop/products")
    assert response.status_code != 404


def test_admin_shop_product_route_is_registered(actors: dict[str, TestClient]) -> None:
    response = actors["admin"].get("/api/admin/shop/products")
    assert response.status_code != 404


def _seed_sellable_product() -> None:
    async def seed() -> None:
        async with SessionLocal() as session:
            pack = CardPack(
                id="test_shop_pack",
                artist_id="artist_nova3",
                name="Test Shop Pack",
                version="v1.0",
                status="published",
            )
            session.add(pack)
            session.add(
                ShopProduct(
                    id="test_shop_product",
                    artist_id="artist_nova3",
                    product_type="card_pack",
                    card_pack_id=pack.id,
                    name="Test Shop Product",
                    description="상품 테스트",
                    price_points=1200,
                    status="published",
                )
            )
            session.add(PointBalance(user_id="fan", balance=2000))
            await session.commit()

    asyncio.run(seed())


def test_fan_can_list_and_purchase_published_shop_product(actors: dict[str, TestClient]) -> None:
    _seed_sellable_product()

    catalog = actors["fan"].get("/api/catalog/shop/products")
    assert catalog.status_code == 200, catalog.text
    assert catalog.json()["data"]["items"][0]["id"] == "test_shop_product"

    order = actors["fan"].post(
        "/api/me/shop/orders",
        json={"productId": "test_shop_product", "paymentMethod": "points"},
    )
    assert order.status_code == 201, order.text
    assert order.json()["data"]["status"] == "completed"

    history = actors["fan"].get("/api/me/shop/orders")
    assert history.status_code == 200, history.text
    assert history.json()["data"]["items"][0]["productId"] == "test_shop_product"
