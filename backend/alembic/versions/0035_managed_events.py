"""Add managed editorial fan events.

Application-specific scheduling fields are added by the following revision.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import context, op

revision: str = "0035_managed_events"
down_revision: str | None = "0034_achievement_periods"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        _create_events()
        return
    inspector = inspect(op.get_bind())
    if not inspector.has_table("events"):
        _create_events()


def _create_events() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("artist_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("summary", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=5000), nullable=False, server_default=""),
        sa.Column("hero_asset_id", sa.String(), nullable=False),
        sa.Column(
            "event_type", sa.String(length=32), nullable=False, server_default="announcement"
        ),
        sa.Column("workflow_status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cta_label", sa.String(length=80), nullable=True),
        sa.Column("drop_id", sa.String(), nullable=True),
        sa.Column("card_id", sa.String(), nullable=True),
        sa.Column("achievement_id", sa.String(), nullable=True),
        sa.Column("external_url", sa.String(length=2048), nullable=True),
        sa.Column("review_note", sa.String(length=500), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["hero_asset_id"], ["assets.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["drop_id"], ["drops.id"]),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"]),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievement_definitions.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
    )
    op.create_index(
        "ix_events_workflow_status_starts_at", "events", ["workflow_status", "starts_at"]
    )
    op.create_index(
        "ix_events_artist_workflow_starts", "events", ["artist_id", "workflow_status", "starts_at"]
    )
    op.create_index("ix_events_featured_priority", "events", ["featured", "priority"])


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_table("events")
        return
    inspector = inspect(op.get_bind())
    if inspector.has_table("events"):
        op.drop_index("ix_events_featured_priority", table_name="events")
        op.drop_index("ix_events_artist_workflow_starts", table_name="events")
        op.drop_index("ix_events_workflow_status_starts_at", table_name="events")
        op.drop_table("events")
