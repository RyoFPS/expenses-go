"""Add account based saving goals.

Revision ID: 20261122_saving_goals
Revises: 39c7023f1d2b
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261122_saving_goals"
down_revision: str | None = "39c7023f1d2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saving_goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("target_amount", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.CheckConstraint("target_amount > 0", name=op.f("ck_saving_goals_target_amount_positive")),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", name=op.f("uq_saving_goals_account_id")),
    )
    op.create_index("ix_saving_goals_account_id", "saving_goals", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_saving_goals_account_id", table_name="saving_goals")
    op.drop_table("saving_goals")
