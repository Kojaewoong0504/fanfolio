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


def test_admin_can_manage_point_charge_packages_and_monitor_charges(
    actors: dict[str, TestClient],
) -> None:
    packages = actors["admin"].get("/api/admin/point-charge-packages")
    assert packages.status_code == 200, packages.text
    assert packages.json()["data"]["items"]

    created = actors["admin"].post(
        "/api/admin/point-charge-packages",
        json={
            "id": "points_test",
            "points": 750,
            "priceWon": 7000,
            "label": "750P",
            "scheduledPublishAt": "2999-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["data"]["points"] == 750
    assert created.json()["data"]["scheduledPublishAt"].startswith("2999-01-01")
    fan_catalog = actors["fan"].get("/api/catalog/point-charges")
    assert fan_catalog.status_code == 200, fan_catalog.text
    assert "points_test" not in {item["id"] for item in fan_catalog.json()["data"]["items"]}
    scheduled_charge = actors["fan"].post(
        "/api/me/point-charges",
        json={"packageId": "points_test", "paymentMethod": "sandbox_card"},
        headers={"Idempotency-Key": "scheduled-point-package"},
    )
    assert scheduled_charge.status_code == 409, scheduled_charge.text
    assert scheduled_charge.json()["error"]["code"] == "POINT_PACKAGE_NOT_PUBLISHED"

    updated = actors["admin"].patch(
        "/api/admin/point-charge-packages/points_test",
        json={"priceWon": 6500, "points": 800, "label": "800P", "status": "inactive"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["points"] == 800
    assert updated.json()["data"]["priceWon"] == 6500
    assert updated.json()["data"]["label"] == "800P"
    assert updated.json()["data"]["status"] == "inactive"

    inactive_charge = actors["fan"].post(
        "/api/me/point-charges",
        json={"packageId": "points_test", "paymentMethod": "sandbox_card"},
        headers={"Idempotency-Key": "inactive-point-package"},
    )
    assert inactive_charge.status_code == 409, inactive_charge.text

    charge_history = actors["admin"].get("/api/admin/point-charges")
    assert charge_history.status_code == 200, charge_history.text
    assert "items" in charge_history.json()["data"]


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
