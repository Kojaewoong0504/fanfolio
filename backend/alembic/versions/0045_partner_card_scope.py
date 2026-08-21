"""Persist the partner organization that owns cards and card packs."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0045_partner_card_scope"
# Keep this migration independent from the uncommitted card-combination
# branch in the working tree; it must apply cleanly from the merged service
# baseline as well.
down_revision: str | None = "0043_card_ownership_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("cards"):
        columns = {column["name"] for column in inspector.get_columns("cards")}
        if "organization_id" not in columns:
            with op.batch_alter_table("cards", recreate="always") as batch:
                batch.add_column(
                    sa.Column(
                        "organization_id",
                        sa.String(),
                        sa.ForeignKey(
                            "organizations.id", name="fk_cards_organization_id_organizations"
                        ),
                        nullable=True,
                    )
                )

    if inspector.has_table("card_packs"):
        columns = {column["name"] for column in inspector.get_columns("card_packs")}
        if "organization_id" not in columns:
            with op.batch_alter_table("card_packs", recreate="always") as batch:
                batch.add_column(
                    sa.Column(
                        "organization_id",
                        sa.String(),
                        sa.ForeignKey(
                            "organizations.id", name="fk_card_packs_organization_id_organizations"
                        ),
                        nullable=True,
                    )
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("card_packs") and "organization_id" in {
        column["name"] for column in inspector.get_columns("card_packs")
    }:
        with op.batch_alter_table("card_packs", recreate="always") as batch:
            batch.drop_column("organization_id")
    if inspector.has_table("cards") and "organization_id" in {
        column["name"] for column in inspector.get_columns("cards")
    }:
        with op.batch_alter_table("cards", recreate="always") as batch:
            batch.drop_column("organization_id")
