import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep, get_or_404, unprocessable
from app.models import Budget, Category
from app.models.enums import CategoryType
from app.schemas.budget import BudgetOut, BudgetSave

router = APIRouter(prefix="/budgets", tags=["budgets"])
Month = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")]


@router.get("", response_model=list[BudgetOut])
async def list_budgets(session: SessionDep, month: Month) -> list[dict]:
    month_date = date.fromisoformat(f"{month}-01")
    rows = await session.execute(
        select(Budget, Category.name)
        .join(Category, Category.id == Budget.category_id)
        .where(Budget.month == month_date, Category.type == CategoryType.expense)
        .order_by(Category.name)
    )
    return [
        {
            "id": budget.id,
            "category_id": budget.category_id,
            "category_name": name,
            "month": budget.month,
            "amount": budget.amount,
        }
        for budget, name in rows.all()
    ]


@router.put("/{category_id}", response_model=BudgetOut)
async def save_budget(
    category_id: uuid.UUID, body: BudgetSave, session: SessionDep, month: Month
) -> dict:
    category = await get_or_404(session, Category, category_id, "Kategori")
    if category.type != CategoryType.expense:
        raise unprocessable("Anggaran hanya berlaku untuk kategori pengeluaran")

    month_date = date.fromisoformat(f"{month}-01")
    budget = await session.scalar(
        select(Budget).where(Budget.category_id == category_id, Budget.month == month_date)
    )
    if budget is None:
        budget = Budget(category_id=category_id, month=month_date, amount=body.amount)
        session.add(budget)
    else:
        budget.amount = body.amount
    await session.commit()
    return {
        "id": budget.id,
        "category_id": category_id,
        "category_name": category.name,
        "month": month_date,
        "amount": budget.amount,
    }


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    category_id: uuid.UUID, session: SessionDep, month: Month
) -> Response:
    month_date = date.fromisoformat(f"{month}-01")
    budget = await session.scalar(
        select(Budget).where(Budget.category_id == category_id, Budget.month == month_date)
    )
    if budget is not None:
        await session.delete(budget)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
