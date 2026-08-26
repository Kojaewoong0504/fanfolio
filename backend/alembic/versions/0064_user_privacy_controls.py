"""Add durable account-deletion state for privacy controls."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0064_user_privacy_controls"
down_revision: str | None = "0063_shop_order_refund_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users"):
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "deleted_at" not in columns:
        op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users"):
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "deleted_at" in columns:
        op.drop_column("users", "deleted_at")
