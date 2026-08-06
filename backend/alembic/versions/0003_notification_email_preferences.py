"""Allow fans to opt into notification emails."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0003_notification_email_preferences"
down_revision: str | None = "0002_events_and_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("users")}
    if "notification_email_enabled" not in columns:
        op.add_column(
            "users",
            sa.Column(
                "notification_email_enabled",
                sa.Boolean(),
                nullable=False,
                # Use a boolean literal accepted by both SQLite and PostgreSQL.
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("users")}
    if "notification_email_enabled" in columns:
        op.drop_column("users", "notification_email_enabled")
