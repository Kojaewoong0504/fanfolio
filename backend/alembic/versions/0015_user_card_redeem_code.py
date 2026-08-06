"""Track the redeem code that issued each user card."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_user_card_redeem_code"
down_revision: str | None = "0014_asset_upload_completion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "redeem_code_id" not in columns:
        with op.batch_alter_table("user_cards") as batch_op:
            batch_op.add_column(
                sa.Column("redeem_code_id", sa.String(), sa.ForeignKey("redeem_codes.code"))
            )
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("user_cards")}
    if "uq_user_cards_user_redeem_code" not in indexes:
        op.create_index(
            "uq_user_cards_user_redeem_code",
            "user_cards",
            ["user_id", "redeem_code_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("user_cards")}
    if "uq_user_cards_user_redeem_code" in indexes:
        op.drop_index("uq_user_cards_user_redeem_code", table_name="user_cards")
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user_cards")}
    if "redeem_code_id" in columns:
        with op.batch_alter_table("user_cards") as batch_op:
            batch_op.drop_column("redeem_code_id")
