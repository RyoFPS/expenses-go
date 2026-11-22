from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import ListenerStatus
from tests.conftest import TEST_API_KEY

INGEST = "/api/v1/ingest/listener-status/heartbeat"
DASHBOARD = "/api/v1/listener-status"
AUTH = {"X-API-Key": TEST_API_KEY}


def payload(**overrides):
    return {
        "device_id": str(uuid4()),
        "listener_enabled": True,
        "pending_count": 0,
        "failed_count": 0,
        "app_version": "0.1.0",
        **overrides,
    }


async def test_heartbeat_requires_ingest_key(client):
    response = await client.post(INGEST, json=payload())
    assert response.status_code == 401


async def test_heartbeat_upserts_only_health_fields(client, db_sessionmaker):
    body = payload(listener_enabled=False, pending_count=2, failed_count=1)
    response = await client.post(INGEST, json=body, headers=AUTH)
    assert response.status_code == 204

    response = await client.post(INGEST, json={**body, "listener_enabled": True, "pending_count": 3}, headers=AUTH)
    assert response.status_code == 204
    async with db_sessionmaker() as session:
        rows = (await session.scalars(select(ListenerStatus))).all()
    assert len(rows) == 1
    assert rows[0].listener_enabled is True
    assert rows[0].pending_count == 3
    assert rows[0].failed_count == 1


async def test_dashboard_returns_empty_before_first_heartbeat(client):
    assert (await client.get(DASHBOARD)).json() == []


async def test_dashboard_marks_stale_and_reports_listener_and_queue(client, db_sessionmaker):
    async with db_sessionmaker() as session:
        session.add(ListenerStatus(
            device_id=uuid4(), listener_enabled=False, pending_count=0, failed_count=2,
            app_version="0.1.0", last_seen=datetime.now(UTC) - timedelta(minutes=46),
        ))
        await session.commit()
    response = await client.get(DASHBOARD)
    assert response.status_code == 200
    assert response.json()[0]["stale"] is True
    assert response.json()[0]["listener_enabled"] is False
    assert response.json()[0]["failed_count"] == 2


@pytest.mark.parametrize("field,value", [("pending_count", -1), ("failed_count", -1), ("listener_enabled", 1)])
async def test_heartbeat_validates_health_fields(client, field, value):
    assert (await client.post(INGEST, json=payload(**{field: value}), headers=AUTH)).status_code == 422
