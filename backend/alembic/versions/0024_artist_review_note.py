"""Persist the latest artist note submitted with a card review request."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0024_artist_review_note"
down_revision: str | None = "0023_role_scoped_user_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cards"):
        return
    columns = {column["name"] for column in inspector.get_columns("cards")}
    if "review_note" in columns:
        return
    with op.batch_alter_table("cards") as batch:
        batch.add_column(sa.Column("review_note", sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cards"):
        return
    columns = {column["name"] for column in inspector.get_columns("cards")}
    if "review_note" not in columns:
        return
    with op.batch_alter_table("cards") as batch:
        batch.drop_column("review_note")
