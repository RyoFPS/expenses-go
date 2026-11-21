from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel, Field


class ParsedTransaction(BaseModel):
    type: Literal["income", "expense", "transfer"]
    amount: int = Field(gt=0)
    merchant: str | None = None
    occurred_at: datetime | None = None  # fallback ke posted_at
    balance_after: int | None = None  # jika notifikasi memuat saldo
    counterpart_hint: str | None = None  # mis. nama akun tujuan untuk transfer
    # Tambahan di luar PRD (lihat docs/DECISIONS.md D-016): kategori dari app bank, mis. "Makanan".
    category_hint: str | None = None
    # Tambahan di luar PRD (D-042): keterangan untuk transaksi, mis. "Pembatalan pengeluaran ...".
    note: str | None = Field(default=None, max_length=1000)
    confidence: float = Field(ge=0, le=1)


class ParseError(Exception):
    """Notifikasi tampak seperti transaksi tetapi formatnya tidak dikenali -> parse_status=failed."""


class Parser(Protocol):
    package_names: set[str]

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        """Kembalikan None untuk notifikasi non-transaksi (promo, OTP, info)."""
        ...
