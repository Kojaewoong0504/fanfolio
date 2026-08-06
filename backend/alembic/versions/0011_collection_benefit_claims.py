"""Persist one-time collection benefit claims."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_collection_benefit_claims"
down_revision: str | None = "0010_collection_campaigns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "collection_benefit_claims" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "collection_benefit_claims",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["campaign_id"], ["collection_campaigns.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_collection_benefit_claim_user_campaign",
        "collection_benefit_claims",
        ["user_id", "campaign_id"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "collection_benefit_claims" in sa.inspect(bind).get_table_names():
        op.drop_index(
            "uq_collection_benefit_claim_user_campaign", table_name="collection_benefit_claims"
        )
        op.drop_table("collection_benefit_claims")
