import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.models.enums import TransactionType
from app.services.recurring_bills import detect_recurring_bills
from tests.api_helpers import API, create_account, create_tx


ACCOUNT = uuid.uuid4()


def tx(month: int, day: int, amount: int = 100_000, *, merchant: str | None = "Netflix",
       account_id: uuid.UUID = ACCOUNT, type_: TransactionType = TransactionType.expense):
    return SimpleNamespace(id=uuid.uuid4(), account_id=account_id, type=type_, amount=amount,
                           merchant=merchant, occurred_at=datetime(2026, month, day, 3, tzinfo=UTC))


def test_monthly_pattern_uses_normalized_merchant_and_jakarta_dates() -> None:
    bills = detect_recurring_bills([
        tx(1, 31, 95_000, merchant=" Netflix "),
        tx(2, 28, 100_000, merchant="NETFLIX"),
        tx(3, 31, 110_000, merchant="netflix"),
    ])
    assert len(bills) == 1
    assert (bills[0]["merchant"], bills[0]["estimated_amount"], str(bills[0]["last_date"]),
            str(bills[0]["next_date"])) == ("netflix", 100_000, "2026-03-31", "2026-04-30")


def test_five_days_and_twenty_percent_are_allowed() -> None:
    assert len(detect_recurring_bills([tx(1, 15), tx(2, 20, 120_000), tx(3, 15)])) == 1


@pytest.mark.parametrize("transactions", [
    [tx(1, 15), tx(2, 15)],
    [tx(1, 15), tx(1, 16), tx(2, 15)],
    [tx(1, 15), tx(3, 15), tx(5, 15)],
    [tx(1, 15), tx(2, 21), tx(3, 15)],
    [tx(1, 15), tx(2, 15, 125_001), tx(3, 15)],
    [tx(1, 15), tx(2, 15), tx(3, 15, merchant=" ")],
    [tx(1, 15), tx(2, 15, merchant="Other"), tx(3, 15)],
    [tx(1, 15), tx(2, 15), tx(3, 15, account_id=uuid.uuid4())],
    [tx(1, 15), tx(2, 15), tx(3, 15, type_=TransactionType.income)],
    [tx(1, 15), tx(2, 15), tx(3, 15, type_=TransactionType.transfer)],
])
def test_non_monthly_patterns_are_excluded(transactions) -> None:
    assert detect_recurring_bills(transactions) == []


async def test_decisions_persist_and_ignored_candidate_returns_after_new_transaction(client) -> None:
    account = await create_account(client, "Bank")
    for month in (1, 2, 3):
        await create_tx(client, account, "expense", 100_000, merchant=" Netflix ",
                        occurred_at=datetime(2026, month, 15, 3, tzinfo=UTC))
    url = f"{API}/recurring-bills"
    initial = (await client.get(url)).json()
    assert len(initial["candidates"]) == 1
    assert initial["confirmed"] == []
    body = {"account_id": account["id"], "merchant": "NETFLIX", "status": "ignored"}
    assert (await client.put(f"{url}/decision", json=body)).status_code == 204
    assert (await client.get(url)).json() == {"candidates": [], "confirmed": []}

    await create_tx(client, account, "expense", 100_000, merchant="netflix",
                    occurred_at=datetime(2026, 4, 15, 3, tzinfo=UTC))
    assert len((await client.get(url)).json()["candidates"]) == 1
    body["status"] = "confirmed"
    assert (await client.put(f"{url}/decision", json=body)).status_code == 204
    confirmed = (await client.get(url)).json()
    assert confirmed["candidates"] == []
    assert confirmed["confirmed"][0]["estimated_amount"] == 100_000
    assert confirmed["confirmed"][0]["next_date"] == "2026-05-15"
    assert (await client.put(f"{url}/decision", json={**body, "merchant": "Other"})).status_code == 422
