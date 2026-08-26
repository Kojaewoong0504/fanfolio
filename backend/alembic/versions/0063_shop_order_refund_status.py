"""Allow persisted shop orders to transition to refunded."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0063_shop_order_refund_status"
down_revision: str | None = "0062_shop_product_operations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        return

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    # Some historical partial-schema fixtures contain shop_orders without its
    # referenced catalog tables. Batch reflection cannot safely rebuild those.
    if "shop_orders" not in tables or not {
        "users",
        "artists",
        "shop_products",
        "card_packs",
    }.issubset(tables):
        return

    with op.batch_alter_table("shop_orders", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_shop_orders_status", type_="check")
        batch_op.create_check_constraint(
            "ck_shop_orders_status",
            "status IN ('completed', 'failed', 'refunded')",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        return

    with op.batch_alter_table("shop_orders", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_shop_orders_status", type_="check")
        batch_op.create_check_constraint(
            "ck_shop_orders_status",
            "status IN ('completed', 'failed')",
        )
