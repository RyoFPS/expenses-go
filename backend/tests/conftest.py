import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy.engine import make_url

TEST_API_KEY = "test-api-key"

os.environ["ENV"] = "dev"
# Paksa key yang diketahui test (menimpa API_KEY asli dari environment container).
os.environ["API_KEY"] = TEST_API_KEY
# Endpoint dashboard tanpa Cloudflare Access di test (auth diuji khusus di test_auth.py).
os.environ["AUTH_DISABLED"] = "true"

from collections.abc import AsyncIterator  # noqa: E402

import httpx  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import get_session  # noqa: E402
from app.main import app  # noqa: E402

get_settings.cache_clear()

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


@pytest.fixture(scope="session")
def migrated_db(alembic_config: Config, test_db_url: str) -> str:
    command.upgrade(alembic_config, "head")
    return test_db_url


@pytest.fixture
async def db_sessionmaker(migrated_db: str) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Sessionmaker ke DB test; tabel dikosongkan sebelum tiap test."""
    engine = create_async_engine(migrated_db)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE transactions, balance_snapshots, category_rules, categories, "
                "accounts, raw_notifications RESTART IDENTITY CASCADE"
            )
        )
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def client(db_sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[httpx.AsyncClient]:
    async def _session() -> AsyncIterator[AsyncSession]:
        async with db_sessionmaker() as s:
            yield s

    app.dependency_overrides[get_session] = _session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
