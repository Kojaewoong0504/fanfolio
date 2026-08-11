"""Add partner organizations and scoped administrator memberships."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0025_admin_partner_scope"
down_revision: str | None = "0024_artist_review_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("contact_name", sa.String(), nullable=True),
            sa.Column("contact_email", sa.String(), nullable=True),
            sa.Column("contract_starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("contract_ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("logo_url", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "status IN ('active', 'suspended')",
                name="ck_organization_status",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug"),
        )
        op.create_index(
            "ix_organizations_status_name",
            "organizations",
            ["status", "name"],
            unique=False,
        )

    inspector = inspect(bind)
    if not inspector.has_table("admin_memberships"):
        op.create_table(
            "admin_memberships",
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("organization_id", sa.String(), nullable=True),
            sa.Column("access_level", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("display_name", sa.String(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "access_level IN ('root', 'manager', 'editor', 'viewer')",
                name="ck_admin_membership_access_level",
            ),
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
        )
        op.create_index(
            "ix_admin_memberships_organization_status",
            "admin_memberships",
            ["organization_id", "status"],
            unique=False,
        )

    inspector = inspect(bind)
    if not inspector.has_table("organization_artists"):
        op.create_table(
            "organization_artists",
            sa.Column("organization_id", sa.String(), nullable=False),
            sa.Column("artist_id", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("organization_id", "artist_id"),
        )

    inspector = inspect(bind)
    if not inspector.has_table("admin_artist_assignments"):
        op.create_table(
            "admin_artist_assignments",
            sa.Column("admin_user_id", sa.String(), nullable=False),
            sa.Column("artist_id", sa.String(), nullable=False),
            sa.Column("assigned_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("admin_user_id", "artist_id"),
        )
        op.create_index(
            "ix_admin_artist_assignments_artist",
            "admin_artist_assignments",
            ["artist_id"],
            unique=False,
        )

    inspector = inspect(bind)
    if inspector.has_table("audit_logs"):
        columns = {column["name"] for column in inspector.get_columns("audit_logs")}
        with op.batch_alter_table("audit_logs") as batch:
            if "organization_id" not in columns:
                batch.add_column(sa.Column("organization_id", sa.String(), nullable=True))
                batch.create_foreign_key(
                    "fk_audit_logs_organization_id",
                    "organizations",
                    ["organization_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
            if "artist_id" not in columns:
                batch.add_column(sa.Column("artist_id", sa.String(), nullable=True))
                batch.create_foreign_key(
                    "fk_audit_logs_artist_id",
                    "artists",
                    ["artist_id"],
                    ["id"],
                    ondelete="SET NULL",
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("audit_logs"):
        columns = {column["name"] for column in inspector.get_columns("audit_logs")}
        with op.batch_alter_table("audit_logs") as batch:
            if "artist_id" in columns:
                batch.drop_column("artist_id")
            if "organization_id" in columns:
                batch.drop_column("organization_id")
    for table in (
        "admin_artist_assignments",
        "organization_artists",
        "admin_memberships",
        "organizations",
    ):
        if inspect(bind).has_table(table):
            op.drop_table(table)
