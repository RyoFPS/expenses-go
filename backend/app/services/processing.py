"""Raw notification -> transaksi.

Alur per raw (dalam SAVEPOINT agar kegagalan satu raw tidak memengaruhi yang lain):
    registry -> parser -> akun (berdasarkan package_name) -> kategori -> insert transaksi
    (ON CONFLICT dedup_hash DO NOTHING) -> snapshot saldo -> transfer matcher.

Idempoten: raw yang sudah punya transaksi (langsung atau sebagai sisi lawan transfer) tidak
diproses ulang, sehingga reparse tidak pernah menggandakan data.
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, BalanceSnapshot, RawNotification, Transaction
from app.models.enums import ParseStatus, TransactionSource, TransactionType
from app.parsers import ParsedTransaction, ParseError, get_parser
from app.services.categorize import pick_category
from app.services.dedup import dedup_hash
from app.services.transfer_matcher import match_transfer

logger = logging.getLogger(__name__)

REVIEW_THRESHOLD = 0.8
MAX_ERROR_LEN = 500


class ProcessingError(Exception):
    """Raw valid tetapi tidak bisa diproses (mis. akun belum dibuat) -> failed."""


async def _has_transaction(session: AsyncSession, raw_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(
                or_(
                    Transaction.raw_notification_id == raw_id,
                    Transaction.counter_raw_notification_id == raw_id,
                )
            )
        )
    )


async def _account_for(session: AsyncSession, package_name: str) -> Account:
    accounts = (
        await session.scalars(
            select(Account).where(Account.package_name == package_name, Account.is_active.is_(True))
        )
    ).all()
    if not accounts:
        raise ProcessingError(f"belum ada akun aktif untuk package {package_name}")
    if len(accounts) > 1:
        raise ProcessingError(f"lebih dari satu akun aktif untuk package {package_name}")
    return accounts[0]


async def _resolve_transfer_target(
    session: AsyncSession, parsed: ParsedTransaction, source: Account
) -> uuid.UUID | None:
    if not parsed.counterpart_hint:
        return None
    return await session.scalar(
        select(Account.id).where(
            func.lower(Account.name) == parsed.counterpart_hint.casefold(),
            Account.id != source.id,
        )
    )


async def _create_transaction(
    session: AsyncSession, raw: RawNotification, parsed: ParsedTransaction
) -> Transaction | None:
    account = await _account_for(session, raw.package_name)
    occurred_at: datetime = parsed.occurred_at or raw.posted_at
    if occurred_at.tzinfo is None:
        raise ProcessingError("occurred_at dari parser harus timezone-aware")

    tx_type = TransactionType(parsed.type)
    to_account_id = None
    if tx_type == TransactionType.transfer:
        to_account_id = await _resolve_transfer_target(session, parsed, account)
        if to_account_id is None:
            # Transfer ke pihak luar dicatat sebagai pengeluaran (D-002).
            tx_type = TransactionType.expense

    category_id = await pick_category(session, tx_type, parsed.merchant, parsed.category_hint)
    values = {
        "id": uuid.uuid4(),
        "account_id": account.id,
        "to_account_id": to_account_id,
        "type": tx_type,
        "amount": parsed.amount,
        "merchant": parsed.merchant,
        "note": parsed.note,
        "category_id": category_id,
        "occurred_at": occurred_at,
        "source": TransactionSource.notification,
        "raw_notification_id": raw.id,
        "dedup_hash": dedup_hash(account.id, tx_type, parsed.amount, parsed.merchant, occurred_at),
        "needs_review": parsed.confidence < REVIEW_THRESHOLD,
    }
    tx_id = await session.scalar(
        insert(Transaction)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[Transaction.dedup_hash])
        .returning(Transaction.id)
    )

    if tx_id is None:
        logger.info("raw id=%s duplikat transaksi (dedup_hash)", raw.id)
        return None

    if parsed.balance_after is not None:
        session.add(
            BalanceSnapshot(
                account_id=account.id,
                balance=parsed.balance_after,
                observed_at=occurred_at,
                raw_notification_id=raw.id,
            )
        )

    tx = await session.get(Transaction, tx_id)
    assert tx is not None
    await session.flush()
    return await match_transfer(session, tx) or tx


async def process_raw(session: AsyncSession, raw: RawNotification) -> ParseStatus:
    """Proses satu raw dan set parse_status-nya. Tidak commit."""
    if await _has_transaction(session, raw.id):
        raw.parse_status, raw.parse_error = ParseStatus.parsed, None
        return raw.parse_status

    parser = get_parser(raw.package_name)
    if parser is None:
        raw.parse_status, raw.parse_error = ParseStatus.ignored, None
        return raw.parse_status

    try:
        async with session.begin_nested():
            parsed = parser.parse(raw.title, raw.text)
            if parsed is None:
                status, error = ParseStatus.ignored, None
            else:
                await _create_transaction(session, raw, parsed)
                status, error = ParseStatus.parsed, None
    except (ParseError, ProcessingError, ValueError) as exc:
        status, error = ParseStatus.failed, f"{type(exc).__name__}: {exc}"
    except Exception as exc:  # noqa: BLE001 - satu raw rusak tidak boleh menggagalkan ingest
        logger.exception("raw id=%s error tak terduga saat parsing", raw.id)
        status, error = ParseStatus.failed, f"{type(exc).__name__}: {exc}"

    raw.parse_status = status
    raw.parse_error = error[:MAX_ERROR_LEN] if error else None
    logger.info("raw id=%s parse_status=%s", raw.id, status.value)
    return status


async def process_raw_ids(session: AsyncSession, raw_ids: Sequence[uuid.UUID]) -> None:
    """Proses raw berurutan (urut posted_at) lalu commit."""
    if not raw_ids:
        return
    raws = await session.scalars(
        select(RawNotification)
        .where(RawNotification.id.in_(raw_ids))
        .order_by(RawNotification.posted_at, RawNotification.id)
    )
    for raw in raws:
        await process_raw(session, raw)
    await session.commit()


async def reparse(session: AsyncSession, raw_id: uuid.UUID) -> ParseStatus | None:
    raw = await session.get(RawNotification, raw_id)
    if raw is None:
        return None
    status = await process_raw(session, raw)
    await session.commit()
    return status


async def reparse_all(session: AsyncSession, status: ParseStatus) -> dict[str, int]:
    ids = (
        await session.scalars(select(RawNotification.id).where(RawNotification.parse_status == status))
    ).all()
    await process_raw_ids(session, ids)
    counts = await session.execute(
        select(RawNotification.parse_status, func.count())
        .where(RawNotification.id.in_(ids))
        .group_by(RawNotification.parse_status)
    )
    return {s.value: n for s, n in counts.all()}
