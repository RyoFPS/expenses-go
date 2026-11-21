import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy.engine import make_url

os.environ.setdefault("ENV", "dev")
os.environ.setdefault("API_KEY", "test-api-key")

from alembic.config import Config  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _test_db_url() -> str:
    """DB terpisah `<nama>_test` agar test tidak menyentuh data dev."""
    base = make_url(os.environ["DATABASE_URL"])
    return base.set(database=f"{base.database}_test").render_as_string(hide_password=False)


def _asyncpg_dsn(url: str, database: str | None = None) -> str:
    u = make_url(url).set(drivername="postgresql")
    if database:
        u = u.set(database=database)
    return u.render_as_string(hide_password=False)


async def _recreate_db(url: str) -> None:
    name = make_url(url).database
    conn = await asyncpg.connect(_asyncpg_dsn(url, "postgres"))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def _drop_db(url: str) -> None:
    name = make_url(url).database
    conn = await asyncpg.connect(_asyncpg_dsn(url, "postgres"))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def test_db_url() -> Iterator[str]:
    url = _test_db_url()
    asyncio.run(_recreate_db(url))
    yield url
    asyncio.run(_drop_db(url))


@pytest.fixture(scope="session")
def alembic_config(test_db_url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_db_url.replace("%", "%%"))
    cfg.attributes["configure_logger"] = False
    return cfg
