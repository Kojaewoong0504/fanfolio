"""Store an append-only history of user consent choices."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0072_consent_history"
down_revision: str | None = "0071_global_shop_products"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("consent_records") or not inspector.has_table("users"):
        return
    op.create_table(
        "consent_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("policy_key", sa.String(length=32), nullable=False),
        sa.Column("policy_version", sa.String(length=64), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="settings"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "policy_key IN ('terms', 'privacy', 'marketing')",
            name="ck_consent_records_policy_key",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_consent_records_user_created", "consent_records", ["user_id", "created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("consent_records"):
        return
    op.drop_index("ix_consent_records_user_created", table_name="consent_records")
    op.drop_table("consent_records")
