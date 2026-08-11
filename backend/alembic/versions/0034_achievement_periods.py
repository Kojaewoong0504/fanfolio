"""Persist achievement availability periods."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import context, op

revision: str = "0034_achievement_periods"
down_revision: str | None = "0033_free_pass_seasons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column("achievement_definitions", sa.Column("starts_at", sa.DateTime(timezone=True)))
        op.add_column("achievement_definitions", sa.Column("ends_at", sa.DateTime(timezone=True)))
        return

    inspector = inspect(op.get_bind())
    if not inspector.has_table("achievement_definitions"):
        return
    columns = {column["name"] for column in inspector.get_columns("achievement_definitions")}
    with op.batch_alter_table("achievement_definitions") as batch:
        if "starts_at" not in columns:
            batch.add_column(sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
        if "ends_at" not in columns:
            batch.add_column(sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_column("achievement_definitions", "ends_at")
        op.drop_column("achievement_definitions", "starts_at")
        return

    inspector = inspect(op.get_bind())
    if not inspector.has_table("achievement_definitions"):
        return
    columns = {column["name"] for column in inspector.get_columns("achievement_definitions")}
    with op.batch_alter_table("achievement_definitions") as batch:
        if "ends_at" in columns:
            batch.drop_column("ends_at")
        if "starts_at" in columns:
            batch.drop_column("starts_at")
