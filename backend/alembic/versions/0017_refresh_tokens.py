"""Persist refresh-token rotation families for JWT authentication."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_refresh_tokens"
down_revision: str | None = "0016_artist_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("refresh_tokens"):
        return
    op.create_table(
        "refresh_tokens",
        sa.Column("jti", sa.String(), primary_key=True),
        sa.Column("family_id", sa.String(), nullable=False),
        sa.Column("token_digest", sa.String(), nullable=False, unique=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_jti", sa.String(), nullable=True),
    )
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_user_client", "refresh_tokens", ["user_id", "client"])
    op.create_index("ix_refresh_tokens_token_digest", "refresh_tokens", ["token_digest"])


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("refresh_tokens"):
        return
    op.drop_index("ix_refresh_tokens_token_digest", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_client", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
