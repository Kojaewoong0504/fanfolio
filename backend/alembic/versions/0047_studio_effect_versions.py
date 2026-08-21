"""Add versioned artist studio effect configurations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0047_studio_effect_versions"
down_revision: str | tuple[str, str] | None = "0046_social_card_trading"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("card_effect_versions"):
        op.create_table(
            "card_effect_versions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "card_id",
                sa.String(),
                sa.ForeignKey("cards.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("design_config", sa.JSON(), nullable=False),
            sa.Column(
                "author_user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("review_note", sa.String(length=500), nullable=True),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("card_id", "version", name="uq_card_effect_version"),
        )
        op.create_index(
            "ix_card_effect_versions_card_status",
            "card_effect_versions",
            ["card_id", "status"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("card_effect_versions"):
        op.drop_index("ix_card_effect_versions_card_status", table_name="card_effect_versions")
        op.drop_table("card_effect_versions")
