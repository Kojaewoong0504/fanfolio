"""Add pack-opening idempotency fields for ownership issuance."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0043_card_ownership_ledger"
down_revision: str | None = "0042_card_packs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("card_pack_openings"):
        return
    columns = {column["name"] for column in inspector.get_columns("card_pack_openings")}
    if "user_card_id" not in columns:
        op.add_column("card_pack_openings", sa.Column("user_card_id", sa.String(), nullable=True))
    if "idempotency_key" not in columns:
        op.add_column(
            "card_pack_openings",
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        )
    indexes = {index["name"] for index in inspector.get_indexes("card_pack_openings")}
    if "uq_card_pack_openings_user_pack_key" not in indexes:
        op.create_index(
            "uq_card_pack_openings_user_pack_key",
            "card_pack_openings",
            ["user_id", "pack_id", "idempotency_key"],
            unique=True,
        )
    if not inspector.has_table("card_ownership_ledger"):
        op.create_table(
            "card_ownership_ledger",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_card_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("action", sa.String(length=32), nullable=False),
            sa.Column("source_type", sa.String(length=32), nullable=False),
            sa.Column("source_id", sa.String(length=128), nullable=False),
            sa.Column("from_user_id", sa.String(), nullable=True),
            sa.Column("to_user_id", sa.String(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_card_id"], ["user_cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "action",
                "source_type",
                "source_id",
                name="uq_card_ownership_ledger_event",
            ),
        )
    ledger_indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes("card_ownership_ledger")
    }
    if "ix_card_ownership_ledger_user_created" not in ledger_indexes:
        op.create_index(
            "ix_card_ownership_ledger_user_created",
            "card_ownership_ledger",
            ["user_id", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("card_pack_openings"):
        return
    indexes = {index["name"] for index in inspector.get_indexes("card_pack_openings")}
    if "uq_card_pack_openings_user_pack_key" in indexes:
        op.drop_index("uq_card_pack_openings_user_pack_key", table_name="card_pack_openings")
    columns = {column["name"] for column in inspector.get_columns("card_pack_openings")}
    if "idempotency_key" in columns:
        op.drop_column("card_pack_openings", "idempotency_key")
    if "user_card_id" in columns:
        op.drop_column("card_pack_openings", "user_card_id")
    if inspector.has_table("card_ownership_ledger"):
        op.drop_index("ix_card_ownership_ledger_user_created", table_name="card_ownership_ledger")
        op.drop_table("card_ownership_ledger")
