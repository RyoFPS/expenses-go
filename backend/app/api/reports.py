from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import SessionDep, unprocessable
from app.core.timeutil import month_bounds_utc, today_jakarta
from app.models import Account, RawNotification, Transaction
from app.models.enums import ParseStatus, TransactionType
from app.schemas.report import (
    Cashflow,
    CashflowProjection,
    LatestNotification,
    MonthClose,
    MonthlySummary,
    NetWorth,
)
from app.services import projection, reports
from app.services.balance import balance_status

router = APIRouter(prefix="/reports", tags=["reports"])

MAX_DAYS = 3 * 366


@router.get("/summary", response_model=MonthlySummary)
async def summary(
    session: SessionDep,
    month: Annotated[
        str | None,
        Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM (WIB); default bulan ini"),
    ] = None,
) -> dict:
    if month is None:
        today = today_jakarta()
        year, mon = today.year, today.month
    else:
        year, mon = int(month[:4]), int(month[5:])
    return await reports.monthly_summary(session, year, mon)


@router.get("/month-close", response_model=MonthClose)
async def month_close(
    session: SessionDep,
    month: Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM (WIB)")],
) -> dict:
    year, mon = int(month[:4]), int(month[5:])
    start, end = month_bounds_utc(year, mon)
    tx_range = (Transaction.occurred_at >= start, Transaction.occurred_at < end)
    raw_range = (RawNotification.posted_at >= start, RawNotification.posted_at < end)
    needs_review = await session.scalar(
        select(func.count()).select_from(Transaction).where(*tx_range, Transaction.needs_review.is_(True))
    )
    uncategorized = await session.scalar(
        select(func.count()).select_from(Transaction).where(
            *tx_range,
            Transaction.category_id.is_(None),
            Transaction.type.in_([TransactionType.income, TransactionType.expense]),
        )
    )
    failed = await session.scalar(
        select(func.count()).select_from(RawNotification).where(
            *raw_range, RawNotification.parse_status == ParseStatus.failed
        )
    )
    accounts = (await session.scalars(select(Account).order_by(Account.name))).all()
    reconciliation = []
    for account in accounts:
        status = await balance_status(session, account.id)
        snapshot = status["last_snapshot"]
        reconciliation.append({
            "account_id": account.id,
            "name": account.name,
            "observed_at": snapshot.observed_at if snapshot else None,
            "diff": status["diff"],
        })
    return {
        "month": month,
        "needs_review": needs_review,
        "failed_notifications": failed,
        "uncategorized": uncategorized,
        "reconciliation": reconciliation,
    }


@router.get("/cashflow", response_model=Cashflow)
async def cashflow(
    session: SessionDep,
    date_from: Annotated[date, Query(description="Tanggal WIB, inklusif")],
    date_to: Annotated[date, Query(description="Tanggal WIB, inklusif")],
    group_by: Literal["day", "week", "month"] = "day",
) -> dict:
    if date_from > date_to:
        raise unprocessable("date_from harus <= date_to")
    if (date_to - date_from).days > MAX_DAYS:
        raise unprocessable(f"Rentang maksimal {MAX_DAYS} hari")
    return await reports.cashflow(session, date_from, date_to, group_by)


@router.get("/net-worth", response_model=NetWorth)
async def net_worth(session: SessionDep) -> dict:
    return await reports.net_worth(session)


@router.get("/projection", response_model=CashflowProjection)
async def cashflow_projection(session: SessionDep) -> dict:
    return await projection.cashflow_projection(session)


@router.get("/latest-notification", response_model=LatestNotification)
async def latest_notification(session: SessionDep) -> dict:
    received_at = await session.scalar(
        select(RawNotification.received_at)
        .order_by(RawNotification.received_at.desc(), RawNotification.id.desc())
        .limit(1)
    )
    return {"received_at": received_at}
