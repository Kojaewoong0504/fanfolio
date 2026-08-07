"""Add private artist-studio credentials to users."""

import sqlalchemy as sa

from alembic import op

revision = "0020_artist_password_accounts"
down_revision = "0019_optional_social_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "username" not in columns:
        op.add_column("users", sa.Column("username", sa.String(), nullable=True))
        # A unique index works on both PostgreSQL and the SQLite database used
        # by lightweight Render/dev deployments; SQLite cannot add a table
        # constraint after creation.
        op.create_index("uq_users_username", "users", ["username"], unique=True)
    if "password_hash" not in columns:
        op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    if "must_change_password" not in columns:
        op.add_column(
            "users",
            sa.Column(
                "must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "password_hash")
    op.drop_index("uq_users_username", table_name="users")
    op.drop_column("users", "username")
