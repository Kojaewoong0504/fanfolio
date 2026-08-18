"""Prevent duplicate fan nicknames."""

from collections.abc import Sequence

from alembic import op

revision: str = "0040_unique_fan_nicknames"
down_revision: str | None = "0039_event_comment_moderation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_role_nickname_ci
        ON users (role, lower(nickname))
        WHERE nickname IS NOT NULL AND trim(nickname) <> ''
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_role_nickname_ci")
