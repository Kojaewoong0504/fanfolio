"""Add editable event notices and ordered related cards."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0037_event_detail_content"
down_revision: str | None = "0036_event_applications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "notice_items" not in {column["name"] for column in inspector.get_columns("events")}:
        op.add_column(
            "events", sa.Column("notice_items", sa.JSON(), nullable=False, server_default="[]")
        )
    if not inspector.has_table("event_related_cards"):
        op.create_table(
            "event_related_cards",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("event_id", "card_id", name="uq_event_related_cards_event_card"),
            sa.UniqueConstraint(
                "event_id", "position", name="uq_event_related_cards_event_position"
            ),
        )
        op.create_index(
            "ix_event_related_cards_event_position", "event_related_cards", ["event_id", "position"]
        )


def downgrade() -> None:
    op.drop_index("ix_event_related_cards_event_position", table_name="event_related_cards")
    op.drop_table("event_related_cards")
    op.drop_column("events", "notice_items")
