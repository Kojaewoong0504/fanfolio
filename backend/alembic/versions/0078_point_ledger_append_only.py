"""Guard the point ledger against in-place mutation in PostgreSQL."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0078_point_ledger_guard"
down_revision: str | None = "0077_point_tx_fingerprint"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode() or op.get_bind().dialect.name != "postgresql":
        return
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "point_ledger" not in tables:
        return
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fanfolio_reject_point_ledger_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION 'point_ledger is append-only';
        END;
        $$;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS point_ledger_append_only ON point_ledger")
    op.execute(
        """
        CREATE TRIGGER point_ledger_append_only
        BEFORE UPDATE OR DELETE ON point_ledger
        FOR EACH ROW EXECUTE FUNCTION fanfolio_reject_point_ledger_mutation()
        """
    )


def downgrade() -> None:
    if context.is_offline_mode() or op.get_bind().dialect.name != "postgresql":
        return
    op.execute("DROP TRIGGER IF EXISTS point_ledger_append_only ON point_ledger")
    op.execute("DROP FUNCTION IF EXISTS fanfolio_reject_point_ledger_mutation()")
