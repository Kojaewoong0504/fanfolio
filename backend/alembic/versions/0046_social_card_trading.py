"""Add fan follows, public collections, and scoped card trades."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0046_social_card_trading"
down_revision: str | tuple[str, str] | None = (
    "0044_card_combinations",
    "0045_partner_card_scope",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("cards") and "tradable" not in {
        column["name"] for column in inspector.get_columns("cards")
    }:
        tradable = sa.Column("tradable", sa.Boolean(), nullable=False, server_default=sa.true())
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("cards", recreate="always") as batch:
                batch.add_column(tradable)
        else:
            op.add_column("cards", tradable)

    if inspector.has_table("user_cards"):
        columns = {column["name"] for column in inspector.get_columns("user_cards")}
        missing_columns = [
            sa.Column(name, sa.DateTime(timezone=True), nullable=True)
            for name in ("expires_at", "trade_locked_at")
            if name not in columns
        ]
        if bind.dialect.name == "sqlite" and missing_columns:
            with op.batch_alter_table("user_cards", recreate="always") as batch:
                for column in missing_columns:
                    batch.add_column(column)
        else:
            for column in missing_columns:
                op.add_column("user_cards", column)

    if not inspector.has_table("follows"):
        op.create_table(
            "follows",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "follower_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "following_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("follower_id", "following_id", name="uq_follows_pair"),
        )
        op.create_index("ix_follows_following", "follows", ["following_id"])

    if not inspector.has_table("user_blocks"):
        op.create_table(
            "user_blocks",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "blocker_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "blocked_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_user_blocks_pair"),
        )

    if not inspector.has_table("card_visibilities"):
        op.create_table(
            "card_visibilities",
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("public_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    if not inspector.has_table("trade_proposals"):
        op.create_table(
            "trade_proposals",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "proposer_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "recipient_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(
            "ix_trade_proposals_recipient_status", "trade_proposals", ["recipient_id", "status"]
        )
        op.create_index(
            "ix_trade_proposals_proposer_status", "trade_proposals", ["proposer_id", "status"]
        )

    if not inspector.has_table("trade_items"):
        op.create_table(
            "trade_items",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "proposal_id",
                sa.String(),
                sa.ForeignKey("trade_proposals.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_card_id",
                sa.String(),
                sa.ForeignKey("user_cards.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("side", sa.String(16), nullable=False),
            sa.UniqueConstraint("proposal_id", "user_card_id", name="uq_trade_items_proposal_card"),
        )
        op.create_index("ix_trade_items_user_card", "trade_items", ["user_card_id"])

    if not inspector.has_table("trade_locks"):
        op.create_table(
            "trade_locks",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "proposal_id",
                sa.String(),
                sa.ForeignKey("trade_proposals.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_card_id",
                sa.String(),
                sa.ForeignKey("user_cards.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_card_id", name="uq_trade_locks_user_card"),
        )


def downgrade() -> None:
    for table in (
        "trade_locks",
        "trade_items",
        "trade_proposals",
        "card_visibilities",
        "user_blocks",
        "follows",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("user_cards", recreate="always") as batch:
            batch.drop_column("trade_locked_at")
            batch.drop_column("expires_at")
        with op.batch_alter_table("cards", recreate="always") as batch:
            batch.drop_column("tradable")
    else:
        op.drop_column("user_cards", "trade_locked_at")
        op.drop_column("user_cards", "expires_at")
        op.drop_column("cards", "tradable")
