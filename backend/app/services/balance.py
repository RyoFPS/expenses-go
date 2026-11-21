"""Perhitungan saldo (PRD §8) dan rekonsiliasi (PRD §11).

current_balance = opening_balance
                + Σ income − Σ expense
                − Σ (transfer keluar + fee) + Σ transfer masuk
"""

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, BalanceSnapshot, Category, Transaction
from app.models.enums import CategoryType, TransactionSource, TransactionType

ADJUSTMENT_CATEGORY = "Penyesuaian saldo"


def _delta(account_id_col):
    t = Transaction
    return case(
        (and_(t.account_id == account_id_col, t.type == TransactionType.income), t.amount),
        (and_(t.account_id == account_id_col, t.type == TransactionType.expense), -t.amount),
        (and_(t.account_id == account_id_col, t.type == TransactionType.transfer), -(t.amount + t.fee)),
        (and_(t.to_account_id == account_id_col, t.type == TransactionType.transfer), t.amount),
        else_=0,
    )


async def calculated_balances(
    session: AsyncSession,
    account_ids: Iterable[uuid.UUID] | None = None,
    as_of: datetime | None = None,
) -> dict[uuid.UUID, int]:
    """Saldo terhitung per akun. `as_of` inklusif (transaksi dengan occurred_at <= as_of)."""
    join_cond = or_(Transaction.account_id == Account.id, Transaction.to_account_id == Account.id)
    if as_of is not None:
        join_cond = and_(join_cond, Transaction.occurred_at <= as_of)

    stmt = (
        select(Account.id, Account.opening_balance + func.coalesce(func.sum(_delta(Account.id)), 0))
        .select_from(Account)
        .outerjoin(Transaction, join_cond)
        .group_by(Account.id)
    )
    if account_ids is not None:
        stmt = stmt.where(Account.id.in_(list(account_ids)))
    return {acc_id: int(bal) for acc_id, bal in (await session.execute(stmt)).all()}


async def calculated_balance(session: AsyncSession, account_id: uuid.UUID, as_of: datetime | None = None) -> int:
    return (await calculated_balances(session, [account_id], as_of))[account_id]


async def last_snapshot(session: AsyncSession, account_id: uuid.UUID) -> BalanceSnapshot | None:
    return await session.scalar(
        select(BalanceSnapshot)
        .where(BalanceSnapshot.account_id == account_id)
        .order_by(BalanceSnapshot.observed_at.desc(), BalanceSnapshot.id.desc())
        .limit(1)
    )


async def balance_status(session: AsyncSession, account_id: uuid.UUID) -> dict:
    """calculated (saat ini), last_snapshot, dan diff terhadap saldo terhitung per waktu snapshot."""
    calculated = await calculated_balance(session, account_id)
    snap = await last_snapshot(session, account_id)
    at_snapshot = diff = None
    if snap is not None:
        at_snapshot = await calculated_balance(session, account_id, as_of=snap.observed_at)
        diff = snap.balance - at_snapshot
    return {
        "account_id": account_id,
        "calculated": calculated,
        "last_snapshot": snap,
        "calculated_at_snapshot": at_snapshot,
        "diff": diff,
    }


async def _adjustment_category(session: AsyncSession, cat_type: CategoryType) -> Category:
    cat = await session.scalar(
        select(Category).where(Category.name == ADJUSTMENT_CATEGORY, Category.type == cat_type).limit(1)
    )
    if cat is None:
        cat = Category(name=ADJUSTMENT_CATEGORY, type=cat_type)
        session.add(cat)
        await session.flush()
    return cat


async def create_adjustment(session: AsyncSession, account_id: uuid.UUID) -> Transaction | None:
    """Buat transaksi penyesuaian agar saldo terhitung = snapshot terakhir. None jika tidak perlu."""
    status = await balance_status(session, account_id)
    diff, snap = status["diff"], status["last_snapshot"]
    if not diff:
        return None
    tx_type = TransactionType.income if diff > 0 else TransactionType.expense
    category = await _adjustment_category(session, CategoryType(tx_type.value))
    tx = Transaction(
        account_id=account_id,
        type=tx_type,
        amount=abs(diff),
        category_id=category.id,
        occurred_at=snap.observed_at,
        source=TransactionSource.manual,
        note=ADJUSTMENT_CATEGORY,
    )
    session.add(tx)
    await session.flush()
    return tx
