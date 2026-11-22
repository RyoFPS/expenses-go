import logging

from fastapi import APIRouter, Depends, FastAPI

from app.api import accounts, budgets, categories, ingest, raw_notifications, reports, saving_goals, transactions
from app.core.auth import require_user
from app.core.config import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="Personal Finance API",
    version="0.1.0",
    description=(
        "Ingest (`/api/v1/ingest/*`) memakai header `X-API-Key`. Endpoint lain memakai "
        "Cloudflare Access (`Cf-Access-Jwt-Assertion`). Nominal dalam rupiah (integer), "
        "waktu dalam UTC (ISO 8601); filter tanggal memakai Asia/Jakarta."
    ),
)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(ingest.router)

dashboard = APIRouter(dependencies=[Depends(require_user)], responses={401: {"description": "Belum login"}})
for r in (
    accounts.router,
    transactions.router,
    categories.router,
    budgets.router,
    saving_goals.router,
    categories.rules_router,
    raw_notifications.router,
    reports.router,
):
    dashboard.include_router(r)
api_v1.include_router(dashboard)
app.include_router(api_v1)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
