"""Persist the concrete drop selected for an approved card release."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0030_card_drop_link"
down_revision: str | None = "0029_card_release_workflow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("cards"):
        return
    columns = {column["name"] for column in inspector.get_columns("cards")}
    if "drop_id" not in columns:
        with op.batch_alter_table("cards") as batch:
            batch.add_column(sa.Column("drop_id", sa.String(), nullable=True))


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("cards"):
        return
    columns = {column["name"] for column in inspector.get_columns("cards")}
    if "drop_id" in columns:
        with op.batch_alter_table("cards") as batch:
            batch.drop_column("drop_id")
