import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models import RawNotification
from app.models.enums import ParseStatus
from tests.api_helpers import API, T0, create_account, create_category, create_tx
from tests.conftest import TEST_API_KEY


@pytest.fixture
async def setup(client):
    bank = await create_account(client, "Bank")
    wallet = await create_account(client, "Wallet", type="ewallet")
    makan = await create_category(client, "Makan")
    gaji = await create_category(client, "Gaji", "income")
    tarik_tunai = await create_category(client, "Tarik Tunai Lain", "transfer")
    return {"bank": bank, "wallet": wallet, "makan": makan, "gaji": gaji, "tarik_tunai": tarik_tunai}


# --- create ---------------------------------------------------------------


async def test_manual_cash_entry_defaults(client, setup) -> None:
    before = datetime.now(UTC)
    tx = await create_tx(client, setup["bank"], "expense", 25_000, category_id=setup["makan"]["id"], note="Bakso")
    assert tx["source"] == "manual"
    assert tx["needs_review"] is False
    assert tx["fee"] == 0
    assert datetime.fromisoformat(tx["occurred_at"]) >= before - timedelta(seconds=1)


@pytest.mark.parametrize(
    "overrides,detail",
    [
        ({"type": "transfer"}, "to_account_id"),
        ({"type": "expense", "to_account": "wallet"}, "hanya untuk transfer"),
        ({"type": "transfer", "to_account": "bank"}, "berbeda"),
        ({"type": "expense", "fee": 1000}, "fee"),
        ({"type": "expense", "category": "gaji"}, "Kategori bertipe income"),
        ({"type": "transfer", "to_account": "wallet", "category": "makan"}, "Kategori bertipe expense"),
        ({"type": "expense", "account_id": str(uuid.uuid4())}, "account_id tidak ditemukan"),
        ({"type": "expense", "category_id": str(uuid.uuid4())}, "category_id tidak ditemukan"),
    ],
)
async def test_invalid_business_rules_are_422(client, setup, overrides, detail) -> None:
    body = {"account_id": setup["bank"]["id"], "amount": 1000}
    if (to := overrides.pop("to_account", None)) is not None:
        body["to_account_id"] = setup[to]["id"]
    if (cat := overrides.pop("category", None)) is not None:
        body["category_id"] = setup[cat]["id"]
    body.update(overrides)
    resp = await client.post(f"{API}/transactions", json=body)
    assert resp.status_code == 422
    assert detail in resp.json()["detail"]


@pytest.mark.parametrize(
    "patch",
    [
        {"amount": 0},
        {"amount": -5},
        {"amount": 10.5},
        {"amount": "1000"},
        {"fee": -1},
        {"occurred_at": "2026-11-10T10:00:00"},  # tanpa timezone
        {"source": "notification"},  # tidak boleh diisi client
        {"needs_review": True},
    ],
)
async def test_invalid_payload_is_422(client, setup, patch) -> None:
    body = {"account_id": setup["bank"]["id"], "type": "expense", "amount": 1000, **patch}
    assert (await client.post(f"{API}/transactions", json=body)).status_code == 422


# --- list & filter ----------------------------------------------------------


