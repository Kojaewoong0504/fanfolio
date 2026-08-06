"""Track completed uploads so abandoned objects can be cleaned safely."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_asset_upload_completion"
down_revision: str | None = "0013_asset_upload_expiry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("assets")}
    if "upload_completed_at" not in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.add_column(sa.Column("upload_completed_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("assets")}
    if "upload_completed_at" in columns:
        with op.batch_alter_table("assets") as batch_op:
            batch_op.drop_column("upload_completed_at")
