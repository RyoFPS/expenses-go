"""Parsing nominal rupiah dari teks notifikasi tanpa float.

Format yang ditangani (PRD §10): `Rp 1.500.000`, `Rp1.500.000,00`, `IDR 25,000`, `IDR 52,760.00`.
Aturan: separator terakhir yang diikuti 1-2 digit di akhir string adalah pemisah desimal;
selain itu semua separator adalah pemisah ribuan dan harus konsisten (grup 3 digit).
"""

import re
from dataclasses import dataclass

_PREFIX = re.compile(r"^\s*(?:Rp\.?|IDR)\s*", re.IGNORECASE)
_NUMBER = re.compile(r"\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+")


@dataclass(frozen=True)
class Amount:
    rupiah: int  # dibulatkan half-up jika ada sen
    exact: bool  # False jika ada pecahan sen yang tidak nol


def parse_amount(raw: str) -> Amount:
    s = _PREFIX.sub("", raw).strip()
    if not s or not re.fullmatch(r"[\d.,]+", s):
        raise ValueError(f"nominal tidak valid: {raw!r}")

    integer, cents = s, 0
    m = re.search(r"([.,])(\d{1,2})$", s)
    if m:
        integer, dec = s[: m.start()], m.group(2)
        if m.group(1) in integer:
            # mis. "1.500.00": separator desimal sama dengan separator ribuan -> ambigu
            raise ValueError(f"nominal ambigu: {raw!r}")
        cents = int(dec.ljust(2, "0"))

    if not _NUMBER.fullmatch(integer):
        raise ValueError(f"pemisah ribuan tidak konsisten: {raw!r}")
    rupiah = int(re.sub(r"[.,]", "", integer))
    if cents >= 50:
        rupiah += 1
    return Amount(rupiah=rupiah, exact=cents == 0)
