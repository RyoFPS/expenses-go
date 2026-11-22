from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import SessionDep, unprocessable
from app.core.timeutil import today_jakarta
from app.models import RawNotification
from app.schemas.report import Cashflow, CashflowProjection, LatestNotification, MonthlySummary, NetWorth
from app.services import projection, reports

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
