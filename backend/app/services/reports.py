"""Laporan. Semua pengelompokan waktu memakai Asia/Jakarta.

- Transfer antar akun sendiri tidak dihitung sebagai pemasukan/pengeluaran.
- Biaya transfer (fee) dihitung sebagai pengeluaran (uang benar-benar keluar).
"""

from datetime import date, timedelta
from typing import Literal

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import TZ_NAME, day_end_exclusive_utc, day_start_utc, month_bounds_utc
from app.models import Account, Category, Transaction
from app.models.enums import CategoryType, TransactionType
from app.services.balance import calculated_balances

GroupBy = Literal["day", "week", "month"]

_t = Transaction
_income = func.coalesce(func.sum(case((_t.type == TransactionType.income, _t.amount), else_=0)), 0)
_expense_only = func.coalesce(func.sum(case((_t.type == TransactionType.expense, _t.amount), else_=0)), 0)
_fees = func.coalesce(func.sum(case((_t.type == TransactionType.transfer, _t.fee), else_=0)), 0)


async def monthly_summary(session: AsyncSession, year: int, month: int) -> dict:
    start, end = month_bounds_utc(year, month)
    in_range = (_t.occurred_at >= start) & (_t.occurred_at < end)

    income, expense_only, fees = (await session.execute(select(_income, _expense_only, _fees).where(in_range))).one()

    rows = await session.execute(
        select(_t.category_id, Category.name, _t.type, func.sum(_t.amount))
        .outerjoin(Category, Category.id == _t.category_id)
        .where(in_range, _t.type.in_([TransactionType.income, TransactionType.expense]))
        .group_by(_t.category_id, Category.name, _t.type)
    )
    by_category = sorted(
        (
            {
                "category_id": cat_id,
                "name": name or "Tanpa kategori",
                "type": CategoryType(tx_type.value),
                "total": int(total),
            }
            for cat_id, name, tx_type, total in rows.all()
        ),
        key=lambda r: (r["type"].value, -r["total"], r["name"]),
    )

    expense = int(expense_only) + int(fees)
    return {
        "month": f"{year:04d}-{month:02d}",
        "income": int(income),
        "expense": expense,
        "fees": int(fees),
        "net": int(income) - expense,
        "by_category": by_category,
    }


def _period_start(d: date, group_by: GroupBy) -> date:
    if group_by == "week":
        return d - timedelta(days=d.weekday())
    if group_by == "month":
        return d.replace(day=1)
    return d


def _next_period(d: date, group_by: GroupBy) -> date:
    if group_by == "day":
        return d + timedelta(days=1)
    if group_by == "week":
        return d + timedelta(days=7)
    return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)


async def cashflow(session: AsyncSession, date_from: date, date_to: date, group_by: GroupBy) -> dict:
    local = func.timezone(TZ_NAME, _t.occurred_at)
    period = cast(func.date_trunc(group_by, local), Date).label("period")
    rows = await session.execute(
        select(period, _income, _expense_only + _fees)
        .where(_t.occurred_at >= day_start_utc(date_from), _t.occurred_at < day_end_exclusive_utc(date_to))
        .group_by(period)
    )
    found = {p: (int(i), int(e)) for p, i, e in rows.all()}

    points = []
    cur = _period_start(date_from, group_by)
    while cur <= date_to:
        income, expense = found.get(cur, (0, 0))
        points.append({"period": cur, "income": income, "expense": expense, "net": income - expense})
        cur = _next_period(cur, group_by)
    return {"date_from": date_from, "date_to": date_to, "group_by": group_by, "points": points}


async def net_worth(session: AsyncSession) -> dict:
    accounts = (await session.scalars(select(Account).order_by(Account.name))).all()
    balances = await calculated_balances(session)
    items = [
        {"id": a.id, "name": a.name, "type": a.type, "is_active": a.is_active, "balance": balances[a.id]}
        for a in accounts
    ]
    return {"total": sum(i["balance"] for i in items), "accounts": items}
