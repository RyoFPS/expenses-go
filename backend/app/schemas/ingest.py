import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
# 2000-01-01 UTC dalam epoch ms: nilai lebih kecil hampir pasti salah satuan (detik, bukan ms).
MIN_POSTED_AT_MS = 946_684_800_000
# Toleransi jam HP yang sedikit maju.
MAX_FUTURE_SKEW = timedelta(days=1)

MAX_BATCH = 100


class NotificationIn(BaseModel):
    """Notifikasi mentah dari Android. Teks TIDAK dimodifikasi (tidak di-strip)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    package_name: Annotated[StrictStr, Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9_.]+$")]
    title: Annotated[StrictStr, Field(max_length=1_000)]
    text: Annotated[StrictStr, Field(min_length=1, max_length=10_000)]
    posted_at: Annotated[StrictInt, Field(description="Epoch milidetik dari Android (postTime)")]

    @field_validator("posted_at")
    @classmethod
    def _posted_at_range(cls, v: int) -> int:
        if v < MIN_POSTED_AT_MS:
            raise ValueError("posted_at harus epoch milidetik (>= tahun 2000)")
        if ms_to_datetime(v) > datetime.now(UTC) + MAX_FUTURE_SKEW:
            raise ValueError("posted_at terlalu jauh di masa depan")
        return v

    @property
    def posted_at_dt(self) -> datetime:
        return ms_to_datetime(self.posted_at)


def ms_to_datetime(ms: int) -> datetime:
    """Konversi epoch ms -> datetime UTC tanpa pembulatan float."""
    return EPOCH + timedelta(milliseconds=ms)


class IngestResult(BaseModel):
    status: Literal["accepted", "duplicate"]
    raw_id: uuid.UUID | None = None


class BatchIngestResponse(BaseModel):
    accepted: int
    duplicate: int
    results: list[IngestResult] = Field(description="Urutan sama dengan item pada request")
