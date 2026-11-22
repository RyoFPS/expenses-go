"""Add monthly category budgets."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "39c7023f1d2b"
down_revision: str | None = "a4e66f92d161"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_budgets")),
        sa.UniqueConstraint("category_id", "month", name=op.f("uq_budgets_category_id")),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_budgets_amount_nonnegative")),
    )
    op.create_index(op.f("ix_budgets_category_id"), "budgets", ["category_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_budgets_category_id"), table_name="budgets")
    op.drop_table("budgets")
