"""Add support tickets and conversation messages."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0060_support_tickets"
down_revision: str | None = "0059_notification_deliveries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = inspector.get_table_names()
    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("category", sa.String(length=20), nullable=False),
            sa.Column("subject", sa.String(length=160), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("assigned_admin_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint(
                "category IN ('general', 'card', 'trade', 'order', 'report')",
                name="ck_support_tickets_category",
            ),
            sa.CheckConstraint(
                "status IN ('open', 'in_progress', 'answered', 'closed')",
                name="ck_support_tickets_status",
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["assigned_admin_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_support_tickets_user_created", "support_tickets", ["user_id", "created_at"]
        )
        op.create_index(
            "ix_support_tickets_status_updated", "support_tickets", ["status", "updated_at"]
        )
    if "support_messages" not in tables:
        op.create_table(
            "support_messages",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("ticket_id", sa.String(), nullable=False),
            sa.Column("author_user_id", sa.String(), nullable=False),
            sa.Column("body", sa.String(length=4000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_support_messages_ticket_created", "support_messages", ["ticket_id", "created_at"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = inspector.get_table_names()
    if "support_messages" in tables:
        op.drop_index("ix_support_messages_ticket_created", table_name="support_messages")
        op.drop_table("support_messages")
    if "support_tickets" in tables:
        op.drop_index("ix_support_tickets_status_updated", table_name="support_tickets")
        op.drop_index("ix_support_tickets_user_created", table_name="support_tickets")
        op.drop_table("support_tickets")
