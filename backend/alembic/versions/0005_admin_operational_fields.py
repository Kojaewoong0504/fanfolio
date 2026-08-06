"""Add operational state fields for assets and redeem codes."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_admin_operational_fields"
down_revision: str | None = "0004_catalog_artist_member"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    asset_columns = {column["name"] for column in inspector.get_columns("assets")}
    if "transform" not in asset_columns:
        op.add_column("assets", sa.Column("transform", sa.JSON(), nullable=True))
    code_columns = {column["name"] for column in inspector.get_columns("redeem_codes")}
    if "disabled_at" not in code_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "disabled_at" in {column["name"] for column in inspector.get_columns("redeem_codes")}:
        op.drop_column("redeem_codes", "disabled_at")
    if "transform" in {column["name"] for column in inspector.get_columns("assets")}:
        op.drop_column("assets", "transform")
