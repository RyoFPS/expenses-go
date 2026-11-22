import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import PageDep, SessionDep, get_or_404
from app.core.timeutil import day_end_exclusive_utc, day_start_utc
from app.models import RawNotification
from app.models.enums import ParseStatus
from app.schemas.common import Page
from app.schemas.raw import RawNotificationOut, ReparseAllResult
from app.services.processing import reparse, reparse_all

router = APIRouter(prefix="/raw-notifications", tags=["raw-notifications"])


@router.get("", response_model=Page[RawNotificationOut])
async def list_raw_notifications(
    session: SessionDep,
    pg: PageDep,
    parse_status: ParseStatus | None = None,
    package_name: Annotated[str | None, Query(max_length=255)] = None,
    date_from: Annotated[date | None, Query(description="Tanggal notifikasi WIB, inklusif")] = None,
    date_to: Annotated[date | None, Query(description="Tanggal notifikasi WIB, inklusif")] = None,
) -> dict:
    conds = []
    if parse_status is not None:
        conds.append(RawNotification.parse_status == parse_status)
    if package_name is not None:
        conds.append(RawNotification.package_name == package_name)
    if date_from is not None:
        conds.append(RawNotification.posted_at >= day_start_utc(date_from))
    if date_to is not None:
        conds.append(RawNotification.posted_at < day_end_exclusive_utc(date_to))
    total = await session.scalar(select(func.count()).select_from(RawNotification).where(*conds))
    items = await session.scalars(
        select(RawNotification)
        .where(*conds)
        .order_by(RawNotification.received_at.desc(), RawNotification.id.desc())
        .offset(pg.offset)
        .limit(pg.page_size)
    )
    return {"items": list(items), "total": total, "page": pg.page, "page_size": pg.page_size}


@router.post(
    "/reparse-all",
    response_model=ReparseAllResult,
    description="Proses ulang semua raw dengan parse_status tertentu (default: failed). Idempoten.",
)
async def reparse_all_raw(session: SessionDep, parse_status: ParseStatus = ParseStatus.failed) -> dict:
    by_status = await reparse_all(session, parse_status)
    return {"processed": sum(by_status.values()), "by_status": by_status}


@router.post("/{raw_id}/reparse", response_model=RawNotificationOut)
async def reparse_raw(raw_id: uuid.UUID, session: SessionDep) -> RawNotification:
    await get_or_404(session, RawNotification, raw_id, "Raw notification")
    await reparse(session, raw_id)
    raw = await session.get(RawNotification, raw_id)
    await session.refresh(raw)
    return raw
