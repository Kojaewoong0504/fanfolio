"""Allow social-only accounts without an email address."""

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0019_optional_social_email"
down_revision = "0018_social_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"]: column for column in inspect(bind).get_columns("users")}
    if "profile_image_url" not in columns:
        op.add_column("users", sa.Column("profile_image_url", sa.String(), nullable=True))
    # 0001 creates the schema from the current SQLAlchemy model, so new databases
    # already have a nullable email. Keep the conditional for older installations.
    if not columns["email"]["nullable"]:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("email", nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"]: column for column in inspect(bind).get_columns("users")}
    if "profile_image_url" in columns:
        op.drop_column("users", "profile_image_url")
    if columns["email"]["nullable"]:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("email", nullable=False)
