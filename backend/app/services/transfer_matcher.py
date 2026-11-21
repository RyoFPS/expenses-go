"""Gabungkan pasangan expense/income (mis. top up bank -> e-wallet) menjadi satu transfer.

Kriteria (PRD §10): dua transaksi berlawanan, nominal sama, akun berbeda, selisih waktu <= 2 menit.
Hanya transaksi dari notifikasi yang belum berupa transfer. Jika ada beberapa kandidat,
dipilih yang waktunya paling dekat.

Hasil: transaksi expense diubah menjadi transfer (account_id = akun sumber, to_account_id = akun
tujuan); transaksi income dihapus dan raw-nya dicatat di counter_raw_notification_id.
"""

import logging
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction
from app.models.enums import TransactionSource, TransactionType

logger = logging.getLogger(__name__)

WINDOW = timedelta(minutes=2)


async def match_transfer(session: AsyncSession, tx: Transaction) -> Transaction | None:
    if tx.source != TransactionSource.notification or tx.type == TransactionType.transfer:
        return None

    opposite = TransactionType.income if tx.type == TransactionType.expense else TransactionType.expense
    candidate = await session.scalar(
        select(Transaction)
        .where(
            Transaction.id != tx.id,
            Transaction.source == TransactionSource.notification,
            Transaction.type == opposite,
            Transaction.amount == tx.amount,
            Transaction.account_id != tx.account_id,
            Transaction.occurred_at.between(tx.occurred_at - WINDOW, tx.occurred_at + WINDOW),
        )
        .order_by(func.abs(func.extract("epoch", Transaction.occurred_at - tx.occurred_at)), Transaction.id)
        .limit(1)
        .with_for_update()
    )
    if candidate is None:
        return None

    out_tx, in_tx = (tx, candidate) if tx.type == TransactionType.expense else (candidate, tx)
    out_tx.type = TransactionType.transfer
    out_tx.to_account_id = in_tx.account_id
    out_tx.category_id = None
    out_tx.needs_review = out_tx.needs_review or in_tx.needs_review
    out_tx.counter_raw_notification_id = in_tx.raw_notification_id
    if not out_tx.merchant:
        out_tx.merchant = in_tx.merchant
    await session.delete(in_tx)
    await session.flush()
    logger.info("transfer matched out=%s in_deleted=%s", out_tx.id, in_tx.id)
    return out_tx
