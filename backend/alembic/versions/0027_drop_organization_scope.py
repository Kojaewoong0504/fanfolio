"""Add company and artist ownership scope to drops."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0027_drop_organization_scope"
down_revision: str | None = "0026_organization_logo_asset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DROP_ORGANIZATION_FK = "fk_drops_organization_id_organizations"
DROP_ARTIST_FK = "fk_drops_artist_id_artists"
DROP_SCOPE_INDEX = "ix_drops_organization_artist_status"


def has_drop_fk(
    foreign_keys: Sequence[dict],
    constrained_column: str,
    referred_table: str,
) -> bool:
    return any(
        foreign_key.get("constrained_columns") == [constrained_column]
        and foreign_key.get("referred_table") == referred_table
        and foreign_key.get("referred_columns") == ["id"]
        for foreign_key in foreign_keys
    )


def drop_fk_name(
    foreign_keys: Sequence[dict],
    constrained_column: str,
    referred_table: str,
) -> str | None:
    for foreign_key in foreign_keys:
        if (
            foreign_key.get("constrained_columns") == [constrained_column]
            and foreign_key.get("referred_table") == referred_table
            and foreign_key.get("referred_columns") == ["id"]
        ):
            name = foreign_key.get("name")
            return name if isinstance(name, str) and name else None
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("drops"):
        return

    columns = {column["name"] for column in inspector.get_columns("drops")}
    indexes = {index["name"] for index in inspector.get_indexes("drops")}
    foreign_keys = inspector.get_foreign_keys("drops")
    has_organization_fk = has_drop_fk(foreign_keys, "organization_id", "organizations")
    has_artist_fk = has_drop_fk(foreign_keys, "artist_id", "artists")

    with op.batch_alter_table("drops") as batch:
        if "organization_id" not in columns:
            batch.add_column(sa.Column("organization_id", sa.String(), nullable=True))
        if "artist_id" not in columns:
            batch.add_column(sa.Column("artist_id", sa.String(), nullable=True))
        if not has_organization_fk:
            batch.create_foreign_key(
                DROP_ORGANIZATION_FK,
                "organizations",
                ["organization_id"],
                ["id"],
            )
        if not has_artist_fk:
            batch.create_foreign_key(
                DROP_ARTIST_FK,
                "artists",
                ["artist_id"],
                ["id"],
            )
        if DROP_SCOPE_INDEX not in indexes:
            batch.create_index(
                DROP_SCOPE_INDEX,
                ["organization_id", "artist_id", "status"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("drops"):
        return

    columns = {column["name"] for column in inspector.get_columns("drops")}
    indexes = {index["name"] for index in inspector.get_indexes("drops")}
    foreign_keys = inspector.get_foreign_keys("drops")
    organization_fk_name = drop_fk_name(foreign_keys, "organization_id", "organizations")
    artist_fk_name = drop_fk_name(foreign_keys, "artist_id", "artists")

    with op.batch_alter_table("drops") as batch:
        if DROP_SCOPE_INDEX in indexes:
            batch.drop_index(DROP_SCOPE_INDEX)
        if artist_fk_name and bind.dialect.name != "sqlite":
            batch.drop_constraint(artist_fk_name, type_="foreignkey")
        if organization_fk_name and bind.dialect.name != "sqlite":
            batch.drop_constraint(organization_fk_name, type_="foreignkey")
        if "artist_id" in columns:
            batch.drop_column("artist_id")
        if "organization_id" in columns:
            batch.drop_column("organization_id")
