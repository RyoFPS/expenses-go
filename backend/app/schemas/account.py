import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StrictBool, StrictInt, model_validator

from app.models.enums import AccountType
from app.schemas.common import ORMModel, StrictInput

Name = Annotated[str, Field(min_length=1, max_length=100)]
PackageName = Annotated[str, Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9_.]+$")]


class AccountCreate(StrictInput):
    name: Name
    type: AccountType
    package_name: PackageName | None = None
    opening_balance: StrictInt = 0
    is_active: StrictBool = True


class AccountUpdate(StrictInput):
    name: Name | None = None
    type: AccountType | None = None
    package_name: PackageName | None = None
    opening_balance: StrictInt | None = None
    is_active: StrictBool | None = None

    @model_validator(mode="after")
    def _no_null(self) -> "AccountUpdate":
        self.reject_nulls("name", "type", "opening_balance", "is_active")
        return self


class AccountOut(ORMModel):
    id: uuid.UUID
    name: str
    type: AccountType
    package_name: str | None
    opening_balance: int
    is_active: bool
    created_at: datetime


class AccountWithBalance(AccountOut):
    balance: int = Field(description="Saldo terhitung saat ini (rupiah)")


class SnapshotOut(ORMModel):
    balance: int
    observed_at: datetime
    raw_notification_id: uuid.UUID | None


class AccountBalance(ORMModel):
    account_id: uuid.UUID
    calculated: int = Field(description="Saldo terhitung saat ini")
    last_snapshot: SnapshotOut | None
    calculated_at_snapshot: int | None = Field(
        description="Saldo terhitung per waktu snapshot terakhir (dasar perhitungan diff)"
    )
    diff: int | None = Field(description="last_snapshot.balance - calculated_at_snapshot; null jika belum ada snapshot")
