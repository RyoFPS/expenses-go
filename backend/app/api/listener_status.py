from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_ingest_access, require_user
from app.core.db import get_session
from app.core.security import require_api_key
from app.models import ListenerStatus
from app.schemas.listener_status import ListenerHeartbeatIn, ListenerStatusOut

ingest_router = APIRouter(
    prefix="/ingest/listener-status",
    tags=["ingest"],
    dependencies=[Depends(require_api_key), Depends(require_ingest_access)],
)
router = APIRouter(
    prefix="/listener-status",
    tags=["listener status"],
    dependencies=[Depends(require_user)],
)
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@ingest_router.post("/heartbeat", status_code=204)
async def heartbeat(payload: ListenerHeartbeatIn, session: SessionDep) -> None:
    stmt = insert(ListenerStatus).values(**payload.model_dump(), last_seen=datetime.now(UTC))
    stmt = stmt.on_conflict_do_update(
        index_elements=[ListenerStatus.device_id],
        set_={
            "listener_enabled": stmt.excluded.listener_enabled,
            "pending_count": stmt.excluded.pending_count,
            "failed_count": stmt.excluded.failed_count,
            "app_version": stmt.excluded.app_version,
            "last_seen": stmt.excluded.last_seen,
        },
    )
    await session.execute(stmt)
    await session.commit()


@router.get("", response_model=list[ListenerStatusOut])
async def list_listener_status(session: SessionDep) -> list[ListenerStatusOut]:
    statuses = (await session.scalars(select(ListenerStatus).order_by(ListenerStatus.last_seen.desc()))).all()
    now = datetime.now(UTC)
    return [ListenerStatusOut.from_status(status, now) for status in statuses]
