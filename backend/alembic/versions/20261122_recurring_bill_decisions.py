"""Store recurring bill review decisions.

Revision ID: 20261122_recurring_bills
Revises: 9a31e82c_listener_status
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261122_recurring_bills"
down_revision: str | None = "9a31e82c_listener_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recurring_bill_decisions",
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("merchant", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("last_transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint("status IN ('confirmed', 'ignored')", name=op.f("ck_recurring_bill_decisions_valid_status")),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("account_id", "merchant"),
    )


def downgrade() -> None:
    op.drop_table("recurring_bill_decisions")
