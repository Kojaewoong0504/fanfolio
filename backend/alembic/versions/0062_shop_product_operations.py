"""Add product inventory, schedule, exposure, and segment controls.

Revision ID: 0062_shop_product_operations
Revises: 0061_operations_case_controls
"""

import sqlalchemy as sa

from alembic import op

revision = "0062_shop_product_operations"
down_revision = "0061_operations_case_controls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("shop_products")}
    additions = {
        "inventory_limit": sa.Column("inventory_limit", sa.Integer(), nullable=True),
        "sold_count": sa.Column("sold_count", sa.Integer(), nullable=False, server_default="0"),
        "per_user_limit": sa.Column("per_user_limit", sa.Integer(), nullable=True),
        "scheduled_publish_at": sa.Column(
            "scheduled_publish_at", sa.DateTime(timezone=True), nullable=True
        ),
        "exposure_slot": sa.Column(
            "exposure_slot", sa.String(length=40), nullable=False, server_default="shop"
        ),
        "fan_segment": sa.Column(
            "fan_segment", sa.JSON(), nullable=False, server_default=sa.text("'{}'")
        ),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("shop_products", column)


def downgrade() -> None:
    for name in (
        "fan_segment",
        "exposure_slot",
        "scheduled_publish_at",
        "per_user_limit",
        "sold_count",
        "inventory_limit",
    ):
        op.drop_column("shop_products", name)
