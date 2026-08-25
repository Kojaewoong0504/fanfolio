"""Add atomic point mutation records and refundable shop order state."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0053_point_transactions_and_shop_refunds"
down_revision: str | tuple[str, str] | None = "0052_shop_product_detail_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("point_transactions"):
        op.create_table(
            "point_transactions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("operation", sa.String(length=32), nullable=False),
            sa.Column("idempotency_key", sa.String(length=160), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column(
                "ledger_id", sa.String(), sa.ForeignKey("point_ledger.id", ondelete="SET NULL")
            ),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "operation IN ('charge', 'refund', 'adjustment')",
                name="ck_point_transactions_operation",
            ),
            sa.CheckConstraint(
                "status IN ('completed', 'failed')", name="ck_point_transactions_status"
            ),
            sa.UniqueConstraint(
                "user_id",
                "operation",
                "idempotency_key",
                name="uq_point_transactions_user_operation_key",
            ),
        )
        op.create_index(
            "ix_point_transactions_user_created",
            "point_transactions",
            ["user_id", "created_at"],
        )

    inspector = inspect(bind)
    shop_columns = _columns("shop_orders") if inspector.has_table("shop_orders") else set()
    if "idempotency_key" not in shop_columns:
        op.add_column("shop_orders", sa.Column("idempotency_key", sa.String(length=160)))
    if "point_ledger_id" not in shop_columns:
        op.add_column("shop_orders", sa.Column("point_ledger_id", sa.String(length=160)))
    if "point_event_id" not in shop_columns:
        op.add_column("shop_orders", sa.Column("point_event_id", sa.String(length=160)))
    if "refund_transaction_id" not in shop_columns:
        op.add_column("shop_orders", sa.Column("refund_transaction_id", sa.String(length=160)))
    if "refunded_at" not in shop_columns:
        op.add_column("shop_orders", sa.Column("refunded_at", sa.DateTime(timezone=True)))
    if inspector.has_table("shop_orders"):
        indexes = {index["name"] for index in inspect(bind).get_indexes("shop_orders")}
        if "uq_shop_orders_user_key" not in indexes:
            op.create_index(
                "uq_shop_orders_user_key",
                "shop_orders",
                ["user_id", "idempotency_key"],
                unique=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("shop_orders"):
        indexes = {index["name"] for index in inspect(bind).get_indexes("shop_orders")}
        if "uq_shop_orders_user_key" in indexes:
            op.drop_index("uq_shop_orders_user_key", table_name="shop_orders")
        bind.execute(sa.text("DROP INDEX IF EXISTS uq_shop_orders_user_key"))
        columns = _columns("shop_orders")
        removable = [
            name
            for name in (
                "refunded_at",
                "refund_transaction_id",
                "point_event_id",
                "point_ledger_id",
                "idempotency_key",
            )
            if name in columns
        ]
        if removable:
            with op.batch_alter_table("shop_orders") as batch_op:
                for name in removable:
                    batch_op.drop_column(name)
    if inspector.has_table("point_transactions"):
        op.drop_index("ix_point_transactions_user_created", table_name="point_transactions")
        op.drop_table("point_transactions")
