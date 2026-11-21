import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class BalanceSnapshot(Base):
    __tablename__ = "balance_snapshots"
    __table_args__ = (Index("ix_balance_snapshots_account_id_observed_at", "account_id", "observed_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE")
    )
    balance: Mapped[int] = mapped_column(BigInteger)
    observed_at: Mapped[datetime]
    raw_notification_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_notifications.id", ondelete="SET NULL")
    )
