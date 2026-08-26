"""Store authenticated fan device registrations for push delivery."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0057_push_devices"
down_revision: str | None = "0056_reward_grant_revocation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "push_devices" in inspector.get_table_names():
        return
    op.create_table(
        "push_devices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("token", sa.String(length=4096), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_push_devices_token"),
    )
    op.create_index("ix_push_devices_user_enabled", "push_devices", ["user_id", "enabled"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "push_devices" in inspector.get_table_names():
        op.drop_index("ix_push_devices_user_enabled", table_name="push_devices")
        op.drop_table("push_devices")
