"""Persist asynchronous spatial scene generation requests."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0081_spatial_scene_jobs"
down_revision: str | None = "0080_event_likes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if inspect(op.get_bind()).has_table("spatial_scene_jobs"):
        return
    op.create_table(
        "spatial_scene_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("asset_id", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("generation_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("phase", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "idempotency_key", name="uq_spatial_scene_owner_key"),
    )
    op.create_index(
        "ix_spatial_scene_jobs_due", "spatial_scene_jobs", ["status", "next_attempt_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_spatial_scene_jobs_due", table_name="spatial_scene_jobs")
    op.drop_table("spatial_scene_jobs")