async def test_list_filters_and_pagination(client, setup) -> None:
    bank, wallet = setup["bank"], setup["wallet"]
    # 2026-11-10 23:30 WIB = 16:30 UTC; 2026-11-11 00:30 WIB = 17:30 UTC
    late = datetime(2026, 11, 10, 16, 30, tzinfo=UTC)
    early_next = datetime(2026, 11, 10, 17, 30, tzinfo=UTC)
    await create_tx(client, bank, "expense", 1, merchant="Kopi Kenangan", occurred_at=late, category_id=setup["makan"]["id"])
    await create_tx(client, bank, "income", 2, merchant="PT Gaji", occurred_at=early_next, category_id=setup["gaji"]["id"])
    await create_tx(client, bank, "transfer", 3, to_account_id=wallet, occurred_at=T0, note="isi 100%_saldo")
    await create_tx(client, wallet, "expense", 4, occurred_at=T0 + timedelta(days=3))

    async def amounts(**params) -> list[int]:
        resp = await client.get(f"{API}/transactions", params=params)
        assert resp.status_code == 200, resp.text
        return [t["amount"] for t in resp.json()["items"]]

    assert await amounts() == [4, 2, 1, 3]  # occurred_at desc
    assert await amounts(account_id=wallet["id"]) == [4, 3]  # transfer masuk ikut
    assert await amounts(type="income") == [2]
    assert await amounts(category_id=setup["makan"]["id"]) == [1]
    assert await amounts(date_from="2026-11-11", date_to="2026-11-11") == [2]  # batas hari WIB
    assert await amounts(date_to="2026-11-10") == [1, 3]
    assert await amounts(q="kopi") == [1]
    assert await amounts(q="100%_") == [3]  # wildcard di-escape
    assert await amounts(q="%") == [3]
    assert await amounts(needs_review=True) == []

    page = (await client.get(f"{API}/transactions", params={"page": 2, "page_size": 3})).json()
    assert page["total"] == 4 and page["page"] == 2 and [t["amount"] for t in page["items"]] == [3]
    assert (await client.get(f"{API}/transactions", params={"page_size": 500})).status_code == 422


# --- detail, patch, delete, review -----------------------------------------


async def test_detail_includes_raw_notification(client, db_sessionmaker) -> None:
    from app.parsers.bca import BcaParser  # noqa: F401 - parser terdaftar via registry

    await create_account(client, "BCA", package_name="com.bca.mybca.omni.android")
    text = "Pengeluaran sebesar IDR 10,000.00 di kategori Makanan."
    resp = await client.post(
        f"{API}/ingest/notification",
        json={"package_name": "com.bca.mybca.omni.android", "title": "Catatan Finansial", "text": text,
              "posted_at": int(T0.timestamp() * 1000)},
        headers={"X-API-Key": TEST_API_KEY},
    )
    raw_id = resp.json()["raw_id"]
    [tx] = (await client.get(f"{API}/transactions")).json()["items"]
    detail = (await client.get(f"{API}/transactions/{tx['id']}")).json()
    assert detail["raw_notification"]["id"] == raw_id
    assert detail["raw_notification"]["text"] == text
    assert detail["counter_raw_notification"] is None


async def test_manual_detail_has_no_raw(client, setup) -> None:
    tx = await create_tx(client, setup["bank"], "expense", 1)
    detail = (await client.get(f"{API}/transactions/{tx['id']}")).json()
    assert detail["raw_notification"] is None
    assert (await client.get(f"{API}/transactions/{uuid.uuid4()}")).status_code == 404


async def test_patch_category_inline(client, setup) -> None:
    tx = await create_tx(client, setup["bank"], "expense", 1)
    resp = await client.patch(f"{API}/transactions/{tx['id']}", json={"category_id": setup["makan"]["id"]})
    assert resp.status_code == 200 and resp.json()["category_id"] == setup["makan"]["id"]
    resp = await client.patch(f"{API}/transactions/{tx['id']}", json={"category_id": setup["gaji"]["id"]})
    assert resp.status_code == 422


async def test_transfer_category_can_be_saved_and_filtered(client, setup) -> None:
    tx = await create_tx(
        client, setup["bank"], "transfer", 50_000,
        to_account_id=setup["wallet"], category_id=setup["tarik_tunai"]["id"],
    )
    assert tx["category_id"] == setup["tarik_tunai"]["id"]
    filtered = (await client.get(
        f"{API}/transactions", params={"category_id": setup["tarik_tunai"]["id"]}
    )).json()
    assert [item["id"] for item in filtered["items"]] == [tx["id"]]
    resp = await client.patch(f"{API}/transactions/{tx['id']}", json={"type": "expense"})
    assert resp.status_code == 200 and resp.json()["category_id"] is None


