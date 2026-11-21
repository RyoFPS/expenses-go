"""Parser myBCA.

Pola diambil dari notifikasi asli (tests/fixtures/bca/). Judul "Catatan Finansial":
    Pengeluaran sebesar IDR 52,760.00 di kategori Pembayaran.
    Pemasukan sebesar IDR 73,000.00 dari INTI**RI ****SIH A di kategori Transfer Rekening.
    Pengeluaran sebesar IDR 10.00 di kategori Pendidikan yang dilakukan tanggal 21 November 2026 dibatalkan.

Notifikasi ini tidak memuat waktu transaksi, merchant pengeluaran, maupun saldo.
Pembatalan pengeluaran (mis. merchant QRIS tidak ditemukan; uang tidak terpotong) dicatat sebagai pemasukan
"Pembatalan" bernominal sama agar saldo kembali benar dan riwayat tetap utuh (D-042).
Notifikasi berjudul lain dianggap non-transaksi (ignored). Judul "Catatan Finansial" dengan isi yang tidak cocok
(termasuk varian pembatalan yang belum pernah terlihat) -> ParseError (failed) agar terlihat di halaman Review.
"""

import re

from app.parsers.amount import parse_amount
from app.parsers.base import ParsedTransaction, ParseError

TITLE = "Catatan Finansial"
_AMOUNT = r"(?P<amount>IDR\s*[\d.,]+)"
_CATEGORY = r"\s+di\s+kategori\s+(?P<category>.+?)\.?"

_EXPENSE = re.compile(rf"Pengeluaran\s+sebesar\s+{_AMOUNT}{_CATEGORY}", re.DOTALL)
_INCOME = re.compile(
    rf"Pemasukan\s+sebesar\s+{_AMOUNT}(?:\s+dari\s+(?P<sender>.+?))?{_CATEGORY}", re.DOTALL
)
_EXPENSE_CANCELLED = re.compile(
    rf"Pengeluaran\s+sebesar\s+{_AMOUNT}\s+di\s+kategori\s+(?P<category>.+?)"
    r"\s+yang\s+dilakukan\s+tanggal\s+(?P<date>\d{1,2}\s+\w+\s+\d{4})\s+dibatalkan\.?",
    re.DOTALL,
)
_CANCEL_WORD = re.compile(r"\bdibatalkan\b", re.IGNORECASE)


def _clean(s: str | None) -> str | None:
    return " ".join(s.split()) if s else None


class BcaParser:
    package_names = {"com.bca.mybca.omni.android"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        if title.strip() != TITLE:
            return None

        body = text.strip()
        # Pembatalan dicek lebih dulu: pola pengeluaran biasa (kategori .+?) juga akan "cocok" dengan teks ini.
        if m := _EXPENSE_CANCELLED.fullmatch(body):
            amount = parse_amount(m.group("amount"))
            return ParsedTransaction(
                type="income",
                amount=amount.rupiah,
                note=f"Pembatalan pengeluaran {_clean(m.group('category'))} tanggal {_clean(m.group('date'))}",
                confidence=0.95 if amount.exact else 0.5,
            )
        if _CANCEL_WORD.search(body):
            raise ParseError("format pembatalan 'Catatan Finansial' myBCA belum dikenali")

        if m := _EXPENSE.fullmatch(body):
            tx_type, sender = "expense", None
        elif m := _INCOME.fullmatch(body):
            tx_type, sender = "income", _clean(m.group("sender"))
        else:
            raise ParseError("format 'Catatan Finansial' myBCA tidak dikenali")

        amount = parse_amount(m.group("amount"))
        return ParsedTransaction(
            type=tx_type,
            amount=amount.rupiah,
            merchant=sender,
            counterpart_hint=sender,
            category_hint=_clean(m.group("category")),
            confidence=0.95 if amount.exact else 0.5,
        )
