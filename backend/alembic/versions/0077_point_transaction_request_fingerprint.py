"""Persist point mutation request identity for safe replay."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0077_point_tx_fingerprint"
down_revision: str | None = "0076_ownership_ledger_hash_chain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    table = "point_transactions"
    if context.is_offline_mode():
        op.add_column(table, sa.Column("resource_type", sa.String(length=40), nullable=True))
        op.add_column(table, sa.Column("resource_id", sa.String(length=160), nullable=True))
        op.add_column(table, sa.Column("request_hash", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("response_snapshot", sa.JSON(), nullable=True))
        return
    if table not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}
    additions = {
        "resource_type": sa.Column("resource_type", sa.String(length=40), nullable=True),
        "resource_id": sa.Column("resource_id", sa.String(length=160), nullable=True),
        "request_hash": sa.Column("request_hash", sa.String(length=64), nullable=True),
        "response_snapshot": sa.Column("response_snapshot", sa.JSON(), nullable=True),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column(table, column)


def downgrade() -> None:
    table = "point_transactions"
    if table not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}
    for name in ("response_snapshot", "request_hash", "resource_id", "resource_type"):
        if name in columns:
            op.drop_column(table, name)
