"""Add operator-configured collection completion campaigns."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_collection_campaigns"
down_revision: str | None = "0009_user_card_drop"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "collection_campaigns" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "collection_campaigns",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("artist_id", sa.String(), nullable=True),
        sa.Column("season_name", sa.String(), nullable=True),
        sa.Column("required_card_ids", sa.JSON(), nullable=False),
        sa.Column("benefit_title", sa.String(), nullable=False),
        sa.Column("benefit_description", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "collection_campaigns" in sa.inspect(bind).get_table_names():
        op.drop_table("collection_campaigns")
