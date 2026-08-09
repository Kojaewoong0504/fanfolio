"""Allow fan and staff identities to safely share an email address."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_role_scoped_user_email"
down_revision: str | None = "0022_deployment_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _unique_columns(constraint: dict[str, object]) -> tuple[str, ...]:
    return tuple(constraint.get("column_names") or ())


def upgrade() -> None:
    bind = op.get_bind()
    unique_constraints = sa.inspect(bind).get_unique_constraints("users")
    if any(_unique_columns(item) == ("role", "email") for item in unique_constraints):
        return

    email_unique = next(
        (item for item in unique_constraints if _unique_columns(item) == ("email",)),
        None,
    )
    if bind.dialect.name == "sqlite" and email_unique and not email_unique.get("name"):
        with op.batch_alter_table(
            "users",
            recreate="always",
            naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"},
        ) as batch:
            batch.drop_constraint("uq_users_email", type_="unique")
            batch.create_unique_constraint("uq_users_role_email", ["role", "email"])
        return

    with op.batch_alter_table("users") as batch:
        if email_unique and email_unique.get("name"):
            batch.drop_constraint(str(email_unique["name"]), type_="unique")
        batch.create_unique_constraint("uq_users_role_email", ["role", "email"])


def downgrade() -> None:
    raise RuntimeError("0023 cannot be downgraded without merging duplicate emails")
