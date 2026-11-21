from datetime import UTC, datetime

import httpx

API = "/api/v1"
T0 = datetime(2026, 11, 10, 3, 0, tzinfo=UTC)  # 10:00 WIB


async def create_account(client: httpx.AsyncClient, name: str, **kw) -> dict:
    body = {"name": name, "type": kw.pop("type", "bank"), **kw}
    resp = await client.post(f"{API}/accounts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def create_category(client: httpx.AsyncClient, name: str, type_: str = "expense", **kw) -> dict:
    resp = await client.post(f"{API}/categories", json={"name": name, "type": type_, **kw})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def create_tx(client: httpx.AsyncClient, account: dict, type_: str, amount: int, **kw) -> dict:
    body = {"account_id": account["id"], "type": type_, "amount": amount, **kw}
    if isinstance(body.get("to_account_id"), dict):
        body["to_account_id"] = body["to_account_id"]["id"]
    if isinstance(body.get("occurred_at"), datetime):
        body["occurred_at"] = body["occurred_at"].isoformat()
    resp = await client.post(f"{API}/transactions", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def balance(client: httpx.AsyncClient, account: dict) -> dict:
    resp = await client.get(f"{API}/accounts/{account['id']}/balance")
    assert resp.status_code == 200, resp.text
    return resp.json()
