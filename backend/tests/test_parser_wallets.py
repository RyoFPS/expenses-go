import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Account, RawNotification, Transaction
from app.models.enums import AccountType, ParseStatus, TransactionType
from app.parsers import ParseError, get_parser
from app.parsers.wallets import DanaParser, GopayParser
from app.services.processing import reparse_all

SAMPLES = json.loads(
    (Path(__file__).parent / "fixtures" / "wallets" / "qris_self_transfer.json").read_text(
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
