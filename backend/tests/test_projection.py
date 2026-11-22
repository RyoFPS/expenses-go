from datetime import UTC, date, datetime

from tests.api_helpers import API, create_account, create_tx


def fixed_day(monkeypatch, day: date) -> None:
    monkeypatch.setattr("app.services.projection.today_jakarta", lambda: day)
    monkeypatch.setattr("app.services.recurring_bills.today_jakarta", lambda: day)


async def test_projection_excludes_transfers_and_counts_only_confirmed_bills(client, monkeypatch) -> None:
    fixed_day(monkeypatch, date(2026, 4, 10))
    bank = await create_account(client, "Bank", opening_balance=1_000_000)
    wallet = await create_account(client, "Wallet", opening_balance=100_000)
    await create_tx(client, bank, "income", 900_000, occurred_at=datetime(2025, 12, 31, 17, tzinfo=UTC))  # Jan 1 WIB
    await create_tx(client, bank, "expense", 90_000, occurred_at=datetime(2026, 2, 1, 3, tzinfo=UTC))
    await create_tx(client, bank, "income", 900_000, occurred_at=datetime(2026, 3, 1, 3, tzinfo=UTC))
    await create_tx(client, bank, "expense", 90_000, merchant="Netflix",
                    occurred_at=datetime(2026, 1, 2, 3, tzinfo=UTC))
    for month in (1, 2, 3):
        await create_tx(client, bank, "expense", 100_000, merchant="Netflix",
                        occurred_at=datetime(2026, month, 15, 3, tzinfo=UTC))
    await create_tx(client, bank, "transfer", 200_000, to_account_id=wallet, fee=0,
                    occurred_at=datetime(2026, 3, 20, 3, tzinfo=UTC))
    await create_tx(client, bank, "expense", 50_000, occurred_at=datetime(2026, 3, 31, 17, tzinfo=UTC))  # Apr 1 WIB

    url = f"{API}/reports/projection"
    candidate = (await client.get(url)).json()
    assert (candidate["history_from"], candidate["history_to"]) == ("2026-01-01", "2026-03-31")
    assert candidate["starting_balance"] == 2_370_000
    assert candidate["upcoming_bills"] == []
    assert candidate["estimated_30d"] == 2_370_000 + 440_000

    response = await client.put(f"{API}/recurring-bills/decision", json={
        "account_id": bank["id"], "merchant": "NETFLIX", "status": "confirmed",
    })
    assert response.status_code == 204
    projection = (await client.get(url)).json()
    assert projection["starting_balance"] == candidate["starting_balance"]
    assert projection["estimated_7d"] == 2_370_000 + 126_000 - 100_000
    assert projection["estimated_30d"] == 2_370_000 + 540_000 - 100_000
    assert [(bill["due_date"], bill["estimated_amount"]) for bill in projection["upcoming_bills"]] == [
        ("2026-04-15", 100_000),
    ]
    assert (await client.get(f"{API}/transactions")).json()["total"] == 9


async def test_projection_includes_each_due_date_once_across_short_month(client, monkeypatch) -> None:
    fixed_day(monkeypatch, date(2027, 1, 30))
    bank = await create_account(client, "Bank")
    for year, month, day in ((2026, 10, 31), (2026, 11, 30), (2026, 12, 31)):
        await create_tx(client, bank, "expense", 100_000, merchant="Rent",
                        occurred_at=datetime(year, month, day, 3, tzinfo=UTC))
    assert (await client.put(f"{API}/recurring-bills/decision", json={
        "account_id": bank["id"], "merchant": "Rent", "status": "confirmed",
    })).status_code == 204
    projection = (await client.get(f"{API}/reports/projection")).json()
    assert [bill["due_date"] for bill in projection["upcoming_bills"]] == ["2027-01-31", "2027-02-28"]
    assert projection["estimated_7d"] == -400_000
    assert projection["estimated_30d"] == -500_000


async def test_projection_counts_unpaid_bill_due_today_without_double_counting_payment(client, monkeypatch) -> None:
    fixed_day(monkeypatch, date(2026, 4, 15))
    bank = await create_account(client, "Bank")
    for month in (1, 2, 3):
        await create_tx(client, bank, "expense", 100_000, merchant="Rent",
                        occurred_at=datetime(2026, month, 15, 3, tzinfo=UTC))
    assert (await client.put(f"{API}/recurring-bills/decision", json={
        "account_id": bank["id"], "merchant": "Rent", "status": "confirmed",
    })).status_code == 204

    url = f"{API}/reports/projection"
    unpaid = (await client.get(url)).json()
    assert [bill["due_date"] for bill in unpaid["upcoming_bills"]] == ["2026-04-15", "2026-05-15"]
    assert unpaid["estimated_7d"] == -400_000
    assert unpaid["estimated_30d"] == -500_000

    await create_tx(client, bank, "expense", 100_000, merchant="Rent",
                    occurred_at=datetime(2026, 4, 15, 3, tzinfo=UTC))
    paid = (await client.get(url)).json()
    assert paid["starting_balance"] == -400_000
    assert [bill["due_date"] for bill in paid["upcoming_bills"]] == ["2026-05-15"]
    assert paid["estimated_7d"] == -400_000
    assert paid["estimated_30d"] == -500_000


async def test_projection_without_three_complete_months_has_no_estimate(client, monkeypatch) -> None:
    fixed_day(monkeypatch, date(2026, 4, 10))
    url = f"{API}/reports/projection"
    empty = (await client.get(url)).json()
    assert empty["estimated_7d"] is None
    assert empty["estimated_30d"] is None
    bank = await create_account(client, "Bank", opening_balance=100_000)
    for month in (1, 3):
        await create_tx(client, bank, "income", 10_000, occurred_at=datetime(2026, month, 1, 3, tzinfo=UTC))
    incomplete = (await client.get(url)).json()
    assert incomplete["starting_balance"] == 120_000
    assert incomplete["estimated_7d"] is None
    assert incomplete["upcoming_bills"] == []
