"""Add a shared publication calendar for cards, events, and products."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0065_content_calendar"
down_revision: str | None = "0064_user_privacy_controls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("content_calendar_entries"):
        return
    op.create_table(
        "content_calendar_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("content_id", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_content_calendar_content_window",
        "content_calendar_entries",
        ["content_type", "content_id", "starts_at", "ends_at"],
    )
    op.create_index("ix_content_calendar_starts_at", "content_calendar_entries", ["starts_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("content_calendar_entries"):
        return
    op.drop_index("ix_content_calendar_starts_at", table_name="content_calendar_entries")
    op.drop_index("ix_content_calendar_content_window", table_name="content_calendar_entries")
    op.drop_table("content_calendar_entries")
