"""Add provider identities and one-time OAuth handoff records."""

import sqlalchemy as sa

from alembic import op

revision = "0018_social_oauth"
down_revision = "0017_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "social_accounts" not in tables:
        op.create_table(
            "social_accounts",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "uq_social_accounts_provider_subject",
            "social_accounts",
            ["provider", "subject"],
            unique=True,
        )
        op.create_index("ix_social_accounts_user_id", "social_accounts", ["user_id"], unique=False)
    if "oauth_states" not in tables:
        op.create_table(
            "oauth_states",
            sa.Column("state_hash", sa.String(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("client", sa.String(), nullable=False),
            sa.Column("redirect_uri", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("state_hash"),
        )
    if "oauth_exchange_codes" not in tables:
        op.create_table(
            "oauth_exchange_codes",
            sa.Column("code_hash", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("client", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("code_hash"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "oauth_exchange_codes" in tables:
        op.drop_table("oauth_exchange_codes")
    if "oauth_states" in tables:
        op.drop_table("oauth_states")
    if "social_accounts" in tables:
        op.drop_index("ix_social_accounts_user_id", table_name="social_accounts")
        op.drop_index("uq_social_accounts_provider_subject", table_name="social_accounts")
        op.drop_table("social_accounts")
