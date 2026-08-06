"""Persist the drop that issued a fan's card."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_user_card_drop"
down_revision: str | None = "0008_user_card_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "drop_id" not in columns:
        op.add_column(
            "user_cards",
            sa.Column("drop_id", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "drop_id" in columns:
        op.drop_column("user_cards", "drop_id")
