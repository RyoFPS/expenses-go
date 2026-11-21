import pytest

from app.parsers.amount import parse_amount


@pytest.mark.parametrize(
    "raw,rupiah",
    [
        # format PRD §10
        ("Rp 1.500.000", 1_500_000),
        ("Rp1.500.000,00", 1_500_000),
        ("IDR 25,000", 25_000),
        # format myBCA asli
        ("IDR 1,000.00", 1_000),
        ("IDR 52,760.00", 52_760),
        ("IDR 73,000.00", 73_000),
        # variasi lain
        ("Rp 500", 500),
        ("Rp. 10.000", 10_000),
        ("IDR 1,234,567.00", 1_234_567),
        ("Rp 1.234.567,00", 1_234_567),
        ("1500000", 1_500_000),
        ("rp 2.000", 2_000),
        ("IDR 999", 999),
    ],
)
def test_parse_exact_amounts(raw: str, rupiah: int) -> None:
    a = parse_amount(raw)
    assert a.rupiah == rupiah
    assert a.exact is True
    assert isinstance(a.rupiah, int)


@pytest.mark.parametrize(
    "raw,rupiah",
    [("IDR 1,000.50", 1_001), ("Rp 1.000,49", 1_000), ("IDR 10.5", 11)],
)
def test_non_zero_cents_rounded_and_inexact(raw: str, rupiah: int) -> None:
    a = parse_amount(raw)
    assert a.rupiah == rupiah
    assert a.exact is False


@pytest.mark.parametrize(
    "raw",
    ["", "Rp", "IDR abc", "Rp 1.500,000", "Rp 1.50.000", "IDR 1,00,000", "Rp 1.500.00", "IDR -5,000"],
)
def test_invalid_amounts_raise(raw: str) -> None:
    with pytest.raises(ValueError):
        parse_amount(raw)
