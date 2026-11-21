import logging

from fastapi import APIRouter, FastAPI

from app.api import ingest
from app.core.config import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(title="Personal Finance API", version="0.1.0")

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(ingest.router)
app.include_router(api_v1)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
