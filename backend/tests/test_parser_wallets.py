import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Account, RawNotification, Transaction
from app.models.enums import AccountType, ParseStatus, TransactionSource, TransactionType
from app.parsers import ParseError, get_parser
from app.parsers.wallets import DanaParser, GopayParser, JagoParser, OvoParser
from app.services.processing import reparse, reparse_all

SAMPLES = json.loads(
    (Path(__file__).parent / "fixtures" / "wallets" / "qris_self_transfer.json").read_text(
        encoding="utf-8"
    )
)
JAGO_SAMPLES = json.loads(
    (Path(__file__).parent / "fixtures" / "wallets" / "jago_qris_self_transfer.json").read_text(
        encoding="utf-8"
    )
)
OVO_SAMPLES = json.loads(
    (Path(__file__).parent / "fixtures" / "wallets" / "ovo_qris_self_transfer.json").read_text(
        encoding="utf-8"
    )
)
GOPAY_VA = json.loads(
    (Path(__file__).parent / "fixtures" / "wallets" / "gopay_bca_va_20261124.json").read_text(
        encoding="utf-8"
    )
)


def test_observed_wallet_notifications() -> None:
    gopay = get_parser(SAMPLES["gopay"]["package_name"])
    dana = get_parser(SAMPLES["dana"]["package_name"])
    assert isinstance(gopay, GopayParser)
    assert isinstance(dana, DanaParser)
    out = gopay.parse(SAMPLES["gopay"]["title"], SAMPLES["gopay"]["text"])
    incoming = dana.parse(SAMPLES["dana"]["title"], SAMPLES["dana"]["text"])
    assert (out.type, out.amount, out.merchant) == ("expense", 11681, "Toko Contoh, Service")
    assert (incoming.type, incoming.amount) == ("income", 11681)
    assert gopay.parse(SAMPLES["promo"]["title"], SAMPLES["promo"]["text"]) is None
    with pytest.raises(ParseError):
        dana.parse("Pembayaran Masuk", "Format pembayaran masuk yang belum dikenal")


async def test_ignored_observed_pair_reparses_as_transfer(db_sessionmaker) -> None:
    async with db_sessionmaker() as session:
        gopay = Account(name="Gopay", type=AccountType.ewallet, package_name="com.gojek.gopay")
        dana = Account(name="DANA", type=AccountType.ewallet, package_name="id.dana")
        session.add_all([gopay, dana])
        when = datetime(2026, 11, 22, 13, 4, 11, tzinfo=UTC)
        for key, at in (("gopay", when), ("dana", when + timedelta(seconds=4))):
            sample = SAMPLES[key]
            session.add(
                RawNotification(
                    **sample, posted_at=at, content_hash=key, parse_status=ParseStatus.ignored
                )
            )
        await session.commit()

    async with db_sessionmaker() as session:
        assert await reparse_all(session, ParseStatus.ignored) == {"parsed": 2}

    async with db_sessionmaker() as session:
        assert (await session.scalars(select(RawNotification.parse_status))).all() == [
            ParseStatus.parsed, ParseStatus.parsed
        ]
        [tx] = (await session.scalars(select(Transaction))).all()
        assert (tx.type, tx.amount, tx.account_id, tx.to_account_id) == (
            TransactionType.transfer, 11681, gopay.id, dana.id
        )
        assert tx.raw_notification_id is not None
        assert tx.counter_raw_notification_id is not None


def test_observed_jago_payment() -> None:
    parser = get_parser(JAGO_SAMPLES["jago"]["package_name"])
    assert isinstance(parser, JagoParser)
    result = parser.parse(JAGO_SAMPLES["jago"]["title"], JAGO_SAMPLES["jago"]["text"])
    assert (result.type, result.amount, result.merchant) == ("expense", 1565, "Toko Contoh, Service")
    assert parser.parse("Payday is Here!! Ready to Treat Yourself? 🛍️✨", "") is None
    with pytest.raises(ParseError):
        parser.parse("Jago", "Format pembayaran yang belum dikenal")


async def test_jago_reparse_matches_existing_dana_income(db_sessionmaker) -> None:
    async with db_sessionmaker() as session:
        jago = Account(name="Jago", type=AccountType.bank, package_name="com.jago.digitalBanking")
        dana = Account(name="DANA", type=AccountType.ewallet, package_name="id.dana")
        session.add_all([jago, dana])
        when = datetime(2026, 11, 22, 13, 32, 26, tzinfo=UTC)
        for key, at in (("jago", when), ("dana", when + timedelta(seconds=6))):
            sample = JAGO_SAMPLES[key]
            session.add(RawNotification(**sample, posted_at=at, content_hash=key))
        await session.commit()
        raw_ids = {raw.package_name: raw.id for raw in (await session.scalars(select(RawNotification))).all()}
        assert await reparse(session, raw_ids["id.dana"]) == ParseStatus.parsed
        assert await reparse(session, raw_ids["com.jago.digitalBanking"]) == ParseStatus.parsed

    async with db_sessionmaker() as session:
        [tx] = (await session.scalars(select(Transaction))).all()
        assert (tx.type, tx.amount, tx.account_id, tx.to_account_id) == (
            TransactionType.transfer, 1565, jago.id, dana.id
        )
        assert tx.raw_notification_id == raw_ids["com.jago.digitalBanking"]
        assert tx.counter_raw_notification_id == raw_ids["id.dana"]