async def test_patch_type_change_clears_incompatible_fields(client, setup) -> None:
    tx = await create_tx(client, setup["bank"], "transfer", 1, to_account_id=setup["wallet"])
    resp = await client.patch(f"{API}/transactions/{tx['id']}", json={"type": "expense"})
    assert resp.status_code == 200 and resp.json()["to_account_id"] is None

    tx = await create_tx(client, setup["bank"], "expense", 2, category_id=setup["makan"]["id"])
    resp = await client.patch(f"{API}/transactions/{tx['id']}", json={"type": "income"})
    assert resp.status_code == 200 and resp.json()["category_id"] is None

    resp = await client.patch(
        f"{API}/transactions/{tx['id']}", json={"type": "transfer", "to_account_id": setup["wallet"]["id"]}
    )
    assert resp.status_code == 200 and resp.json()["type"] == "transfer"


async def test_patch_null_required_is_422(client, setup) -> None:
    tx = await create_tx(client, setup["bank"], "expense", 1)
    assert (await client.patch(f"{API}/transactions/{tx['id']}", json={"amount": None})).status_code == 422


async def test_delete_and_mark_reviewed(client, setup, db_sessionmaker) -> None:
    tx = await create_tx(client, setup["bank"], "expense", 1)
    assert (await client.delete(f"{API}/transactions/{tx['id']}")).status_code == 204
    assert (await client.delete(f"{API}/transactions/{tx['id']}")).status_code == 404
    assert (await client.post(f"{API}/transactions/{uuid.uuid4()}/mark-reviewed")).status_code == 404


async def test_mark_reviewed_clears_flag(client, db_sessionmaker) -> None:
    from app.models import Transaction
    from app.models.enums import TransactionSource, TransactionType

    acc = await create_account(client, "Bank")
    async with db_sessionmaker() as s:
        tx = Transaction(account_id=uuid.UUID(acc["id"]), type=TransactionType.expense, amount=1,
                         occurred_at=T0, source=TransactionSource.notification, needs_review=True)
        s.add(tx)
        await s.commit()
    assert [t["id"] for t in (await client.get(f"{API}/transactions", params={"needs_review": True})).json()["items"]] == [str(tx.id)]
    resp = await client.post(f"{API}/transactions/{tx.id}/mark-reviewed")
    assert resp.status_code == 200 and resp.json()["needs_review"] is False
    assert (await client.get(f"{API}/transactions", params={"needs_review": True})).json()["total"] == 0


async def test_deleted_notification_tx_can_be_reparsed(client, db_sessionmaker) -> None:
    """D-019: hapus transaksi lalu reparse raw-nya membuat transaksi baru."""
    await create_account(client, "BCA", package_name="com.bca.mybca.omni.android")
    resp = await client.post(
        f"{API}/ingest/notification",
        json={"package_name": "com.bca.mybca.omni.android", "title": "Catatan Finansial",
              "text": "Pengeluaran sebesar IDR 77,000.00 di kategori Makanan.", "posted_at": int(T0.timestamp() * 1000)},
        headers={"X-API-Key": TEST_API_KEY},
    )
    raw_id = resp.json()["raw_id"]
    [tx] = (await client.get(f"{API}/transactions")).json()["items"]
    await client.delete(f"{API}/transactions/{tx['id']}")

    resp = await client.post(f"{API}/raw-notifications/{raw_id}/reparse")
    assert resp.status_code == 200 and resp.json()["parse_status"] == "parsed"
    [new_tx] = (await client.get(f"{API}/transactions")).json()["items"]
    assert new_tx["amount"] == 77_000 and new_tx["id"] != tx["id"]

    async with db_sessionmaker() as s:
        assert (await s.get(RawNotification, uuid.UUID(raw_id))).parse_status == ParseStatus.parsed
