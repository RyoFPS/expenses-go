import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Text, false, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, uuid_pk
from app.models.enums import TransactionSource, TransactionType, pg_enum


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("fee >= 0", name="fee_non_negative"),
        # to_account_id hanya (dan wajib) untuk transfer, dan tidak boleh ke akun yang sama
        CheckConstraint(
            "(type = 'transfer') = (to_account_id IS NOT NULL)", name="to_account_only_for_transfer"
        ),
        CheckConstraint("to_account_id IS DISTINCT FROM account_id", name="to_account_differs"),
        Index("ix_transactions_account_id_occurred_at", "account_id", "occurred_at"),
        Index("ix_transactions_occurred_at", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="RESTRICT"), index=True
    )
    type: Mapped[TransactionType] = mapped_column(pg_enum(TransactionType, "transaction_type"))
    amount: Mapped[int] = mapped_column(BigInteger)
    fee: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    merchant: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    occurred_at: Mapped[datetime]
    source: Mapped[TransactionSource] = mapped_column(pg_enum(TransactionSource, "transaction_source"))
    raw_notification_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_notifications.id", ondelete="SET NULL"), index=True
    )
    dedup_hash: Mapped[str | None] = mapped_column(Text, unique=True)
    needs_review: Mapped[bool] = mapped_column(default=False, server_default=false())
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
