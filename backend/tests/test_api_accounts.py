import uuid
from datetime import timedelta

import pytest

from app.models import BalanceSnapshot
from tests.api_helpers import API, T0, balance, create_account, create_tx

# --- CRUD -------------------------------------------------------------------


async def test_create_list_update_account(client) -> None:
    acc = await create_account(client, "Jago", package_name="com.jago.app", opening_balance=100_000)
    assert acc["opening_balance"] == 100_000 and acc["is_active"] is True

    resp = await client.patch(f"{API}/accounts/{acc['id']}", json={"name": "Jago Utama", "is_active": False})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Jago Utama" and resp.json()["is_active"] is False

    listed = (await client.get(f"{API}/accounts")).json()
    assert [(a["name"], a["balance"]) for a in listed] == [("Jago Utama", 100_000)]
    assert (await client.get(f"{API}/accounts", params={"include_inactive": False})).json() == []


async def test_duplicate_name_is_409(client) -> None:
    await create_account(client, "GoPay", type="ewallet")
    resp = await client.post(f"{API}/accounts", json={"name": "GoPay", "type": "ewallet"})
    assert resp.status_code == 409
    assert "Nama akun" in resp.json()["detail"]


async def test_one_active_account_per_package(client) -> None:
    a = await create_account(client, "BCA", package_name="com.bca.mybca.omni.android")
    resp = await client.post(
        f"{API}/accounts", json={"name": "BCA 2", "type": "bank", "package_name": "com.bca.mybca.omni.android"}
    )
    assert resp.status_code == 409

    # Setelah akun lama dinonaktifkan, package boleh dipakai akun baru.
    await client.patch(f"{API}/accounts/{a['id']}", json={"is_active": False})
    await create_account(client, "BCA 2", package_name="com.bca.mybca.omni.android")


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "type": "bank"},
        {"name": "X", "type": "kripto"},
        {"name": "X", "type": "bank", "opening_balance": 1.5},
        {"name": "X", "type": "bank", "opening_balance": "100"},
        {"name": "X", "type": "bank", "package_name": "bad pkg"},
        {"name": "X", "type": "bank", "unknown": 1},
    ],
)
async def test_invalid_account_is_422(client, body) -> None:
    assert (await client.post(f"{API}/accounts", json=body)).status_code == 422


async def test_patch_null_on_required_field_is_422(client) -> None:
    acc = await create_account(client, "Cash", type="cash")
    assert (await client.patch(f"{API}/accounts/{acc['id']}", json={"name": None})).status_code == 422


async def test_unknown_account_is_404(client) -> None:
    rid = uuid.uuid4()
    assert (await client.patch(f"{API}/accounts/{rid}", json={"name": "x"})).status_code == 404
    assert (await client.get(f"{API}/accounts/{rid}/balance")).status_code == 404


# --- perhitungan saldo (AC M3) ---------------------------------------------


async def test_balance_income_expense_transfer_fee(client) -> None:
    bank = await create_account(client, "Bank", opening_balance=1_000_000)
    wallet = await create_account(client, "Wallet", type="ewallet", opening_balance=50_000)
    cash = await create_account(client, "Cash", type="cash")

    await create_tx(client, bank, "income", 500_000)  # bank 1.500.000
    await create_tx(client, bank, "expense", 120_000)  # bank 1.380.000
    await create_tx(client, bank, "transfer", 200_000, fee=2_500, to_account_id=wallet)  # bank 1.177.500, wallet 250.000
    await create_tx(client, wallet, "expense", 30_000)  # wallet 220.000
    await create_tx(client, wallet, "transfer", 20_000, to_account_id=cash)  # wallet 200.000, cash 20.000
    await create_tx(client, cash, "expense", 5_000)  # cash 15.000

    assert (await balance(client, bank))["calculated"] == 1_177_500
    assert (await balance(client, wallet))["calculated"] == 200_000
    assert (await balance(client, cash))["calculated"] == 15_000

    listed = {a["name"]: a["balance"] for a in (await client.get(f"{API}/accounts")).json()}
    assert listed == {"Bank": 1_177_500, "Wallet": 200_000, "Cash": 15_000}

    nw = (await client.get(f"{API}/reports/net-worth")).json()
    # Total turun hanya sebesar pengeluaran + fee; transfer antar akun netral.
    assert nw["total"] == 1_050_000 + 500_000 - 120_000 - 2_500 - 30_000 - 5_000
    assert sum(a["balance"] for a in nw["accounts"]) == nw["total"]


