"""Add event application state and public scheduling fields."""

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0036_event_applications"
down_revision = "0035_managed_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    event_columns = {column["name"] for column in inspector.get_columns("events")}
    for name, column in (
        ("venue", sa.Column("venue", sa.String(length=200), nullable=True)),
        ("participant_limit", sa.Column("participant_limit", sa.Integer(), nullable=True)),
        (
            "application_starts_at",
            sa.Column("application_starts_at", sa.DateTime(timezone=True), nullable=True),
        ),
        (
            "application_ends_at",
            sa.Column("application_ends_at", sa.DateTime(timezone=True), nullable=True),
        ),
    ):
        if name not in event_columns:
            op.add_column("events", column)

    if not inspector.has_table("event_applications"):
        op.create_table(
            "event_applications",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "event_id",
                sa.String(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(length=24), server_default="submitted", nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("event_id", "user_id", name="uq_event_applications_event_user"),
        )
    index_names = {index["name"] for index in inspect(bind).get_indexes("event_applications")}
    if "ix_event_applications_event_status" not in index_names:
        op.create_index(
            "ix_event_applications_event_status", "event_applications", ["event_id", "status"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("event_applications"):
        index_names = {index["name"] for index in inspector.get_indexes("event_applications")}
        if "ix_event_applications_event_status" in index_names:
            op.drop_index("ix_event_applications_event_status", table_name="event_applications")
        op.drop_table("event_applications")
    if inspector.has_table("events"):
        event_columns = {column["name"] for column in inspector.get_columns("events")}
        for name in ("application_ends_at", "application_starts_at", "participant_limit", "venue"):
            if name in event_columns:
                op.drop_column("events", name)
