"""Add transfer categories and label the existing BCA cash withdrawal.

Revision ID: a4e66f92d161
Revises: fc78c51ea778
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4e66f92d161"
down_revision: str | None = "fc78c51ea778"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CASH_CATEGORY_ID = "b711713e-93c5-4fb2-bacd-23d859555019"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE category_type ADD VALUE IF NOT EXISTS 'transfer'")
    op.execute(
        sa.text(
            "INSERT INTO categories (id, name, type) "
            "VALUES (CAST(:id AS uuid), 'Tarik Tunai', 'transfer')"
        ).bindparams(id=CASH_CATEGORY_ID)
    )
    op.execute(
        sa.text(
            "UPDATE transactions AS t SET category_id = CAST(:id AS uuid) "
            "FROM accounts AS src, accounts AS dest, raw_notifications AS raw "
            "WHERE t.category_id IS NULL AND t.type = 'transfer' AND t.source = 'notification' "
            "AND t.account_id = src.id AND src.package_name = 'com.bca.mybca.omni.android' "
            "AND t.to_account_id = dest.id AND dest.type = 'cash' "
            "AND t.raw_notification_id = raw.id AND raw.title = 'Catatan Finansial' "
            "AND raw.text = 'Pengeluaran sebesar IDR 50,000.00 di kategori Uang Tunai.'"
        ).bindparams(id=CASH_CATEGORY_ID)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM categories AS c WHERE c.id = CAST(:id AS uuid) AND c.name = 'Tarik Tunai' "
            "AND c.type = 'transfer' "
            "AND NOT EXISTS (SELECT 1 FROM transactions WHERE category_id = c.id) "
            "AND NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = c.id) "
            "AND NOT EXISTS (SELECT 1 FROM category_rules WHERE category_id = c.id)"
        ).bindparams(id=CASH_CATEGORY_ID)
    )
    remaining = op.get_bind().scalar(sa.text("SELECT count(*) FROM categories WHERE type = 'transfer'"))
    if remaining:
        raise RuntimeError("Hapus atau ubah kategori transfer beserta pemakaiannya sebelum downgrade")
    op.execute("ALTER TYPE category_type RENAME TO category_type_with_transfer")
    op.execute("CREATE TYPE category_type AS ENUM ('income', 'expense')")
    op.execute(
        "ALTER TABLE categories ALTER COLUMN type TYPE category_type "
        "USING type::text::category_type"
    )
    op.execute("DROP TYPE category_type_with_transfer")
