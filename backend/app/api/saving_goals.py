import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, conflict, get_or_404
from app.models import Account, SavingGoal
from app.schemas.saving_goal import SavingGoalOut, SavingGoalSave
from app.services.balance import calculated_balances

router = APIRouter(prefix="/saving-goals", tags=["saving goals"])


def _out(goal: SavingGoal, account: Account, balance: int) -> dict:
    return {
        "id": goal.id,
        "account_id": goal.account_id,
        "account_name": account.name,
        "name": goal.name,
        "target_amount": goal.target_amount,
        "target_date": goal.target_date,
        "balance": balance,
        "remaining": goal.target_amount - balance,
        "progress_percent": max(0, min(100, balance / goal.target_amount * 100)),
    }


@router.get("", response_model=list[SavingGoalOut])
async def list_saving_goals(session: SessionDep) -> list[dict]:
    rows = (
        await session.execute(
            select(SavingGoal, Account)
            .join(Account, Account.id == SavingGoal.account_id)
            .order_by(Account.name)
        )
    ).all()
    balances = await calculated_balances(session, [account.id for _, account in rows])
    return [_out(goal, account, balances[account.id]) for goal, account in rows]


@router.put("/{account_id}", response_model=SavingGoalOut)
async def save_saving_goal(
    account_id: uuid.UUID, body: SavingGoalSave, session: SessionDep
) -> dict:
    account = await get_or_404(session, Account, account_id, "Akun")
    goal = await session.scalar(select(SavingGoal).where(SavingGoal.account_id == account_id))
    if goal is None:
        goal = SavingGoal(account_id=account_id, **body.model_dump())
        session.add(goal)
    else:
        for field, value in body.model_dump().items():
            setattr(goal, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict("Target tabungan untuk akun ini sudah dibuat") from exc
    return _out(goal, account, (await calculated_balances(session, [account_id]))[account_id])


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saving_goal(account_id: uuid.UUID, session: SessionDep) -> Response:
    goal = await session.scalar(select(SavingGoal).where(SavingGoal.account_id == account_id))
    if goal is not None:
        await session.delete(goal)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
