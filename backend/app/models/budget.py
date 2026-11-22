import uuid
from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "month"),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    month: Mapped[date] = mapped_column(Date)
    amount: Mapped[int] = mapped_column(BigInteger)
