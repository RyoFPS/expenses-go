"""M2: pipeline raw -> transaksi (registry, akun, dedup, kategori, transfer matcher, reparse).

Framework diuji dengan parser dummy KHUSUS TEST berformat buatan
`type|amount|merchant|confidence|balance_after|counterpart` — ini bukan format bank.
Alur BCA end-to-end memakai fixture asli.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Account, BalanceSnapshot, Category, CategoryRule, RawNotification, Transaction
from app.models.enums import (
    AccountType,
    CategoryType,
    ParseStatus,
    RuleMatchType,
    TransactionSource,
    TransactionType,
)
from app.parsers import ParsedTransaction, ParseError, register, unregister
from app.services.processing import reparse, reparse_all
from tests.conftest import TEST_API_KEY

URL = "/api/v1/ingest/notification"
BATCH_URL = "/api/v1/ingest/notification/batch"
AUTH = {"X-API-Key": TEST_API_KEY}
T0 = datetime(2026, 11, 21, 7, 0, 0, tzinfo=UTC)
BANK_PKG, WALLET_PKG = "test.dummy.bank", "test.dummy.wallet"
BCA = json.loads(
    (Path(__file__).parent / "fixtures" / "bca" / "catatan_finansial.json").read_text(encoding="utf-8")
)


class DummyParser:
    def __init__(self, packages: set[str]) -> None:
        self.package_names = packages

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title == "promo":
            return None
        if title == "rusak":
            raise ParseError("format dummy rusak")
        if title == "boom":
            raise RuntimeError("bug tak terduga")
        t, amount, merchant, conf, balance, counterpart = text.split("|")
        return ParsedTransaction(
            type=t,
            amount=int(amount),
            merchant=merchant or None,
            confidence=float(conf),
            balance_after=int(balance) if balance else None,
            counterpart_hint=counterpart or None,
        )


@pytest.fixture(autouse=True)
def dummy_parser():
    p = DummyParser({BANK_PKG, WALLET_PKG})
    register(p)
    yield p
    unregister(p)


def ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def notif(text: str, *, pkg: str = BANK_PKG, title: str = "trx", at: datetime = T0) -> dict:
    return {"package_name": pkg, "title": title, "text": text, "posted_at": ms(at)}


def dummy(type_="expense", amount=50_000, merchant="Kopi Senja", conf=0.95, balance="", counterpart=""):
    return f"{type_}|{amount}|{merchant}|{conf}|{balance}|{counterpart}"


@pytest.fixture
async def accounts(db_sessionmaker: async_sessionmaker[AsyncSession]) -> dict[str, uuid.UUID]:
    async with db_sessionmaker() as s:
        bank = Account(name="Bank Test", type=AccountType.bank, package_name=BANK_PKG)
        wallet = Account(name="Wallet Test", type=AccountType.ewallet, package_name=WALLET_PKG)
        bca = Account(name="BCA", type=AccountType.bank, package_name=BCA["package_name"])
        s.add_all([bank, wallet, bca])
        await s.commit()
        return {"bank": bank.id, "wallet": wallet.id, "bca": bca.id}


async def post(client: httpx.AsyncClient, payload: dict) -> str:
    resp = await client.post(URL, json=payload, headers=AUTH)
    assert resp.status_code == 202, resp.text
    return resp.json()["raw_id"]


async def get_raw(sm, raw_id) -> RawNotification:
    async with sm() as s:
        return await s.get(RawNotification, raw_id)


async def all_tx(sm) -> list[Transaction]:
    async with sm() as s:
        return list(await s.scalars(select(Transaction).order_by(Transaction.occurred_at)))


async def count(sm, model) -> int:
    async with sm() as s:
        return await s.scalar(select(func.count()).select_from(model))


# --- BCA end-to-end dengan fixture asli ------------------------------------


async def test_bca_fixtures_become_transactions(client, db_sessionmaker, accounts) -> None:
    for i, case in enumerate(BCA["cases"]):
        raw_id = await post(
            client,
            notif(case["text"], pkg=BCA["package_name"], title=case["title"], at=T0 + timedelta(minutes=i)),
        )
        assert (await get_raw(db_sessionmaker, raw_id)).parse_status == ParseStatus.parsed

    txs = await all_tx(db_sessionmaker)
    assert [(t.type.value, t.amount) for t in txs] == [
        (c["expected"]["type"], c["expected"]["amount"]) for c in BCA["cases"]
    ]
    assert all(t.account_id == accounts["bca"] for t in txs)
    assert all(t.source == TransactionSource.notification and not t.needs_review for t in txs)
    assert txs[0].occurred_at == T0  # tidak ada waktu di teks -> posted_at


async def test_bca_category_hint_maps_to_existing_category(client, db_sessionmaker, accounts) -> None:
    async with db_sessionmaker() as s:
        makanan = Category(name="makanan", type=CategoryType.expense)
        s.add(makanan)
        await s.commit()
    case = next(c for c in BCA["cases"] if c["expected"]["category_hint"] == "Makanan")
    await post(client, notif(case["text"], pkg=BCA["package_name"], title=case["title"]))
    [tx] = await all_tx(db_sessionmaker)
    assert tx.category_id == makanan.id


# --- status raw -------------------------------------------------------------


async def test_unknown_package_is_ignored(client, db_sessionmaker, accounts) -> None:
    raw_id = await post(client, notif(dummy(), pkg="com.unknown.app"))
    assert (await get_raw(db_sessionmaker, raw_id)).parse_status == ParseStatus.ignored
    assert await count(db_sessionmaker, Transaction) == 0


async def test_non_transaction_is_ignored(client, db_sessionmaker, accounts) -> None:
    raw_id = await post(client, notif("diskon 50%", title="promo"))
    assert (await get_raw(db_sessionmaker, raw_id)).parse_status == ParseStatus.ignored
    assert await count(db_sessionmaker, Transaction) == 0


@pytest.mark.parametrize("title", ["rusak", "boom"])
async def test_parser_error_is_failed_with_message(client, db_sessionmaker, accounts, title) -> None:
    raw_id = await post(client, notif("x", title=title))
    raw = await get_raw(db_sessionmaker, raw_id)
    assert raw.parse_status == ParseStatus.failed
    assert raw.parse_error
    assert await count(db_sessionmaker, Transaction) == 0


async def test_missing_account_is_failed_then_reparse_succeeds(client, db_sessionmaker) -> None:
    raw_id = await post(client, notif(dummy()))
    raw = await get_raw(db_sessionmaker, raw_id)
    assert raw.parse_status == ParseStatus.failed
    assert "belum ada akun" in raw.parse_error

    async with db_sessionmaker() as s:
        s.add(Account(name="Bank Test", type=AccountType.bank, package_name=BANK_PKG))
        await s.commit()
    async with db_sessionmaker() as s:
        assert await reparse(s, uuid.UUID(raw_id)) == ParseStatus.parsed
    raw = await get_raw(db_sessionmaker, raw_id)
    assert raw.parse_status == ParseStatus.parsed and raw.parse_error is None
    assert await count(db_sessionmaker, Transaction) == 1


async def test_failure_in_one_item_does_not_affect_batch(client, db_sessionmaker, accounts) -> None:
    resp = await client.post(
        BATCH_URL,
        json=[notif(dummy(amount=1000)), notif("x", title="boom"), notif(dummy(amount=2000))],
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert sorted(t.amount for t in await all_tx(db_sessionmaker)) == [1000, 2000]


# --- review & snapshot -------------------------------------------------------


async def test_low_confidence_needs_review(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy(conf=0.79)))
    await post(client, notif(dummy(amount=1, conf=0.8)))
    txs = {t.amount: t for t in await all_tx(db_sessionmaker)}
    assert txs[50_000].needs_review is True
    assert txs[1].needs_review is False


async def test_balance_after_creates_snapshot(client, db_sessionmaker, accounts) -> None:
    raw_id = await post(client, notif(dummy(balance=1_250_000)))
    async with db_sessionmaker() as s:
        [snap] = (await s.scalars(select(BalanceSnapshot))).all()
    assert snap.account_id == accounts["bank"]
    assert snap.balance == 1_250_000
    assert str(snap.raw_notification_id) == raw_id


# --- dedup -------------------------------------------------------------------


async def test_same_transaction_within_minute_is_deduplicated(client, db_sessionmaker, accounts) -> None:
    # Dua raw berbeda (posted_at beda detik) untuk transaksi yang sama.
    r1 = await post(client, notif(dummy(), at=T0 + timedelta(seconds=5)))
    r2 = await post(client, notif(dummy(merchant="  kopi   SENJA "), at=T0 + timedelta(seconds=40)))
    assert await count(db_sessionmaker, Transaction) == 1
    assert (await get_raw(db_sessionmaker, r1)).parse_status == ParseStatus.parsed
    assert (await get_raw(db_sessionmaker, r2)).parse_status == ParseStatus.parsed


async def test_different_minute_is_not_deduplicated(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy(), at=T0))
    await post(client, notif(dummy(), at=T0 + timedelta(minutes=1)))
    assert await count(db_sessionmaker, Transaction) == 2


# --- reparse -----------------------------------------------------------------


async def test_reparse_is_idempotent(client, db_sessionmaker, accounts) -> None:
    ids = [await post(client, notif(dummy(amount=a), at=T0 + timedelta(minutes=a))) for a in (1, 2, 3)]
    before = [(t.id, t.type, t.amount, t.account_id) for t in await all_tx(db_sessionmaker)]

    async with db_sessionmaker() as s:
        for raw_id in ids:
            assert await reparse(s, uuid.UUID(raw_id)) == ParseStatus.parsed
        await reparse_all(s, ParseStatus.parsed)

    after = [(t.id, t.type, t.amount, t.account_id) for t in await all_tx(db_sessionmaker)]
    assert after == before


async def test_reparse_all_processes_pending_from_m1(client, db_sessionmaker, accounts) -> None:
    async with db_sessionmaker() as s:
        raw = RawNotification(
            package_name=BANK_PKG, title="trx", text=dummy(), posted_at=T0, content_hash="legacy-1"
        )
        s.add(raw)
        await s.commit()
    async with db_sessionmaker() as s:
        assert await reparse_all(s, ParseStatus.pending) == {"parsed": 1}
    assert await count(db_sessionmaker, Transaction) == 1


async def test_reparse_unknown_raw_returns_none(db_sessionmaker) -> None:
    async with db_sessionmaker() as s:
        assert await reparse(s, uuid.uuid4()) is None


# --- kategori ---------------------------------------------------------------


async def test_category_rules_priority_and_type(client, db_sessionmaker, accounts) -> None:
    async with db_sessionmaker() as s:
        kopi = Category(name="Kopi", type=CategoryType.expense)
        jajan = Category(name="Jajan", type=CategoryType.expense)
        gaji = Category(name="Gaji", type=CategoryType.income)
        s.add_all([kopi, jajan, gaji])
        await s.flush()
        s.add_all(
            [
                CategoryRule(match_type=RuleMatchType.merchant_contains, pattern="senja", category_id=jajan.id, priority=1),
                CategoryRule(match_type=RuleMatchType.regex, pattern=r"^kopi\b", category_id=kopi.id, priority=10),
                CategoryRule(match_type=RuleMatchType.merchant_contains, pattern="kopi", category_id=gaji.id, priority=99),
                CategoryRule(match_type=RuleMatchType.regex, pattern="([", category_id=kopi.id, priority=100),
            ]
        )
        await s.commit()

    await post(client, notif(dummy(merchant="KOPI Senja")))
    await post(client, notif(dummy(amount=1, merchant="Warung Senja")))
    await post(client, notif(dummy(amount=2, merchant="Toko Buku")))
    txs = {t.amount: t for t in await all_tx(db_sessionmaker)}
    assert txs[50_000].category_id == kopi.id  # priority tertinggi yang tipenya cocok; regex rusak dilewati
    assert txs[1].category_id == jajan.id
    assert txs[2].category_id is None


# --- transfer matcher -------------------------------------------------------


async def test_topup_pair_merged_into_transfer(client, db_sessionmaker, accounts) -> None:
    out_raw = await post(client, notif(dummy("expense", 100_000, "Top up"), at=T0))
    in_raw = await post(
        client, notif(dummy("income", 100_000, "Dari bank"), pkg=WALLET_PKG, at=T0 + timedelta(seconds=90))
    )

    [tx] = await all_tx(db_sessionmaker)
    assert tx.type == TransactionType.transfer
    assert tx.account_id == accounts["bank"]
    assert tx.to_account_id == accounts["wallet"]
    assert tx.amount == 100_000
    assert tx.category_id is None
    assert str(tx.raw_notification_id) == out_raw
    assert str(tx.counter_raw_notification_id) == in_raw

    # Reparse kedua sisi tidak memunculkan transaksi income lagi.
    async with db_sessionmaker() as s:
        await reparse(s, uuid.UUID(in_raw))
        await reparse(s, uuid.UUID(out_raw))
    assert await count(db_sessionmaker, Transaction) == 1


async def test_income_first_then_expense_also_merges(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy("income", 75_000), pkg=WALLET_PKG, at=T0))
    await post(client, notif(dummy("expense", 75_000), at=T0 + timedelta(seconds=30)))
    [tx] = await all_tx(db_sessionmaker)
    assert (tx.type, tx.account_id, tx.to_account_id) == (
        TransactionType.transfer,
        accounts["bank"],
        accounts["wallet"],
    )


@pytest.mark.parametrize(
    "wallet_kwargs",
    [
        {"at": T0 + timedelta(minutes=2, seconds=1)},  # di luar jendela 2 menit
        {"amount": 99_999},  # nominal beda (mis. ada biaya admin)
        {"pkg": BANK_PKG},  # akun sama
    ],
    ids=["outside-window", "different-amount", "same-account"],
)
async def test_non_matching_pairs_not_merged(client, db_sessionmaker, accounts, wallet_kwargs) -> None:
    amount = wallet_kwargs.pop("amount", 100_000)
    await post(client, notif(dummy("expense", 100_000), at=T0))
    await post(
        client,
        notif(dummy("income", amount), **{"pkg": WALLET_PKG, "at": T0 + timedelta(seconds=10), **wallet_kwargs}),
    )
    types = sorted(t.type.value for t in await all_tx(db_sessionmaker))
    assert types == ["expense", "income"]


async def test_matcher_picks_closest_candidate(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy("expense", 20_000, "a"), at=T0))
    await post(client, notif(dummy("expense", 20_000, "b"), at=T0 + timedelta(seconds=100)))
    await post(client, notif(dummy("income", 20_000), pkg=WALLET_PKG, at=T0 + timedelta(seconds=90)))
    txs = await all_tx(db_sessionmaker)
    by_type = {t.type: t for t in txs}
    assert len(txs) == 2
    assert by_type[TransactionType.transfer].merchant == "b"
    assert by_type[TransactionType.expense].merchant == "a"


async def test_parser_transfer_to_own_account(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy("transfer", 5_000, counterpart="wallet test")))
    [tx] = await all_tx(db_sessionmaker)
    assert (tx.type, tx.to_account_id) == (TransactionType.transfer, accounts["wallet"])


async def test_parser_transfer_to_external_becomes_expense(client, db_sessionmaker, accounts) -> None:
    await post(client, notif(dummy("transfer", 5_000, counterpart="Orang Lain")))
    [tx] = await all_tx(db_sessionmaker)
    assert (tx.type, tx.to_account_id) == (TransactionType.expense, None)


async def test_bca_real_cancellation_sequence_keeps_balance_correct(client, db_sessionmaker, accounts) -> None:
    """Urutan asli 21 Nov 2026: QRIS Rp10 dibatalkan (2 detik kemudian), lalu QRIS Rp10 berhasil."""
    pkg = BCA["package_name"]
    t = T0 + timedelta(seconds=18)
    await post(client, notif("Pengeluaran sebesar IDR 10.00 di kategori Pendidikan.", pkg=pkg, title="Catatan Finansial", at=t))
    await post(
        client,
        notif(
            "Pengeluaran sebesar IDR 10.00 di kategori Pendidikan yang dilakukan tanggal 21 November 2026 dibatalkan.",
            pkg=pkg, title="Catatan Finansial", at=t + timedelta(seconds=2),
        ),
    )
    await post(client, notif("Pengeluaran sebesar IDR 10.00 di kategori Tagihan Rutin.", pkg=pkg, title="Catatan Finansial", at=t + timedelta(minutes=1)))

    txs = await all_tx(db_sessionmaker)
    assert [(x.type.value, x.amount) for x in txs] == [("expense", 10), ("income", 10), ("expense", 10)]
    refund = txs[1]
    assert refund.note == "Pembatalan pengeluaran Pendidikan tanggal 21 November 2026"
    assert refund.category_id is None
    # Saldo BCA: hanya pengeluaran yang berhasil yang mengurangi saldo.
    resp = await client.get(f"/api/v1/accounts/{accounts['bca']}/balance")
    assert resp.json()["calculated"] == -10

    # Reparse tidak menggandakan
    async with db_sessionmaker() as s:
        await reparse_all(s, ParseStatus.parsed)
    assert len(await all_tx(db_sessionmaker)) == 3
