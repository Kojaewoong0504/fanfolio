"""Store editable shop product detail content blocks."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0052_shop_product_detail_content"
down_revision: str | tuple[str, str] | None = "0051_shop_products_orders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("shop_products")}
    if "detail_content" not in columns:
        op.add_column(
            "shop_products",
            sa.Column("detail_content", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("shop_products")}
    if "detail_content" in columns:
        op.drop_column("shop_products", "detail_content")
