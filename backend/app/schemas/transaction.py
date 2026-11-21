import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AwareDatetime, Field, StrictInt, model_validator

from app.models.enums import TransactionSource, TransactionType
from app.schemas.common import ORMModel, StrictInput
from app.schemas.raw import RawNotificationOut

Amount = Annotated[StrictInt, Field(gt=0)]
Fee = Annotated[StrictInt, Field(ge=0)]
Merchant = Annotated[str, Field(min_length=1, max_length=255)]
Note = Annotated[str, Field(max_length=1000)]


class TransactionCreate(StrictInput):
    """Input manual (mis. cash). occurred_at default sekarang."""

    account_id: uuid.UUID
    to_account_id: uuid.UUID | None = None
    type: TransactionType
    amount: Amount
    fee: Fee = 0
    merchant: Merchant | None = None
    note: Note | None = None
    category_id: uuid.UUID | None = None
    occurred_at: AwareDatetime | None = None


class TransactionUpdate(StrictInput):
    account_id: uuid.UUID | None = None
    to_account_id: uuid.UUID | None = None
    type: TransactionType | None = None
    amount: Amount | None = None
    fee: Fee | None = None
    merchant: Merchant | None = None
    note: Note | None = None
    category_id: uuid.UUID | None = None
    occurred_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def _no_null(self) -> "TransactionUpdate":
        self.reject_nulls("account_id", "type", "amount", "fee", "occurred_at")
        return self


class TransactionOut(ORMModel):
    id: uuid.UUID
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None
    type: TransactionType
    amount: int
    fee: int
    merchant: str | None
    note: str | None
    category_id: uuid.UUID | None
    occurred_at: datetime
    source: TransactionSource
    raw_notification_id: uuid.UUID | None
    counter_raw_notification_id: uuid.UUID | None
    needs_review: bool
    created_at: datetime
    updated_at: datetime


class TransactionDetail(TransactionOut):
    raw_notification: RawNotificationOut | None = None
    counter_raw_notification: RawNotificationOut | None = None
