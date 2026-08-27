"""Add point charge purchase records."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0068_point_charge_flow"
down_revision: str | None = "0067_paid_season_pass"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("point_charges"):
        return
    op.create_table(
        "point_charges",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("package_id", sa.String(length=80), nullable=False),
        sa.Column("payment_method", sa.String(length=40), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("price_won", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="completed"),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("ledger_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ledger_id"], ["point_ledger.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_point_charges_user_key"),
        sa.CheckConstraint(
            "status IN ('completed', 'refunded', 'failed', 'cancelled')",
            name="ck_point_charges_status",
        ),
    )
    op.create_index("ix_point_charges_user_created", "point_charges", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_point_charges_user_created", table_name="point_charges")
    op.drop_table("point_charges")
