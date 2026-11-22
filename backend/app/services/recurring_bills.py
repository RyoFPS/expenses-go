import calendar
import uuid
from collections import defaultdict
from datetime import date
from statistics import median

from app.core.timeutil import JAKARTA
from app.models import Transaction
from app.models.enums import TransactionType
from app.services.dedup import normalize_merchant


def detect_recurring_bills(transactions: list[Transaction]) -> list[dict]:
    groups: dict[tuple[uuid.UUID, str], dict[tuple[int, int], Transaction]] = defaultdict(dict)
    for tx in transactions:
        merchant = normalize_merchant(tx.merchant)
        if tx.type != TransactionType.expense or not merchant:
            continue
        local = tx.occurred_at.astimezone(JAKARTA)
        month = (local.year, local.month)
        key = (tx.account_id, merchant)
        if month not in groups[key] or tx.occurred_at > groups[key][month].occurred_at:
            groups[key][month] = tx

    bills = []
    for (account_id, merchant), by_month in groups.items():
        # shortcut: satu transaksi terakhir per bulan; perlu pemilihan pasangan bila merchant sering ditagih lebih dari sekali sebulan.
        months = sorted(by_month)[-3:]
        if len(months) < 3 or any(
            (b[0] * 12 + b[1]) - (a[0] * 12 + a[1]) != 1
            for a, b in zip(months, months[1:])
        ):
            continue
        matches = [by_month[month] for month in months]
        days = [tx.occurred_at.astimezone(JAKARTA).day for tx in matches]
        anchor = int(median(days))
        if any(abs(day - min(anchor, calendar.monthrange(*month)[1])) > 5 for day, month in zip(days, months)):
            continue
        amounts = [tx.amount for tx in matches]
        estimate = int(median(amounts))
        if any(abs(amount - estimate) * 5 > estimate for amount in amounts):
            continue
        last_month = months[-1]
        year, month = (last_month[0] + 1, 1) if last_month[1] == 12 else (last_month[0], last_month[1] + 1)
        bills.append({
            "account_id": account_id,
            "merchant": merchant,
            "display_merchant": matches[-1].merchant.strip(),
            "estimated_amount": estimate,
            "last_date": matches[-1].occurred_at.astimezone(JAKARTA).date(),
            "next_date": date(year, month, min(anchor, calendar.monthrange(year, month)[1])),
            "last_transaction_id": matches[-1].id,
        })
    return bills
