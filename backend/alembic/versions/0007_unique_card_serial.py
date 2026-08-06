"""Prevent duplicate serial numbers for a card."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_unique_card_serial"
down_revision: str | None = "0006_card_voice_asset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


INDEX_NAME = "uq_user_cards_card_serial"


def upgrade() -> None:
    bind = op.get_bind()
    index_names = {index["name"] for index in sa.inspect(bind).get_indexes("user_cards")}
    if INDEX_NAME not in index_names:
        op.create_index(
            INDEX_NAME,
            "user_cards",
            ["card_id", "serial_number"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    index_names = {index["name"] for index in sa.inspect(bind).get_indexes("user_cards")}
    if INDEX_NAME in index_names:
        op.drop_index(INDEX_NAME, table_name="user_cards")
