"""Penyimpanan notifikasi mentah (idempoten via content_hash), lalu parsing ke transaksi.

Raw di-commit lebih dulu sehingga tetap tersimpan meski parsing gagal; parsing dijalankan
hanya untuk raw yang baru masuk (duplikat tidak diproses ulang).
"""

import hashlib
import logging
import uuid
from collections.abc import Sequence

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RawNotification
from app.schemas.ingest import IngestResult, NotificationIn
from app.services.processing import process_raw_ids

logger = logging.getLogger(__name__)

_SEP = "\x1f"  # ASCII unit separator, tidak muncul di teks notifikasi normal


def content_hash(n: NotificationIn) -> str:
    """sha256(package + title + text + posted_at) dengan separator agar tidak ambigu."""
    payload = _SEP.join((n.package_name, n.title, n.text, str(n.posted_at)))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def store_notifications(
    session: AsyncSession, items: Sequence[NotificationIn]
) -> list[IngestResult]:
    """Simpan notifikasi; yang sudah ada (hash sama) dilaporkan `duplicate`.

    Memakai INSERT ... ON CONFLICT DO NOTHING sehingga aman terhadap kiriman
    paralel. Hasil berurutan sesuai `items`.
    """
    hashes = [content_hash(n) for n in items]

    # Buang duplikat di dalam request yang sama, pertahankan urutan.
    unique: dict[str, NotificationIn] = {}
    for h, n in zip(hashes, items, strict=True):
        unique.setdefault(h, n)

    stmt = (
        insert(RawNotification)
        .values(
            [
                {
                    "id": uuid.uuid4(),
                    "package_name": n.package_name,
                    "title": n.title,
                    "text": n.text,
                    "posted_at": n.posted_at_dt,
                    "content_hash": h,
                }
                for h, n in unique.items()
            ]
        )
        .on_conflict_do_nothing(index_elements=[RawNotification.content_hash])
        .returning(RawNotification.id, RawNotification.content_hash)
    )
    inserted = {row.content_hash: row.id for row in await session.execute(stmt)}
    await session.commit()  # raw tersimpan dulu, apa pun hasil parsing
    await process_raw_ids(session, list(inserted.values()))

    results: list[IngestResult] = []
    for h in hashes:
        raw_id = inserted.pop(h, None)
        if raw_id is not None:
            results.append(IngestResult(status="accepted", raw_id=raw_id))
            logger.info("raw_notification stored id=%s", raw_id)
        else:
            results.append(IngestResult(status="duplicate"))
    dup = sum(r.status == "duplicate" for r in results)
    if dup:
        logger.info("ingest skipped %d duplicate notification(s)", dup)
    return results
