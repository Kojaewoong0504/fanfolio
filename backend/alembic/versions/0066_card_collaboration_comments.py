"""Add card-scoped collaboration feedback threads."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0066_card_collaboration_comments"
down_revision: str | None = "0065_content_calendar"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("card_collaboration_comments"):
        return
    op.create_table(
        "card_collaboration_comments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("card_id", sa.String(), nullable=False),
        sa.Column("author_user_id", sa.String(), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("mention_user_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("review_version", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["mention_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_card_collab_comments_card_created",
        "card_collaboration_comments",
        ["card_id", "created_at"],
    )
    op.create_index(
        "ix_card_collab_comments_card_status",
        "card_collaboration_comments",
        ["card_id", "status"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("card_collaboration_comments"):
        return
    op.drop_index("ix_card_collab_comments_card_status", table_name="card_collaboration_comments")
    op.drop_index("ix_card_collab_comments_card_created", table_name="card_collaboration_comments")
    op.drop_table("card_collaboration_comments")
