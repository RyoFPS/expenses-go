"""AC M3: semua endpoint PRD §9 tersedia dan terdokumentasi di /docs (OpenAPI)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

P = "/api/v1"
PRD_ENDPOINTS = [
    ("post", f"{P}/ingest/notification"),
    ("post", f"{P}/ingest/notification/batch"),
    ("get", f"{P}/accounts"),
    ("post", f"{P}/accounts"),
    ("patch", f"{P}/accounts/{{account_id}}"),
    ("get", f"{P}/accounts/{{account_id}}/balance"),
    ("get", f"{P}/transactions"),
    ("post", f"{P}/transactions"),
    ("patch", f"{P}/transactions/{{transaction_id}}"),
    ("delete", f"{P}/transactions/{{transaction_id}}"),
    ("post", f"{P}/transactions/{{transaction_id}}/mark-reviewed"),
    ("get", f"{P}/categories"),
    ("post", f"{P}/categories"),
    ("patch", f"{P}/categories/{{category_id}}"),
    ("delete", f"{P}/categories/{{category_id}}"),
    ("get", f"{P}/category-rules"),
    ("post", f"{P}/category-rules"),
    ("patch", f"{P}/category-rules/{{rule_id}}"),
    ("delete", f"{P}/category-rules/{{rule_id}}"),
    ("post", f"{P}/category-rules/apply"),
    ("get", f"{P}/raw-notifications"),
    ("post", f"{P}/raw-notifications/{{raw_id}}/reparse"),
    ("post", f"{P}/raw-notifications/reparse-all"),
    ("get", f"{P}/reports/summary"),
    ("get", f"{P}/reports/cashflow"),
    ("get", f"{P}/reports/net-worth"),
    ("get", f"{P}/budgets"),
    ("put", f"{P}/budgets/{{category_id}}"),
    ("delete", f"{P}/budgets/{{category_id}}"),
    ("get", f"{P}/saving-goals"),
    ("put", f"{P}/saving-goals/{{account_id}}"),
    ("delete", f"{P}/saving-goals/{{account_id}}"),
    ("get", "/healthz"),
]

TX_FILTERS = {"account_id", "type", "category_id", "date_from", "date_to", "q", "needs_review", "page", "page_size"}


@pytest.fixture(scope="module")
def spec() -> dict:
    with TestClient(app) as c:
        assert c.get("/docs").status_code == 200
        return c.get("/openapi.json").json()


@pytest.mark.parametrize("method,path", PRD_ENDPOINTS, ids=[f"{m} {p}" for m, p in PRD_ENDPOINTS])
def test_prd_endpoint_documented(spec, method, path) -> None:
    assert method in spec["paths"].get(path, {}), f"{method.upper()} {path} tidak ada di OpenAPI"


def test_transaction_filters_documented(spec) -> None:
    params = {p["name"] for p in spec["paths"][f"{P}/transactions"]["get"]["parameters"]}
    assert TX_FILTERS <= params


def test_reports_params_documented(spec) -> None:
    def params(path):
        return {p["name"] for p in spec["paths"][path]["get"]["parameters"]}

    assert "month" in params(f"{P}/reports/summary")
    assert {"date_from", "date_to", "group_by"} <= params(f"{P}/reports/cashflow")
    assert "parse_status" in params(f"{P}/raw-notifications")
