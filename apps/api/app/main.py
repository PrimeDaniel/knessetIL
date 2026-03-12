"""
KnessetIL FastAPI application entry point.

Architecture:
  - Fetches CSV data from production.oknesset.org/pipelines/data/
  - Normalises with pandas, caches in Redis
  - Serves clean JSON REST API to the Next.js frontend
  - Background APScheduler job syncs CSVs every 6 hours
"""
import logging

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.routers import bills, members, parties, stats, votes
from app.tasks.sync import run_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit_default])

# ── Background scheduler ──────────────────────────────────────────────────────
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting KnessetIL API (env=%s)", settings.app_env)
    scheduler.add_job(
        run_sync,
        "interval",
        hours=settings.oknesset_sync_interval_hours,
        id="oknesset_csv_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("CSV sync scheduler started (interval=%dh)", settings.oknesset_sync_interval_hours)

    yield  # App runs here

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("Scheduler shut down")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="KnessetIL API",
    description="Civic transparency API — normalised data from Open Knesset CSV datasets",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET"],  # read-only API
    allow_headers=["*"],
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/v1/health", tags=["system"])
async def health(request: Request):
    return {"status": "ok", "env": settings.app_env}


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(bills.router, prefix="/api/v1/bills", tags=["bills"])
app.include_router(members.router, prefix="/api/v1/members", tags=["members"])
app.include_router(parties.router, prefix="/api/v1/parties", tags=["parties"])
app.include_router(votes.router, prefix="/api/v1/votes", tags=["votes"])
app.include_router(stats.router, prefix="/api/v1/stats", tags=["stats"])
