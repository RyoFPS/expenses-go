from datetime import UTC, datetime

from tests.api_helpers import API, create_account, create_category, create_tx
from tests.conftest import TEST_API_KEY

BCA_PKG = "com.bca.mybca.omni.android"


async def ingest(client, text: str, title: str = "Catatan Finansial", pkg: str = BCA_PKG, ms: int = 1_763_700_000_000):
    resp = await client.post(
        f"{API}/ingest/notification",
        json={"package_name": pkg, "title": title, "text": text, "posted_at": ms},
        headers={"X-API-Key": TEST_API_KEY},
    )
    assert resp.status_code == 202, resp.text
    return resp.json()["raw_id"]


# --- raw notifications --------------------------------------------------------


async def test_list_failed_then_reparse_all(client) -> None:
    # Belum ada akun BCA -> failed
    r1 = await ingest(client, "Pengeluaran sebesar IDR 10,000.00 di kategori Makanan.")
    r2 = await ingest(client, "Pengeluaran sebesar IDR 77,000.00 di kategori Makanan.", ms=1_763_700_120_000)
    await ingest(client, "promo", title="Info", pkg="com.lain")  # ignored

    page = (await client.get(f"{API}/raw-notifications", params={"parse_status": "failed"})).json()
    assert page["total"] == 2
    assert {r["id"] for r in page["items"]} == {r1, r2}
    assert all("belum ada akun" in r["parse_error"] for r in page["items"])
    assert (await client.get(f"{API}/raw-notifications")).json()["total"] == 3
    assert (await client.get(f"{API}/raw-notifications", params={"package_name": "com.lain"})).json()["total"] == 1

    await create_account(client, "BCA", package_name=BCA_PKG)
    resp = await client.post(f"{API}/raw-notifications/reparse-all")  # default failed
    assert resp.status_code == 200
    assert resp.json() == {"processed": 2, "by_status": {"parsed": 2}}
    assert (await client.get(f"{API}/transactions")).json()["total"] == 2

    # Idempoten: reparse lagi tidak menggandakan
    assert (await client.post(f"{API}/raw-notifications/reparse-all", params={"parse_status": "parsed"})).json()["processed"] == 2
    assert (await client.post(f"{API}/raw-notifications/{r1}/reparse")).json()["parse_status"] == "parsed"
    assert (await client.get(f"{API}/transactions")).json()["total"] == 2


async def test_reparse_unknown_raw_is_404(client) -> None:
    resp = await client.post(f"{API}/raw-notifications/00000000-0000-0000-0000-000000000000/reparse")
    assert resp.status_code == 404


# --- reports ------------------------------------------------------------------


async def test_monthly_summary(client) -> None:
    bank = await create_account(client, "Bank")
    wallet = await create_account(client, "Wallet", type="ewallet")
    makan = await create_category(client, "Makan")
    gaji = await create_category(client, "Gaji", "income")

    nov = datetime(2026, 11, 15, 5, 0, tzinfo=UTC)
    await create_tx(client, bank, "income", 5_000_000, category_id=gaji["id"], occurred_at=nov)
    await create_tx(client, bank, "expense", 50_000, category_id=makan["id"], occurred_at=nov)
    await create_tx(client, bank, "expense", 30_000, category_id=makan["id"], occurred_at=nov)
    await create_tx(client, bank, "expense", 20_000, occurred_at=nov)  # tanpa kategori
    await create_tx(client, bank, "transfer", 100_000, fee=2_500, to_account_id=wallet, occurred_at=nov)
    # 2026-10-31 23:30 WIB (= 16:30 UTC) masuk Oktober; 2026-11-30 17:30 UTC = 1 Des 00:30 WIB masuk Desember
    await create_tx(client, bank, "expense", 999, occurred_at=datetime(2026, 10, 31, 16, 30, tzinfo=UTC))
    await create_tx(client, bank, "expense", 888, occurred_at=datetime(2026, 11, 30, 17, 30, tzinfo=UTC))
    # 2026-10-31 17:30 UTC = 1 Nov 00:30 WIB masuk November
    await create_tx(client, bank, "expense", 1_000, category_id=makan["id"], occurred_at=datetime(2026, 10, 31, 17, 30, tzinfo=UTC))

    s = (await client.get(f"{API}/reports/summary", params={"month": "2026-11"})).json()
    assert s["month"] == "2026-11"
    assert s["income"] == 5_000_000
    assert s["fees"] == 2_500
    assert s["expense"] == 50_000 + 30_000 + 20_000 + 1_000 + 2_500
    assert s["net"] == s["income"] - s["expense"]
    assert [(c["name"], c["type"], c["total"]) for c in s["by_category"]] == [
        ("Makan", "expense", 81_000),
        ("Tanpa kategori", "expense", 20_000),
        ("Gaji", "income", 5_000_000),
    ]

    oct_ = (await client.get(f"{API}/reports/summary", params={"month": "2026-10"})).json()
    assert oct_["expense"] == 999
    assert (await client.get(f"{API}/reports/summary", params={"month": "2026-13"})).status_code == 422
    assert (await client.get(f"{API}/reports/summary")).status_code == 200


