"""Persist optional email and push delivery attempts."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0059_notification_deliveries"
down_revision: str | None = "0058_engagement_event_retries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "notification_deliveries" in inspector.get_table_names():
        return
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("notification_id", sa.String(), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("destination", sa.String(length=4096), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint(
            "notification_id", "channel", "destination", name="uq_notification_delivery_target"
        ),
    )
    op.create_index(
        "ix_notification_deliveries_due", "notification_deliveries", ["status", "next_attempt_at"]
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "notification_deliveries" in inspector.get_table_names():
        op.drop_index("ix_notification_deliveries_due", table_name="notification_deliveries")
        op.drop_table("notification_deliveries")
