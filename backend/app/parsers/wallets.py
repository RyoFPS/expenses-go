"""Observed GoPay, Jago, and OVO payments and DANA Bisnis receipts."""

import re

from app.parsers.amount import parse_amount
from app.parsers.base import ParsedTransaction, ParseError

_GOPAY_PAYMENT = re.compile(
    r"Mantaap,\s+kamu\s+barusan\s+bayar\s+(?P<amount>Rp\s*[\d.,]+)\s+ke\s+(?P<merchant>.+)\.",
    re.DOTALL,
)
_DANA_RECEIPT = re.compile(r"(?P<amount>Rp\s*[\d.,]+)\s+diterima\s+DANA\s+Bisnis\.")
_JAGO_PAYMENT = re.compile(
    r"You\s+have\s+paid\s+(?P<amount>Rp\s*[\d.,]+)\s+to\s+(?P<merchant>.+?)\.\s+"
    r"Need\s+help\?\s+Contact\s+Tanya\s+Jago\s+at\s+1500\s+746\.",
    re.DOTALL,
)
_OVO_PAYMENT = re.compile(
    r"Yay,\s+pembayaran\s+sebesar\s+(?P<amount>Rp\s*[\d.,]+)\s+di\s+"
    r"(?P<merchant>.+?)\s+telah\s+berhasil\s+🥳✨",
    re.DOTALL,
)


class GopayParser:
    package_names = {"com.gojek.gopay"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title.strip() != "Pembayaran berhasil!":
            return None
        match = _GOPAY_PAYMENT.fullmatch(text.strip())
        if match is None:
            raise ParseError("format pembayaran GoPay belum dikenali")
        amount = parse_amount(match.group("amount"))
        return ParsedTransaction(
            type="expense",
            amount=amount.rupiah,
            merchant=" ".join(match.group("merchant").split()),
            confidence=0.95 if amount.exact else 0.5,
        )


class DanaParser:
    package_names = {"id.dana"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title.strip() != "Pembayaran Masuk":
            return None
        match = _DANA_RECEIPT.fullmatch(text.strip())
        if match is None:
            raise ParseError("format pembayaran masuk DANA Bisnis belum dikenali")
        amount = parse_amount(match.group("amount"))
        return ParsedTransaction(
            type="income", amount=amount.rupiah, confidence=0.95 if amount.exact else 0.5
        )


class JagoParser:
    package_names = {"com.jago.digitalBanking"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title.strip() != "Jago":
            return None
        match = _JAGO_PAYMENT.fullmatch(text.strip())
        if match is None:
            raise ParseError("format pembayaran Jago belum dikenali")
        amount = parse_amount(match.group("amount"))
        return ParsedTransaction(
            type="expense",
            amount=amount.rupiah,
            merchant=" ".join(match.group("merchant").split()),
            confidence=0.95 if amount.exact else 0.5,
        )


class OvoParser:
    package_names = {"ovo.id"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title.strip() != "OVO":
            return None
        match = _OVO_PAYMENT.fullmatch(text.strip())
        if match is None:
            raise ParseError("format pembayaran OVO belum dikenali")
        amount = parse_amount(match.group("amount"))
        return ParsedTransaction(
            type="expense",
            amount=amount.rupiah,
            merchant=" ".join(match.group("merchant").split()),
            confidence=0.95 if amount.exact else 0.5,
        )
