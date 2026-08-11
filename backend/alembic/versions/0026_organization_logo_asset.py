"""Add optional logo asset reference to organizations."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0026_organization_logo_asset"
down_revision: str | None = "0025_admin_partner_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LOGO_ASSET_FK = "fk_organizations_logo_asset_id_assets"
LOGO_ASSET_INDEX = "ix_organizations_logo_asset_id"


def has_logo_asset_fk(foreign_keys: Sequence[dict]) -> bool:
    return any(
        foreign_key.get("constrained_columns") == ["logo_asset_id"]
        and foreign_key.get("referred_table") == "assets"
        and foreign_key.get("referred_columns") == ["id"]
        for foreign_key in foreign_keys
    )


def logo_asset_fk_name(foreign_keys: Sequence[dict]) -> str | None:
    for foreign_key in foreign_keys:
        if (
            foreign_key.get("constrained_columns") == ["logo_asset_id"]
            and foreign_key.get("referred_table") == "assets"
            and foreign_key.get("referred_columns") == ["id"]
        ):
            name = foreign_key.get("name")
            return name if isinstance(name, str) and name else None
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("organizations"):
        return

    columns = {column["name"] for column in inspector.get_columns("organizations")}
    indexes = {index["name"] for index in inspector.get_indexes("organizations")}
    has_fk = has_logo_asset_fk(inspector.get_foreign_keys("organizations"))
    with op.batch_alter_table("organizations") as batch:
        if "logo_asset_id" not in columns:
            batch.add_column(sa.Column("logo_asset_id", sa.String(), nullable=True))
        if not has_fk:
            batch.create_foreign_key(
                LOGO_ASSET_FK,
                "assets",
                ["logo_asset_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if LOGO_ASSET_INDEX not in indexes:
            batch.create_index(LOGO_ASSET_INDEX, ["logo_asset_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("organizations"):
        return

    columns = {column["name"] for column in inspector.get_columns("organizations")}
    indexes = {index["name"] for index in inspector.get_indexes("organizations")}
    foreign_keys = inspector.get_foreign_keys("organizations")
    fk_name = logo_asset_fk_name(foreign_keys)
    with op.batch_alter_table("organizations") as batch:
        if LOGO_ASSET_INDEX in indexes:
            batch.drop_index(LOGO_ASSET_INDEX)
        if fk_name and bind.dialect.name != "sqlite":
            batch.drop_constraint(fk_name, type_="foreignkey")
        if "logo_asset_id" in columns:
            batch.drop_column("logo_asset_id")
