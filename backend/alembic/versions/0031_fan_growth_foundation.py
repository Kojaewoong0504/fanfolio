"""Add fan growth event ledgers and reward foundation tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import context, op

revision: str = "0031_fan_growth_foundation"
down_revision: str | None = "0030_card_drop_link"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(table_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if not _has_table("engagement_events"):
        op.create_table(
            "engagement_events",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(), nullable=False),
            sa.Column("source_id", sa.String(), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "kind",
                "source_type",
                "source_id",
                name="uq_engagement_event_source",
            ),
        )

    if not _has_table("achievement_definitions"):
        op.create_table(
            "achievement_definitions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("organization_id", sa.String(), nullable=True),
            sa.Column("artist_id", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("condition_type", sa.String(), nullable=False),
            sa.Column("target_value", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "condition_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")
            ),
            sa.Column("reward_rule_key", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("achievement_progress"):
        op.create_table(
            "achievement_progress",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("achievement_id", sa.String(), nullable=False),
            sa.Column("current_value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["achievement_id"], ["achievement_definitions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "achievement_id", name="uq_achievement_progress_user"),
        )

    if not _has_table("reward_catalog"):
        op.create_table(
            "reward_catalog",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("organization_id", sa.String(), nullable=True),
            sa.Column("artist_id", sa.String(), nullable=True),
            sa.Column("reward_type", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("reward_grants"):
        op.create_table(
            "reward_grants",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("reward_id", sa.String(), nullable=False),
            sa.Column("source_event_id", sa.String(), nullable=False),
            sa.Column("rule_key", sa.String(), nullable=False),
            sa.Column(
                "granted_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["reward_id"], ["reward_catalog.id"]),
            sa.ForeignKeyConstraint(["source_event_id"], ["engagement_events.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "source_event_id",
                "rule_key",
                name="uq_reward_grant_event_rule",
            ),
        )

    if not _has_table("xp_ledger"):
        op.create_table(
            "xp_ledger",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("rule_key", sa.String(), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["event_id"], ["engagement_events.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "event_id", "rule_key", name="uq_xp_ledger_event_rule"),
        )

    if not _has_table("fan_levels"):
        op.create_table(
            "fan_levels",
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("total_xp", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("user_id"),
        )

    if not _has_table("pass_seasons"):
        op.create_table(
            "pass_seasons",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("organization_id", sa.String(), nullable=True),
            sa.Column("artist_id", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("pass_tiers"):
        op.create_table(
            "pass_tiers",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("season_id", sa.String(), nullable=False),
            sa.Column("tier", sa.Integer(), nullable=False),
            sa.Column("required_xp", sa.Integer(), nullable=False),
            sa.Column("reward_id", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["season_id"], ["pass_seasons.id"]),
            sa.ForeignKeyConstraint(["reward_id"], ["reward_catalog.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("pass_progress"):
        op.create_table(
            "pass_progress",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("season_id", sa.String(), nullable=False),
            sa.Column("current_xp", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "claimed_tier_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["season_id"], ["pass_seasons.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "season_id", name="uq_pass_progress_user"),
        )

    if not _has_table("profile_equipment"):
        op.create_table(
            "profile_equipment",
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column(
                "equipped_reward_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
            ),
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("user_id"),
        )


def downgrade() -> None:
    for table_name in (
        "profile_equipment",
        "pass_progress",
        "pass_tiers",
        "pass_seasons",
        "fan_levels",
        "xp_ledger",
        "reward_grants",
        "reward_catalog",
        "achievement_progress",
        "achievement_definitions",
        "engagement_events",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)
