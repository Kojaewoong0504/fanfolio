"""Add one-time signed passes for in-person event check-in."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

revision: str = "0075_event_check_in"
down_revision: str | None = "0074_card_pack_entitlements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column("event_applications", sa.Column("check_in_token_hash", sa.String(length=64)))
        op.add_column(
            "event_applications", sa.Column("check_in_token_issued_at", sa.DateTime(timezone=True))
        )
        op.add_column("event_applications", sa.Column("checked_in_at", sa.DateTime(timezone=True)))
        op.add_column(
            "event_applications",
            sa.Column("checked_in_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        )
        return
    if "event_applications" not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("event_applications")
    }
    additions = {
        "check_in_token_hash": sa.Column("check_in_token_hash", sa.String(length=64)),
        "check_in_token_issued_at": sa.Column(
            "check_in_token_issued_at", sa.DateTime(timezone=True)
        ),
        "checked_in_at": sa.Column("checked_in_at", sa.DateTime(timezone=True)),
        "checked_in_by": sa.Column(
            "checked_in_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
    }
    missing = [column for name, column in additions.items() if name not in columns]
    if op.get_bind().dialect.name == "sqlite":
        # SQLite's batch reflection fails on legacy fixtures whose referenced
        # tables are intentionally absent. The nullable identifier still has
        # the same runtime contract; PostgreSQL receives the FK below.
        sqlite_additions = {
            **additions,
            "checked_in_by": sa.Column("checked_in_by", sa.String()),
        }
        for name in additions:
            if name in columns:
                continue
            op.add_column("event_applications", sqlite_additions[name])
    else:
        for column in missing:
            op.add_column("event_applications", column)


def downgrade() -> None:
    if "event_applications" not in sa.inspect(op.get_bind()).get_table_names():
        return
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("event_applications")
    }
    names = [
        name
        for name in (
            "checked_in_by",
            "checked_in_at",
            "check_in_token_issued_at",
            "check_in_token_hash",
        )
        if name in columns
    ]
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("event_applications") as batch_op:
            for name in names:
                batch_op.drop_column(name)
    else:
        for name in names:
            op.drop_column("event_applications", name)
