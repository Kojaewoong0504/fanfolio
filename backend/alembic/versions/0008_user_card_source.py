"""Persist how a fan redeemed an official card."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_user_card_source"
down_revision: str | None = "0007_unique_card_serial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "acquisition_source" not in columns:
        op.add_column(
            "user_cards",
            sa.Column(
                "acquisition_source",
                sa.String(),
                nullable=False,
                server_default="redeem_code",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "acquisition_source" in columns:
        op.drop_column("user_cards", "acquisition_source")
