"""Add server-backed fan wishlists and collection goals."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0048_fan_collection_targets"
down_revision: str | tuple[str, str] | None = "0047_studio_effect_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("fan_wishlist_items"):
        op.create_table(
            "fan_wishlist_items",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "card_id",
                sa.String(),
                sa.ForeignKey("cards.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "card_id", name="uq_fan_wishlist_user_card"),
        )
        op.create_index(
            "ix_fan_wishlist_user_created", "fan_wishlist_items", ["user_id", "created_at"]
        )

    if not inspector.has_table("collection_goals"):
        op.create_table(
            "collection_goals",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "pack_id",
                sa.String(),
                sa.ForeignKey("card_packs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("target_count", sa.Integer(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "pack_id", name="uq_collection_goals_user_pack"),
        )
        op.create_index(
            "ix_collection_goals_user_created", "collection_goals", ["user_id", "created_at"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("collection_goals"):
        op.drop_index("ix_collection_goals_user_created", table_name="collection_goals")
        op.drop_table("collection_goals")
    if inspector.has_table("fan_wishlist_items"):
        op.drop_index("ix_fan_wishlist_user_created", table_name="fan_wishlist_items")
        op.drop_table("fan_wishlist_items")
