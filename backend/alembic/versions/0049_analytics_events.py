"""Add immutable analytics events for scoped administrator statistics."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0049_analytics_events"
down_revision: str | tuple[str, str] | None = "0048_fan_collection_targets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("analytics_events"):
        return
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("event_name", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "organization_id",
            sa.String(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
        ),
        sa.Column("artist_id", sa.String(), sa.ForeignKey("artists.id", ondelete="SET NULL")),
        sa.Column("card_id", sa.String(), sa.ForeignKey("cards.id", ondelete="SET NULL")),
        sa.Column("pack_id", sa.String(), sa.ForeignKey("card_packs.id", ondelete="SET NULL")),
        sa.Column("source", sa.String(length=40)),
        sa.Column("dedupe_key", sa.String(length=200)),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("dedupe_key", name="uq_analytics_events_dedupe_key"),
    )
    op.create_index(
        "ix_analytics_events_name_created", "analytics_events", ["event_name", "created_at"]
    )
    op.create_index(
        "ix_analytics_events_scope_created",
        "analytics_events",
        ["organization_id", "artist_id", "created_at"],
    )
    op.create_index(
        "ix_analytics_events_user_created", "analytics_events", ["user_id", "created_at"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("analytics_events"):
        return
    op.drop_index("ix_analytics_events_user_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_scope_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_name_created", table_name="analytics_events")
    op.drop_table("analytics_events")
