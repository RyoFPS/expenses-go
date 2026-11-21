import uuid
from datetime import datetime

from sqlalchemy import Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk
from app.models.enums import ParseStatus, pg_enum


class RawNotification(Base):
    __tablename__ = "raw_notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    package_name: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)  # isi mentah, jangan dimodifikasi
    posted_at: Mapped[datetime]  # waktu dari Android
    received_at: Mapped[datetime] = mapped_column(server_default=func.now())  # waktu server
    content_hash: Mapped[str] = mapped_column(Text, unique=True)
    parse_status: Mapped[ParseStatus] = mapped_column(
        pg_enum(ParseStatus, "parse_status"),
        default=ParseStatus.pending,
        server_default=ParseStatus.pending.value,
        index=True,
    )
    parse_error: Mapped[str | None] = mapped_column(Text)
