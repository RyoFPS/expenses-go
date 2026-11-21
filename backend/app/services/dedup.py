import hashlib
import uuid
from datetime import UTC, datetime

from app.models.enums import TransactionType


def normalize_merchant(merchant: str | None) -> str:
    return " ".join(merchant.split()).casefold() if merchant else ""


def dedup_hash(
    account_id: uuid.UUID,
    type_: TransactionType,
    amount: int,
    merchant: str | None,
    occurred_at: datetime,
) -> str:
    """sha256(account_id | type | amount | merchant_normalized | occurred_at dibulatkan ke menit)."""
    minute = occurred_at.astimezone(UTC).replace(second=0, microsecond=0)
    parts = (str(account_id), type_.value, str(amount), normalize_merchant(merchant), minute.isoformat())
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
