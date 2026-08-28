"""Store report targets separately from the reporting fan.

Revision ID: 0073_support_report_targets
Revises: 0072_consent_history
"""

import sqlalchemy as sa

from alembic import op

revision = "0073_support_report_targets"
down_revision = "0072_consent_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "support_tickets" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("support_tickets")}
    if "target_type" not in columns:
        op.add_column(
            "support_tickets", sa.Column("target_type", sa.String(length=20), nullable=True)
        )
    if "target_id" not in columns:
        op.add_column(
            "support_tickets", sa.Column("target_id", sa.String(length=160), nullable=True)
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "support_tickets" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("support_tickets")}
    if "target_id" in columns:
        op.drop_column("support_tickets", "target_id")
    if "target_type" in columns:
        op.drop_column("support_tickets", "target_type")
