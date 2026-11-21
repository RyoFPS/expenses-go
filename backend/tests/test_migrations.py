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
