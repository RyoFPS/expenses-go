"""Formats observed in GoPay QRIS payment and DANA Bisnis receipt notifications."""

import re

from app.parsers.amount import parse_amount
from app.parsers.base import ParsedTransaction, ParseError

_GOPAY_PAYMENT = re.compile(
    r"Mantaap,\s+kamu\s+barusan\s+bayar\s+(?P<amount>Rp\s*[\d.,]+)\s+ke\s+(?P<merchant>.+)\.",
    re.DOTALL,
)
_DANA_RECEIPT = re.compile(r"(?P<amount>Rp\s*[\d.,]+)\s+diterima\s+DANA\s+Bisnis\.")


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
