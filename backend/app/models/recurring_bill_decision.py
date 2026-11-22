import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RecurringBillDecision(Base):
    __tablename__ = "recurring_bill_decisions"
    __table_args__ = (CheckConstraint("status IN ('confirmed', 'ignored')", name="valid_status"),)

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    merchant: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text)
    last_transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
