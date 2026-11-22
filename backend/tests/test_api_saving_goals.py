import uuid

import pytest

from tests.api_helpers import API, create_account, create_tx


async def test_goal_tracks_calculated_balance_and_caps_visual_progress(client) -> None:
    account = await create_account(client, "Tabungan", opening_balance=20_000)
    response = await client.put(
        f"{API}/saving-goals/{account['id']}",
        json={"name": "Liburan", "target_amount": 100_000, "target_date": "2027-06-01"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "id": response.json()["id"],
        "account_id": account["id"],
        "account_name": "Tabungan",
        "name": "Liburan",
        "target_amount": 100_000,
        "target_date": "2027-06-01",
        "balance": 20_000,
        "remaining": 80_000,
        "progress_percent": 20,
    }

    await create_tx(client, account, "income", 100_000)
    goal = (await client.get(f"{API}/saving-goals")).json()[0]
    assert (goal["balance"], goal["remaining"], goal["progress_percent"]) == (120_000, -20_000, 100)

    updated = await client.put(
        f"{API}/saving-goals/{account['id']}",
        json={"name": "Dana darurat", "target_amount": 200_000},
    )
    assert updated.json()["name"] == "Dana darurat"
    assert updated.json()["target_date"] is None
    assert updated.json()["balance"] == 120_000

    assert (await client.delete(f"{API}/saving-goals/{account['id']}")).status_code == 204
    assert (await client.get(f"{API}/saving-goals")).json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "target_amount": 100},
        {"name": "Liburan", "target_amount": 0},
        {"name": "Liburan", "target_amount": -1},
        {"name": "Liburan", "target_amount": 1.5},
        {"name": "Liburan", "target_amount": "100"},
        {"name": "Liburan", "target_amount": 100, "target_date": "invalid"},
    ],
)
async def test_invalid_saving_goal_is_rejected(client, body) -> None:
    account = await create_account(client, "Tabungan")
    assert (await client.put(f"{API}/saving-goals/{account['id']}", json=body)).status_code == 422


async def test_saving_goal_requires_existing_account(client) -> None:
    response = await client.put(
        f"{API}/saving-goals/{uuid.uuid4()}",
        json={"name": "Liburan", "target_amount": 100},
    )
    assert response.status_code == 404
