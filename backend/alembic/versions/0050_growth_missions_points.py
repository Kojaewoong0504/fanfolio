"""Add mission, point, level policy, and retry storage."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import context, op

revision: str = "0050_growth_missions_points"
down_revision: str | tuple[str, str] | None = "0049_analytics_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DEFAULT_LEVEL_POLICY_ID = "default_level_policy"


def _has_table(table_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return inspect(op.get_bind()).has_table(table_name)


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode() or not _has_table(table_name):
        return set()
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    if context.is_offline_mode() or not _has_table(table_name):
        return set()
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table_name)}


def _add_engagement_event_retry_columns() -> None:
    if context.is_offline_mode():
        op.add_column("engagement_events", sa.Column("error_code", sa.String(length=80)))
        op.add_column("engagement_events", sa.Column("error_message", sa.String(length=500)))
        op.add_column(
            "engagement_events",
            sa.Column(
                "attempt_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
        return

    if not _has_table("engagement_events"):
        return
    columns = _columns("engagement_events")
    if "error_code" not in columns:
        op.add_column(
            "engagement_events",
            sa.Column("error_code", sa.String(length=80), nullable=True),
        )
    if "error_message" not in columns:
        op.add_column(
            "engagement_events",
            sa.Column("error_message", sa.String(length=500), nullable=True),
        )
    if "attempt_count" not in columns:
        op.add_column(
            "engagement_events",
            sa.Column(
                "attempt_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )


def _create_growth_tables() -> None:
    if not _has_table("mission_definitions"):
        op.create_table(
            "mission_definitions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "organization_id",
                sa.String(),
                sa.ForeignKey("organizations.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "artist_id",
                sa.String(),
                sa.ForeignKey("artists.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("description", sa.String(length=1000), nullable=True),
            sa.Column("event_kind", sa.String(length=80), nullable=False),
            sa.Column("target_value", sa.Integer(), nullable=False),
            sa.Column("recurrence", sa.String(length=20), nullable=False, server_default="once"),
            sa.Column(
                "condition_payload",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'"),
            ),
            sa.Column(
                "reward_payload",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'"),
            ),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.CheckConstraint(
                "recurrence IN ('once', 'daily', 'weekly', 'season')",
                name="ck_mission_definitions_recurrence",
            ),
            sa.CheckConstraint(
                "status IN ('draft', 'pending_review', 'published', 'disabled', 'ended')",
                name="ck_mission_definitions_status",
            ),
            sa.CheckConstraint(
                "target_value > 0",
                name="ck_mission_definitions_target_positive",
            ),
        )
        op.create_index(
            "ix_mission_definitions_status_event",
            "mission_definitions",
            ["status", "event_kind"],
        )
        op.create_index(
            "ix_mission_definitions_scope_status",
            "mission_definitions",
            ["organization_id", "artist_id", "status"],
        )

    if not _has_table("mission_progress"):
        op.create_table(
            "mission_progress",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "mission_id",
                sa.String(),
                sa.ForeignKey("mission_definitions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("period_key", sa.String(length=64), nullable=False),
            sa.Column("current_value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.UniqueConstraint(
                "user_id",
                "mission_id",
                "period_key",
                name="uq_mission_progress_user_period",
            ),
            sa.CheckConstraint(
                "current_value >= 0",
                name="ck_mission_progress_current_nonnegative",
            ),
        )
        op.create_index(
            "ix_mission_progress_user_updated",
            "mission_progress",
            ["user_id", "updated_at"],
        )
        op.create_index(
            "ix_mission_progress_mission_period",
            "mission_progress",
            ["mission_id", "period_key"],
        )

    if not _has_table("point_balances"):
        op.create_table(
            "point_balances",
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("balance", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.CheckConstraint("balance >= 0", name="ck_point_balances_nonnegative"),
        )

    if not _has_table("point_ledger"):
        op.create_table(
            "point_ledger",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "source_event_id",
                sa.String(),
                sa.ForeignKey("engagement_events.id"),
                nullable=False,
            ),
            sa.Column("rule_key", sa.String(length=160), nullable=False),
            sa.Column("transaction_type", sa.String(length=32), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reversed_ledger_id", sa.String(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(["reversed_ledger_id"], ["point_ledger.id"]),
            sa.UniqueConstraint(
                "user_id",
                "source_event_id",
                "rule_key",
                name="uq_point_ledger_event_rule",
            ),
            sa.CheckConstraint(
                "transaction_type IN ('earn', 'spend', 'reverse', 'expire', 'adjust')",
                name="ck_point_ledger_transaction_type",
            ),
        )
        op.create_index("ix_point_ledger_user_created", "point_ledger", ["user_id", "created_at"])
        op.create_index("ix_point_ledger_expires_at", "point_ledger", ["expires_at"])

    if not _has_table("level_policy_versions"):
        op.create_table(
            "level_policy_versions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.CheckConstraint(
                "status IN ('draft', 'published', 'disabled')",
                name="ck_level_policy_versions_status",
            ),
        )
        op.create_index(
            "ix_level_policy_versions_active_status",
            "level_policy_versions",
            ["is_active", "status"],
        )

    if not _has_table("level_thresholds"):
        op.create_table(
            "level_thresholds",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "policy_version_id",
                sa.String(),
                sa.ForeignKey("level_policy_versions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("level", sa.Integer(), nullable=False),
            sa.Column("required_xp", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(length=100), nullable=True),
            sa.UniqueConstraint(
                "policy_version_id",
                "level",
                name="uq_level_threshold_policy_level",
            ),
            sa.CheckConstraint("level >= 1", name="ck_level_thresholds_level_positive"),
            sa.CheckConstraint(
                "required_xp >= 0",
                name="ck_level_thresholds_required_nonnegative",
            ),
        )


def _seed_default_level_policy() -> None:
    if context.is_offline_mode() or not _has_table("level_policy_versions"):
        return

    bind = op.get_bind()
    existing_policy = bind.execute(
        sa.text("SELECT 1 FROM level_policy_versions WHERE id = :id"),
        {"id": DEFAULT_LEVEL_POLICY_ID},
    ).fetchone()
    if existing_policy is None:
        bind.execute(
            sa.text(
                """
                INSERT INTO level_policy_versions (
                    id, name, status, is_active, created_at, updated_at
                ) VALUES (
                    :id, :name, :status, :is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            ),
            {
                "id": DEFAULT_LEVEL_POLICY_ID,
                "name": "Default fan level policy",
                "status": "published",
                "is_active": True,
            },
        )

    for level in range(1, 11):
        threshold_id = f"default_level_{level}"
        exists = bind.execute(
            sa.text("SELECT 1 FROM level_thresholds WHERE id = :id"),
            {"id": threshold_id},
        ).fetchone()
        if exists is None:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO level_thresholds (
                        id, policy_version_id, level, required_xp, label
                    ) VALUES (:id, :policy_version_id, :level, :required_xp, :label)
                    """
                ),
                {
                    "id": threshold_id,
                    "policy_version_id": DEFAULT_LEVEL_POLICY_ID,
                    "level": level,
                    "required_xp": (level - 1) * 100,
                    "label": f"Level {level}",
                },
            )


def upgrade() -> None:
    _add_engagement_event_retry_columns()
    _create_growth_tables()
    _seed_default_level_policy()


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_table("level_thresholds")
        op.drop_table("level_policy_versions")
        op.drop_table("point_ledger")
        op.drop_table("point_balances")
        op.drop_table("mission_progress")
        op.drop_table("mission_definitions")
        op.drop_column("engagement_events", "attempt_count")
        op.drop_column("engagement_events", "error_message")
        op.drop_column("engagement_events", "error_code")
        return

    for index_name, table_name in (
        ("ix_level_policy_versions_active_status", "level_policy_versions"),
        ("ix_point_ledger_expires_at", "point_ledger"),
        ("ix_point_ledger_user_created", "point_ledger"),
        ("ix_mission_progress_mission_period", "mission_progress"),
        ("ix_mission_progress_user_updated", "mission_progress"),
        ("ix_mission_definitions_scope_status", "mission_definitions"),
        ("ix_mission_definitions_status_event", "mission_definitions"),
    ):
        if index_name in _indexes(table_name):
            op.drop_index(index_name, table_name=table_name)

    for table_name in (
        "level_thresholds",
        "level_policy_versions",
        "point_ledger",
        "point_balances",
        "mission_progress",
        "mission_definitions",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)

    if _has_table("engagement_events"):
        columns = _columns("engagement_events")
        with op.batch_alter_table("engagement_events") as batch:
            if "attempt_count" in columns:
                batch.drop_column("attempt_count")
            if "error_message" in columns:
                batch.drop_column("error_message")
            if "error_code" in columns:
                batch.drop_column("error_code")
