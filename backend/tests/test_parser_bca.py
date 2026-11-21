"""Parser myBCA berbasis fixture asli (tests/fixtures/bca/).

Catatan PRD §10 (minimal kasus per parser):
- pemasukan, pengeluaran: dari fixture asli.
- transfer: belum ada contoh asli -> tidak diuji (top up ditangani transfer_matcher).
- non-transaksi: hanya diuji perilaku "judul lain -> None"; tidak mengarang teks promo BCA.
- format nominal berbeda: fixture asli hanya IDR x,xxx.00; format lain diuji di test_amount.py.
"""

import json
from pathlib import Path

import pytest

from app.parsers import ParseError, get_parser
from app.parsers.bca import BcaParser

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "bca" / "catatan_finansial.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["cases"]
parser = BcaParser()


def test_registered_for_fixture_package() -> None:
    assert isinstance(get_parser(FIXTURE["package_name"]), BcaParser)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_fixture_parsed_as_expected(case: dict) -> None:
    result = parser.parse(case["title"], case["text"])
    assert result is not None
    exp = case["expected"]
    assert result.type == exp["type"]
    assert result.amount == exp["amount"]
    assert result.merchant == exp["merchant"]
    assert result.category_hint == exp["category_hint"]
    assert result.note == exp.get("note")
    assert result.occurred_at is None  # tidak ada waktu di teks -> pakai posted_at
    assert result.balance_after is None
    assert result.confidence >= 0.8


def test_fixture_covers_income_and_expense() -> None:
    types = {c["expected"]["type"] for c in CASES}
    assert {"income", "expense"} <= types


def test_line_break_in_sender_name_is_tolerated() -> None:
    # Teks asli bisa mengandung baris baru di tengah nama (wrap di layar).
    text = "Pemasukan sebesar IDR 73,000.00 dari INTI**RI\n****SIH A di kategori Transfer\nRekening."
    result = parser.parse("Catatan Finansial", text)
    assert result is not None
    assert result.merchant == "INTI**RI ****SIH A"
    assert result.category_hint == "Transfer Rekening"


def test_other_title_is_non_transaction() -> None:
    assert parser.parse("Judul lain", CASES[0]["text"]) is None


def test_known_title_unknown_body_raises() -> None:
    with pytest.raises(ParseError):
        parser.parse("Catatan Finansial", "Isi dengan format yang belum dikenal.")


def test_inexact_amount_needs_review() -> None:
    result = parser.parse("Catatan Finansial", "Pengeluaran sebesar IDR 1,000.50 di kategori Makanan.")
    assert result is not None
    assert result.amount == 1001
    assert result.confidence < 0.8


def test_cancelled_expense_variants_unknown_raise() -> None:
    # Hanya pola pembatalan yang pernah terlihat yang diterima; varian lain direview manual.
    for text in [
        "Pemasukan sebesar IDR 10.00 di kategori Pendidikan yang dilakukan tanggal 21 November 2026 dibatalkan.",
        "Pengeluaran sebesar IDR 10.00 di kategori Pendidikan dibatalkan.",
    ]:
        with pytest.raises(ParseError):
            parser.parse("Catatan Finansial", text)


def test_cancellation_category_not_swallowed_by_expense_pattern() -> None:
    text = "Pengeluaran sebesar IDR 10.00 di kategori Pendidikan yang dilakukan tanggal 21 November 2026 dibatalkan."
    result = parser.parse("Catatan Finansial", text)
    assert result is not None and result.type == "income" and result.category_hint is None
