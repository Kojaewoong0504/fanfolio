"""Create the current schema and add metadata to legacy drops tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op
from app.models import Base

revision: str = "0001_schema_and_drop_metadata"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    # This also makes `alembic upgrade head` useful for a brand-new local DB.
    Base.metadata.create_all(bind=bind)
    columns = {column["name"] for column in inspect(bind).get_columns("drops")}
    if "name" not in columns:
        op.add_column(
            "drops",
            sa.Column("name", sa.String(), nullable=False, server_default="이름 없는 드롭"),
        )
    if "starts_at" not in columns:
        op.add_column("drops", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
    if "ends_at" not in columns:
        op.add_column("drops", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("drops"):
        return
    columns = {column["name"] for column in inspect(bind).get_columns("drops")}
    with op.batch_alter_table("drops") as batch:
        for column in ("ends_at", "starts_at", "name"):
            if column in columns:
                batch.drop_column(column)