async def test_balance_negative_opening_and_empty_account(client) -> None:
    acc = await create_account(client, "Paylater", type="ewallet", opening_balance=-75_000)
    b = await balance(client, acc)
    assert b == {
        "account_id": acc["id"],
        "calculated": -75_000,
        "last_snapshot": None,
        "calculated_at_snapshot": None,
        "diff": None,
    }


async def test_balance_updates_after_patch_and_delete(client) -> None:
    acc = await create_account(client, "Bank")
    tx = await create_tx(client, acc, "income", 10_000)
    await client.patch(f"{API}/transactions/{tx['id']}", json={"amount": 15_000})
    assert (await balance(client, acc))["calculated"] == 15_000
    await client.delete(f"{API}/transactions/{tx['id']}")
    assert (await balance(client, acc))["calculated"] == 0


# --- rekonsiliasi -------------------------------------------------------------


async def _snapshot(db_sessionmaker, account: dict, balance_value: int, at) -> None:
    async with db_sessionmaker() as s:
        s.add(BalanceSnapshot(account_id=uuid.UUID(account["id"]), balance=balance_value, observed_at=at))
        await s.commit()


async def test_diff_uses_balance_at_snapshot_time(client, db_sessionmaker) -> None:
    acc = await create_account(client, "Bank", opening_balance=100_000)
    await create_tx(client, acc, "expense", 10_000, occurred_at=T0)
    await _snapshot(db_sessionmaker, acc, 90_000, T0 + timedelta(minutes=1))  # cocok saat itu
    await create_tx(client, acc, "expense", 5_000, occurred_at=T0 + timedelta(hours=1))  # setelah snapshot

    b = await balance(client, acc)
    assert b["calculated"] == 85_000
    assert b["last_snapshot"]["balance"] == 90_000
    assert b["calculated_at_snapshot"] == 90_000
    assert b["diff"] == 0


@pytest.mark.parametrize("snapshot_balance,exp_type", [(95_000, "income"), (80_000, "expense")])
async def test_reconcile_creates_adjustment(client, db_sessionmaker, snapshot_balance, exp_type) -> None:
    acc = await create_account(client, "Bank", opening_balance=100_000)
    await create_tx(client, acc, "expense", 10_000, occurred_at=T0)
    await _snapshot(db_sessionmaker, acc, snapshot_balance, T0 + timedelta(minutes=5))
    diff = snapshot_balance - 90_000
    assert (await balance(client, acc))["diff"] == diff

    resp = await client.post(f"{API}/accounts/{acc['id']}/reconcile")
    assert resp.status_code == 201
    adj = resp.json()
    assert (adj["type"], adj["amount"], adj["source"]) == (exp_type, abs(diff), "manual")

    cats = {c["id"]: c for c in (await client.get(f"{API}/categories")).json()}
    assert cats[adj["category_id"]]["name"] == "Penyesuaian saldo"
    assert cats[adj["category_id"]]["type"] == exp_type

    after = await balance(client, acc)
    assert after["diff"] == 0 and after["calculated"] == snapshot_balance

    # Sudah cocok -> 409, kategori penyesuaian tidak diduplikasi.
    assert (await client.post(f"{API}/accounts/{acc['id']}/reconcile")).status_code == 409


async def test_reconcile_without_snapshot_is_409(client) -> None:
    acc = await create_account(client, "Bank")
    assert (await client.post(f"{API}/accounts/{acc['id']}/reconcile")).status_code == 409
