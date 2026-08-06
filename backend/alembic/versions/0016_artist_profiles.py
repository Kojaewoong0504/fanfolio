"""Connect artist accounts to their verified catalog group."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_artist_profiles"
down_revision: str | None = "0015_user_card_redeem_code"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("artist_profiles"):
        op.create_table(
            "artist_profiles",
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("artist_id", sa.String(), sa.ForeignKey("artists.id"), nullable=False),
            sa.Column("verification_status", sa.String(), nullable=False, server_default="pending"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("artist_profiles"):
        op.drop_table("artist_profiles")
