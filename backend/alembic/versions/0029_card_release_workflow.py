"""Store card release workflow review state."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0029_card_release_workflow"
down_revision: str | None = "0026_organization_logo_asset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ADMIN_MEMBERSHIP_SCOPE = (
    "(access_level IN ('root', 'platform_operator') AND organization_id IS NULL) OR "
    "(access_level NOT IN ('root', 'platform_operator') AND organization_id IS NOT NULL)"
)
ADMIN_ACCESS_LEVELS = "access_level IN ('root', 'manager', 'editor', 'viewer', 'platform_operator')"


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("admin_memberships") and inspector.has_table("assets"):
        with op.batch_alter_table("admin_memberships") as batch:
            batch.drop_constraint("ck_admin_membership_access_level", type_="check")
            batch.drop_constraint("ck_admin_membership_scope", type_="check")
            batch.create_check_constraint(
                "ck_admin_membership_access_level",
                ADMIN_ACCESS_LEVELS,
            )
            batch.create_check_constraint("ck_admin_membership_scope", ADMIN_MEMBERSHIP_SCOPE)

    if inspector.has_table("cards"):
        columns = _columns("cards")
        with op.batch_alter_table("cards") as batch:
            if "release_policy" not in columns:
                batch.add_column(
                    sa.Column(
                        "release_policy",
                        sa.String(),
                        nullable=False,
                        server_default="partner_only",
                    )
                )
            if "release_status" not in columns:
                batch.add_column(
                    sa.Column(
                        "release_status",
                        sa.String(),
                        nullable=False,
                        server_default="draft",
                    )
                )
            if "review_version" not in columns:
                batch.add_column(
                    sa.Column("review_version", sa.Integer(), nullable=False, server_default="0")
                )
        op.execute(
            """
            UPDATE cards
            SET release_policy = CASE
                    WHEN rarity = 'Special' THEN 'partner_and_platform'
                    ELSE 'partner_only'
                END,
                release_status = CASE status
                    WHEN 'pending_review' THEN 'pending_partner_review'
                    WHEN 'changes_requested' THEN 'changes_requested'
                    WHEN 'approved' THEN 'approved'
                    WHEN 'published' THEN 'published'
                    ELSE 'draft'
                END
            """
        )

    inspector = inspect(bind)
    if not inspector.has_table("card_review_requests"):
        op.create_table(
            "card_review_requests",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("stage", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "card_id",
                "version",
                "stage",
                name="uq_card_review_request_version_stage",
            ),
        )

    inspector = inspect(bind)
    if not inspector.has_table("card_review_decisions"):
        op.create_table(
            "card_review_decisions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("request_id", sa.String(), nullable=False),
            sa.Column("reviewer_user_id", sa.String(), nullable=False),
            sa.Column("decision", sa.String(), nullable=False),
            sa.Column("note", sa.String(length=500), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["request_id"], ["card_review_requests.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = inspect(bind)
    if inspector.has_table("notifications"):
        columns = _columns("notifications")
        indexes = _indexes("notifications")
        with op.batch_alter_table("notifications") as batch:
            if "entity_type" not in columns:
                batch.add_column(sa.Column("entity_type", sa.String(), nullable=True))
            if "entity_id" not in columns:
                batch.add_column(sa.Column("entity_id", sa.String(), nullable=True))
            if "event_key" not in columns:
                batch.add_column(sa.Column("event_key", sa.String(), nullable=True))
            if "uq_notifications_user_event_key" not in indexes:
                batch.create_index(
                    "uq_notifications_user_event_key",
                    ["user_id", "event_key"],
                    unique=True,
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("notifications"):
        columns = _columns("notifications")
        indexes = _indexes("notifications")
        with op.batch_alter_table("notifications") as batch:
            if "uq_notifications_user_event_key" in indexes:
                batch.drop_index("uq_notifications_user_event_key")
            if "event_key" in columns:
                batch.drop_column("event_key")
            if "entity_id" in columns:
                batch.drop_column("entity_id")
            if "entity_type" in columns:
                batch.drop_column("entity_type")

    for table_name in ("card_review_decisions", "card_review_requests"):
        if inspect(bind).has_table(table_name):
            op.drop_table(table_name)

    if inspect(bind).has_table("cards"):
        columns = _columns("cards")
        with op.batch_alter_table("cards") as batch:
            if "review_version" in columns:
                batch.drop_column("review_version")
            if "release_status" in columns:
                batch.drop_column("release_status")
            if "release_policy" in columns:
                batch.drop_column("release_policy")

    if inspect(bind).has_table("admin_memberships"):
        with op.batch_alter_table("admin_memberships") as batch:
            batch.drop_constraint("ck_admin_membership_access_level", type_="check")
            batch.drop_constraint("ck_admin_membership_scope", type_="check")
            batch.create_check_constraint(
                "ck_admin_membership_access_level",
                "access_level IN ('root', 'manager', 'editor', 'viewer')",
            )
            batch.create_check_constraint(
                "ck_admin_membership_scope",
                "(access_level = 'root' AND organization_id IS NULL) OR "
                "(access_level != 'root' AND organization_id IS NOT NULL)",
            )
