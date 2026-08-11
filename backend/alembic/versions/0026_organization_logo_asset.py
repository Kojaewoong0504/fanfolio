"""Add optional logo asset reference to organizations."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0026_organization_logo_asset"
down_revision: str | None = "0025_admin_partner_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("organizations"):
        return

    columns = {column["name"] for column in inspector.get_columns("organizations")}
    indexes = {index["name"] for index in inspector.get_indexes("organizations")}
    with op.batch_alter_table("organizations") as batch:
        if "logo_asset_id" not in columns:
            batch.add_column(sa.Column("logo_asset_id", sa.String(), nullable=True))
            batch.create_foreign_key(
                "fk_organizations_logo_asset_id_assets",
                "assets",
                ["logo_asset_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "ix_organizations_logo_asset_id" not in indexes:
            batch.create_index("ix_organizations_logo_asset_id", ["logo_asset_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("organizations"):
        return

    columns = {column["name"] for column in inspector.get_columns("organizations")}
    indexes = {index["name"] for index in inspector.get_indexes("organizations")}
    with op.batch_alter_table("organizations") as batch:
        if "ix_organizations_logo_asset_id" in indexes:
            batch.drop_index("ix_organizations_logo_asset_id")
        if "logo_asset_id" in columns:
            batch.drop_constraint("fk_organizations_logo_asset_id_assets", type_="foreignkey")
            batch.drop_column("logo_asset_id")
