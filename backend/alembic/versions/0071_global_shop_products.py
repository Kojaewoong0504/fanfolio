"""Allow storefront products without an artist scope."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0071_global_shop_products"
down_revision: str | None = "0070_point_pkg_schedule"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # Older partial-upgrade fixtures may contain the shop table before the
    # catalog tables it references. Leave that legacy shape untouched; the
    # normal upgrade path will run this migration once the catalog exists.
    if not inspector.has_table("shop_products") or not inspector.has_table("artists"):
        return
    columns = {column["name"]: column for column in inspector.get_columns("shop_products")}
    if columns.get("artist_id", {}).get("nullable") is False:
        with op.batch_alter_table("shop_products") as batch:
            batch.alter_column("artist_id", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("shop_products") or not inspector.has_table("artists"):
        return
    if inspector.get_columns("shop_products"):
        with op.batch_alter_table("shop_products") as batch:
            batch.alter_column("artist_id", existing_type=sa.String(), nullable=False)
