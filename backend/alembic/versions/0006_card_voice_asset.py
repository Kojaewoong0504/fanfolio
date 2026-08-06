"""Store the protected voice asset attached to a card."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_card_voice_asset"
down_revision: str | None = "0005_admin_operational_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("cards")}
    if "voice_asset_id" not in columns:
        op.add_column("cards", sa.Column("voice_asset_id", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("cards")}
    if "voice_asset_id" in columns:
        op.drop_column("cards", "voice_asset_id")
