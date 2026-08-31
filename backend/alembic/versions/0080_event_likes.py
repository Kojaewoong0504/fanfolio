"""Persist fan likes for public events."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0080_event_likes"
down_revision: str | None = "0079_point_ledger_privileges"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The baseline migration uses Base.metadata.create_all(), so a brand-new
    # database may already contain this table before reaching this revision.
    if inspect(op.get_bind()).has_table("event_likes"):
        return
    op.create_table(
        "event_likes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "event_id", name="uq_event_likes_user_event"),
    )
    op.create_index("ix_event_likes_event_created", "event_likes", ["event_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_event_likes_event_created", table_name="event_likes")
    op.drop_table("event_likes")
