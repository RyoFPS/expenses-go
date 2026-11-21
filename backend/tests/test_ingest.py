"""M1: ingest notifikasi mentah.

Teks notifikasi di sini sengaja generik (bukan format bank asli); parsing baru di M2.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import RawNotification
from app.models.enums import ParseStatus
from tests.conftest import TEST_API_KEY

URL = "/api/v1/ingest/notification"
BATCH_URL = "/api/v1/ingest/notification/batch"
AUTH = {"X-API-Key": TEST_API_KEY}
POSTED_AT = 1_763_700_000_123  # 2025-11-21T04:40:00.123Z


def make_payload(**overrides) -> dict:
    payload = {
        "package_name": "com.example.bank",
        "title": "Contoh judul",
        "text": "Contoh isi notifikasi #1",
        "posted_at": POSTED_AT,
    }
    payload.update(overrides)
    return payload


async def count_raw(sm: async_sessionmaker[AsyncSession]) -> int:
    async with sm() as s:
        return await s.scalar(select(func.count()).select_from(RawNotification))


# --- single ---------------------------------------------------------------


async def test_accepts_and_stores_raw(client: httpx.AsyncClient, db_sessionmaker) -> None:
    payload = make_payload(text="  isi dengan spasi\n dan baris baru  ")
    resp = await client.post(URL, json=payload, headers=AUTH)

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "accepted"
    raw_id = body["raw_id"]

    async with db_sessionmaker() as s:
        raw = await s.get(RawNotification, raw_id)
    assert raw is not None
    assert raw.package_name == payload["package_name"]
    assert raw.title == payload["title"]
    assert raw.text == payload["text"]  # tidak dimodifikasi / di-strip
    assert raw.posted_at == datetime(2025, 11, 21, 4, 40, 0, 123000, tzinfo=UTC)
    assert raw.received_at.tzinfo is not None
    assert raw.parse_status == ParseStatus.pending
    assert len(raw.content_hash) == 64


async def test_same_notification_twice_is_idempotent(client, db_sessionmaker) -> None:
    first = await client.post(URL, json=make_payload(), headers=AUTH)
    second = await client.post(URL, json=make_payload(), headers=AUTH)

    assert first.status_code == 202
    assert second.status_code == 200
    assert second.json() == {"status": "duplicate"}
    assert await count_raw(db_sessionmaker) == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("package_name", "com.example.other"),
        ("title", "Judul lain"),
        ("text", "Isi lain"),
        ("posted_at", POSTED_AT + 1),
    ],
)
async def test_any_field_change_is_new_notification(client, db_sessionmaker, field, value) -> None:
    await client.post(URL, json=make_payload(), headers=AUTH)
    resp = await client.post(URL, json=make_payload(**{field: value}), headers=AUTH)
    assert resp.status_code == 202
    assert await count_raw(db_sessionmaker) == 2


async def test_hash_is_not_ambiguous_across_field_boundaries(client, db_sessionmaker) -> None:
    a = make_payload(title="ab", text="c")
    b = make_payload(title="a", text="bc")
    assert (await client.post(URL, json=a, headers=AUTH)).status_code == 202
    assert (await client.post(URL, json=b, headers=AUTH)).status_code == 202
    assert await count_raw(db_sessionmaker) == 2


async def test_concurrent_duplicates_store_one_row(client, db_sessionmaker) -> None:
    responses = await asyncio.gather(
        *(client.post(URL, json=make_payload(), headers=AUTH) for _ in range(5))
    )
    codes = sorted(r.status_code for r in responses)
    assert codes == [200, 200, 200, 200, 202]
    assert await count_raw(db_sessionmaker) == 1


async def test_empty_title_is_allowed(client) -> None:
    resp = await client.post(URL, json=make_payload(title=""), headers=AUTH)
    assert resp.status_code == 202


# --- auth -----------------------------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-API-Key": "wrong"}, {"X-API-Key": ""}, {"X-API-Key": TEST_API_KEY + "x"}],
    ids=["missing", "wrong", "empty", "prefix"],
)
async def test_invalid_api_key_is_401(client, db_sessionmaker, headers) -> None:
    resp = await client.post(URL, json=make_payload(), headers=headers)
    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid API key"}

    resp = await client.post(BATCH_URL, json=[make_payload()], headers=headers)
    assert resp.status_code == 401
    assert await count_raw(db_sessionmaker) == 0


async def test_invalid_key_with_invalid_payload_is_401(client) -> None:
    resp = await client.post(URL, json={"foo": 1}, headers={"X-API-Key": "wrong"})
    assert resp.status_code == 401


# --- validation -----------------------------------------------------------

NOW_MS = int(datetime.now(UTC).timestamp() * 1000)


@pytest.mark.parametrize(
    "payload",
    [
        {k: v for k, v in make_payload().items() if k != "text"},
        {k: v for k, v in make_payload().items() if k != "posted_at"},
        make_payload(text=""),
        make_payload(package_name=""),
        make_payload(package_name="com.bad name"),
        make_payload(posted_at="1763700000123"),  # string, bukan int
        make_payload(posted_at=1763700000.5),  # float
        make_payload(posted_at=True),
        make_payload(posted_at=1_763_700_000),  # detik, bukan ms
        make_payload(posted_at=NOW_MS + int(timedelta(days=2).total_seconds() * 1000)),
        make_payload(text=123),
        make_payload(text="x" * 10_001),
        make_payload(extra_field="nope"),
    ],
    ids=[
        "missing-text",
        "missing-posted_at",
        "empty-text",
        "empty-package",
        "bad-package",
        "posted_at-string",
        "posted_at-float",
        "posted_at-bool",
        "posted_at-seconds",
        "posted_at-future",
        "text-int",
        "text-too-long",
        "extra-field",
    ],
)
async def test_invalid_payload_is_422(client, db_sessionmaker, payload) -> None:
    resp = await client.post(URL, json=payload, headers=AUTH)
    assert resp.status_code == 422
    assert await count_raw(db_sessionmaker) == 0


async def test_malformed_json_is_422(client) -> None:
    resp = await client.post(
        URL, content=b"{not json", headers={**AUTH, "Content-Type": "application/json"}
    )
    assert resp.status_code == 422


# --- batch ----------------------------------------------------------------


async def test_batch_stores_all_and_reports_in_order(client, db_sessionmaker) -> None:
    items = [make_payload(text=f"isi {i}") for i in range(3)]
    resp = await client.post(BATCH_URL, json=items, headers=AUTH)

    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] == 3
    assert body["duplicate"] == 0
    assert [r["status"] for r in body["results"]] == ["accepted"] * 3
    assert len({r["raw_id"] for r in body["results"]}) == 3
    assert await count_raw(db_sessionmaker) == 3


async def test_batch_resend_is_idempotent(client, db_sessionmaker) -> None:
    items = [make_payload(text=f"isi {i}") for i in range(3)]
    await client.post(BATCH_URL, json=items, headers=AUTH)

    # Kirim ulang + 1 item baru (simulasi antrian offline yang sebagian sudah terkirim)
    resp = await client.post(BATCH_URL, json=[*items, make_payload(text="baru")], headers=AUTH)
    body = resp.json()
    assert body["accepted"] == 1
    assert body["duplicate"] == 3
    assert [r["status"] for r in body["results"]] == ["duplicate"] * 3 + ["accepted"]
    assert await count_raw(db_sessionmaker) == 4


async def test_batch_with_duplicates_inside_request(client, db_sessionmaker) -> None:
    a, b = make_payload(text="a"), make_payload(text="b")
    resp = await client.post(BATCH_URL, json=[a, b, a], headers=AUTH)
    body = resp.json()
    assert [r["status"] for r in body["results"]] == ["accepted", "accepted", "duplicate"]
    assert await count_raw(db_sessionmaker) == 2


async def test_batch_and_single_share_idempotency(client, db_sessionmaker) -> None:
    await client.post(URL, json=make_payload(), headers=AUTH)
    resp = await client.post(BATCH_URL, json=[make_payload()], headers=AUTH)
    assert resp.json()["results"] == [{"status": "duplicate", "raw_id": None}]
    assert await count_raw(db_sessionmaker) == 1


async def test_batch_max_100(client, db_sessionmaker) -> None:
    ok = [make_payload(text=f"isi {i}") for i in range(100)]
    assert (await client.post(BATCH_URL, json=ok, headers=AUTH)).status_code == 200

    too_many = [make_payload(text=f"lain {i}") for i in range(101)]
    assert (await client.post(BATCH_URL, json=too_many, headers=AUTH)).status_code == 422
    assert await count_raw(db_sessionmaker) == 100


async def test_batch_empty_is_422(client) -> None:
    assert (await client.post(BATCH_URL, json=[], headers=AUTH)).status_code == 422


async def test_batch_one_invalid_item_rejects_whole_batch(client, db_sessionmaker) -> None:
    resp = await client.post(BATCH_URL, json=[make_payload(), make_payload(text="")], headers=AUTH)
    assert resp.status_code == 422
    assert await count_raw(db_sessionmaker) == 0


# --- logging --------------------------------------------------------------


async def test_notification_text_not_logged_at_info(client, caplog) -> None:
    secret_text = "RAHASIA-saldo-12345"
    with caplog.at_level("INFO"):
        await client.post(URL, json=make_payload(text=secret_text), headers=AUTH)
    assert secret_text not in caplog.text
    assert "stored id=" in caplog.text
