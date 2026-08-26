"""Add structured CS evidence, trade holds, and approval requests.

Revision ID: 0061_operations_case_controls
Revises: 0060_support_tickets
"""

import sqlalchemy as sa

from alembic import op

revision = "0061_operations_case_controls"
down_revision = "0060_support_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "support_evidence" not in tables:
        op.create_table(
            "support_evidence",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "ticket_id",
                sa.String(),
                sa.ForeignKey("support_tickets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "actor_user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(length=40), nullable=False),
            sa.Column("reference_id", sa.String(length=160)),
            sa.Column("note", sa.String(length=2000)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            "ix_support_evidence_ticket_created", "support_evidence", ["ticket_id", "created_at"]
        )
    if "trade_holds" not in tables:
        op.create_table(
            "trade_holds",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "proposal_id",
                sa.String(),
                sa.ForeignKey("trade_proposals.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "ticket_id", sa.String(), sa.ForeignKey("support_tickets.id", ondelete="SET NULL")
            ),
            sa.Column("reason", sa.String(length=2000)),
            sa.Column("released_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("proposal_id", name="uq_trade_holds_proposal"),
        )
    if "approval_requests" not in tables:
        op.create_table(
            "approval_requests",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("kind", sa.String(length=60), nullable=False),
            sa.Column("entity_type", sa.String(length=60), nullable=False),
            sa.Column("entity_id", sa.String(length=160), nullable=False),
            sa.Column(
                "requested_by",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("approved_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("reason", sa.String(length=1000)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("decided_at", sa.DateTime(timezone=True)),
        )
        op.create_index(
            "ix_approval_requests_status_created", "approval_requests", ["status", "created_at"]
        )
        op.create_index(
            "ix_approval_requests_entity", "approval_requests", ["entity_type", "entity_id"]
        )


def downgrade() -> None:
    op.drop_index("ix_approval_requests_entity", table_name="approval_requests")
    op.drop_index("ix_approval_requests_status_created", table_name="approval_requests")
    op.drop_table("approval_requests")
    op.drop_table("trade_holds")
    op.drop_index("ix_support_evidence_ticket_created", table_name="support_evidence")
    op.drop_table("support_evidence")
