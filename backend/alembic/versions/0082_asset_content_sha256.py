"""Fingerprint uploaded assets for inference reuse."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0082_asset_content_sha256"
down_revision: str | None = "0081_spatial_scene_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("assets"):
        return
    columns = {column["name"] for column in inspector.get_columns("assets")}
    if "content_sha256" not in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.add_column(sa.Column("content_sha256", sa.String(length=64), nullable=True))
            batch_op.create_index("ix_assets_content_sha256", ["content_sha256"], unique=False)


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("assets"):
        return
    columns = {column["name"] for column in inspector.get_columns("assets")}
    if "content_sha256" in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.drop_index("ix_assets_content_sha256")
            batch_op.drop_column("content_sha256")