async def test_cashflow_grouping_and_gap_fill(client) -> None:
    bank = await create_account(client, "Bank")
    wallet = await create_account(client, "Wallet", type="ewallet")
    # Senin 2026-11-09, Rabu 2026-11-11, Senin 2026-11-16 (WIB)
    await create_tx(client, bank, "income", 100, occurred_at=datetime(2026, 11, 9, 1, 0, tzinfo=UTC))
    await create_tx(client, bank, "expense", 40, occurred_at=datetime(2026, 11, 11, 1, 0, tzinfo=UTC))
    await create_tx(client, bank, "transfer", 500, fee=5, to_account_id=wallet, occurred_at=datetime(2026, 11, 11, 2, 0, tzinfo=UTC))
    # 2026-11-15 17:30 UTC = Senin 16 Nov 00:30 WIB
    await create_tx(client, bank, "expense", 7, occurred_at=datetime(2026, 11, 15, 17, 30, tzinfo=UTC))

    day = (await client.get(f"{API}/reports/cashflow", params={"date_from": "2026-11-09", "date_to": "2026-11-12"})).json()
    assert [(p["period"], p["income"], p["expense"], p["net"]) for p in day["points"]] == [
        ("2026-11-09", 100, 0, 100),
        ("2026-11-10", 0, 0, 0),
        ("2026-11-11", 0, 45, -45),
        ("2026-11-12", 0, 0, 0),
    ]

    week = (await client.get(f"{API}/reports/cashflow", params={"date_from": "2026-11-10", "date_to": "2026-11-16", "group_by": "week"})).json()
    # date_from Selasa -> periode pertama mulai Senin 09; data Senin 09 di luar date_from tidak ikut
    assert [(p["period"], p["income"], p["expense"]) for p in week["points"]] == [
        ("2026-11-09", 0, 45),
        ("2026-11-16", 0, 7),
    ]

    month = (await client.get(f"{API}/reports/cashflow", params={"date_from": "2026-10-01", "date_to": "2026-11-30", "group_by": "month"})).json()
    assert [(p["period"], p["income"], p["expense"]) for p in month["points"]] == [
        ("2026-10-01", 0, 0),
        ("2026-11-01", 100, 52),
    ]

    bad = await client.get(f"{API}/reports/cashflow", params={"date_from": "2026-11-12", "date_to": "2026-11-01"})
    assert bad.status_code == 422
    assert (await client.get(f"{API}/reports/cashflow", params={"date_from": "2026-11-12", "date_to": "2026-11-13", "group_by": "year"})).status_code == 422


async def test_net_worth_includes_inactive(client) -> None:
    a = await create_account(client, "A", opening_balance=1_000)
    b = await create_account(client, "B", opening_balance=500)
    await client.patch(f"{API}/accounts/{b['id']}", json={"is_active": False})
    nw = (await client.get(f"{API}/reports/net-worth")).json()
    assert nw["total"] == 1_500
    assert {(x["name"], x["is_active"]) for x in nw["accounts"]} == {("A", True), ("B", False)}
    assert a
