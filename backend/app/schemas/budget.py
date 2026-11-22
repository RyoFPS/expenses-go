import uuid
from datetime import date

from pydantic import Field, StrictInt

from app.schemas.common import ORMModel, StrictInput


class BudgetSave(StrictInput):
    amount: StrictInt = Field(ge=0)


class BudgetOut(ORMModel):
    id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    month: date
    amount: int
