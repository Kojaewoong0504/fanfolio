"""Persist fan reward claim timestamps."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0032_fan_reward_claims"
down_revision: str | None = "0031_fan_growth_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("reward_grants"):
        return
    columns = {column["name"] for column in inspector.get_columns("reward_grants")}
    if "claimed_at" not in columns:
        with op.batch_alter_table("reward_grants") as batch:
            batch.add_column(sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("reward_grants"):
        return
    columns = {column["name"] for column in inspector.get_columns("reward_grants")}
    if "claimed_at" in columns:
        with op.batch_alter_table("reward_grants") as batch:
            batch.drop_column("claimed_at")