def test_observed_ovo_payment() -> None:
    parser = get_parser(OVO_SAMPLES["ovo"]["package_name"])
    assert isinstance(parser, OvoParser)
    result = parser.parse(OVO_SAMPLES["ovo"]["title"], OVO_SAMPLES["ovo"]["text"])
    assert (result.type, result.amount, result.merchant) == ("expense", 5000, "Toko Contoh, Service")
    assert parser.parse("Rp1 bisa dapet apa? Banyak! 🤯", "") is None
    with pytest.raises(ParseError):
        parser.parse("OVO", "Format pembayaran yang belum dikenal")


async def test_ovo_reparse_preserves_unrelated_dana_income(db_sessionmaker) -> None:
    async with db_sessionmaker() as session:
        ovo = Account(name="OVO", type=AccountType.ewallet, package_name="ovo.id")
        dana = Account(name="DANA", type=AccountType.ewallet, package_name="id.dana")
        session.add_all([ovo, dana])
        times = {
            "dana_other": datetime(2026, 11, 22, 13, 41, 31, tzinfo=UTC),
            "ovo": datetime(2026, 11, 22, 13, 43, 48, tzinfo=UTC),
            "dana": datetime(2026, 11, 22, 13, 43, 51, tzinfo=UTC),
        }
        for key, at in times.items():
            session.add(
                RawNotification(
                    **OVO_SAMPLES[key], posted_at=at, content_hash=key,
                    parse_status=ParseStatus.ignored,
                )
            )
        await session.commit()
        raw_ids = {raw.content_hash: raw.id for raw in (await session.scalars(select(RawNotification))).all()}
        for key in ("dana_other", "dana", "ovo"):
            assert await reparse(session, raw_ids[key]) == ParseStatus.parsed

    async with db_sessionmaker() as session:
        transactions = {tx.amount: tx for tx in (await session.scalars(select(Transaction))).all()}
        assert set(transactions) == {4107, 5000}
        assert transactions[4107].type == TransactionType.income
        assert transactions[4107].raw_notification_id == raw_ids["dana_other"]
        transfer = transactions[5000]
        assert (transfer.type, transfer.account_id, transfer.to_account_id) == (
            TransactionType.transfer, ovo.id, dana.id
        )
        assert transfer.raw_notification_id == raw_ids["ovo"]
        assert transfer.counter_raw_notification_id == raw_ids["dana"]


def test_observed_gopay_va_topup_and_saldo_payment() -> None:
    parser = get_parser("com.gojek.gopay")
    topup = parser.parse(GOPAY_VA["topup"]["title"], GOPAY_VA["topup"]["text"])
    payment = parser.parse(GOPAY_VA["payment"]["title"], GOPAY_VA["payment"]["text"])
    assert (topup.type, topup.amount, topup.merchant) == ("income", 300000, None)
    assert (payment.type, payment.amount, payment.merchant) == ("expense", 298590, "XL HOME")
    for key in ("duplicate_topup", "va_reminder"):
        assert parser.parse(GOPAY_VA[key]["title"], GOPAY_VA[key]["text"]) is None
    with pytest.raises(ParseError):
        parser.parse("Top up berhasil", "Format top up yang belum dikenal")


async def test_gopay_va_topup_pairs_with_bca_expense(db_sessionmaker) -> None:
    async with db_sessionmaker() as session:
        bca = Account(name="BCA", type=AccountType.bank, package_name="com.bca.mybca.omni.android")
        gopay = Account(name="Gopay", type=AccountType.ewallet, package_name="com.gojek.gopay")
        session.add_all([bca, gopay])
        at = datetime(2026, 11, 24, 15, 55, 40, tzinfo=UTC)
        for key, occurred_at in (("topup", at), ("bca_out", at + timedelta(milliseconds=279))):
            session.add(RawNotification(**GOPAY_VA[key], posted_at=occurred_at, content_hash=key))
        await session.commit()
        raw_ids = {raw.content_hash: raw.id for raw in (await session.scalars(select(RawNotification))).all()}
        assert await reparse(session, raw_ids["topup"]) == ParseStatus.parsed
        assert await reparse(session, raw_ids["bca_out"]) == ParseStatus.parsed

    async with db_sessionmaker() as session:
        [tx] = (await session.scalars(select(Transaction))).all()
        assert (tx.type, tx.amount, tx.account_id, tx.to_account_id) == (
            TransactionType.transfer, 300000, bca.id, gopay.id
        )
        assert tx.raw_notification_id == raw_ids["bca_out"]
        assert tx.counter_raw_notification_id == raw_ids["topup"]


async def test_linked_manual_gopay_payment_survives_reparse(db_sessionmaker) -> None:
    async with db_sessionmaker() as session:
        gopay = Account(name="Gopay", type=AccountType.ewallet, package_name="com.gojek.gopay")
        raw = RawNotification(
            **GOPAY_VA["payment"],
            posted_at=datetime(2026, 11, 24, 15, 57, 39, tzinfo=UTC),
            content_hash="payment",
            parse_status=ParseStatus.ignored,
        )
        session.add_all([gopay, raw])
        await session.flush()
        manual = Transaction(
            account_id=gopay.id,
            type=TransactionType.expense,
            amount=298590,
            occurred_at=datetime(2026, 11, 24, 15, 59, tzinfo=UTC),
            source=TransactionSource.manual,
            note="Wifi Bulan November",
            raw_notification_id=raw.id,
        )
        session.add(manual)
        await session.commit()
        assert await reparse(session, raw.id) == ParseStatus.parsed

    async with db_sessionmaker() as session:
        [tx] = (await session.scalars(select(Transaction))).all()
        assert (tx.id, tx.source, tx.note, tx.amount, tx.raw_notification_id) == (
            manual.id, TransactionSource.manual, "Wifi Bulan November", 298590, raw.id
        )
