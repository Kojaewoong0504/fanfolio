"""Allow company administrator partner memberships."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0028_company_admin_access_level"
down_revision: str | None = "0027_drop_organization_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACCESS_LEVEL_CHECK = "ck_admin_membership_access_level"
COMPANY_ADMIN_ACCESS_LEVELS = (
    "access_level IN ('root', 'company_admin', 'manager', 'editor', 'viewer')"
)
LEGACY_ACCESS_LEVELS = "access_level IN ('root', 'manager', 'editor', 'viewer')"


def admin_memberships_copy_table(access_level_check: str) -> sa.Table:
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.String(), primary_key=True))
    sa.Table("organizations", metadata, sa.Column("id", sa.String(), primary_key=True))
    return sa.Table(
        "admin_memberships",
        metadata,
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("access_level", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(access_level_check, name=ACCESS_LEVEL_CHECK),
        sa.CheckConstraint(
            "status IN ('active', 'suspended')",
            name="ck_admin_membership_status",
        ),
        sa.CheckConstraint(
            "(access_level = 'root' AND organization_id IS NULL) OR "
            "(access_level != 'root' AND organization_id IS NOT NULL)",
            name="ck_admin_membership_scope",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
        sa.Index("ix_admin_memberships_organization_status", "organization_id", "status"),
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("admin_memberships"):
        return

    with op.batch_alter_table(
        "admin_memberships",
        copy_from=admin_memberships_copy_table(LEGACY_ACCESS_LEVELS),
    ) as batch:
        batch.drop_constraint(ACCESS_LEVEL_CHECK, type_="check")
        batch.create_check_constraint(ACCESS_LEVEL_CHECK, COMPANY_ADMIN_ACCESS_LEVELS)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("admin_memberships"):
        return

    with op.batch_alter_table(
        "admin_memberships",
        copy_from=admin_memberships_copy_table(COMPANY_ADMIN_ACCESS_LEVELS),
    ) as batch:
        batch.drop_constraint(ACCESS_LEVEL_CHECK, type_="check")
        batch.create_check_constraint(ACCESS_LEVEL_CHECK, LEGACY_ACCESS_LEVELS)
