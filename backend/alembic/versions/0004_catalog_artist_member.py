"""Add catalog artist/member entities and the card member relation."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0004_catalog_artist_member"
down_revision: str | None = "0003_notification_email_prefs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("artists"):
        op.create_table(
            "artists",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("members"):
        op.create_table(
            "members",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("artist_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    card_columns = {column["name"] for column in inspect(bind).get_columns("cards")}
    if "member_id" not in card_columns:
        op.add_column(
            "cards",
            sa.Column("member_id", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    card_columns = {column["name"] for column in inspect(bind).get_columns("cards")}
    if "member_id" in card_columns:
        op.drop_column("cards", "member_id")
    inspector = inspect(bind)
    if inspector.has_table("members"):
        op.drop_table("members")
    if inspector.has_table("artists"):
        op.drop_table("artists")
