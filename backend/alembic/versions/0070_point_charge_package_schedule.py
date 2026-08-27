"""add scheduled publication to point charge packages

Revision ID: 0070_point_charge_package_schedule
Revises: 0069_point_charge_packages
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0070_point_pkg_schedule"
down_revision: str | None = "0069_point_charge_packages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("point_charge_packages"):
        return
    columns = {column["name"] for column in inspector.get_columns("point_charge_packages")}
    if "scheduled_publish_at" not in columns:
        op.add_column(
            "point_charge_packages",
            sa.Column("scheduled_publish_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("point_charge_packages", "scheduled_publish_at")
