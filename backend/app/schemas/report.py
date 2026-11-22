import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import AccountType, CategoryType


class CategoryTotal(BaseModel):
    category_id: uuid.UUID | None = Field(description="null = tanpa kategori")
    name: str
    type: CategoryType
    total: int


class MonthlySummary(BaseModel):
    month: str = Field(examples=["2026-11"])
    income: int
    expense: int = Field(description="Pengeluaran termasuk biaya transfer (fees)")
    fees: int = Field(description="Total biaya transfer (bagian dari expense)")
    net: int
    by_category: list[CategoryTotal] = Field(description="Hanya transaksi income/expense, tanpa biaya transfer")


class CashflowPoint(BaseModel):
    period: date = Field(description="Awal periode (WIB); minggu dimulai Senin")
    income: int
    expense: int = Field(description="Termasuk biaya transfer")
    net: int


class Cashflow(BaseModel):
    date_from: date
    date_to: date
    group_by: Literal["day", "week", "month"]
    points: list[CashflowPoint]


class AccountWorth(BaseModel):
    id: uuid.UUID
    name: str
    type: AccountType
    is_active: bool
    balance: int


class NetWorth(BaseModel):
    total: int
    accounts: list[AccountWorth]


class LatestNotification(BaseModel):
    received_at: datetime | None
