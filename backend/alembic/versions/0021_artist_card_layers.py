"""Persist artist card design layers and optional motion media."""

import sqlalchemy as sa

from alembic import op

revision = "0021_artist_card_layers"
down_revision = "0020_artist_password_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("cards")}
    if "video_asset_id" not in columns:
        op.add_column("cards", sa.Column("video_asset_id", sa.String(), nullable=True))
    if "design_config" not in columns:
        op.add_column("cards", sa.Column("design_config", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("cards", "design_config")
    op.drop_column("cards", "video_asset_id")
