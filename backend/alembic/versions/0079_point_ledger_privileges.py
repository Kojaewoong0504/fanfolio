"""Separate the API PostgreSQL role from point-ledger mutation privileges."""

import re
from collections.abc import Sequence

from alembic import context, op

revision: str = "0079_point_ledger_privileges"
down_revision: str | None = "0078_point_ledger_guard"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _configured_role() -> str | None:
    role = context.config.get_main_option("database_app_role", fallback="").strip()
    if not role:
        return None
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", role):
        raise ValueError("database_app_role must be a plain PostgreSQL identifier")
    return role


def upgrade() -> None:
    if context.is_offline_mode() or op.get_bind().dialect.name != "postgresql":
        return
    role = _configured_role()
    if not role:
        return
    quoted_role = op.get_bind().dialect.identifier_preparer.quote(role)
    op.execute(f"GRANT SELECT, INSERT ON TABLE point_ledger TO {quoted_role}")
    op.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON TABLE point_ledger FROM {quoted_role}")


def downgrade() -> None:
    if context.is_offline_mode() or op.get_bind().dialect.name != "postgresql":
        return
    role = _configured_role()
    if not role:
        return
    quoted_role = op.get_bind().dialect.identifier_preparer.quote(role)
    op.execute(f"GRANT UPDATE, DELETE, TRUNCATE ON TABLE point_ledger TO {quoted_role}")
