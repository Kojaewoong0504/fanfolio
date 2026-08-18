"""Store season pass descriptions."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0041_pass_season_description"
down_revision: str | None = "0040_unique_fan_nicknames"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("pass_seasons")}
    if "description" not in columns:
        op.add_column("pass_seasons", sa.Column("description", sa.String(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("pass_seasons")}
    if "description" in columns:
        op.drop_column("pass_seasons", "description")
