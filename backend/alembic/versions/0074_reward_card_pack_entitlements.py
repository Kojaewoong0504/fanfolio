"""Allow fan-growth rewards to grant card-pack use rights."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0074_card_pack_entitlements"
down_revision: str | None = "0073_support_report_targets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_table() -> None:
    op.create_table(
        "reward_grant_card_pack_entitlements",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("reward_grant_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("pack_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reward_grant_id"], ["reward_grants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pack_id"], ["card_packs.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reward_grant_id", name="uq_reward_grant_card_pack_entitlement_grant"),
        sa.CheckConstraint(
            "status IN ('available', 'opened', 'revoked')",
            name="ck_reward_grant_card_pack_entitlements_status",
        ),
    )
    op.create_index(
        "ix_reward_grant_card_pack_entitlements_user_pack",
        "reward_grant_card_pack_entitlements",
        ["user_id", "pack_id", "status"],
    )


def upgrade() -> None:
    if context.is_offline_mode():
        _create_table()
        return
    inspector = sa.inspect(op.get_bind())
    if "reward_grant_card_pack_entitlements" not in inspector.get_table_names():
        _create_table()


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_index(
            "ix_reward_grant_card_pack_entitlements_user_pack",
            table_name="reward_grant_card_pack_entitlements",
        )
        op.drop_table("reward_grant_card_pack_entitlements")
        return
    inspector = sa.inspect(op.get_bind())
    if "reward_grant_card_pack_entitlements" in inspector.get_table_names():
        op.drop_index(
            "ix_reward_grant_card_pack_entitlements_user_pack",
            table_name="reward_grant_card_pack_entitlements",
        )
        op.drop_table("reward_grant_card_pack_entitlements")
