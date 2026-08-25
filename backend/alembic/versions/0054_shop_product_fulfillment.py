"""Add durable reward fulfillment metadata for non-PG shop products."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0054_shop_product_fulfillment"
down_revision: str | tuple[str, str] | None = "0053_point_transactions_and_shop_refunds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "fulfillment" not in {
        column["name"] for column in inspect(op.get_bind()).get_columns("shop_products")
    }:
        op.add_column(
            "shop_products",
            sa.Column("fulfillment", sa.JSON(), nullable=False, server_default="{}"),
        )


def downgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("shop_products")}
    if "fulfillment" in columns:
        op.drop_column("shop_products", "fulfillment")
