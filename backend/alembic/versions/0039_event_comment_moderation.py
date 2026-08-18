"""Add moderation state to event comments."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0039_event_comment_moderation"
down_revision: str | None = "0038_event_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("event_comments"):
        return
    columns = {column["name"] for column in inspector.get_columns("event_comments")}
    if "status" not in columns:
        op.add_column(
            "event_comments",
            sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        )
    indexes = {index["name"] for index in inspector.get_indexes("event_comments")}
    if "ix_event_comments_event_status_created" not in indexes:
        op.create_index(
            "ix_event_comments_event_status_created",
            "event_comments",
            ["event_id", "status", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("event_comments"):
        indexes = {index["name"] for index in inspector.get_indexes("event_comments")}
        if "ix_event_comments_event_status_created" in indexes:
            op.drop_index("ix_event_comments_event_status_created", table_name="event_comments")
        columns = {column["name"] for column in inspector.get_columns("event_comments")}
        if "status" in columns:
            op.drop_column("event_comments", "status")
