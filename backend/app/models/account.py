import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Index, Text, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, uuid_pk
from app.models.enums import AccountType, pg_enum


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        # Satu package Android hanya boleh dipetakan ke satu akun aktif (D-003, D-021).
        Index(
            "uq_accounts_active_package_name",
            "package_name",
            unique=True,
            postgresql_where=text("is_active AND package_name IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    type: Mapped[AccountType] = mapped_column(pg_enum(AccountType, "account_type"))
    package_name: Mapped[str | None] = mapped_column(Text)
    opening_balance: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    created_at: Mapped[datetime] = created_at_col()
