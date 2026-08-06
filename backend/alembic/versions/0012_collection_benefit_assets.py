"""Attach optional downloadable assets to collection campaigns."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_collection_benefit_assets"
down_revision: str | None = "0011_collection_benefit_claims"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("collection_campaigns")}
    if "benefit_asset_id" in columns:
        return
    op.add_column(
        "collection_campaigns",
        sa.Column("benefit_asset_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_collection_campaigns_benefit_asset_id",
        "collection_campaigns",
        "assets",
        ["benefit_asset_id"],
        ["id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("collection_campaigns")}
    if "benefit_asset_id" in columns:
        op.drop_constraint(
            "fk_collection_campaigns_benefit_asset_id",
            "collection_campaigns",
            type_="foreignkey",
        )
        op.drop_column("collection_campaigns", "benefit_asset_id")
