"""Add tamper-evident hashes to ownership events."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0076_ownership_ledger_hash_chain"
down_revision: str | None = "0075_event_check_in"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    table = "card_ownership_ledger"
    if context.is_offline_mode():
        op.add_column(table, sa.Column("previous_hash", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("record_hash", sa.String(length=64), nullable=True))
        return
    if table not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}
    for name in ("previous_hash", "record_hash"):
        if name not in columns:
            op.add_column(table, sa.Column(name, sa.String(length=64), nullable=True))


def downgrade() -> None:
    table = "card_ownership_ledger"
    if context.is_offline_mode():
        op.drop_column(table, "record_hash")
        op.drop_column(table, "previous_hash")
        return
    if table not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}
    for name in ("record_hash", "previous_hash"):
        if name in columns:
            op.drop_column(table, name)
