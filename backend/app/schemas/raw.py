import uuid
from datetime import datetime

from app.models.enums import ParseStatus
from app.schemas.common import ORMModel


class RawNotificationOut(ORMModel):
    id: uuid.UUID
    package_name: str
    title: str
    text: str
    posted_at: datetime
    received_at: datetime
    parse_status: ParseStatus
    parse_error: str | None


class ReparseAllResult(ORMModel):
    processed: int
    by_status: dict[ParseStatus, int]
