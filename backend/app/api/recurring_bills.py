import uuid
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, conflict, unprocessable
from app.models import Account, RecurringBillDecision, Transaction
from app.models.enums import TransactionType
from app.schemas.common import StrictInput
from app.services.dedup import normalize_merchant
from app.services.recurring_bills import detect_recurring_bills

router = APIRouter(prefix="/recurring-bills", tags=["recurring bills"])


class DecisionIn(StrictInput):
    account_id: uuid.UUID
    merchant: str = Field(min_length=1)
    status: Literal["confirmed", "ignored"]


async def _detected(session: SessionDep) -> list[dict]:
    transactions = list(await session.scalars(
        select(Transaction).where(Transaction.type == TransactionType.expense, Transaction.merchant.is_not(None))
    ))
    return detect_recurring_bills(transactions)


@router.get("")
async def list_recurring_bills(session: SessionDep) -> dict:
    bills = await _detected(session)
    decisions = {
        (row.account_id, row.merchant): row
        for row in await session.scalars(select(RecurringBillDecision))
    }
    accounts = {row.id: row.name for row in await session.scalars(select(Account))}
    candidates, confirmed = [], []
    for bill in bills:
        decision = decisions.get((bill["account_id"], bill["merchant"]))
        if decision and decision.status == "ignored" and decision.last_transaction_id == bill["last_transaction_id"]:
            continue
        out = {**bill, "account_name": accounts[bill["account_id"]]}
        (confirmed if decision and decision.status == "confirmed" else candidates).append(out)
    return {"candidates": candidates, "confirmed": confirmed}


@router.put("/decision", status_code=status.HTTP_204_NO_CONTENT)
async def save_decision(body: DecisionIn, session: SessionDep) -> Response:
    merchant = normalize_merchant(body.merchant)
    bill = next((item for item in await _detected(session)
                 if item["account_id"] == body.account_id and item["merchant"] == merchant), None)
    if bill is None:
        raise unprocessable("Kandidat tagihan tidak ditemukan")
    decision = await session.get(RecurringBillDecision, (body.account_id, merchant))
    if decision is None:
        decision = RecurringBillDecision(account_id=body.account_id, merchant=merchant,
                                         status=body.status, last_transaction_id=bill["last_transaction_id"])
        session.add(decision)
    else:
        decision.status = body.status
        decision.last_transaction_id = bill["last_transaction_id"]
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict("Keputusan tagihan berubah bersamaan, coba lagi") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
