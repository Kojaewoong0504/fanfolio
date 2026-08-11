"""Mark pass seasons as free-only by default."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import context, op

revision: str = "0033_free_pass_seasons"
down_revision: str | None = "0032_fan_reward_claims"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column(
            "pass_seasons",
            sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
        return

    inspector = inspect(op.get_bind())
    if not inspector.has_table("pass_seasons"):
        return
    columns = {column["name"] for column in inspector.get_columns("pass_seasons")}
    if "is_paid" not in columns:
        op.add_column(
            "pass_seasons",
            sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_column("pass_seasons", "is_paid")
        return

    inspector = inspect(op.get_bind())
    if not inspector.has_table("pass_seasons"):
        return
    columns = {column["name"] for column in inspector.get_columns("pass_seasons")}
    if "is_paid" in columns:
        with op.batch_alter_table("pass_seasons") as batch:
            batch.drop_column("is_paid")
