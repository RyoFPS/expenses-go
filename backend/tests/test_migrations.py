"""Migrasi awal harus membuat semua tabel di PRD bagian 8 dan sinkron dengan model."""

import asyncio

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base

EXPECTED_TABLES = {
    "accounts",
    "categories",
    "raw_notifications",
    "transactions",
    "balance_snapshots",
    "category_rules",
}

EXPECTED_ENUMS = {
    "account_type",
    "category_type",
    "parse_status",
    "transaction_type",
    "transaction_source",
    "rule_match_type",
}


def _inspect(url: str, fn):
    async def run():
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(fn)
        finally:
            await engine.dispose()

    return asyncio.run(run())


def _tables(conn) -> set[str]:
    return set(inspect(conn).get_table_names()) - {"alembic_version"}


def _enums(conn) -> set[str]:
    return {e["name"] for e in inspect(conn).get_enums()}


def test_upgrade_head_creates_all_tables(alembic_config: Config, test_db_url: str) -> None:
    command.upgrade(alembic_config, "head")
    assert _inspect(test_db_url, _tables) == EXPECTED_TABLES
    assert _inspect(test_db_url, _enums) == EXPECTED_ENUMS


def test_migration_matches_models(alembic_config: Config, test_db_url: str) -> None:
    command.upgrade(alembic_config, "head")

    def diff(conn):
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)

    assert _inspect(test_db_url, diff) == []


def test_downgrade_then_upgrade_is_clean(alembic_config: Config, test_db_url: str) -> None:
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")
    assert _inspect(test_db_url, _tables) == set()
    assert _inspect(test_db_url, _enums) == set()
    command.upgrade(alembic_config, "head")
    assert _inspect(test_db_url, _tables) == EXPECTED_TABLES


def test_transfer_category_migration_labels_existing_cash_withdrawal(
    alembic_config: Config, test_db_url: str
) -> None:
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "fc78c51ea778")

    async def run(*statements: str):
        engine = create_async_engine(test_db_url)
        try:
            async with engine.begin() as conn:
                result = None
                for sql in statements:
                    result = await conn.exec_driver_sql(sql)
                return result.all() if result.returns_rows else None
        finally:
            await engine.dispose()

    asyncio.run(run(
        "INSERT INTO accounts (name, type, package_name) VALUES "
        "('BCA', 'bank', 'com.bca.mybca.omni.android'), ('Cash', 'cash', NULL)",
        "INSERT INTO raw_notifications (package_name, title, text, posted_at, content_hash) "
        "VALUES ('com.bca.mybca.omni.android', 'Catatan Finansial', "
        "'Pengeluaran sebesar IDR 50,000.00 di kategori Uang Tunai.', now(), 'legacy-cash')",
        "INSERT INTO transactions (account_id, to_account_id, type, amount, occurred_at, "
        "source, raw_notification_id) SELECT src.id, dest.id, 'transfer', 50000, raw.posted_at, "
        "'notification', raw.id FROM accounts src, accounts dest, raw_notifications raw "
        "WHERE src.name = 'BCA' AND dest.name = 'Cash' AND raw.content_hash = 'legacy-cash'"
    ))
    assert asyncio.run(run("SELECT count(*) FROM transactions")) == [(1,)]
    try:
        command.upgrade(alembic_config, "head")
        result = asyncio.run(run(
            "SELECT c.name, c.type::text FROM transactions t "
            "JOIN categories c ON c.id = t.category_id WHERE t.amount = 50000"
        ))
        assert result == [("Tarik Tunai", "transfer")]
    finally:
        asyncio.run(run(
            "DELETE FROM transactions WHERE amount = 50000",
            "DELETE FROM raw_notifications WHERE content_hash = 'legacy-cash'",
            "DELETE FROM accounts WHERE name IN ('BCA', 'Cash')"
        ))
