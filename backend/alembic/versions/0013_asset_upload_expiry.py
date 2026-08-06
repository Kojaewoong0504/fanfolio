"""Persist the expiry of development upload URLs."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_asset_upload_expiry"
down_revision: str | None = "0012_collection_benefit_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("assets")}
    if "upload_expires_at" not in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.add_column(sa.Column("upload_expires_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("assets")}
    if "upload_expires_at" in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.drop_column("upload_expires_at")
