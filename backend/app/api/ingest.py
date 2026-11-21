from typing import Annotated

from fastapi import APIRouter, Body, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.auth import require_ingest_access
from app.core.security import require_api_key
from app.schemas.ingest import MAX_BATCH, BatchIngestResponse, IngestResult, NotificationIn
from app.services.ingest import store_notifications

router = APIRouter(
    prefix="/ingest",
    tags=["ingest"],
    dependencies=[Depends(require_api_key), Depends(require_ingest_access)],
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "/notification",
    response_model=IngestResult,
    response_model_exclude_none=True,
    status_code=status.HTTP_202_ACCEPTED,
    responses={200: {"description": "Duplikat, sudah pernah diterima"}, 401: {}},
)
async def ingest_notification(
    payload: NotificationIn, session: SessionDep, response: Response
) -> IngestResult:
    [result] = await store_notifications(session, [payload])
    if result.status == "duplicate":
        response.status_code = status.HTTP_200_OK
    return result


@router.post("/notification/batch", response_model=BatchIngestResponse, responses={401: {}})
async def ingest_notification_batch(
    payload: Annotated[list[NotificationIn], Body(min_length=1, max_length=MAX_BATCH)],
    session: SessionDep,
) -> BatchIngestResponse:
    results = await store_notifications(session, payload)
    accepted = sum(r.status == "accepted" for r in results)
    return BatchIngestResponse(
        accepted=accepted, duplicate=len(results) - accepted, results=results
    )
