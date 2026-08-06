"""Add structured notifications and audit events."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0002_events_and_notifications"
down_revision: str | None = "0001_schema_and_drop_metadata"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("entity_type", sa.String(), nullable=False),
            sa.Column("entity_id", sa.String(), nullable=False),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    notification_columns = {column["name"] for column in inspector.get_columns("notifications")}
    if "kind" not in notification_columns:
        op.add_column(
            "notifications",
            sa.Column("kind", sa.String(), nullable=False, server_default="system"),
        )
    if "title" not in notification_columns:
        op.add_column(
            "notifications",
            sa.Column("title", sa.String(), nullable=False, server_default="Fanfolio 알림"),
        )
    if "body" not in notification_columns:
        op.add_column("notifications", sa.Column("body", sa.String(), nullable=True))
    if "created_at" not in notification_columns:
        op.add_column(
            "notifications",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("audit_logs"):
        op.drop_table("audit_logs")
    notification_columns = {column["name"] for column in inspect(bind).get_columns("notifications")}
    with op.batch_alter_table("notifications") as batch:
        for column in ("created_at", "body", "title", "kind"):
            if column in notification_columns:
                batch.drop_column(column)
