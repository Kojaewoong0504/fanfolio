"""Add revocation state for atomically refunded reward grants.

Revision ID: 0056_reward_grant_revocation
Revises: 0055_shop_order_entitlements
"""

import sqlalchemy as sa

from alembic import op

revision = "0056_reward_grant_revocation"
down_revision = "0055_shop_order_entitlements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("reward_grants")}
    if "revoked_at" not in columns:
        op.add_column(
            "reward_grants",
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("reward_grants")}
    if "revoked_at" in columns:
        op.drop_column("reward_grants", "revoked_at")
