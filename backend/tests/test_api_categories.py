import uuid

import pytest

from tests.api_helpers import API, create_account, create_category, create_tx


async def test_category_crud(client) -> None:
    makan = await create_category(client, "Makan", icon="utensils", color="#22AA55")
    kopi = await create_category(client, "Kopi", parent_id=makan["id"])
    assert kopi["parent_id"] == makan["id"]

    resp = await client.patch(f"{API}/categories/{kopi['id']}", json={"name": "Ngopi", "color": None})
    assert resp.status_code == 200 and resp.json()["name"] == "Ngopi"

    names = [c["name"] for c in (await client.get(f"{API}/categories")).json()]
    assert names == ["Makan", "Ngopi"]

    assert (await client.delete(f"{API}/categories/{makan['id']}")).status_code == 204
    [remaining] = (await client.get(f"{API}/categories")).json()
    assert remaining["parent_id"] is None  # sub-kategori jadi kategori utama


async def test_delete_category_uncategorizes_transactions_and_removes_rules(client) -> None:
    acc = await create_account(client, "Bank")
    cat = await create_category(client, "Makan")
    tx = await create_tx(client, acc, "expense", 1, category_id=cat["id"])
    await client.post(f"{API}/category-rules", json={"match_type": "merchant_contains", "pattern": "x", "category_id": cat["id"]})

    await client.delete(f"{API}/categories/{cat['id']}")
    assert (await client.get(f"{API}/transactions/{tx['id']}")).json()["category_id"] is None
    assert (await client.get(f"{API}/category-rules")).json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "type": "expense"},
        {"name": "X", "type": "transfer"},
        {"name": "X", "type": "expense", "color": "red"},
        {"name": "X", "type": "expense", "parent_id": str(uuid.uuid4())},
    ],
)
async def test_invalid_category_is_422(client, body) -> None:
    assert (await client.post(f"{API}/categories", json=body)).status_code == 422


async def test_parent_rules(client) -> None:
    gaji = await create_category(client, "Gaji", "income")
    a = await create_category(client, "A")
    b = await create_category(client, "B", parent_id=a["id"])

    # tipe induk berbeda
    resp = await client.post(f"{API}/categories", json={"name": "C", "type": "expense", "parent_id": gaji["id"]})
    assert resp.status_code == 422
    # diri sendiri & siklus
    assert (await client.patch(f"{API}/categories/{a['id']}", json={"parent_id": a["id"]})).status_code == 422
    assert (await client.patch(f"{API}/categories/{a['id']}", json={"parent_id": b["id"]})).status_code == 422
    # ubah tipe induk padahal punya anak bertipe lain
    assert (await client.patch(f"{API}/categories/{a['id']}", json={"type": "income"})).status_code == 422


# --- rules ------------------------------------------------------------------


async def test_rule_crud_and_validation(client) -> None:
    cat = await create_category(client, "Kopi")
    resp = await client.post(
        f"{API}/category-rules", json={"match_type": "regex", "pattern": r"^kopi\b", "category_id": cat["id"], "priority": 5}
    )
    assert resp.status_code == 201
    rule = resp.json()

    assert (await client.post(f"{API}/category-rules", json={"match_type": "regex", "pattern": "([", "category_id": cat["id"]})).status_code == 422
    assert (await client.post(f"{API}/category-rules", json={"match_type": "regex", "pattern": "x", "category_id": str(uuid.uuid4())})).status_code == 422
    assert (await client.patch(f"{API}/category-rules/{rule['id']}", json={"pattern": "(["})).status_code == 422

    resp = await client.patch(f"{API}/category-rules/{rule['id']}", json={"priority": 9, "match_type": "merchant_contains", "pattern": "(["})
    assert resp.status_code == 200 and resp.json()["priority"] == 9  # "([" valid sebagai substring

    assert (await client.delete(f"{API}/category-rules/{rule['id']}")).status_code == 204
    assert (await client.get(f"{API}/category-rules")).json() == []


async def test_apply_rules_only_to_uncategorized(client) -> None:
    acc = await create_account(client, "Bank")
    kopi = await create_category(client, "Kopi")
    lain = await create_category(client, "Lain")
    gaji = await create_category(client, "Gaji", "income")
    t1 = await create_tx(client, acc, "expense", 1, merchant="Kopi Kenangan")
    t2 = await create_tx(client, acc, "expense", 2, merchant="Kopi Lain", category_id=lain["id"])
    t3 = await create_tx(client, acc, "income", 3, merchant="Kopi Corp")  # tipe beda, rule expense tidak berlaku
    t4 = await create_tx(client, acc, "expense", 4)  # tanpa merchant

    await client.post(f"{API}/category-rules", json={"match_type": "merchant_contains", "pattern": "kopi", "category_id": kopi["id"]})
    resp = await client.post(f"{API}/category-rules/apply")
    assert resp.status_code == 200 and resp.json() == {"updated": 1}

    got = {t["id"]: t["category_id"] for t in (await client.get(f"{API}/transactions")).json()["items"]}
    assert got[t1["id"]] == kopi["id"]
    assert got[t2["id"]] == lain["id"]
    assert got[t3["id"]] is None
    assert got[t4["id"]] is None
    assert gaji  # dipakai agar ada kategori income

    assert (await client.post(f"{API}/category-rules/apply")).json() == {"updated": 0}
