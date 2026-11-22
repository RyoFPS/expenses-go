"""Estimasi saldo gabungan dari tiga bulan kalender lengkap terakhir (WIB)."""

import calendar
from datetime import date, timedelta
from fractions import Fraction

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import JAKARTA, day_start_utc, today_jakarta
from app.models import Account, RecurringBillDecision, Transaction
from app.models.enums import TransactionType
from app.services.balance import calculated_balances
from app.services.dedup import normalize_merchant
from app.services.recurring_bills import detect_recurring_bills


async def cashflow_projection(session: AsyncSession) -> dict:
    today = today_jakarta()
    end = today.replace(day=1)
    month_index = end.year * 12 + end.month - 1 - 3
    start = date(month_index // 12, month_index % 12 + 1, 1)
    accounts = (await session.scalars(select(Account).where(Account.is_active))).all()
    account_ids = [account.id for account in accounts]
    balances = await calculated_balances(session, account_ids)
    starting_balance = sum(balances.values())
    result = {
        "as_of": today,
        "history_from": start,
        "history_to": end - timedelta(days=1),
        "starting_balance": starting_balance,
        "estimated_7d": None,
        "estimated_30d": None,
        "upcoming_bills": [],
    }
    if not accounts:
        return result

    history = (await session.scalars(
        select(Transaction).where(
            Transaction.account_id.in_(account_ids),
            Transaction.occurred_at >= day_start_utc(start),
            Transaction.occurred_at < day_start_utc(end),
            Transaction.type.in_([TransactionType.income, TransactionType.expense]),
        )
    )).all()
    months = {(tx.occurred_at.astimezone(JAKARTA).year, tx.occurred_at.astimezone(JAKARTA).month) for tx in history}
    # shortcut: bulan tanpa transaksi dianggap belum cukup; perlu metadata cakupan histori untuk membedakan bulan nol transaksi.
    if len(months) < 3:
        return result

    expenses = (await session.scalars(
        select(Transaction).where(
            Transaction.account_id.in_(account_ids),
            Transaction.type == TransactionType.expense,
            Transaction.merchant.is_not(None),
            Transaction.occurred_at < day_start_utc(today + timedelta(days=1)),
        )
    )).all()
    decisions = {
        (decision.account_id, decision.merchant)
        for decision in await session.scalars(
            select(RecurringBillDecision).where(
                RecurringBillDecision.account_id.in_(account_ids),
                RecurringBillDecision.status == "confirmed",
            )
        )
    }
    names = {account.id: account.name for account in accounts}
    # shortcut: tagihan kedaluwarsa mengikuti detektor; perlu jadwal tersimpan agar tetap diproyeksikan setelah pola hilang.
    bills = [bill for bill in detect_recurring_bills(expenses) if (bill["account_id"], bill["merchant"]) in decisions]
    confirmed = {(bill["account_id"], bill["merchant"]): bill for bill in bills}
    recurring = {}
    for tx in history:
        if tx.type != TransactionType.expense:
            continue
        bill = confirmed.get((tx.account_id, normalize_merchant(tx.merchant)))
        local = tx.occurred_at.astimezone(JAKARTA)
        if bill is None or abs(tx.amount - bill["estimated_amount"]) * 5 > bill["estimated_amount"]:
            continue
        if abs(local.day - min(bill["anchor_day"], calendar.monthrange(local.year, local.month)[1])) > 5:
            continue
        key = (tx.account_id, bill["merchant"], local.year, local.month)
        if key not in recurring or tx.occurred_at > recurring[key].occurred_at:
            recurring[key] = tx
    recurring_ids = {tx.id for tx in recurring.values()}
    variable_net = sum(
        tx.amount if tx.type == TransactionType.income else -tx.amount
        for tx in history
        if tx.id not in recurring_ids
    )

    for bill in bills:
        due = bill["next_date"]
        while due <= today + timedelta(days=30):
            if due >= today:
                result["upcoming_bills"].append({
                    "account_name": names[bill["account_id"]],
                    "merchant": bill["display_merchant"],
                    "estimated_amount": bill["estimated_amount"],
                    "due_date": due,
                })
            month_index = due.year * 12 + due.month
            year, month = divmod(month_index, 12)
            month += 1
            due = date(year, month, min(bill["anchor_day"], calendar.monthrange(year, month)[1]))
    result["upcoming_bills"].sort(key=lambda bill: (bill["due_date"], bill["merchant"]))

    days = (end - start).days
    for horizon in (7, 30):
        due_total = sum(bill["estimated_amount"] for bill in result["upcoming_bills"] if bill["due_date"] <= today + timedelta(days=horizon))
        result[f"estimated_{horizon}d"] = starting_balance + round(Fraction(variable_net * horizon, days)) - due_total
    return result
