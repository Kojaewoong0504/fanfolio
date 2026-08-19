"""Prevent duplicate fan nicknames."""

from collections.abc import Sequence

from sqlalchemy import inspect

from alembic import op

revision: str = "0040_unique_fan_nicknames"
down_revision: str | None = "0039_event_comment_moderation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Some supported upgrade paths start from a partial schema that predates
    # the users table.  This migration must remain a no-op until that table is
    # introduced by the later application schema migrations.
    if not inspect(op.get_bind()).has_table("users"):
        return
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_role_nickname_ci
        ON users (role, lower(nickname))
        WHERE nickname IS NOT NULL AND trim(nickname) <> ''
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_role_nickname_ci")
