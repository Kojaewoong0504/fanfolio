"""Add premium lanes and per-user season pass entitlements."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0067_paid_season_pass"
down_revision: str | None = "0066_card_collaboration_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column(
            "pass_seasons",
            sa.Column("premium_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.add_column(
            "pass_seasons",
            sa.Column("premium_price_points", sa.Integer(), nullable=True),
        )
        with op.batch_alter_table("pass_tiers", recreate="always") as batch_op:
            batch_op.add_column(sa.Column("premium_reward_id", sa.String(), nullable=True))
            batch_op.create_foreign_key(
                "fk_pass_tiers_premium_reward", "reward_catalog", ["premium_reward_id"], ["id"]
            )
        op.add_column(
            "pass_progress",
            sa.Column(
                "premium_claimed_tier_ids",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            ),
        )
        op.create_table(
            "pass_entitlements",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("season_id", sa.String(), nullable=False),
            sa.Column("price_points", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("order_id", sa.String(), nullable=True),
            sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["season_id"], ["pass_seasons.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["order_id"], ["shop_orders.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "season_id", name="uq_pass_entitlements_user_season"),
            sa.CheckConstraint(
                "status IN ('active', 'refunded', 'expired')", name="ck_pass_entitlements_status"
            ),
        )
        op.create_index(
            "ix_pass_entitlements_user_status", "pass_entitlements", ["user_id", "status"]
        )
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if "pass_seasons" in table_names:
        columns = {column["name"] for column in inspector.get_columns("pass_seasons")}
    else:
        columns = set()
    if "pass_seasons" in table_names and "premium_enabled" not in columns:
        op.add_column(
            "pass_seasons",
            sa.Column("premium_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "pass_seasons" in table_names and "premium_price_points" not in columns:
        op.add_column(
            "pass_seasons", sa.Column("premium_price_points", sa.Integer(), nullable=True)
        )
    tier_columns = (
        {column["name"] for column in inspector.get_columns("pass_tiers")}
        if "pass_tiers" in table_names
        else set()
    )
    if (
        "pass_tiers" in table_names
        and "premium_reward_id" not in tier_columns
        and "reward_catalog" in table_names
    ):
        # A partially upgraded legacy database may not contain every historical
        # FK target. Add the nullable column directly in that case so a later
        # migration can complete without reflecting missing tables.
        if {"artists", "assets"} <= table_names:
            with op.batch_alter_table("pass_tiers", recreate="always") as batch_op:
                batch_op.add_column(sa.Column("premium_reward_id", sa.String(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_pass_tiers_premium_reward",
                    "reward_catalog",
                    ["premium_reward_id"],
                    ["id"],
                )
        else:
            op.add_column("pass_tiers", sa.Column("premium_reward_id", sa.String(), nullable=True))
    progress_columns = (
        {column["name"] for column in inspector.get_columns("pass_progress")}
        if "pass_progress" in table_names
        else set()
    )
    if "pass_progress" in table_names and "premium_claimed_tier_ids" not in progress_columns:
        op.add_column(
            "pass_progress",
            sa.Column(
                "premium_claimed_tier_ids",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            ),
        )
        op.execute(
            "UPDATE pass_progress SET premium_claimed_tier_ids = '[]' WHERE premium_claimed_tier_ids IS NULL"
        )
    if (
        "pass_entitlements" not in table_names
        and {"users", "pass_seasons", "shop_orders"} <= table_names
    ):
        op.create_table(
            "pass_entitlements",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("season_id", sa.String(), nullable=False),
            sa.Column("price_points", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("order_id", sa.String(), nullable=True),
            sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["season_id"], ["pass_seasons.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["order_id"], ["shop_orders.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "season_id", name="uq_pass_entitlements_user_season"),
            sa.CheckConstraint(
                "status IN ('active', 'refunded', 'expired')", name="ck_pass_entitlements_status"
            ),
        )
        op.create_index(
            "ix_pass_entitlements_user_status", "pass_entitlements", ["user_id", "status"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    if context.is_offline_mode():
        op.drop_index("ix_pass_entitlements_user_status", table_name="pass_entitlements")
        op.drop_table("pass_entitlements")
        op.drop_column("pass_progress", "premium_claimed_tier_ids")
        with op.batch_alter_table("pass_tiers", recreate="always") as batch_op:
            batch_op.drop_column("premium_reward_id")
        op.drop_column("pass_seasons", "premium_price_points")
        op.drop_column("pass_seasons", "premium_enabled")
        return

    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if "pass_entitlements" in table_names:
        op.drop_index("ix_pass_entitlements_user_status", table_name="pass_entitlements")
        op.drop_table("pass_entitlements")
    if "pass_progress" in table_names and "premium_claimed_tier_ids" in {
        column["name"] for column in inspector.get_columns("pass_progress")
    }:
        op.drop_column("pass_progress", "premium_claimed_tier_ids")
    if "pass_tiers" in table_names and "premium_reward_id" in {
        column["name"] for column in inspector.get_columns("pass_tiers")
    }:
        with op.batch_alter_table("pass_tiers", recreate="always") as batch_op:
            batch_op.drop_column("premium_reward_id")
    if "pass_seasons" in table_names:
        season_columns = {column["name"] for column in inspector.get_columns("pass_seasons")}
        if "premium_price_points" in season_columns:
            op.drop_column("pass_seasons", "premium_price_points")
        if "premium_enabled" in season_columns:
            op.drop_column("pass_seasons", "premium_enabled")
