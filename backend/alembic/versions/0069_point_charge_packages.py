"""admin-managed point charge packages

Revision ID: 0069_point_charge_packages
Revises: 0068_point_charge_flow
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0069_point_charge_packages"
down_revision: str | None = "0068_point_charge_flow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("point_charge_packages"):
        return

    op.create_table(
        "point_charge_packages",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("price_won", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("points > 0", name="ck_point_charge_packages_points_positive"),
        sa.CheckConstraint("price_won > 0", name="ck_point_charge_packages_price_positive"),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name="ck_point_charge_packages_status"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_point_charge_packages_status_sort",
        "point_charge_packages",
        ["status", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_point_charge_packages_status_sort", table_name="point_charge_packages")
    op.drop_table("point_charge_packages")
