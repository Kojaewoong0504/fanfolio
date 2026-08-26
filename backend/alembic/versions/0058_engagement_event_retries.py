"""Persist the next retry window and dead-letter timestamp."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0058_engagement_event_retries"
down_revision: str | None = "0057_push_devices"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "engagement_events" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("engagement_events")}
    if "next_attempt_at" not in columns:
        op.add_column(
            "engagement_events",
            sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "dead_lettered_at" not in columns:
        op.add_column(
            "engagement_events",
            sa.Column("dead_lettered_at", sa.DateTime(timezone=True), nullable=True),
        )
    indexes = {index["name"] for index in inspector.get_indexes("engagement_events")}
    if "ix_engagement_events_retry" not in indexes:
        op.create_index(
            "ix_engagement_events_retry",
            "engagement_events",
            ["status", "next_attempt_at"],
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "engagement_events" not in inspector.get_table_names():
        return
    indexes = {index["name"] for index in inspector.get_indexes("engagement_events")}
    if "ix_engagement_events_retry" in indexes:
        op.drop_index("ix_engagement_events_retry", table_name="engagement_events")
    columns = {column["name"] for column in inspector.get_columns("engagement_events")}
    if "dead_lettered_at" in columns:
        op.drop_column("engagement_events", "dead_lettered_at")
    if "next_attempt_at" in columns:
        op.drop_column("engagement_events", "next_attempt_at")
