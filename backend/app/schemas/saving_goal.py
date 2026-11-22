import uuid
from datetime import date
from typing import Annotated

from pydantic import Field, StrictInt

from app.schemas.common import ORMModel, StrictInput

GoalName = Annotated[str, Field(min_length=1, max_length=100)]


class SavingGoalSave(StrictInput):
    name: GoalName
    target_amount: StrictInt = Field(gt=0)
    target_date: date | None = None


class SavingGoalOut(ORMModel):
    id: uuid.UUID
    account_id: uuid.UUID
    account_name: str
    name: str
    target_amount: int
    target_date: date | None
    balance: int
    remaining: int
    progress_percent: float
