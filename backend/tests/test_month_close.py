from datetime import UTC, datetime
import uuid

from sqlalchemy import select

from app.models import BalanceSnapshot, RawNotification, Transaction
from app.models.enums import ParseStatus
from tests.api_helpers import API, create_account, create_category, create_tx


async def test_month_close_uses_jakarta_bounds_and_current_state(client, db_sessionmaker) -> None:
    account = await create_account(client, "Bank")
    category = await create_category(client, "Makan")
    before = datetime(2026, 10, 31, 16, 59, tzinfo=UTC)
    start = datetime(2026, 10, 31, 17, 0, tzinfo=UTC)
    end = datetime(2026, 11, 30, 16, 59, tzinfo=UTC)
    after = datetime(2026, 11, 30, 17, 0, tzinfo=UTC)

    await create_tx(client, account, "expense", 1, occurred_at=before)
    first = await create_tx(client, account, "expense", 2, occurred_at=start)
    last = await create_tx(client, account, "expense", 3, occurred_at=end)
    await create_tx(client, account, "expense", 4, occurred_at=after)
    async with db_sessionmaker() as session:
        rows = (await session.scalars(select(Transaction).where(Transaction.id.in_([first["id"], last["id"]])))).all()
        for row in rows:
            row.needs_review = True
        session.add_all([
            RawNotification(package_name="test", title="x", text="x", posted_at=at,
                            content_hash=f"failed-{index}", parse_status=ParseStatus.failed)
            for index, at in enumerate((before, start, end, after))
        ])
        await session.commit()

    response = await client.get(f"{API}/reports/month-close", params={"month": "2026-11"})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "month": "2026-11", "needs_review": 2, "failed_notifications": 2,
        "uncategorized": 2,
        "reconciliation": [{"account_id": account["id"], "name": "Bank", "observed_at": None, "diff": None}],
    }
    assert (await client.get(f"{API}/transactions", params={
        "date_from": "2026-11-01", "date_to": "2026-11-30", "uncategorized": True,
    })).json()["total"] == 2
    assert (await client.get(f"{API}/raw-notifications", params={
        "date_from": "2026-11-01", "date_to": "2026-11-30", "parse_status": "failed",
    })).json()["total"] == 2

    for tx in (first, last):
        await client.patch(f"{API}/transactions/{tx['id']}", json={"category_id": category["id"]})
        await client.post(f"{API}/transactions/{tx['id']}/mark-reviewed")
    async with db_sessionmaker() as session:
        for raw in (await session.scalars(select(RawNotification).where(
            RawNotification.content_hash.in_(["failed-1", "failed-2"])
        ))).all():
            raw.parse_status = ParseStatus.ignored
        await session.commit()

    done = (await client.get(f"{API}/reports/month-close", params={"month": "2026-11"})).json()
    assert (done["needs_review"], done["failed_notifications"], done["uncategorized"]) == (0, 0, 0)
    assert (await client.get(f"{API}/reports/month-close", params={"month": "2026-13"})).status_code == 422


async def test_month_close_reconciliation_is_latest_account_status(client, db_sessionmaker) -> None:
    account = await create_account(client, "Bank", opening_balance=100)
    observed = datetime(2026, 11, 10, 3, 0, tzinfo=UTC)
    async with db_sessionmaker() as session:
        session.add(BalanceSnapshot(account_id=uuid.UUID(account["id"]), balance=90, observed_at=observed))
        await session.commit()

    october = (await client.get(f"{API}/reports/month-close", params={"month": "2026-10"})).json()
    november = (await client.get(f"{API}/reports/month-close", params={"month": "2026-11"})).json()
    assert october["reconciliation"] == november["reconciliation"]
    assert october["reconciliation"][0]["diff"] == -10

    await client.post(f"{API}/accounts/{account['id']}/reconcile")
    done = (await client.get(f"{API}/reports/month-close", params={"month": "2026-10"})).json()
    assert done["reconciliation"][0]["diff"] == 0
