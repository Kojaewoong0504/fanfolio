"""Add a durable production data-store identity marker."""

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0022_deployment_identity"
down_revision = "0021_artist_card_layers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 creates Base.metadata for a brand-new local database. Since this
    # table is now part of that metadata, it can already exist when Alembic
    # reaches 0022. Keep the migration safe for both old and fresh databases.
    if not inspect(op.get_bind()).has_table("deployment_identity"):
        op.create_table(
            "deployment_identity",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("key_digest", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("deployment_identity")
