"""Add card-pack use rights issued by point purchases."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0055_shop_order_entitlements"
down_revision: str | None = "0054_shop_product_fulfillment"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "shop_order_entitlements" not in inspector.get_table_names():
        op.create_table(
            "shop_order_entitlements",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("pack_id", sa.String(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
            sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["order_id"], ["shop_orders.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["pack_id"], ["card_packs.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("order_id", name="uq_shop_order_entitlements_order"),
            sa.CheckConstraint(
                "status IN ('available', 'opened', 'revoked')",
                name="ck_shop_order_entitlements_status",
            ),
        )
        op.create_index(
            "ix_shop_order_entitlements_user_pack",
            "shop_order_entitlements",
            ["user_id", "pack_id", "status"],
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "shop_order_entitlements" in inspector.get_table_names():
        op.drop_index("ix_shop_order_entitlements_user_pack", table_name="shop_order_entitlements")
        op.drop_table("shop_order_entitlements")
