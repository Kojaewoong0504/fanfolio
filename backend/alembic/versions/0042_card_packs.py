"""Add versioned card packs and immutable pack opening records."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0042_card_packs"
down_revision: str | None = "0041_pass_season_description"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("card_packs"):
        op.create_table(
            "card_packs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("artist_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("season_name", sa.String(length=200), nullable=True),
            sa.Column("version", sa.String(length=32), nullable=False),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.Column("description", sa.String(length=1000), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "artist_id", "name", "version", name="uq_card_packs_artist_name_version"
            ),
        )
    if not inspector.has_index("card_packs", "ix_card_packs_status_artist"):
        op.create_index("ix_card_packs_status_artist", "card_packs", ["status", "artist_id"])
    if not inspector.has_table("card_pack_cards"):
        op.create_table(
            "card_pack_cards",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("pack_id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("probability", sa.Float(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["pack_id"], ["card_packs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("pack_id", "card_id", name="uq_card_pack_cards_pack_card"),
        )
    if not inspector.has_index("card_pack_cards", "ix_card_pack_cards_pack_position"):
        op.create_index(
            "ix_card_pack_cards_pack_position", "card_pack_cards", ["pack_id", "position"]
        )
    if not inspector.has_table("card_pack_openings"):
        op.create_table(
            "card_pack_openings",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("pack_id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("issuance_code", sa.String(length=80), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["pack_id"], ["card_packs.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("issuance_code", name="uq_card_pack_openings_issuance_code"),
        )
    if not inspector.has_index("card_pack_openings", "ix_card_pack_openings_user_created"):
        op.create_index(
            "ix_card_pack_openings_user_created", "card_pack_openings", ["user_id", "created_at"]
        )


def downgrade() -> None:
    op.drop_index("ix_card_pack_openings_user_created", table_name="card_pack_openings")
    op.drop_table("card_pack_openings")
    op.drop_index("ix_card_pack_cards_pack_position", table_name="card_pack_cards")
    op.drop_table("card_pack_cards")
    op.drop_index("ix_card_packs_status_artist", table_name="card_packs")
    op.drop_table("card_packs")
