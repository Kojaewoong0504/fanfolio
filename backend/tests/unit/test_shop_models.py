from app.models import ShopOrder, ShopProduct


def test_shop_models_expose_catalog_and_order_snapshot_fields() -> None:
    product_columns = ShopProduct.__table__.c
    order_columns = ShopOrder.__table__.c

    assert {"artist_id", "card_pack_id", "price_points", "status"} <= set(product_columns.keys())
    assert "detail_content" in product_columns
    assert {"user_id", "product_id", "product_name", "price_points", "status"} <= set(
        order_columns.keys()
    )
