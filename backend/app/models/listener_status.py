import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ListenerStatus(Base):
    __tablename__ = "listener_status"

    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    listener_enabled: Mapped[bool] = mapped_column(Boolean)
    pending_count: Mapped[int] = mapped_column(Integer)
    failed_count: Mapped[int] = mapped_column(Integer)
    app_version: Mapped[str] = mapped_column(Text)
    last_seen: Mapped[datetime] = mapped_column(server_default=func.now())
