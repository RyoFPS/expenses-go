import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PageDep, SessionDep, conflict, get_or_404, unprocessable
from app.core.timeutil import day_end_exclusive_utc, day_start_utc, now_utc
from app.models import Account, Category, RawNotification, Transaction
from app.models.enums import CategoryType, TransactionSource, TransactionType
from app.schemas.common import Page
from app.schemas.transaction import (
    TransactionCreate,
    TransactionDetail,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


async def _validate(session: AsyncSession, data: dict) -> None:
    """Validasi state akhir transaksi (dipakai create & patch)."""
    tx_type: TransactionType = data["type"]
    account_id, to_account_id = data["account_id"], data.get("to_account_id")

    if await session.get(Account, account_id) is None:
        raise unprocessable("account_id tidak ditemukan")

    if tx_type == TransactionType.transfer:
        if to_account_id is None:
            raise unprocessable("Transfer wajib punya to_account_id")
        if to_account_id == account_id:
            raise unprocessable("to_account_id harus berbeda dari account_id")
        if await session.get(Account, to_account_id) is None:
            raise unprocessable("to_account_id tidak ditemukan")
    else:
        if to_account_id is not None:
            raise unprocessable("to_account_id hanya untuk transfer")
        if data.get("fee", 0):
            raise unprocessable("fee hanya untuk transfer")

    if (cat_id := data.get("category_id")) is not None:
        category = await session.get(Category, cat_id)
        if category is None:
            raise unprocessable("category_id tidak ditemukan")
        if category.type != CategoryType(tx_type.value):
            raise unprocessable(f"Kategori bertipe {category.type.value}, transaksi bertipe {tx_type.value}")


@router.get("", response_model=Page[TransactionOut])
async def list_transactions(
    session: SessionDep,
    pg: PageDep,
    account_id: uuid.UUID | None = None,
    type: TransactionType | None = None,  # noqa: A002 - nama parameter mengikuti PRD
    category_id: uuid.UUID | None = None,
    date_from: Annotated[date | None, Query(description="Tanggal WIB, inklusif")] = None,
    date_to: Annotated[date | None, Query(description="Tanggal WIB, inklusif")] = None,
    q: Annotated[str | None, Query(max_length=100, description="Cari di merchant & catatan")] = None,
    needs_review: bool | None = None,
) -> dict:
    conds = []
    if account_id is not None:
        conds.append(or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id))
    if type is not None:
        conds.append(Transaction.type == type)
    if category_id is not None:
        conds.append(Transaction.category_id == category_id)
    if date_from is not None:
        conds.append(Transaction.occurred_at >= day_start_utc(date_from))
    if date_to is not None:
        conds.append(Transaction.occurred_at < day_end_exclusive_utc(date_to))
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conds.append(or_(Transaction.merchant.ilike(like), Transaction.note.ilike(like)))
    if needs_review is not None:
        conds.append(Transaction.needs_review.is_(needs_review))

    total = await session.scalar(select(func.count()).select_from(Transaction).where(*conds))
    items = await session.scalars(
        select(Transaction)
        .where(*conds)
        .order_by(Transaction.occurred_at.desc(), Transaction.id.desc())
        .offset(pg.offset)
        .limit(pg.page_size)
    )
    return {"items": list(items), "total": total, "page": pg.page, "page_size": pg.page_size}


@router.get("/{transaction_id}", response_model=TransactionDetail)
async def get_transaction(transaction_id: uuid.UUID, session: SessionDep) -> dict:
    tx = await get_or_404(session, Transaction, transaction_id, "Transaksi")
    out = TransactionOut.model_validate(tx).model_dump()
    for key, raw_id in (
        ("raw_notification", tx.raw_notification_id),
        ("counter_raw_notification", tx.counter_raw_notification_id),
    ):
        out[key] = await session.get(RawNotification, raw_id) if raw_id else None
    return out


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(body: TransactionCreate, session: SessionDep) -> Transaction:
    data = body.model_dump()
    data["occurred_at"] = data["occurred_at"] or now_utc()
    await _validate(session, data)
    tx = Transaction(**data, source=TransactionSource.manual, needs_review=False)
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(transaction_id: uuid.UUID, body: TransactionUpdate, session: SessionDep) -> Transaction:
    tx = await get_or_404(session, Transaction, transaction_id, "Transaksi")
    changes = body.model_dump(exclude_unset=True)
    current = {
        f: getattr(tx, f) for f in ("account_id", "to_account_id", "type", "amount", "fee", "category_id")
    }
    merged = {**current, **changes}
    # Mengubah tipe dari transfer ke non-transfer otomatis melepas akun tujuan bila tidak diisi eksplisit.
    if merged["type"] != TransactionType.transfer and "to_account_id" not in changes:
        merged["to_account_id"] = None
        changes["to_account_id"] = None
    # Kategori lama tidak lagi relevan jika tipe berubah dan kategori tidak diisi eksplisit.
    if "type" in changes and changes["type"] != tx.type and "category_id" not in changes:
        merged["category_id"] = None
        changes["category_id"] = None
    await _validate(session, merged)
    for field, value in changes.items():
        setattr(tx, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict("Perubahan bentrok dengan transaksi lain") from exc
    await session.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: uuid.UUID, session: SessionDep) -> Response:
    tx = await get_or_404(session, Transaction, transaction_id, "Transaksi")
    await session.delete(tx)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{transaction_id}/mark-reviewed", response_model=TransactionOut)
async def mark_reviewed(transaction_id: uuid.UUID, session: SessionDep) -> Transaction:
    tx = await get_or_404(session, Transaction, transaction_id, "Transaksi")
    tx.needs_review = False
    await session.commit()
    await session.refresh(tx)
    return tx
