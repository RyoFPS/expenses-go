import uuid
from datetime import datetime, timedelta

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr


class ListenerHeartbeatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_id: uuid.UUID
    listener_enabled: StrictBool
    pending_count: StrictInt = Field(ge=0)
    failed_count: StrictInt = Field(ge=0)
    app_version: StrictStr = Field(min_length=1, max_length=50)


class ListenerStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: uuid.UUID
    listener_enabled: bool
    pending_count: int
    failed_count: int
    app_version: str
    last_seen: datetime
    stale: bool = False

    @classmethod
    def from_status(cls, status, now: datetime) -> "ListenerStatusOut":
        return cls.model_validate(status).model_copy(update={"stale": now - status.last_seen > timedelta(minutes=45)})
