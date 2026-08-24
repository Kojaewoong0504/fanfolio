"""Add sellable shop products and point purchase snapshots."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0051_shop_products_orders"
down_revision: str | tuple[str, str] | None = "0050_growth_missions_points"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shop_products",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "artist_id",
            sa.String(),
            sa.ForeignKey("artists.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("product_type", sa.String(length=32), nullable=False, server_default="card_pack"),
        sa.Column("card_pack_id", sa.String(), sa.ForeignKey("card_packs.id", ondelete="RESTRICT")),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000)),
        sa.Column("image_url", sa.String()),
        sa.Column("price_points", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "product_type IN ('card_pack', 'point_item', 'limited_item')",
            name="ck_shop_products_product_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')", name="ck_shop_products_status"
        ),
        sa.CheckConstraint("price_points > 0", name="ck_shop_products_price_points_positive"),
    )
    op.create_index("ix_shop_products_status_artist", "shop_products", ["status", "artist_id"])
    op.create_table(
        "shop_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "product_id",
            sa.String(),
            sa.ForeignKey("shop_products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("price_points", sa.Integer(), nullable=False),
        sa.Column("payment_method", sa.String(length=32), nullable=False, server_default="points"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("payment_method IN ('points')", name="ck_shop_orders_payment_method"),
        sa.CheckConstraint("status IN ('completed', 'failed')", name="ck_shop_orders_status"),
    )
    op.create_index("ix_shop_orders_user_created", "shop_orders", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_shop_orders_user_created", table_name="shop_orders")
    op.drop_table("shop_orders")
    op.drop_index("ix_shop_products_status_artist", table_name="shop_products")
    op.drop_table("shop_products")
