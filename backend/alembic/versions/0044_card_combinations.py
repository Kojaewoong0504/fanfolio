"""Add duplicate-card combination recipes and atomic consumption records."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "0044_card_combinations"
down_revision: str | None = "0043_card_ownership_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The first migration creates the current SQLAlchemy metadata so a new local
    # database can boot in one step. That metadata now includes these tables, so
    # this migration must also be safe when the tables already exist.
    bind = op.get_bind()
    existing_tables = set(inspect(bind).get_table_names())
    if "card_combination_recipes" not in existing_tables:
        op.create_table(
            "card_combination_recipes",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("scope_type", sa.String(length=32), nullable=False),
            sa.Column("scope_id", sa.String(), nullable=False),
            sa.Column("input_quantity", sa.Integer(), nullable=False),
            sa.Column("output_rarity_pool", sa.JSON(), nullable=False),
            sa.Column("probability_snapshot", sa.JSON(), nullable=False),
            sa.Column("probability_version", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("scope_type", "scope_id", name="uq_card_combination_recipe_scope"),
        )
    if "ix_card_combination_recipes_status" not in {
        index["name"] for index in inspect(bind).get_indexes("card_combination_recipes")
    }:
        op.create_index(
            "ix_card_combination_recipes_status", "card_combination_recipes", ["status"]
        )
    if "card_combinations" not in existing_tables:
        op.create_table(
            "card_combinations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("recipe_id", sa.String(), nullable=False),
            sa.Column("result_card_id", sa.String(), nullable=False),
            sa.Column("result_user_card_id", sa.String(), nullable=True),
            sa.Column("material_user_card_ids", sa.JSON(), nullable=False),
            sa.Column("probability_version", sa.String(length=64), nullable=False),
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["recipe_id"], ["card_combination_recipes.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(["result_card_id"], ["cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(
                ["result_user_card_id"], ["user_cards.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "idempotency_key", name="uq_card_combinations_user_key"),
        )
    if "ix_card_combinations_user_created" not in {
        index["name"] for index in inspect(bind).get_indexes("card_combinations")
    }:
        op.create_index(
            "ix_card_combinations_user_created", "card_combinations", ["user_id", "created_at"]
        )
    if "card_combination_materials" not in existing_tables:
        op.create_table(
            "card_combination_materials",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("combination_id", sa.String(), nullable=False),
            sa.Column("user_card_id", sa.String(), nullable=False),
            sa.Column("card_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(
                ["combination_id"], ["card_combinations.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["user_card_id"], ["user_cards.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_card_id", name="uq_card_combination_material_user_card"),
        )


def downgrade() -> None:
    op.drop_table("card_combination_materials")
    op.drop_index("ix_card_combinations_user_created", table_name="card_combinations")
    op.drop_table("card_combinations")
    op.drop_index("ix_card_combination_recipes_status", table_name="card_combination_recipes")
    op.drop_table("card_combination_recipes")
